/**
 * Popup DOM glue, mounted under jsdom against a controllable fake chrome.
 *
 * These cover the interleavings that three rounds of review (3762-3766) found
 * by reading and that no existing test could express: a storage write still in
 * flight while a second actor plans against `lastSaved` / `hasOverride`. The
 * pure decisions (planManagedReset, planLatePolicyReseed) are unit-tested in
 * lib/__tests__/palette.test.js; what is tested here is the ORDERING around
 * them.
 *
 * Slow policy-deadline cases live in popup-policy.test.js so this file stays
 * quick — node runs test FILES in parallel, so splitting keeps wall clock down.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeChrome } from "../../shared/__tests__/harness/fake-chrome.js";
import { mountPage, waitFor, sleep } from "../../shared/__tests__/harness/mount.js";
import { normalizePalette } from "../../lib/palette.js";

/** The org's published palette, as an admin policy value. */
const ORG = [
  { name: "Org Blue", hex: "#1A73E8" },
  { name: "Org Green", hex: "#34A853" },
];

// A settled edit commits immediately (popup.js writes on `change`, never on a
// keystroke), so these are slack for the write to reach the fake storage and
// for the promise chain around it to unwind - not a debounce being waited out.
const WRITE_MS = 250;
const settle = () => sleep(WRITE_MS + 120);

/** Mount the popup with a managed policy present and no personal override. */
async function mountManagedPopup(overrides = {}) {
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG },
    getURL: (p) => `chrome-extension://test/${p}`,
    ...overrides,
  });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  await waitFor(() => page.rows().length > 0, { label: "editor rows" });
  return { ...page, fake };
}

test("popup: an org policy seeds the editor and reveals the managed note", async () => {
  const page = await mountManagedPopup();
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    assert.equal(page.byId("managed-note").hidden, false);
    assert.match(page.text("managed-note-text"), /organization provides these colors/);
    // No personal override was written just by rendering.
    assert.equal("palette" in page.fake.sync.snapshot(), false);
  } finally {
    page.unmount();
  }
});

test("popup: a failed save leaves stored state untouched and says so", async () => {
  const page = await mountManagedPopup();
  try {
    const gate = page.fake.sync.hold();
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await sleep(WRITE_MS + 40); // let the settled edit's write park in the gate
    gate.fail(new Error("QUOTA_BYTES_PER_ITEM quota exceeded"));

    await waitFor(() => /Save failed/.test(page.status()), { label: "save failure status" });
    // The write never landed, so no override exists: the user is still on the
    // org palette rather than silently detached by a write that failed.
    assert.equal("palette" in page.fake.sync.snapshot(), false);
  } finally {
    page.unmount();
  }
});

test("popup: an edit that differs from the org palette is stored as an override", async () => {
  const page = await mountManagedPopup();
  try {
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await waitFor(() => page.status() === "Saved", { label: "save to land" });

    const stored = /** @type {{name:string,hex:string,order:number}[]} */ (page.fake.sync.snapshot().palette);
    assert.ok(Array.isArray(stored), "an override is stored");
    assert.equal(stored[0]?.hex, "#ABCDEF");
    // ...and the note stops claiming the org supplies these colors.
    assert.match(page.text("managed-note-text"), /your own colors/);
  } finally {
    page.unmount();
  }
});

test("popup: editing back to the org colors reattaches instead of storing a copy", async () => {
  // A user who edits and then undoes their change by hand must end up ATTACHED
  // to the policy again, not holding a private copy that happens to match and
  // that silently shadows every future admin update.
  const page = await mountManagedPopup({ sync: { palette: [{ name: "Mine", hex: "#111111", order: 0 }] } });
  try {
    assert.deepEqual(page.shownHexes(), ["#111111"]);
    assert.equal(Array.isArray(page.fake.sync.snapshot().palette), true);

    // Retype the org palette exactly: one row, then add the second.
    page.typeInto(page.doc.querySelector("#rows [data-bpi-name]"), "Org Blue");
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#1A73E8");
    page.click(page.byId("add"));
    const second = page.rows()[1];
    assert.ok(second, "the added row exists");
    page.typeInto(second.querySelector("[data-bpi-name]"), "Org Green");
    page.typeInto(second.querySelector("[data-bpi-hex]"), "#34A853");

    await waitFor(() => "palette" in page.fake.sync.snapshot() === false, {
      label: "the redundant override to be cleared",
    });
  } finally {
    page.unmount();
  }
});

test("popup: 'Use organization palette' clicked during an in-flight save still clears the override", async () => {
  // Review 3766. planManagedReset was computed against PRE-write hasOverride /
  // lastSaved, so a click landing while setUserPalette was on its way to
  // storage planned persist:"none", reported "Already using your
  // organization's colors", and left a permanent override behind. The fix is
  // popup.js awaiting `inflight` before planning; this test is what proves it.
  const page = await mountManagedPopup();
  try {
    const gate = page.fake.sync.hold();
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await sleep(WRITE_MS + 40); // the override write is now parked in flight

    page.click(page.byId("managed-reset")); // user asks to go back, mid-write
    await sleep(30);
    gate.release(); // the override write lands AFTER the click was issued

    // Let EVERYTHING settle before asserting. Checking early passes trivially:
    // the override has not been written yet at that point, so a poll-until-true
    // assertion here would go green against the very bug it targets.
    await settle();
    // Detaching now spells "no override" as an empty stored palette rather than
    // an absent key (one atomic write, and an older build reads empty as no
    // override too). Assert the invariant, not the encoding.
    assert.deepEqual(
      normalizePalette(page.fake.sync.snapshot().palette), [],
      "no override may survive: the reset must plan against post-write state",
    );
    // And the screen shows the org colors, not the abandoned edit.
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
  } finally {
    page.unmount();
  }
});

test("popup: 'Use organization palette' scrubs the pending edit so the dismissal flush cannot store it", async () => {
  // The pending edit lives in the DOM inputs, not in lastSaved. If the reset
  // leaves it there, the flush that runs as the popup closes reads it, sees it
  // differs from lastSaved, and writes it as a fresh personal override moments
  // after the user asked to go back to the org colors.
  const page = await mountManagedPopup();
  try {
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    page.click(page.byId("managed-reset")); // right after the edit landed
    await settle();

    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"], "pending edit scrubbed");

    // Now simulate the popup closing: the flush must find nothing to store.
    page.doc.dispatchEvent(new page.window.Event("visibilitychange"));
    Object.defineProperty(page.doc, "visibilityState", { value: "hidden", configurable: true });
    page.doc.dispatchEvent(new page.window.Event("visibilitychange"));
    await settle();

    assert.equal("palette" in page.fake.sync.snapshot(), false, "no override written by the flush");
  } finally {
    page.unmount();
  }
});

test("popup: undo paints only after the write lands, and a failed undo changes nothing", async () => {
  // Review 3763. restore() used to paint the editor BEFORE persisting, so a
  // refused or failed write left the popup showing a palette that was never
  // stored and that lastSaved disagreed with — and the next Undo then recorded
  // that unsaved palette as a fresh history entry, so two presses of Undo
  // returned the user to where they started.
  //
  // The observable difference between the two orderings is what the screen
  // shows WHILE the write is in flight, which is exactly what the write gate
  // lets us look at.
  const page = await mountManagedPopup();
  try {
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await waitFor(() => page.status() === "Saved", { label: "first save" });
    assert.deepEqual(page.shownHexes(), ["#ABCDEF", "#34A853"]);

    const gate = page.fake.sync.hold();
    page.click(page.byId("undo"));
    await sleep(60);
    // Mid-write: storage still holds the override, so the screen must too.
    assert.deepEqual(
      page.shownHexes(), ["#ABCDEF", "#34A853"],
      "the editor must not show a palette that is not yet stored",
    );

    gate.fail(new Error("network error"));
    await waitFor(() => /Failed/.test(page.status()), { label: "restore failure status" });
    await settle();
    // The failure changed nothing: screen and storage still agree on the override.
    assert.deepEqual(page.shownHexes(), ["#ABCDEF", "#34A853"]);
    const still = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(still[0]?.hex, "#ABCDEF");
  } finally {
    page.unmount();
  }
});

test("the popup footer is CENTER aligned", async () => {
  // Field ask, 2026-08-23: the footer links sat hard left under a centered
  // page and read as a mistake. jsdom applies no CSS, so like the [hidden]
  // guard this pins the stylesheet text itself: the rule must live on the
  // footer's own declaration block.
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../../popup/popup.html", import.meta.url), "utf8");
  const footerRule = src.match(/footer\s*\{[^}]*\}/);
  assert.ok(footerRule, "a footer rule exists");
  assert.match(footerRule[0], /justify-content:\s*center/,
    "the footer centers its links");
});


// --- iyv: half-typed hexes must never reach storage -------------------------

test("popup: a hex still being typed is NOT written, and does not enter undo history", async () => {
  // The field report (bd workspace-custom-palette-iyv): a swatch that nobody
  // meant to edit read #FE5916, one digit off Poppy #FE5917. Every prefix of a
  // hex someone is typing that happens to be 7 characters long is a VALID hex,
  // so the old per-keystroke debounce persisted values the user only passed
  // through - and recorded them in undo history, where they outlive the popup.
  const page = await mountManagedPopup();
  try {
    const hex = page.doc.querySelector("#rows [data-bpi-hex]");
    page.typeInterim(hex, "#FE5916"); // mid-word: the field still has focus
    await settle();                   // long enough that any timer would have fired

    assert.equal("palette" in page.fake.sync.snapshot(), false,
      "an unfinished hex is never stored");
    assert.equal("paletteHistory" in page.fake.local.snapshot(), false,
      "and never recorded as an undoable state");

    // Finish the word. Now it settles, and only the value they stopped on lands.
    page.typeInto(hex, "#FE5917");
    await waitFor(() => page.status() === "Saved", { label: "the settled edit" });
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.deepEqual(stored.map((sw) => sw.hex), ["#FE5917", "#34A853"],
      "exactly one write, of the value the user chose",
    );
  } finally {
    page.unmount();
  }
});

test("popup: an unsettled edit is not LOST either - dismissal flushes it", async () => {
  // The other half of the contract. Waiting for `change` would be a data-loss
  // bug if the popup could close without one, and it can: clicking the page
  // tears the popup down. The dismissal flush reads the DOM inputs, so the
  // last thing typed is saved even though it never blurred.
  const page = await mountManagedPopup();
  try {
    page.typeInterim(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await settle();
    assert.equal("palette" in page.fake.sync.snapshot(), false, "nothing written yet");

    Object.defineProperty(page.doc, "visibilityState", { value: "hidden", configurable: true });
    page.doc.dispatchEvent(new page.window.Event("visibilitychange"));

    await waitFor(() => Array.isArray(page.fake.sync.snapshot().palette), { label: "the flush" });
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(stored[0]?.hex, "#ABCDEF", "typed but never blurred, and still saved");
  } finally {
    page.unmount();
  }
});

// --- The post-update notice, end to end in the host ---------------------------
// The pure mapping (versionToNote / noteMessage) is covered in
// lib/__tests__/update-note.test.js. What was never covered anywhere is that the
// popup actually SHOWS it: the banner shipped twice (0.1.6, 0.1.7) with its
// render path untested in this host, and 0.2.0 is the first notice most users
// will ever see, since it announces features rather than a fix they may have
// missed. Added 2026-08-27, before the 0.2.0 submission.

test("popup: an update notice for the running version is shown, with its real copy", async () => {
  const { UPDATE_NOTES } = await import("../../lib/update-note.js");
  const fake = createFakeChrome({
    local: { updateNoteVersion: "0.2.0" },
    getURL: (p) => `chrome-extension://test/${p}`,
  });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("update-note")?.hidden === false,
      { timeoutMs: 4000, label: "the update banner to be revealed" });
    assert.equal(page.byId("update-note-text").textContent, UPDATE_NOTES["0.2.0"],
      "the banner shows the shipped copy verbatim, not a placeholder or an empty node");
    // The first-run intro must not fight it for the same slot.
    assert.equal(page.byId("intro")?.hidden, true, "a returning user gets the notice, not the intro");
  } finally {
    page.unmount();
  }
});

test("popup: a stored version with no notice shows nothing and clears itself", async () => {
  // Routine releases are meant to stay silent. A stale or unknown version must
  // not leave an empty banner sitting open forever.
  const fake = createFakeChrome({
    local: { updateNoteVersion: "0.1.5" },
    getURL: (p) => `chrome-extension://test/${p}`,
  });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await sleep(400);
    assert.equal(page.byId("update-note")?.hidden, true, "no banner for a version with no notice");
    await waitFor(() => fake.local.snapshot().updateNoteVersion === undefined,
      { timeoutMs: 3000, label: "the stale flag to be cleared" });
  } finally {
    page.unmount();
  }
});
