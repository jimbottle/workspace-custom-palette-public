/**
 * Popup behaviour when the org palette is ENFORCED (`paletteLocked`).
 *
 * The invariant worth protecting is narrow and absolute: while a lock is in
 * force, nothing this page does may write to `chrome.storage.sync`. Everything
 * else here — the read-only editor, the hidden controls, the changed copy — is
 * in service of that, because an editable field whose value cannot take effect
 * is a worse experience than no field at all.
 *
 * The second invariant is that locking is NOT destructive: a personal palette
 * stored before the lock must still be sitting there afterwards, so lifting the
 * lock gives it back.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeChrome } from "../../shared/__tests__/harness/fake-chrome.js";
import { mountPage, waitFor, sleep } from "../../shared/__tests__/harness/mount.js";
import { normalizePalette } from "../../lib/palette.js";

const ORG = [
  { name: "Org Blue", hex: "#1A73E8" },
  { name: "Org Green", hex: "#34A853" },
];
const MINE = [{ name: "Mine", hex: "#111111", order: 0 }];

// A settled edit commits immediately (popup.js writes on `change`, never on a
// keystroke), so these are slack for the write and its promise chain, not a
// debounce being waited out.
const WRITE_MS = 250;
const settle = () => sleep(WRITE_MS + 120);

/** @param {{ locked?: boolean, sync?: Record<string, unknown> }} [opts] */
async function mountPopup({ locked = true, sync = {} } = {}) {
  const fake = createFakeChrome({ managed: { mode: "value", value: ORG, locked }, sync });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  await waitFor(() => page.rows().length > 0, { label: "editor rows" });
  return { ...page, fake };
}

test("popup: a locked policy shows the org colors, read-only", async () => {
  const page = await mountPopup();
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    const inputs = [...page.doc.querySelectorAll("#rows input")];
    assert.ok(inputs.length > 0);
    assert.ok(inputs.every((el) => /** @type {HTMLInputElement} */ (el).disabled),
      "every editor input is disabled");
    // Structural controls are absent, not merely disabled: a greyed-out trash
    // can reads as broken, an absent one reads as not-yours.
    assert.equal(page.doc.querySelectorAll("#rows .bpi-remove").length, 0, "no remove buttons");
    assert.equal(page.doc.querySelectorAll("#rows .bpi-reorder").length, 0, "no reorder buttons");
  } finally {
    page.unmount();
  }
});

test("popup: locked hides every control that ends in a write", async () => {
  const page = await mountPopup();
  try {
    for (const id of ["undo", "redo", "add", "managed-reset"]) {
      assert.equal(page.byId(id).hidden, true, `#${id} is hidden while locked`);
    }
    // ...and the note points at the one real path. With nothing of their own
    // stored there is nothing to switch TO, so offering the selector would be
    // an empty promise (owner ruling, 2026-08-23): org-only users get pointed
    // at the opt-in that creates a personal palette instead.
    assert.equal(page.byId("managed-note").hidden, false);
    assert.match(page.text("managed-note-text"), /cannot be edited here/);
    // With the opt-in defaulting on (2026-08-24), the control this user can
    // actually act on is New palette in Settings, not a checkbox already on.
    assert.match(page.text("managed-note-text"), /Use New palette in Settings/);
  } finally {
    page.unmount();
  }
});

test("popup: a locked user WITH a personal palette gets the switcher wording", async () => {
  // The other half of the note split: once a personal palette exists, "turn on
  // Multiple palettes" would be nonsense advice - the selector above already
  // reaches theirs.
  const page = await mountPopup({
    sync: {
      "pal:mine": { name: "Mine", swatches: MINE },
      paletteOrder: ["mine"],
      activePaletteId: "org",
      enforcementPushed: true,
    },
  });
  try {
    await waitFor(() => page.byId("managed-note").hidden === false, { label: "the note" });
    assert.match(page.text("managed-note-text"), /cannot be edited here/);
    assert.match(page.text("managed-note-text"), /switch to colors of your own/);
  } finally {
    page.unmount();
  }
});

test("popup: an edit under a lock is never written to storage", async () => {
  // The core guarantee. Typing is still physically possible (a disabled input
  // can be re-enabled in devtools), so the write path itself must refuse.
  const page = await mountPopup();
  try {
    const hex = /** @type {HTMLInputElement} */ (page.doc.querySelector("#rows [data-bpi-hex]"));
    hex.disabled = false; // simulate someone forcing the field back on
    page.typeInto(hex, "#ABCDEF");
    await settle();
    await settle(); // well past any write

    assert.equal("palette" in page.fake.sync.snapshot(), false,
      "no override may be written while the org palette is enforced");
  } finally {
    page.unmount();
  }
});

test("popup: dismissing a locked popup with a forced edit writes nothing", async () => {
  // The dismissal flush calls commit() directly and never passes scheduleSave,
  // so the guard there does not cover it. Worse than a stray write: it would
  // desync lastSaved from the read-only editor, and the NEXT flush would then
  // see the on-screen org palette differ from it and take persistPalette's
  // clear branch — deleting the personal palette outright.
  const page = await mountPopup({ sync: { palette: MINE } });
  try {
    const hex = /** @type {HTMLInputElement} */ (page.doc.querySelector("#rows [data-bpi-hex]"));
    hex.disabled = false;
    page.typeInto(hex, "#ABCDEF");

    // Simulate the popup closing, twice (both events can fire).
    Object.defineProperty(page.doc, "visibilityState", { value: "hidden", configurable: true });
    page.doc.dispatchEvent(new page.window.Event("visibilitychange"));
    page.window.dispatchEvent(new page.window.Event("pagehide"));
    await settle();
    await settle();

    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#111111", "the personal palette is neither overwritten nor cleared");
    assert.equal(stored?.length, 1);
  } finally {
    page.unmount();
  }
});

test("popup: a lock that lands DURING a pending save still blocks the write", async () => {
  // The ordering the guard in scheduleSave cannot see: the policy misses the
  // render deadline (so the popup starts unlocked and editable), the user
  // edits, and the lock only becomes known inside persistPalette's own
  // `await ensureManagedKnown(...)`. Without a re-check after that await, the
  // write proceeds under a lock.
  const fake = createFakeChrome({
    managed: { mode: "late", value: ORG, locked: true, delayMs: 1800 },
    sync: { palette: MINE },
  });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "first render" });
    // Editable: the policy has not landed yet, so this popup believes it is unmanaged.
    assert.deepEqual(page.shownHexes(), ["#111111"]);

    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    // Debounce fires, persistPalette awaits the policy, the lock lands mid-write.
    await waitFor(() => page.shownHexes().length === 2, { timeoutMs: 5000, label: "lock to apply" });
    await sleep(400);

    const stored = /** @type {{hex:string}[]} */ (fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#111111", "the edit was not written under the lock");
    assert.equal(stored?.length, 1, "and the personal palette was not cleared either");
  } finally {
    page.unmount();
  }
});

test("popup: locking does not destroy a palette the user saved earlier", async () => {
  // Locking must be reversible. If the lock is lifted the user should get their
  // own colors back, which only works if we left them alone.
  const page = await mountPopup({ sync: { palette: MINE } });
  try {
    // The org palette is what is in force, so it is what is shown...
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    await settle();
    // ...but the user's stored palette is untouched underneath.
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#111111", "the personal palette survives the lock");
  } finally {
    page.unmount();
  }
});

test("popup: the same policy WITHOUT the lock stays fully editable", async () => {
  // Guards against the lock leaking into the default path: 0.1.7 behaviour must
  // be untouched when paletteLocked is absent or false.
  const page = await mountPopup({ locked: false });
  try {
    const inputs = [...page.doc.querySelectorAll("#rows input")];
    assert.ok(inputs.every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)),
      "inputs are editable when the policy is only a default");
    assert.equal(page.byId("managed-reset").hidden, false, "the way back is offered");
    assert.match(page.text("managed-note-text"), /keeps a personal copy/);

    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await waitFor(() => page.status() === "Saved", { label: "save to land" });
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#ABCDEF", "an unlocked org palette is still personalizable");
  } finally {
    page.unmount();
  }
});

test("popup: an admin toggling the lock reaches an ALREADY-OPEN popup, both ways", async () => {
  // docs/TEST_PLAN.md §6 asks the tester to toggle the policy with the popup
  // open and watch it switch. That step was written before any listener
  // existed, so it could not have passed; this is the test that keeps the
  // claim honest. applyLock only ever fired from ensureManagedKnown, which
  // returns early unless THIS popup's own read timed out — so in the normal
  // fast-read case nothing noticed a toggle at all.
  const page = await mountPopup({ locked: false, sync: { palette: MINE } });
  try {
    assert.deepEqual(page.shownHexes(), ["#111111"], "starts on the user's own palette");
    assert.equal(page.byId("add").hidden, false);

    // Admin turns enforcement ON.
    page.fake.managed.setPolicy({ locked: true });
    await waitFor(() => page.shownHexes().length === 2, { label: "lock to reach the open popup" });
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => /** @type {HTMLInputElement} */ (el).disabled), "editor went read-only");
    assert.equal(page.byId("add").hidden, true);

    // ...and OFF again. Unlocking must restore the user's own colors, not
    // strand them read-only on the org's.
    page.fake.managed.setPolicy({ locked: false });
    await waitFor(() => page.byId("add").hidden === false, { label: "unlock to reach the popup" });
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)), "editor is editable again");
    assert.deepEqual(page.shownHexes(), ["#111111"], "the personal palette is back");
  } finally {
    page.unmount();
  }
});

const ORG2 = [
  { name: "Org Red", hex: "#D93025" },
  { name: "Org Amber", hex: "#F9AB00" },
];

test("popup: an admin editing the ORG COLORS reaches the popup without touching the lock", async () => {
  // applyLock returns early when the lock state is unchanged, so a policy edit
  // that only changes the colors used to change nothing here. Locked, that left
  // the popup rendering the previous palette beside a picker already showing
  // the new one — under a note asserting these are the organization's colors.
  const page = await mountPopup();
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);

    page.fake.managed.setPolicy({ value: ORG2 });
    await waitFor(() => page.shownHexes()[0] === "#D93025", { label: "new org colors to land" });
    assert.deepEqual(page.shownHexes(), ["#D93025", "#F9AB00"]);
    // Still locked, so still read-only.
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => /** @type {HTMLInputElement} */ (el).disabled));
  } finally {
    page.unmount();
  }
});

test("popup: an org-palette edit reaches an UNLOCKED user who has no override", async () => {
  // Without a re-seed the popup keeps the stale palette, and the next tweak
  // auto-saves an override derived from colors that are no longer the policy —
  // the detachment reseedFromManaged exists to prevent, reached live.
  const page = await mountPopup({ locked: false });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);

    page.fake.managed.setPolicy({ value: ORG2 });
    await waitFor(() => page.shownHexes()[0] === "#D93025", { label: "re-seed on the unlocked path" });
    assert.deepEqual(page.shownHexes(), ["#D93025", "#F9AB00"]);
    // No override was written just by following the policy.
    assert.equal("palette" in page.fake.sync.snapshot(), false);
  } finally {
    page.unmount();
  }
});

test("popup: a live policy change never discards a palette saved THIS session", async () => {
  // reseedFromManaged plans against the stored palette, which used to be a
  // load-time const. After an auto-save it still reported "no override", so a
  // live policy change re-seeded the org palette over colors the user had just
  // saved — and left lastSaved === managed, which is exactly what the heal
  // branch treats as a redundant override.
  const page = await mountPopup({ locked: false });
  try {
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await waitFor(() => page.status() === "Saved", { label: "the in-session save" });
    assert.deepEqual(page.shownHexes(), ["#ABCDEF", "#34A853"]);

    page.fake.managed.setPolicy({ value: ORG2 });
    await sleep(300);

    assert.deepEqual(page.shownHexes(), ["#ABCDEF", "#34A853"],
      "the user's saved palette stays on screen; the org change does not displace it");
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#ABCDEF", "and is still stored");
  } finally {
    page.unmount();
  }
});

test("popup: a policy APPEARING mid-session cannot delete a palette saved before it", async () => {
  // The destructive variant. With no managed palette at open, wireManagedUi
  // returns before setting its wired flag, so the live handler's trailing call
  // runs the heal branch for the FIRST time — and if the re-seed has just set
  // lastSaved to the new org palette, the heal sees a "redundant override" and
  // calls clearUserPalette(). The user's palette is gone, irreversibly.
  const fake = createFakeChrome({ managed: { mode: "absent" } });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { label: "editor rows" });
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await waitFor(() => page.status() === "Saved", { label: "the in-session save" });
    const savedHexes = page.shownHexes();

    // An admin publishes a palette for the first time, mid-session.
    fake.managed.setPolicy({ value: ORG2 });
    await sleep(400);

    const stored = /** @type {{hex:string}[]} */ (fake.sync.snapshot().palette);
    assert.ok(Array.isArray(stored), "the saved palette was NOT cleared");
    assert.equal(stored[0]?.hex, "#ABCDEF");
    assert.deepEqual(page.shownHexes(), savedHexes, "and is still what the popup shows");
  } finally {
    page.unmount();
  }
});

test("popup: a heal-cleared override does not strand the user on a superseded org palette", async () => {
  // The heal branch clears a redundant override and moves hasOverride, but it
  // does not go through persistPalette. When the stored-palette mirror was a
  // separate variable, only persistPalette advanced it — so after a heal the
  // re-seed still planned against "they have an override", returned null, and
  // the popup kept the old org colors on screen beside a picker already showing
  // the new ones. The next tweak would then save the superseded palette as a
  // personal copy.
  const page = await mountPopup({ locked: false, sync: { palette: ORG } });
  try {
    // The heal fires on open: the stored palette is identical to the org's.
    await waitFor(() => "palette" in page.fake.sync.snapshot() === false, {
      label: "the redundant override to be healed away",
    });
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);

    page.fake.managed.setPolicy({ value: ORG2 });
    await waitFor(() => page.shownHexes()[0] === "#D93025", { label: "the popup to follow the new org colors" });
    assert.deepEqual(page.shownHexes(), ["#D93025", "#F9AB00"]);
  } finally {
    page.unmount();
  }
});

test("popup: an admin REMOVING the policy is followed, not ignored", async () => {
  // The third live policy edit, and the one docs/DEPLOY.md instructs at the end
  // of a trial. reseedFromManaged and refreshManagedNote both no-op on an empty
  // policy, so the popup used to keep the deleted org colors on screen — and in
  // lastSaved — beneath a note still asserting the organization sets them,
  // while the picker beside it had already fallen back to the packaged
  // defaults. The next edit would then save the deleted palette as a permanent
  // override.
  const page = await mountPopup({ locked: true });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    assert.equal(page.byId("managed-note").hidden, false);

    page.fake.managed.setPolicy({ value: undefined, locked: false });
    await waitFor(() => page.byId("managed-note").hidden === true, {
      label: "the org note to be hidden once the policy is gone",
    });

    // Back on the packaged defaults, editable, with no org affordances left.
    assert.equal(page.rows().length, 7, "the packaged defaults are on screen");
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)), "editable again");
    assert.equal(page.byId("managed-reset").hidden, true, "no reset link without a policy");
    assert.equal("palette" in page.fake.sync.snapshot(), false, "nothing written by the removal");
  } finally {
    page.unmount();
  }
});

test("popup: after a policy removal, an edit does not save the deleted org colors", async () => {
  const page = await mountPopup({ locked: false });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    page.fake.managed.setPolicy({ value: undefined, locked: false });
    await waitFor(() => page.byId("managed-note").hidden === true, { label: "policy removal" });

    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await waitFor(() => page.status() === "Saved", { label: "the edit to save" });

    const stored = /** @type {{name:string,hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(stored[0]?.hex, "#ABCDEF");
    assert.ok(!stored.some((sw) => sw.hex === "#1A73E8"),
      "the deleted org palette is not what got saved");
  } finally {
    page.unmount();
  }
});

test("popup: removing the policy after a heal falls back to the DEFAULTS, not the deleted org colors", async () => {
  // The heal clears a redundant override and moves hasOverride, but the
  // load-time snapshot still holds the org palette. Resolving the removal
  // fallback against that snapshot put the DELETED colors back on screen and
  // into lastSaved — with the org note now hidden, so nothing even explained
  // them — and the next edit saved them as a permanent override.
  const page = await mountPopup({ locked: false, sync: { palette: ORG } });
  try {
    await waitFor(() => "palette" in page.fake.sync.snapshot() === false, { label: "the heal" });
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);

    page.fake.managed.setPolicy({ value: undefined, locked: false });
    await waitFor(() => page.byId("managed-note").hidden === true, { label: "policy removal" });

    assert.equal(page.rows().length, 7, "the packaged defaults, not the deleted org palette");
    assert.ok(!page.shownHexes().includes("#1A73E8"), "no trace of the removed policy");

    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await waitFor(() => page.status() === "Saved", { label: "the edit to save" });
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.ok(!stored.some((sw) => sw.hex === "#34A853"), "the deleted org colors were not saved");
  } finally {
    page.unmount();
  }
});

test("popup: a policy delivered live unblocks saves even when the popup's own read hangs", async () => {
  // ensureManagedKnown only clears managedUnknown from `settledManaged`, which
  // never settles on a hung read — so every save was refused for the life of
  // the popup, including after this handler had authoritatively established
  // the policy state.
  const fake = createFakeChrome({ managed: { mode: "never" } });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "first render" });

    fake.managed.setPolicy({ value: undefined, locked: false });
    await sleep(150);

    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await waitFor(() => page.status() === "Saved", { timeoutMs: 5000, label: "the save to land" });
    const stored = /** @type {{hex:string}[]} */ (fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#ABCDEF");
  } finally {
    page.unmount();
  }
});

test("popup: a stale in-flight read cannot resurrect a policy the admin just deleted", async () => {
  // ensureManagedKnown tested the unknown flag only on ENTRY. A call already
  // parked on its await resumed with the payload it started fetching — which
  // predates the deletion — and walked `managed` and `baseline` back to the
  // removed policy. Locked, that re-mounted the editor read-only on a palette
  // that no longer exists and made persistPalette refuse every save for the
  // rest of the popup's life.
  const fake = createFakeChrome({ managed: { mode: "late", value: ORG, locked: true, delayMs: 2600 } });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "render on the deadline" });
    assert.equal(page.rows().length, 7, "packaged defaults; the policy has not landed");

    // Edit -> commit -> persistPalette parks inside ensureManagedKnown.
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await sleep(400);

    // Admin deletes the policy while that read is still outstanding.
    fake.managed.setPolicy({ value: undefined, locked: false });
    await sleep(150);

    // Now let the stale read land, and give everything time to settle.
    await sleep(2800);

    assert.equal(page.byId("managed-note").hidden, true, "the removed policy stays removed");
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)),
      "the editor is NOT re-locked by the stale read");
    assert.ok(!page.shownHexes().includes("#1A73E8"), "the deleted org palette is not on screen");
  } finally {
    page.unmount();
  }
});

test("popup: removing a LOCKED policy leaves no trace of the deleted org colors", async () => {
  // Pinned here because the popup only got this right by two branches happening
  // to compose — the unlock restored the pre-lock palette and the removal
  // branch then replaced it. planPolicyApply decides it in one step now, and
  // the options page reached the opposite outcome until it did.
  // The lock is TAKEN during the session so the stash is actually populated —
  // a page that loads locked has none, and re-resolves correctly by luck.
  const page = await mountPopup({ locked: false });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    page.fake.managed.setPolicy({ locked: true });
    await waitFor(() => page.byId("add").hidden === true, { label: "the lock" });

    page.fake.managed.setPolicy({ value: undefined, locked: false });
    await waitFor(() => page.byId("managed-note").hidden === true, { label: "the removal" });
    await waitFor(() => page.rows().length === 7, { label: "fall back to the packaged defaults" });
    assert.ok(!page.shownHexes().includes("#1A73E8"), "no trace of the removed policy");
    assert.equal(page.byId("add").hidden, false, "editable again");

    await settle();
    assert.equal("palette" in page.fake.sync.snapshot(), false,
      "and nothing was written on the way through");
  } finally {
    page.unmount();
  }
});

test("popup: a lock landing inside the reset handler's await must not delete the palette", async () => {
  // The third clear path, and the one that had no lock re-check at all. The
  // other two are guarded: persistPalette throws, and the on-open heal tests
  // `!locked` immediately before writing. This handler awaits `inflight` and
  // then cleared directly, bypassing persistPalette entirely.
  //
  // A lock landing inside that await sets lastSaved = ORG and re-mounts, so
  // planManagedReset resumes seeing sameColors AND a stored override, plans
  // persist:"clear", and deletes a synced personal palette under active
  // enforcement — the exact irreversibility the heal's `!locked` guard exists
  // to prevent, reached by a different route. Lifting the lock would put the
  // palette back on screen but not in storage.
  const page = await mountPopup({ locked: false, sync: { palette: MINE } });
  try {
    assert.deepEqual(page.shownHexes(), ["#111111"], "their own palette, not locked");

    const gate = page.fake.sync.hold();
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await sleep(WRITE_MS + 40); // the override write is now parked in flight

    page.click(page.byId("managed-reset")); // mid-write, while still unlocked
    await sleep(30);
    // The admin turns enforcement on while the handler is parked on `inflight`.
    page.fake.managed.setPolicy({ locked: true });
    await waitFor(() => page.byId("add").hidden === true, { label: "the lock" });
    gate.fail(); // the in-flight override write fails, so storage still holds MINE

    // Settle everything before asserting: checking early would pass trivially,
    // since the clear has not been issued yet at that point.
    await settle();
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#111111", "the synced personal palette survives the lock");
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"], "and the org colors are shown");
  } finally {
    page.unmount();
  }
});

// --- kbs: the popup switcher, and the mid-switch edit trap ----------------

/** Two of the user's own palettes, opted in, so the switcher is visible. */
async function mountSwitcherPopup() {
  const fake = createFakeChrome({
    managed: { mode: "absent" },
    sync: {
      "pal:a": { name: "Alpha", swatches: [{ name: "A", hex: "#111111", order: 0 }] },
      "pal:b": { name: "Beta", swatches: [{ name: "B", hex: "#222222", order: 0 }] },
      paletteOrder: ["a", "b"],
      activePaletteId: "a",
      multiPalette: true,
    },
  });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  await waitFor(() => page.rows().length > 0, { label: "editor rows" });
  return { ...page, fake };
}

test("popup: the switcher lists the user's palettes when they opt in", async () => {
  const page = await mountSwitcherPopup();
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { label: "the switcher" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    assert.deepEqual([...select.options].map((o) => o.value), ["a", "b"]);
    assert.equal(select.value, "a");
    assert.deepEqual(page.shownHexes(), ["#111111"]);
  } finally {
    page.unmount();
  }
});

test("popup: an edit pending at the moment of a switch lands in the palette it was MADE in", async () => {
  // The trap an auto-saving editor creates, and the reason switchPalette
  // flushes before it switches. Without the flush, lastSaved moves to the
  // incoming palette, so when the edit does commit it is measured against the
  // wrong baseline - the user's typing evaporates, or worse, lands in the
  // palette they moved to. The write gate is what lets the edit be caught
  // mid-flight rather than guessed at.
  const page = await mountSwitcherPopup();
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { label: "the switcher" });

    // Type into Alpha and settle it, then switch to Beta.
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    select.value = "b";
    select.dispatchEvent(new page.window.Event("change"));

    await waitFor(() => page.shownHexes()[0] === "#222222", { label: "Beta on screen" });
    await settle();

    const data = page.fake.sync.snapshot();
    assert.deepEqual(data["pal:a"].swatches.map((/** @type {any} */ s) => s.hex), ["#ABCDEF"],
      "the edit belongs to Alpha, where it was typed");
    assert.deepEqual(data["pal:b"].swatches.map((/** @type {any} */ s) => s.hex), ["#222222"],
      "and Beta is untouched by it");
    assert.equal(data.activePaletteId, "b");
  } finally {
    page.unmount();
  }
});

test("popup: an edit still being TYPED at the moment of a switch lands in the palette it was made in", async () => {
  // The sharper version of the same trap, and the one that survives the iyv
  // fix: the popup no longer writes per keystroke, so at the moment of a
  // switch the only copy of an unfinished edit is the DOM input itself. If
  // switchPalette did not flush it through commit() first, it would be either
  // thrown away or - since the editor is about to be repainted with Beta -
  // measured against Beta and written into the wrong palette.
  const page = await mountSwitcherPopup();
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { label: "the switcher" });

    page.typeInterim(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF"); // never blurred
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    select.value = "b";
    select.dispatchEvent(new page.window.Event("change"));

    await waitFor(() => page.shownHexes()[0] === "#222222", { label: "Beta on screen" });
    await settle();

    const data = page.fake.sync.snapshot();
    assert.deepEqual(data["pal:a"].swatches.map((/** @type {any} */ s) => s.hex), ["#ABCDEF"],
      "the unfinished edit still belongs to Alpha, where it was typed");
    assert.deepEqual(data["pal:b"].swatches.map((/** @type {any} */ s) => s.hex), ["#222222"],
      "and Beta never receives another palette's edit");
  } finally {
    page.unmount();
  }
});

test("popup: a switch does not strand an edit behind an in-flight write", async () => {
  // Same trap, one layer deeper: a save already on its way to storage when the
  // switch is issued. The gate holds that write open so the switch is forced to
  // interleave with it, which is the ordering the dismissal-flush bugs came
  // from and the only way to observe it deterministically.
  const page = await mountSwitcherPopup();
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { label: "the switcher" });
    const gate = page.fake.sync.hold();
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await sleep(WRITE_MS + 40); // the write for Alpha is now parked in flight

    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    select.value = "b";
    select.dispatchEvent(new page.window.Event("change"));
    await sleep(30);
    gate.release(); // Alpha's write lands only after the switch was issued

    await settle();
    const data = page.fake.sync.snapshot();
    assert.deepEqual(data["pal:a"].swatches.map((/** @type {any} */ s) => s.hex), ["#ABCDEF"],
      "Alpha keeps the edit made in it");
    assert.deepEqual(data["pal:b"].swatches.map((/** @type {any} */ s) => s.hex), ["#222222"],
      "Beta is never given another palette's edit");
  } finally {
    page.unmount();
  }
});

test("popup: a write still in flight at the switch does not corrupt the new palette's undo", async () => {
  // The residual the storage snapshot could not see. commit() used to overwrite
  // `inflight` with its own write before checking whether an earlier one had
  // settled, so `await inflight` returned while an OLDER write was still
  // running. That write then landed and clobbered lastSaved/history with the
  // palette being LEFT - so the next edit on the new palette recorded its undo
  // snapshot from the wrong colours, and Undo restored a palette the user was
  // no longer on. Storage looked right the whole time.
  const page = await mountSwitcherPopup();
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { label: "the switcher" });
    const gate = page.fake.sync.hold();
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    await sleep(WRITE_MS + 40); // Alpha's write is parked in flight

    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    select.value = "b";
    select.dispatchEvent(new page.window.Event("change"));
    await sleep(30);
    gate.release();
    await settle();
    assert.deepEqual(page.shownHexes(), ["#222222"], "on Beta");

    // Edit Beta, then undo it. The undo must return BETA's colours, not the
    // colours of the palette that was in flight during the switch.
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#333333");
    await waitFor(() => page.status() === "Saved", { label: "the edit to Beta" });
    page.click(page.byId("undo"));
    await settle();
    assert.deepEqual(page.shownHexes(), ["#222222"],
      "undo restores Beta, not the palette left behind mid-write");
  } finally {
    page.unmount();
  }
});

test("popup: the reported empty-dropdown state cannot exist", async () => {
  // Field report 2026-08-22: dropdown visible AND empty, unlocked org policy,
  // opt-in off. Whatever visibility rule is in force, a VISIBLE switcher with
  // zero options is never legal - an empty control is worse than none.
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: false },
    sync: {
      "pal:mine": { name: "Mine", swatches: MINE },
      paletteOrder: ["mine"], activePaletteId: "mine",
      multiPalette: false,
    },
  });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { label: "editor" });
    const host = page.byId("switcher");
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    assert.ok(host.hidden || select.options.length > 0,
      `visible with ${select.options.length} options`);
  } finally {
    page.unmount();
  }
});


// --- Several ORG palettes: the pointer must pick WHICH one -----------------
// Field, 2026-08-24 (section E). An admin published Retail and Wholesale. The
// tester selected Wholesale, saw Wholesale's colors for a moment, and then
// every RE-READ - reopening the popup, the Docs picker, the toolbar icon -
// showed Retail's colors under Wholesale's name. Cause: orgSwatches takes the
// active pointer to decide which published palette is in force, and every call
// site but the switch itself omitted it, so they all resolved to "the first
// one". Invisible with a single org palette, which is why C and D passed.

const TWO_ORG = [
  { name: "Retail", swatches: [{ name: "Poppy", hex: "#FE5917" }] },
  { name: "Wholesale", swatches: [{ name: "Grass", hex: "#385834" }] },
];

async function mountTwoOrg(sync = {}) {
  const fake = createFakeChrome({ managed: { mode: "value", palettes: TWO_ORG }, sync });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  await waitFor(() => page.rows().length > 0, { label: "editor rows" });
  return { ...page, fake };
}

test("popup: opening ON the second org palette shows THAT palette, not the first", async () => {
  // The re-read case, which is what the field actually saw: the pointer already
  // names the second org palette when the popup mounts.
  const page = await mountTwoOrg({ activePaletteId: "org:1" });
  try {
    assert.deepEqual(page.shownHexes(), ["#385834"], "Wholesale's colors, under Wholesale's name");
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    assert.equal(select.value, "org:1");
  } finally {
    page.unmount();
  }
});

test("popup: switching between two org palettes changes the colors, and they stick", async () => {
  const page = await mountTwoOrg();
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { label: "the switcher" });
    assert.deepEqual(page.shownHexes(), ["#FE5917"], "starts on the first");
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    select.value = "org:1";
    select.dispatchEvent(new page.window.Event("change"));
    await waitFor(() => page.shownHexes()[0] === "#385834", { label: "Wholesale on screen" });
    // And the pointer is what a re-read will consult, so it must have moved.
    await waitFor(() => page.fake.sync.snapshot().activePaletteId === "org:1", { label: "the pointer" });
  } finally {
    page.unmount();
  }
});


// --- roborev 4123: what `managed` means while a PERSONAL palette is active --
// The review proposed gating switchPalette's `managed` on isOrgPaletteId, so
// selecting a personal palette would set it to []. These two tests are why
// that is wrong: `managed` is "the org palette this user would reattach TO",
// and it is consulted precisely while they are on a palette of their own.

test("popup: editing an OWN palette back to the org's colors reattaches, even after a switch", async () => {
  // The reattach rule (a personal copy that merely matches the org palette
  // buys nothing and costs every future admin update) has to survive arriving
  // by the switcher, not just by mounting. With `managed` emptied on switch
  // this silently stops happening and the user keeps a redundant override.
  // Their own palette is one hex away from the org's, names included, so a
  // single edit makes the two identical - which is the exact state the
  // reattach rule exists to catch.
  // Indexed reads are `| undefined` under noUncheckedIndexedAccess, and these
  // fixtures are fixed-length by construction.
  const orgA = /** @type {{name: string, hex: string}} */ (ORG[0]);
  const orgB = /** @type {{name: string, hex: string}} */ (ORG[1]);
  const nearlyOrg = [
    { name: orgA.name, hex: "#000000", order: 0 },
    { name: orgB.name, hex: orgB.hex, order: 1 },
  ];
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG },
    sync: {
      "pal:mine": { name: "Mine", swatches: nearlyOrg },
      paletteOrder: ["mine"],
      activePaletteId: "org",
      palette: [],
    },
  });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { label: "the switcher" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    select.value = "mine";
    select.dispatchEvent(new page.window.Event("change"));
    await waitFor(() => page.shownHexes()[0] === "#000000", { label: "their own palette" });

    // Now type the org's colors into it.
    const hex = /** @type {Element} */ (page.doc.querySelectorAll("#rows [data-bpi-hex]")[0]);
    page.typeInto(hex, orgA.hex);
    await waitFor(() => page.status() !== "", { label: "the write" });
    await sleep(400);

    assert.deepEqual(normalizePalette(fake.sync.snapshot().palette), [],
      "no redundant override survives: matching the org's colors reattaches to them");
  } finally {
    page.unmount();
  }
});


test("popup: an enforced user who OPTED OUT is pointed at the opt-in instead", async () => {
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: true },
    sync: { multiPalette: false },
  });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { label: "editor rows" });
    assert.match(page.text("managed-note-text"), /Turn on Multiple palettes in Settings/);
  } finally {
    page.unmount();
  }
});


test("popup: an auto-saved edit to the org palette reveals the chooser immediately", async () => {
  // Same shape as the options-page C3 failure (field, 2026-08-26). This host
  // reaches it sooner because it auto-saves: one settled keystroke detaches a
  // personal copy, which is a second entry and therefore a chooser.
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG },
    sync: { multiPalette: true },
  });
  const page = await mountPage("popup/popup.html", "popup/popup.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length === 2, { label: "the org palette" });
    assert.equal(page.byId("switcher").hidden, true, "one entry is not a choice");

    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#00AA11");
    await waitFor(() => page.byId("switcher").hidden === false,
      { label: "the chooser once the save created a second palette" });

    const labels = [...(/** @type {HTMLSelectElement} */ (page.byId("active-palette"))).options]
      .map((o) => o.textContent);
    assert.equal(labels.length, 2, `org + the detached copy: ${labels.join(" | ")}`);
  } finally {
    page.unmount();
  }
});
