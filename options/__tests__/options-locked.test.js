/**
 * Options page when the org palette is ENFORCED (`paletteLocked`).
 *
 * Same absolute rule as the popup: no write to `chrome.storage.sync` while a
 * lock is in force. The options page differs in having explicit Save / Reset /
 * Import buttons, so each is checked directly — hiding a button is a UI
 * convenience, refusing the action is the guarantee.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeChrome } from "../../shared/__tests__/harness/fake-chrome.js";
import { mountPage, waitFor, sleep } from "../../shared/__tests__/harness/mount.js";
import { ORG_PALETTE_NAME } from "../../lib/palette.js";

const ORG = [
  { name: "Org Blue", hex: "#1A73E8" },
  { name: "Org Green", hex: "#34A853" },
];
const MINE = [{ name: "Mine", hex: "#111111", order: 0 }];

/** @param {{ locked?: boolean, sync?: Record<string, unknown> }} [opts] */
async function mountOptions({ locked = true, sync = {} } = {}) {
  const fake = createFakeChrome({ managed: { mode: "value", value: ORG, locked }, sync });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
  return { ...page, fake };
}

test("options: a locked policy renders the org palette read-only", async () => {
  const page = await mountOptions();
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    const inputs = [...page.doc.querySelectorAll("#rows input")];
    assert.ok(inputs.length > 0 && inputs.every((el) => /** @type {HTMLInputElement} */ (el).disabled));
    assert.equal(page.doc.querySelectorAll("#rows .bpi-remove").length, 0);
    // Both halves of what enforcement now means: this palette is not editable
    // here, AND there is a way to colors of your own - which, with nothing of
    // theirs stored yet, is the opt-in that creates one (owner ruling,
    // 2026-08-23), not a selector that would offer nothing.
    assert.match(page.text("managed-note"), /cannot be edited here/);
    // The note has to name the control ACTUALLY on screen. With the opt-in
    // defaulting on (2026-08-24) that is New palette; telling this user to
    // turn on Multiple palettes would point at a checkbox already ticked.
    assert.match(page.text("managed-note"), /Use New palette below/);
  } finally {
    page.unmount();
  }
});

test("options: a locked user with a stored override still sees the ORG palette", async () => {
  // The upgrade cohort for this feature: someone who personalized under 0.1.7
  // and whose admin then turns the lock on. resolvePalette gives the USER's
  // palette precedence, so without an explicit lock branch this page showed
  // them their own colors, read-only, beneath a note saying their organization
  // sets them — while every picker rendered the org's. Export copied the wrong
  // palette out too. Neither original locked test seeded sync.palette, which is
  // exactly why nothing caught it.
  const page = await mountOptions({ sync: { palette: MINE } });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"],
      "the enforced palette is what is shown, not the stored one");

    // Export reads the editor, so it must copy the org palette too.
    page.byId("export").hidden = false;
    page.click(page.byId("export"));
    const box = /** @type {HTMLTextAreaElement} */ (page.byId("text"));
    assert.match(box.value, /1A73E8/i, "Export copies the palette actually in force");
    assert.ok(!/111111/i.test(box.value), "Export must not copy the shadowed personal palette");
  } finally {
    page.unmount();
  }
});

test("options: a lock arriving after render remounts the editor read-only", async () => {
  // readOnly is fixed at mount, so a late lock that only flipped the flag left
  // a page that was locked in every respect except that its inputs still
  // worked — the exact state the readOnly option exists to prevent.
  const fake = createFakeChrome({ managed: { mode: "late", value: ORG, locked: true, delayMs: 1800 } });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "first render" });
    // Rendered from the packaged defaults, editable — the policy has not landed.
    assert.ok([...page.doc.querySelectorAll("#rows input")].every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)));

    await waitFor(() => page.rows().length === 2, { timeoutMs: 5000, label: "late lock to apply" });
    const inputs = [...page.doc.querySelectorAll("#rows input")];
    assert.ok(inputs.length > 0 && inputs.every((el) => /** @type {HTMLInputElement} */ (el).disabled),
      "the editor is remounted read-only once the lock is known");
    assert.equal(page.doc.querySelectorAll("#rows .bpi-remove").length, 0);
    assert.equal(page.byId("save").hidden, true);
  } finally {
    page.unmount();
  }
});

test("options: locked hides Save, Reset and Add but keeps Export and import-as-new", async () => {
  const page = await mountOptions();
  try {
    for (const id of ["save", "reset", "add"]) {
      assert.equal(page.byId(id).hidden, true, `#${id} hidden while locked`);
    }
    // Export only reads. Being unable to edit the org palette is no reason to
    // be unable to copy it out.
    assert.equal(page.byId("export").hidden, false, "Export stays available");
    // With Multiple palettes on (the default) an import makes a NEW palette and
    // never writes the organization's, so the lock is no reason to hide it.
    // Hidden, it left a section called Import / export with no way to import
    // and nothing saying why (owner, 2026-11-12).
    assert.equal(page.byId("import").hidden, false, "Import stays available");
    assert.equal(page.byId("import").textContent, "Import as new palette");
  } finally {
    page.unmount();
  }
});

test("options: a locked user can import into a new palette of their own", async () => {
  const page = await mountOptions();
  try {
    /** @type {HTMLTextAreaElement} */ (page.byId("text")).value = "Headers #1F4E78\nOrange #FF9900";
    page.click(page.byId("import"));
    await waitFor(() => !page.byId("import-name-row").hidden, { label: "the name step" });
    /** @type {HTMLInputElement} */ (page.byId("import-name")).value = "Customer";
    page.click(page.byId("import-create"));
    await waitFor(() => /into a new palette, "Customer"/.test(page.status()), { label: "the import" });

    assert.deepEqual(page.shownHexes(), ["#1F4E78", "#FF9900"], "the editor is on the imported colors");
    assert.equal(page.byId("save").hidden, false, "and their own palette is editable under the lock");
    const data = page.fake.sync.snapshot();
    assert.equal(data[`pal:${data.activePaletteId}`].name, "Customer");
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    assert.equal([...select.options].some((o) => o.value.startsWith("org")), true,
      "the organization's palette is still there to switch back to");
  } finally {
    page.unmount();
  }
});

test("options: locked with Multiple palettes off hides Import, which has nowhere to write", async () => {
  const page = await mountOptions({ sync: { multiPalette: false } });
  try {
    assert.equal(page.byId("import").hidden, true);
  } finally {
    page.unmount();
  }
});

test("options: Save, Reset and Import all refuse while locked, and write nothing", async () => {
  // The buttons are hidden, so this drives them the way anything else could —
  // directly. Refusal has to live in the handlers, not only in the markup.
  // Opted out, so Import has nowhere to write but the palette on screen: with
  // the opt-in on it makes a new palette, which the lock allows.
  const page = await mountOptions({ sync: { palette: MINE, multiPalette: false } });
  try {
    for (const id of ["save", "reset", "import"]) {
      page.byId(id).hidden = false; // make it reachable, as devtools would
      page.click(page.byId(id));
      await waitFor(() => page.status() !== "", { label: `${id} status` });
      assert.match(page.status(), /organization sets these colors/,
        `#${id} explains the refusal`);
      assert.ok(page.byId("status").classList.contains("error"));
      page.byId("status").textContent = ""; // reset for the next one
    }

    // And the user's own stored palette is exactly as it was: not overwritten
    // by the org palette, not cleared. Locking stays reversible.
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#111111");
    assert.equal(stored?.length, 1);
  } finally {
    page.unmount();
  }
});

test("options: an UNLOCKED org-only policy keeps 0.1.7 editing, without promising a selector", async () => {
  const page = await mountOptions({ locked: false });
  try {
    const inputs = [...page.doc.querySelectorAll("#rows input")];
    assert.ok(inputs.every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)));
    for (const id of ["save", "reset", "add", "import"]) {
      assert.equal(page.byId(id).hidden, false, `#${id} available when unlocked`);
    }
    // The note must not promise what Reset no longer does. Reset restores the
    // last SAVED colors now, so the way back to the organization's is the
    // Palette selector — but with nothing of theirs stored there IS no
    // selector yet (owner ruling, 2026-08-23), so this half of the note may
    // not mention it either.
    assert.match(page.text("managed-note"), /You can change these colors for yourself/);
    assert.doesNotMatch(page.text("managed-note"), /Palette selector/,
      "org-only means no selector exists yet to point at");
    assert.doesNotMatch(page.text("managed-note"), /Reset/,
      "the note must not send anyone to Reset for the org colors");
  } finally {
    page.unmount();
  }
});

test("options: once a personal palette exists, the unlocked note points back at the selector", async () => {
  // The other half of the same honesty rule as under the lock: the sentence
  // about switching back becomes true exactly when something of theirs does.
  const page = await mountOptions({
    locked: false,
    sync: {
      "pal:mine": { name: "Mine", swatches: MINE },
      paletteOrder: ["mine"],
      activePaletteId: "mine",
    },
  });
  try {
    await waitFor(() => page.byId("managed-note").hidden === false, { label: "the note" });
    assert.match(page.text("managed-note"), /Palette selector/);
  } finally {
    page.unmount();
  }
});

test("options: an admin toggling the lock reaches an ALREADY-OPEN settings page", async () => {
  // The listener has to be registered on the NORMAL (fast-read) path. It was
  // first written inside applyPolicy's transition branch, which only ever runs
  // on a late read or from the listener itself — so on a fast read nothing
  // subscribed at all, and docs/DEPLOY.md's "both subscribe to policy changes"
  // was false for this page.
  const page = await mountOptions({ locked: false, sync: { palette: MINE } });
  try {
    assert.deepEqual(page.shownHexes(), ["#111111"]);
    const before = page.fake.listenerCount();

    page.fake.managed.setPolicy({ locked: true });
    await waitFor(() => page.shownHexes().length === 2, { label: "lock to reach the open page" });
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => /** @type {HTMLInputElement} */ (el).disabled), "editor went read-only");
    assert.equal(page.byId("save").hidden, true);

    page.fake.managed.setPolicy({ locked: false });
    await waitFor(() => page.byId("save").hidden === false, { label: "unlock to reach the page" });
    assert.deepEqual(page.shownHexes(), ["#111111"], "the personal palette is back");

    // Listeners must not accumulate: registering inside the transition branch
    // added one per toggle, each firing a redundant re-seed for the life of the
    // page.
    assert.equal(page.fake.listenerCount(), before, "no listener accumulation across toggles");
  } finally {
    page.unmount();
  }
});

test("options: a SAVE selects the palette, so a lock does not take it away", async () => {
  // Owner decision, 2026-08-26: "saving should count as selecting a palette as
  // the palette would have to be selected to be saved." So a save moves the
  // stored pointer AND this page adopts it, which decides what a lock then
  // does: an explicit pointer at a personal palette keeps that palette editable
  // under enforcement (the cv2 rule); only an ABSENT pointer defaults to the
  // organization's.
  //
  // This test used to assert the opposite - that locking put the org palette on
  // screen - and passed only because the page never adopted the pointer, so it
  // looked unset. In production what moves an enforced user onto the org
  // palette is applyEnforcementPush in the service worker, which this page-level
  // fake does not run; that transition is covered in lib/__tests__.
  //
  // The original point still holds and is asserted last: userPaletteAtLoad is a
  // load-time snapshot, and restoring it would silently revert work saved while
  // the page was open.
  const page = await mountOptions({ locked: false, sync: { palette: MINE } });
  try {
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    page.click(page.byId("save"));
    await waitFor(() => /Saved/.test(page.status()), { label: "the in-session save" });
    await waitFor(() => page.fake.sync.snapshot().activePaletteId !== undefined,
      { label: "the save to move the pointer" });

    page.fake.managed.setPolicy({ locked: true });
    await sleep(400);
    assert.deepEqual(page.shownHexes(), ["#ABCDEF"],
      "they chose this palette by saving it, so the lock leaves them on it");
    assert.equal(page.byId("save").hidden, false, "and it is still theirs to edit");

    page.fake.managed.setPolicy({ locked: false });
    await sleep(300);
    assert.deepEqual(page.shownHexes(), ["#ABCDEF"],
      "and unlocking brings back the palette saved this session, never the load-time one");
  } finally {
    page.unmount();
  }
});

test("options: a live org-colors change does not replace a palette saved this session", async () => {
  // userPaletteAtLoad is what the re-seed guard consults. Advancing `rendered`
  // on save removed the accidental protection that used to make the guard bail
  // (showing !== rendered), so with a stale "no override" the guard would swap
  // the user's saved palette for the org's — and a click of Save would then
  // take the clear branch and delete their override outright.
  const page = await mountOptions({ locked: false });
  try {
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#ABCDEF");
    page.click(page.byId("save"));
    await waitFor(() => /Saved/.test(page.status()), { label: "the in-session save" });
    const saved = page.shownHexes();

    page.fake.managed.setPolicy({ value: [{ name: "Org Red", hex: "#D93025" }] });
    await waitFor(() => page.status() !== "", { timeoutMs: 1000, label: "settle" }).catch(() => {});
    await new Promise((r) => setTimeout(r, 200));

    assert.deepEqual(page.shownHexes(), saved, "the saved palette stays on screen");
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#ABCDEF", "and is still stored");
  } finally {
    page.unmount();
  }
});

test("options: deleting every row then locking does not resurrect the deleted palette", async () => {
  // The empty-palette save branch left `rendered` holding the pre-deletion
  // colors, so a later lock stashed them and lifting it put colors the user had
  // deliberately deleted back on screen — one click of Save from being stored
  // again.
  const page = await mountOptions({ locked: false, sync: { palette: MINE } });
  try {
    let guard = 20;
    while (page.rows().length > 0 && guard-- > 0) page.click(page.doc.querySelector("#rows .bpi-remove"));
    page.click(page.byId("save"));
    await waitFor(() => /All colors removed/.test(page.status()), { label: "empty save" });
    assert.equal("palette" in page.fake.sync.snapshot(), false);

    page.fake.managed.setPolicy({ locked: true });
    await waitFor(() => page.rows().length === 2, { label: "lock" });
    page.fake.managed.setPolicy({ locked: false });
    await waitFor(() => page.byId("save").hidden === false, { label: "unlock" });

    assert.equal(page.rows().length, 0, "the editor is still empty, as the user left it");
    assert.equal("palette" in page.fake.sync.snapshot(), false, "and nothing was re-stored");
  } finally {
    page.unmount();
  }
});

test("options: a live org-colors change does not discard an imported-but-unsaved palette", async () => {
  // planLatePolicyReseed's mid-edit guard is `showing !== rendered`, where
  // `rendered` means "what the editor was SEEDED with". Overloading `rendered`
  // to also track the live editor made an imported palette indistinguishable
  // from an untouched one, so a policy change silently threw away typing the
  // user had not saved yet — precisely the case the guard exists for.
  // Opted OUT on purpose: an UNSAVED import only exists on that path, because
  // with the opt-in on Import creates and saves a new palette outright.
  const page = await mountOptions({ locked: false, sync: { multiPalette: false } });
  try {
    const box = /** @type {HTMLTextAreaElement} */ (page.byId("text"));
    box.value = "Imported One #ABCDEF\nImported Two #123456";
    page.click(page.byId("import"));
    await waitFor(() => /Imported 2 colors/.test(page.status()), { label: "the import" });
    assert.deepEqual(page.shownHexes(), ["#ABCDEF", "#123456"]);

    page.fake.managed.setPolicy({ value: [{ name: "Org Red", hex: "#D93025" }] });
    await new Promise((r) => setTimeout(r, 250));

    assert.deepEqual(page.shownHexes(), ["#ABCDEF", "#123456"],
      "unsaved import survives a live policy change");
  } finally {
    page.unmount();
  }
});

test("options: Reset then a live org-colors change still reaches the page", async () => {
  // Reset is a CODE-driven re-render, not user typing. Leaving `rendered` at
  // the pre-Reset palette made the mid-edit guard report "they are typing"
  // forever, so a later org-colors change could never re-seed - the page kept
  // showing the old org palette while every picker rendered the new one, and
  // one click of Save would have written the stale colors as a personal
  // override. Reset no longer clears an override (it restores the last save),
  // so this drives the guard the way it survives: no override at all, where
  // the org palette IS the saved state, with an unsaved edit to discard.
  const page = await mountOptions({ locked: false });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"], "the org palette, unmodified");
    const hex = /** @type {HTMLInputElement} */ (page.doc.querySelector("#rows [data-bpi-hex]"));
    hex.value = "#ABCDEF";
    hex.dispatchEvent(new page.window.Event("input", { bubbles: true }));
    await waitFor(() => page.shownHexes()[0] === "#ABCDEF", { label: "the unsaved edit" });

    page.click(page.byId("reset")); // arms
    page.click(page.byId("reset")); // confirms
    await waitFor(() => page.shownHexes()[0] === "#1A73E8", { label: "reset back to the org palette" });

    page.fake.managed.setPolicy({ value: [{ name: "Org Red", hex: "#D93025" }] });
    await waitFor(() => page.shownHexes()[0] === "#D93025", { label: "the page to follow the new org colors" });
  } finally {
    page.unmount();
  }
});

test("options: an admin REMOVING the policy is followed here too", async () => {
  // planLatePolicyReseed returns null on an empty org, so without an explicit
  // removal branch the page kept rendering the DELETED org colors with the note
  // hidden, beside pickers already back on the packaged defaults — and Save
  // would store them as a permanent override. The popup grew this branch first;
  // setPolicy({value: undefined}) had no options coverage at all.
  const page = await mountOptions({ locked: false });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    assert.equal(page.byId("managed-note").hidden, false);

    page.fake.managed.setPolicy({ value: undefined, locked: false });
    await waitFor(() => page.byId("managed-note").hidden === true, { label: "policy removal" });
    await waitFor(() => page.rows().length === 7, { label: "fall back to the packaged defaults" });
    assert.ok(!page.shownHexes().includes("#1A73E8"), "no trace of the removed policy");

    page.click(page.byId("save"));
    await waitFor(() => /Saved/.test(page.status()), { label: "the save" });
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.ok(!stored.some((sw) => sw.hex === "#1A73E8"),
      "Save must not store the deleted org colors as an override");
  } finally {
    page.unmount();
  }
});

test("options: a stale in-flight read cannot resurrect a policy the admin deleted", async () => {
  // The options page needs this ordering rule MORE than the popup: its late
  // read is not behind a write path, so nothing has to be in flight for the
  // older payload to land and win. Unguarded, it re-showed the deleted policy —
  // remounting the page read-only on colors that no longer exist, with Save and
  // Reset refusing for the life of the page.
  const fake = createFakeChrome({ managed: { mode: "late", value: ORG, locked: true, delayMs: 2600 } });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "render on the deadline" });
    assert.equal(page.rows().length, 7, "packaged defaults; the policy has not landed");

    // Admin deletes the policy while the initial read is still outstanding.
    fake.managed.setPolicy({ value: undefined, locked: false });
    await sleep(200);
    assert.equal(page.byId("managed-note").hidden, true, "the removal is applied");

    // Let the stale read land, then confirm it did not win.
    await sleep(2800);
    assert.equal(page.byId("managed-note").hidden, true, "the deleted policy stays gone");
    assert.equal(page.byId("save").hidden, false, "the page is not re-locked");
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)), "inputs stay enabled");
    assert.ok(!page.shownHexes().includes("#1A73E8"), "the deleted org palette is not on screen");

    page.click(page.byId("save"));
    await waitFor(() => /Saved/.test(page.status()), { label: "the save" });
    const stored = /** @type {{hex:string}[]} */ (fake.sync.snapshot().palette);
    assert.ok(!stored.some((sw) => sw.hex === "#1A73E8"), "and Save stores no ORG-derived override");
  } finally {
    page.unmount();
  }
});

test("options: a lock landing inside Save's await must not delete the user's palette", async () => {
  // The fifth "same fix, one host only" divergence: the popup re-checks the
  // lock after ensureManagedKnown, options did not. applyPolicy runs INSIDE
  // that await and can remount the editor read-only on the org palette, so the
  // code after it read ORG out of the fresh editor, matched it against the
  // baseline, and called clearUserPalette() — permanently deleting a synced
  // personal palette, for a Save issued against the user's OWN colors on a page
  // that was not locked when they clicked.
  const fake = createFakeChrome({
    managed: { mode: "late", value: ORG, locked: true, delayMs: 1800 },
    sync: { palette: MINE },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "render on the deadline" });
    assert.deepEqual(page.shownHexes(), ["#111111"], "their own palette, page not yet locked");
    assert.equal(page.byId("save").hidden, false);

    // Click Save while the policy read is still outstanding.
    page.click(page.byId("save"));
    // "so nothing was saved" is the POST-await refusal; the pre-await one reads
    // "so there is nothing to save". Matching the specific wording is what says
    // which guard fired.
    await waitFor(() => /nothing was saved/.test(page.status()), {
      timeoutMs: 5000, label: "the post-await refusal once the lock lands",
    });

    assert.ok(page.byId("status").classList.contains("error"));
    const stored = /** @type {{hex:string}[]} */ (fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#111111", "the personal palette survives");
    assert.equal(stored?.length, 1);
    // ...and the page is now correctly locked.
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => /** @type {HTMLInputElement} */ (el).disabled));
  } finally {
    page.unmount();
  }
});

test("options: a lock landing inside Reset's read wins - no write, and no re-render either", async () => {
  // This replaces a test for a bug that no longer has a shape to occur in.
  // Reset used to CLEAR the personal override, so a lock landing inside its
  // await could wipe colors the user was about to be told they could not
  // change, and it needed a second post-await re-check to prevent that.
  // Restoring the last saved state writes nothing at all, which retires the
  // whole race - but only for as long as that stays true, so pin it directly:
  // drive Reset through a lock landing mid-flight and assert sync storage is
  // byte-identical afterwards.
  const fake = createFakeChrome({
    managed: { mode: "late", value: ORG, locked: true, delayMs: 1800 },
    sync: { palette: MINE },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "render on the deadline" });
    assert.deepEqual(page.shownHexes(), ["#111111"], "their own palette, page not yet locked");
    assert.equal(page.byId("reset").hidden, false);
    const before = fake.sync.snapshot();

    // Park Reset's storage READ so the lock is guaranteed to land while it is
    // outstanding. fake.sync.hold() gates writes only, and Reset performs
    // none - which is the whole point - so the gate goes on the read itself.
    // Without this the read resolves in a microtask and the race never occurs:
    // the test would pass with the guard deleted.
    /** @type {() => void} */
    let releaseRead = () => {};
    const parked = new Promise((r) => { releaseRead = () => r(undefined); });
    const realGet = fake.chrome.storage.sync.get.bind(fake.chrome.storage.sync);
    let parkedOnce = false;
    fake.chrome.storage.sync.get = async (/** @type {never} */ keys) => {
      if (!parkedOnce) { parkedOnce = true; await parked; }
      return realGet(keys);
    };

    page.click(page.byId("reset")); // arms the confirm
    page.click(page.byId("reset")); // confirms; resetToDefault's read is parked below
    await waitFor(() => parkedOnce, { label: "Reset's read to be in flight" });
    await new Promise((r) => setTimeout(r, 2200)); // the late lock lands here
    assert.equal(page.byId("save").hidden, true, "the lock really did land mid-Reset");
    releaseRead();
    await waitFor(() => /nothing was restored/.test(page.status()), {
      timeoutMs: 4000, label: "the POST-await refusal (not the pre-await one)",
    });

    // The editor must still show what applyPolicy mounted - the organization's
    // colors - not the personal palette Reset was resuming with. Painting those
    // back would leave the page claiming "your organization sets these colors"
    // over someone else's.
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"],
      "Reset re-rendered the personal palette over an enforced editor");
    assert.deepEqual(fake.sync.snapshot(), before, "Reset touched storage at all");
    const stored = /** @type {{hex:string}[]} */ (fake.sync.snapshot().palette);
    assert.equal(stored?.[0]?.hex, "#111111", "the override survived the lock landing mid-Reset");
  } finally {
    page.unmount();
  }
});

test("options: removing a LOCKED policy leaves no trace of the deleted org colors", async () => {
  // The divergence that unifying planPolicyApply exposed. Both hosts treated
  // this as an unlock and restored the pre-lock palette, but this page then
  // RETURNED from the remount branch and never reached its removal branch — so
  // a user with no override was left staring at the DELETED org colors, with
  // the note correctly hidden and nothing on screen explaining them, one click
  // of Save away from storing them as a permanent personal override. The popup
  // ran both branches and landed on the packaged defaults; this is that
  // outcome, now decided once for both.
  // The lock must be TAKEN during the session, not present at load: that is
  // what populates the stash. A page that loads locked has no stash and falls
  // through to a correct re-resolution, which is why nine review rounds never
  // surfaced this.
  const page = await mountOptions({ locked: false });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    page.fake.managed.setPolicy({ locked: true });
    await waitFor(() => page.byId("save").hidden === true, { label: "the lock" });

    page.fake.managed.setPolicy({ value: undefined, locked: false });
    await waitFor(() => page.byId("save").hidden === false, { label: "the unlock" });
    await waitFor(() => page.rows().length === 7, { label: "fall back to the packaged defaults" });
    assert.ok(!page.shownHexes().includes("#1A73E8"), "no trace of the removed policy");
    assert.equal(page.byId("managed-note").hidden, true);

    page.click(page.byId("save"));
    await waitFor(() => /Saved/.test(page.status()), { label: "the save" });
    const stored = /** @type {{hex:string}[]} */ (page.fake.sync.snapshot().palette);
    assert.ok(!stored.some((sw) => sw.hex === "#1A73E8"),
      "Save must not store the deleted org colors as an override");
  } finally {
    page.unmount();
  }
});

test("options: removing a LOCKED policy still gives an owner their own palette back", async () => {
  // The mirror case: locking must stay reversible. Someone with a stored
  // override gets it back, not the packaged defaults.
  const page = await mountOptions({ locked: false, sync: { palette: MINE } });
  try {
    assert.deepEqual(page.shownHexes(), ["#111111"], "their own palette");
    page.fake.managed.setPolicy({ locked: true });
    await waitFor(() => page.shownHexes()[0] === "#1A73E8", { label: "the lock" });

    page.fake.managed.setPolicy({ value: undefined, locked: false });
    await waitFor(() => page.byId("save").hidden === false, { label: "the unlock" });
    await waitFor(() => page.shownHexes()[0] === "#111111", { label: "their own palette" });
    assert.deepEqual(page.fake.sync.snapshot().palette, MINE, "and it was never touched in storage");
  } finally {
    page.unmount();
  }
});

test("options: a MULTI-palette policy reaches the page, and follows a live edit", async () => {
  // End-to-end through the new shape: schema key -> getManagedPolicy ->
  // orgSwatches -> the editor. Nothing else drives `palettes` through a host,
  // so without this the whole om8 path is only covered at the pure layer.
  const fake = createFakeChrome({
    managed: { mode: "value", palettes: [
      { name: "Retail", swatches: [{ name: "Poppy", hex: "#FE5917" }] },
      { name: "Wholesale", swatches: [{ name: "Grass", hex: "#385834" }] },
    ] },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
    assert.deepEqual(page.shownHexes(), ["#FE5917"], "staff start on the FIRST org palette");
    assert.equal(page.byId("managed-note").hidden, false, "and it counts as a managed policy");

    // An admin reorders them; the page follows without a restart, which is what
    // onManagedChanged watching the new key buys.
    fake.managed.setPolicy({ palettes: [
      { name: "Wholesale", swatches: [{ name: "Grass", hex: "#385834" }] },
      { name: "Retail", swatches: [{ name: "Poppy", hex: "#FE5917" }] },
    ] });
    await waitFor(() => page.shownHexes()[0] === "#385834", { label: "the reorder to land" });
  } finally {
    page.unmount();
  }
});

test("options: an admin MIGRATING from the single palette to the collection is followed", async () => {
  // The transition the `palettes` key exists to express, and the one the
  // harness got wrong: clearing the legacy key while publishing the collection
  // in the SAME policy write. Nothing else exercises both keys changing at once.
  const page = await mountOptions({ locked: false });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"], "the legacy single palette");

    page.fake.managed.setPolicy({
      value: undefined,
      palettes: [{ name: "Retail", swatches: [{ name: "Poppy", hex: "#FE5917" }] }],
    });
    await waitFor(() => page.shownHexes()[0] === "#FE5917", { label: "the migration to land" });
    assert.equal(page.byId("managed-note").hidden, false,
      "still a managed policy: the org did not lose its palette by migrating");
  } finally {
    page.unmount();
  }
});

// --- kbs: the palette switcher --------------------------------------------

test("options: no switcher for the ordinary single-palette user", async () => {
  // The default experience must be exactly what ships today: no control, no
  // extra concepts, nothing to learn.
  const fake = createFakeChrome({ managed: { mode: "absent" } });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
    assert.equal(page.byId("switcher").hidden, true);
  } finally {
    page.unmount();
  }
});

test("options: an enforced policy reveals the switcher with BOTH sources", async () => {
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: true },
    sync: {
      "pal:mine": { name: "Mine", swatches: MINE },
      paletteOrder: ["mine"],
      activePaletteId: "org",
      enforcementPushed: true,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { timeoutMs: 4000, label: "the switcher" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    const opts = [...select.options].map((o) => o.value);
    assert.deepEqual(opts, ["org:0", "mine"], "the organization's palette and the user's own");
    assert.equal(select.value, "org:0", "enforcement starts them on the organization's");
    assert.match(page.text("switcher-note"), /cannot be edited here/);
    // And the editor is read-only on it.
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => /** @type {HTMLInputElement} */ (el).disabled));
  } finally {
    page.unmount();
  }
});

test("options: switching to your OWN palette under a lock re-mounts it EDITABLE", async () => {
  // The cv2 decision, end to end. readOnly is fixed at mount, so this has to
  // re-mount rather than re-seed - re-seeding would leave a disabled editor
  // showing colours the user is entitled to change.
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: true },
    sync: {
      "pal:mine": { name: "Mine", swatches: MINE },
      paletteOrder: ["mine"],
      activePaletteId: "org",
      enforcementPushed: true,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { timeoutMs: 4000, label: "the switcher" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    select.value = "mine";
    select.dispatchEvent(new page.window.Event("change"));

    await waitFor(() => page.shownHexes()[0] === "#111111", { label: "their own palette" });
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)),
      "their own palette is editable even while enforcement is on");
    assert.equal(fake.sync.snapshot().activePaletteId, "mine", "and the choice is recorded");
  } finally {
    page.unmount();
  }
});

test("options: the opt-in reveals the switcher with no policy at all", async () => {
  const fake = createFakeChrome({
    managed: { mode: "absent" },
    sync: {
      "pal:a": { name: "One", swatches: MINE },
      "pal:b": { name: "Two", swatches: [{ name: "Other", hex: "#ABCDEF", order: 0 }] },
      paletteOrder: ["a", "b"],
      activePaletteId: "a",
      // Explicit opt-OUT: since 2026-08-24 the flag defaults ON, so a test
      // about revealing the switcher has to start from a stored false.
      multiPalette: false,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
    assert.equal(page.byId("switcher").hidden, true, "opted out: no chooser, and both palettes still stored");

    const toggle = /** @type {HTMLInputElement} */ (page.byId("multi-palette"));
    toggle.checked = true;
    toggle.dispatchEvent(new page.window.Event("change"));
    await waitFor(() => page.byId("switcher").hidden === false, { label: "the opt-in to reveal it" });
    assert.equal(fake.sync.snapshot().multiPalette, true, "and it is remembered");
  } finally {
    page.unmount();
  }
});

test("options: the selector agrees with the editor for an opted-in user who never picked", async () => {
  // The DOM makes silence dangerous here. With no option carrying `selected`
  // the browser defaults the select to its FIRST option, and org entries are
  // listed first - so a user with an UNLOCKED org palette, the opt-in on and
  // no explicit choice would have seen an org palette shown as selected while
  // the editor underneath held, and edited, their own first palette.
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: false },
    sync: {
      "pal:a": { name: "Alpha", swatches: MINE },
      "pal:b": { name: "Beta", swatches: [{ name: "B", hex: "#ABCDEF", order: 0 }] },
      paletteOrder: ["a", "b"],
      multiPalette: true,
      // deliberately no activePaletteId: the state a freshly opted-in user is in
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { timeoutMs: 4000, label: "the switcher" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    assert.equal(select.value, "a", "their own first palette, not the organization's");
    assert.deepEqual(page.shownHexes(), ["#111111"], "which is what the editor shows");
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)), "and it is editable");
  } finally {
    page.unmount();
  }
});

test("options: unlocking with CHANGED org colours shows the new ones, not the old", async () => {
  // bd 0ld, end to end: one policy write that both edits the colours and lifts
  // the lock. Without wasManaged the page restored the pre-lock stash, which
  // for a user with nothing of their own is the PREVIOUS org palette - leaving
  // the editor on colours the pickers had already moved off.
  // The lock must be TAKEN during the session: a page that LOADS locked has no
  // stash, so the unlock falls through to the current policy and the bug is
  // invisible. Same shape as the removing-a-locked-policy case.
  const page = await mountOptions({ locked: false });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    page.fake.managed.setPolicy({ locked: true });
    await waitFor(() => page.byId("save").hidden === true, { label: "the lock, which fills the stash" });

    page.fake.managed.setPolicy({ value: [{ name: "Org Red", hex: "#D93025" }], locked: false });
    await waitFor(() => page.byId("save").hidden === false, { label: "the unlock" });
    await waitFor(() => page.shownHexes()[0] === "#D93025", { label: "the NEW org colours" });
  } finally {
    page.unmount();
  }
});

test("options: New palette creates entry two, and the switcher appears around it", async () => {
  // The field gap: the opt-in revealed nothing because nothing could ever
  // create the second entry. This is the flow a human actually walks.
  const fake = createFakeChrome({
    managed: { mode: "absent" },
    sync: {
      "pal:a": { name: "Alpha", swatches: MINE },
      paletteOrder: ["a"], activePaletteId: "a", multiPalette: true,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor" });
    assert.equal(page.byId("switcher").hidden, true, "one palette: no switcher yet");
    assert.equal(page.byId("new-palette").hidden, false, "but creation is offered");

    page.click(page.byId("new-palette"));
    await waitFor(() => page.byId("switcher").hidden === false, { label: "the switcher appears" });
    const data = fake.sync.snapshot();
    const palKeys = Object.keys(data).filter((k) => k.startsWith("pal:"));
    assert.equal(palKeys.length, 2, "a second per-key entry exists");
    assert.equal(data.paletteOrder.length, 2);
    assert.equal(data.activePaletteId, data.paletteOrder[1], "the new one is active");
    // One starter colour, not empty: creation should visibly do something, and
    // an empty palette blanks the Brand row, which reads as breakage.
    assert.equal(page.rows().length, 1, "a starter color marks the new palette");
    assert.deepEqual(page.shownHexes(), ["#1A73E8"]);
  } finally {
    page.unmount();
  }
});

test("options: an ENFORCED org-only user opts in BEFORE any creation is offered", async () => {
  // The owner ruling of 2026-08-23, end to end. Org colors alone REPLACE the
  // default palette - they used to reveal New palette as "the enforced user's
  // only path to colors of their own", which also seeded a phantom personal
  // Default that shadowed the org's colors on unlocked installs. Now creation
  // waits for the Multiple palettes opt-in, like everywhere else.
  const page = await mountOptions({ locked: true, sync: { multiPalette: false } });
  try {
    assert.equal(page.byId("new-palette").hidden, true,
      "no creation offer while org-only and opted out");

    const toggle = /** @type {HTMLInputElement} */ (page.byId("multi-palette"));
    toggle.checked = true;
    toggle.dispatchEvent(new page.window.Event("change"));
    await waitFor(() => page.byId("new-palette").hidden === false, { label: "the opt-in to reveal it" });
    // The note has to follow the toggle, not wait for a reload: it is now
    // pointing at a checkbox the user just ticked (roborev 4133).
    assert.match(page.text("managed-note"), /Use New palette below/,
      "the note follows the control that just appeared");

    page.click(page.byId("new-palette"));
    await waitFor(() => page.byId("switcher").hidden === false, { label: "org + own in the switcher" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    assert.deepEqual([...select.options].map((o) => o.textContent),
      [ORG_PALETTE_NAME, "Palette 1"],
      "NO personal Default materialized beside the org entry - the new palette is just new");
    assert.ok([...page.doc.querySelectorAll("#rows input")]
      .every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)),
      "the new palette is theirs: editable, not org-frozen");
    assert.match(page.status(), /New palette created/);
  } finally {
    page.unmount();
  }
});

test("options: an UNLOCKED org policy shows the switcher with the personal palette beside it", async () => {
  // The opt-in gate, end to end (owner ruling 2026-08-24). The flag now
  // defaults on, so this is the ordinary case: the org palette and the user's
  // own sit side by side, and their own stays active because an unlocked
  // policy never displaces a palette someone customized.
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: false },
    sync: {
      "pal:mine": { name: "My colors", swatches: MINE },
      paletteOrder: ["mine"], activePaletteId: "mine",
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { timeoutMs: 4000, label: "switcher" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    assert.deepEqual([...select.options].map((o) => o.value), ["org:0", "mine"]);
    assert.equal(select.value, "mine", "their own palette stays active - no push without a lock");
    // Managing what they already have follows the SWITCHER's visibility, not
    // the opt-in flag: this entry is selectable and editable on screen, so
    // hiding its controls behind Multiple palettes would strand them
    // (roborev 4101). Creating still IS opt-in-gated.
    assert.equal(page.byId("delete-palette").hidden, false, "own active palette: deletable");
    assert.equal(page.byId("rename-palette").hidden, false, "own active palette: renamable");
    assert.equal(page.byId("new-palette").hidden, false,
      "creation is offered: the opt-in defaults on since 2026-08-24");

    // Per-entry: selecting the org entry hides the management controls again.
    select.value = "org:0";
    select.dispatchEvent(new page.window.Event("change"));
    await waitFor(() => page.byId("delete-palette").hidden === true, { label: "org entry hides the controls" });
    assert.equal(page.byId("rename-palette").hidden, true);
  } finally {
    page.unmount();
  }
});

test("options: deleting a palette is two-step, and the switcher follows", async () => {
  const fake = createFakeChrome({
    managed: { mode: "absent" },
    sync: {
      "pal:a": { name: "Alpha", swatches: MINE },
      "pal:b": { name: "Beta", swatches: [{ name: "B", hex: "#ABCDEF", order: 0 }] },
      paletteOrder: ["a", "b"], activePaletteId: "b", multiPalette: true,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { timeoutMs: 4000, label: "switcher" });
    const del = /** @type {HTMLButtonElement} */ (page.byId("delete-palette"));
    assert.equal(del.hidden, false, "own active palette: deletable");

    page.click(del);
    assert.match(del.textContent ?? "", /Really delete/, "first click only arms");
    assert.ok("pal:b" in fake.sync.snapshot(), "nothing deleted yet");

    page.click(del);
    await waitFor(() => !("pal:b" in fake.sync.snapshot()), { label: "the deletion" });
    const data = fake.sync.snapshot();
    assert.deepEqual(data.paletteOrder, ["a"]);
    assert.equal(data.activePaletteId, "a");
    await waitFor(() => page.shownHexes()[0] === "#111111", { label: "editor on the survivor" });
    assert.equal(page.byId("switcher").hidden, true, "one palette left: no switcher");
  } finally {
    page.unmount();
  }
});

test("options: creating from ZERO stored palettes materializes Default beside the new one", async () => {
  // The field finding behind this: what a fresh user sees is the PACKAGED
  // DEFAULTS - a fallback, not an entry - so creating used to orphan the very
  // palette on screen, unreachable by the switcher forever after.
  const fake = createFakeChrome({ managed: { mode: "absent" }, sync: { multiPalette: true } });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "packaged defaults shown" });
    page.click(page.byId("new-palette"));
    await waitFor(() => page.byId("switcher").hidden === false, { label: "switcher" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    const labels = [...select.options].map((o) => o.textContent);
    assert.deepEqual(labels, ["Default", "Palette 1"],
      "the palette on screen survives as a real entry, and the FIRST palette you create is Palette 1 - numbering is by what is taken, not by how many exist");
    const data = fake.sync.snapshot();
    assert.equal(Object.keys(data).filter((k) => k.startsWith("pal:")).length, 2);
  } finally {
    page.unmount();
  }
});

test("options: rename commits on Enter, and org palettes cannot be renamed", async () => {
  const fake = createFakeChrome({
    managed: { mode: "absent" },
    sync: {
      "pal:a": { name: "Alpha", swatches: MINE },
      "pal:b": { name: "Beta", swatches: [{ name: "B", hex: "#ABCDEF", order: 0 }] },
      paletteOrder: ["a", "b"], activePaletteId: "a", multiPalette: true,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { timeoutMs: 4000, label: "switcher" });
    page.click(page.byId("rename-palette"));
    const input = /** @type {HTMLInputElement} */ (page.byId("rename-input"));
    assert.equal(input.hidden, false, "the selector swaps for an input");
    input.value = "Client work";
    input.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Enter" }));
    await waitFor(() => fake.sync.snapshot()["pal:a"].name === "Client work", { label: "the rename" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    assert.ok([...select.options].some((o) => o.textContent === "Client work"));
  } finally {
    page.unmount();
  }
});


// --- F2 from docs/TESTING-0.2.0.md: a policy whose every entry is unusable ---
// Field, 2026-08-24. The tester had this payload delivered while believing they
// had C1's, saw their own colors, and read it as enforcement failing. It is the
// opposite: an admin can publish garbage and the extension must degrade to the
// user's own colors rather than to a blank Brand row or a crash. Pinned here
// because the field cannot easily tell "correctly skipped" from "silently
// broken" - the two look identical on screen.

const DEGENERATE = [
  { name: "", hex: "#123456" },        // no name
  { name: "BadHex", hex: "notacolor" }, // no usable hex
];

async function mountDegenerate(sync = {}) {
  const fake = createFakeChrome({ managed: { mode: "value", value: DEGENERATE }, sync });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
  return { ...page, fake };
}

test("options: a policy with no usable entry falls back to the user's colors, silently and completely", async () => {
  const page = await mountDegenerate({ palette: MINE });
  try {
    assert.deepEqual(page.shownHexes(), ["#111111"], "their own colors, not the policy's");
    const inputs = [...page.doc.querySelectorAll("#rows input")];
    assert.ok(inputs.every((el) => !(/** @type {HTMLInputElement} */ (el).disabled)),
      "and still editable: nothing was enforced, because nothing usable was published");
    assert.equal(page.byId("managed-note").hidden, true,
      "no organization wording either - a skipped entry is not an org palette");
  } finally {
    page.unmount();
  }
});

test("options: Multiple palettes still works under a policy that published nothing usable", async () => {
  // The tester also reported that toggling Multiple palettes "did not do
  // anything" in this state. It must: the opt-in is what reveals New palette,
  // and it is gated on the flag alone, never on whether a policy exists.
  const page = await mountDegenerate({ palette: MINE, multiPalette: false });
  try {
    assert.equal(page.byId("new-palette").hidden, true, "hidden while opted out");
    const multi = /** @type {HTMLInputElement} */ (page.byId("multi-palette"));
    multi.checked = true;
    page.fire(multi, "change");
    await waitFor(() => page.byId("new-palette").hidden === false, { label: "New palette to appear" });
    // Toggling back off must take the note with it, or it names a button that
    // is no longer on screen (roborev 4133).
    multi.checked = false;
    page.fire(multi, "change");
    await waitFor(() => page.byId("new-palette").hidden === true, { label: "New palette to hide" });
    multi.checked = true;
    page.fire(multi, "change");
    await waitFor(() => page.byId("new-palette").hidden === false, { label: "New palette again" });
    assert.equal(page.byId("switcher").hidden, true,
      "and still no selector: one palette is not a choice");
  } finally {
    page.unmount();
  }
});


// --- roborev 4123, the options half ----------------------------------------
// The review proposed `baseline = isOrgPaletteId(id) ? ... : defaults` in
// switchPalette. `baseline` is what save() compares against to decide "these
// colors ARE the org's, so reattach instead of storing a redundant copy", and
// it is consulted while a personal palette is active. Pointing it at the
// packaged defaults there would both break this rule and invent a worse one:
// with baselineIsManaged still true, saving a palette that merely matched the
// PACKAGED colors would claim "Using your organization's colors" and clear the
// override.

test("options: saving an OWN palette that matches the org's reattaches, even after a switch", async () => {
  // Indexed reads are `| undefined` under noUncheckedIndexedAccess, and these
  // fixtures are fixed-length by construction.
  const orgA = /** @type {{name: string, hex: string}} */ (ORG[0]);
  const orgB = /** @type {{name: string, hex: string}} */ (ORG[1]);
  const nearlyOrg = [
    { name: orgA.name, hex: "#000000", order: 0 },
    { name: orgB.name, hex: orgB.hex, order: 1 },
  ];
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: false },
    sync: {
      "pal:mine": { name: "Mine", swatches: nearlyOrg },
      paletteOrder: ["mine"],
      activePaletteId: "org",
      palette: [],
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { timeoutMs: 4000, label: "the switcher" });
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    select.value = "mine";
    select.dispatchEvent(new page.window.Event("change"));
    await waitFor(() => page.shownHexes()[0] === "#000000", { label: "their own palette" });

    const hex = /** @type {Element} */ (page.doc.querySelectorAll("#rows [data-bpi-hex]")[0]);
    page.typeInto(hex, orgA.hex);
    const beforeSave = page.status();
    page.click(page.byId("save"));
    await waitFor(() => page.status() !== beforeSave, { label: "the save status" });

    assert.match(page.status(), /Using your organization's colors/,
      "arriving by the switcher must not change what saving org-identical colors means");
    assert.equal("palette" in fake.sync.snapshot() && fake.sync.snapshot().palette.length > 0, false,
      "and no redundant override is stored");
  } finally {
    page.unmount();
  }
});


test("options: an enforced user who OPTED OUT is pointed at the opt-in, not at New palette", () => {
  // The other half of the note branch. New palette is hidden for this user, so
  // naming it would be a dead end - the opt-in is the control they can act on.
  return (async () => {
    const page = await mountOptions({ locked: true, sync: { multiPalette: false } });
    try {
      assert.equal(page.byId("new-palette").hidden, true, "no New palette to point at");
      assert.match(page.text("managed-note"), /Turn on Multiple palettes below/);
    } finally {
      page.unmount();
    }
  })();
});


test("options: the enforced note follows the opt-in toggle in BOTH directions", async () => {
  // roborev 4133. The commit that made the note name the on-screen control
  // fixed the load path and left the live-toggle path alone, so a user who
  // flipped the checkbox was read instructions for the state they had just
  // left - the same failure the fix was about.
  const page = await mountOptions({ locked: true, sync: { multiPalette: false } });
  try {
    assert.match(page.text("managed-note"), /Turn on Multiple palettes below/, "opted out to begin with");
    const toggle = /** @type {HTMLInputElement} */ (page.byId("multi-palette"));

    toggle.checked = true;
    page.fire(toggle, "change");
    await waitFor(() => /Use New palette below/.test(page.text("managed-note")),
      { label: "the note to follow the opt-in ON" });
    assert.equal(page.byId("new-palette").hidden, false, "and it names something visible");

    toggle.checked = false;
    page.fire(toggle, "change");
    await waitFor(() => /Turn on Multiple palettes below/.test(page.text("managed-note")),
      { label: "the note to follow the opt-in OFF" });
    assert.equal(page.byId("new-palette").hidden, true, "which is right, because New palette is gone");
  } finally {
    page.unmount();
  }
});


test("options: the enforced note follows a palette SWITCH too", async () => {
  // Same class as roborev 4133, one path over: switchPalette changes
  // paletteReadOnly, which the note branches on, so the note has to move with
  // it or a user who switched to their own palette is still told they cannot
  // edit what is in front of them.
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: true },
    sync: {
      "pal:mine": { name: "Mine", swatches: MINE },
      paletteOrder: ["mine"],
      activePaletteId: "org",
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.byId("switcher").hidden === false, { timeoutMs: 4000, label: "the switcher" });
    assert.match(page.text("managed-note"), /cannot be edited here/, "enforced, on the org palette");

    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    select.value = "mine";
    select.dispatchEvent(new page.window.Event("change"));
    await waitFor(() => page.shownHexes()[0] === "#111111", { label: "their own palette" });

    assert.equal(/cannot be edited here/.test(page.text("managed-note")), false,
      "they are on their own palette now and CAN edit it - the note must not still say otherwise");
  } finally {
    page.unmount();
  }
});


test("options: the first palette you create is Palette 1, even beside a detached copy", async () => {
  // Field, 2026-08-25 (D2). Under an org policy, saving an edit detaches a copy
  // of the org palette, so an entry already exists - and counting entries then
  // adding one named the user's FIRST palette "Palette 2".
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG },
    sync: {
      "pal:mine": { name: "My colors", swatches: MINE },
      paletteOrder: ["mine"], activePaletteId: "mine", multiPalette: true,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
    page.click(page.byId("new-palette"));
    await waitFor(() => [...(/** @type {HTMLSelectElement} */ (page.byId("active-palette"))).options]
      .some((o) => o.textContent === "Palette 1"), { label: "Palette 1 to exist" });
    const labels = [...(/** @type {HTMLSelectElement} */ (page.byId("active-palette"))).options]
      .map((o) => o.textContent);
    assert.equal(labels.includes("Palette 2"), false, "no gap: nothing is named Palette 2 yet");
  } finally {
    page.unmount();
  }
});



test("options: detaching from the org palette reveals the chooser immediately", async () => {
  // Field, 2026-08-26 (C3). Saving an edit to the org palette CREATES a second
  // entry - "My colors" - so with the opt-in on there are two palettes and the
  // chooser must appear. It did not, because save() wrote the entry and never
  // re-read the collection, so the switcher kept counting the one it saw at
  // mount and hid a palette that genuinely existed until a reload.
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG },
    sync: { multiPalette: true },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.rows().length === 2, { timeoutMs: 4000, label: "the org palette" });
    assert.equal(page.byId("switcher").hidden, true,
      "org palette alone is one entry, and one is not a choice");

    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#00AA11");
    page.click(page.byId("save"));
    await waitFor(() => /as your own/.test(page.status()), { label: "the detaching save" });

    await waitFor(() => page.byId("switcher").hidden === false,
      { label: "the chooser to appear now that a second palette exists" });
    const labels = [...(/** @type {HTMLSelectElement} */ (page.byId("active-palette"))).options]
      .map((o) => o.textContent);
    assert.equal(labels.length, 2, `org + the new palette: ${labels.join(" | ")}`);
    assert.ok(labels.some((l) => /My colors/.test(l ?? "")), `the created palette is listed: ${labels.join(" | ")}`);
  } finally {
    page.unmount();
  }
});


test("options: opting OUT under enforcement returns to the org palette, keeping yours", async () => {
  // Owner, 2026-08-26: "If organization colors are enforced, then even after
  // creating a new palette, it should return to being set to the brand colors
  // if multiple palettes is then turned off." End to end, including the half
  // that matters just as much - their palette is still there afterwards.
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: true },
    sync: {
      "pal:mine": { name: "Mine", swatches: MINE },
      paletteOrder: ["mine"], activePaletteId: "mine", multiPalette: true,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.shownHexes()[0] === "#111111", { timeoutMs: 4000, label: "their own palette" });
    assert.equal(page.byId("save").hidden, false, "editable, because it is theirs");

    const toggle = /** @type {HTMLInputElement} */ (page.byId("multi-palette"));
    toggle.checked = false;
    page.fire(toggle, "change");

    await waitFor(() => page.shownHexes().length === ORG.length,
      { label: "the org palette to come back" });
    assert.deepEqual(page.shownHexes(), ORG.map((c) => c.hex),
      "enforced colors are what one palette means under a lock");
    assert.equal(page.byId("switcher").hidden, true, "and no chooser, which is what opting out asked for");

    const data = fake.sync.snapshot();
    assert.deepEqual(data["pal:mine"].swatches, MINE,
      "their palette is untouched - the pointer moved, nothing was deleted");
    assert.equal(data.activePaletteId, "org");
  } finally {
    page.unmount();
  }
});

test("options: opting out with an UNLOCKED org palette returns to the org colors too", async () => {
  // Owner, 2026-08-27: the rule is not scoped to enforcement. Unlocked, the
  // org palette is EDITABLE rather than read-only, but it is still what a
  // single-palette user lands on when an organization publishes one.
  const fake = createFakeChrome({
    managed: { mode: "value", value: ORG, locked: false },
    sync: {
      "pal:mine": { name: "Mine", swatches: MINE },
      paletteOrder: ["mine"], activePaletteId: "mine", multiPalette: true,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.shownHexes()[0] === "#111111", { timeoutMs: 4000, label: "their own palette" });
    const toggle = /** @type {HTMLInputElement} */ (page.byId("multi-palette"));
    toggle.checked = false;
    page.fire(toggle, "change");
    await waitFor(() => page.shownHexes().length === ORG.length,
      { label: "the org palette to come back unlocked" });
    assert.deepEqual(page.shownHexes(), ORG.map((c) => c.hex), "the organization's colors");
    assert.equal(page.byId("save").hidden, false,
      "and still EDITABLE - unlocked org colors are a starting point you may change");
    assert.deepEqual(fake.sync.snapshot()["pal:mine"].swatches, MINE, "their palette survives");
    assert.equal(fake.sync.snapshot().activePaletteId, "org");
  } finally {
    page.unmount();
  }
});
