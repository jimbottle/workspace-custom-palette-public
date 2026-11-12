/**
 * Options page DOM glue, mounted under jsdom against a controllable fake
 * chrome. Companion to popup/__tests__/*; see
 * shared/__tests__/harness/fake-chrome.js for why the write gate exists.
 *
 * The options page has an explicit Save rather than the popup's auto-save, so
 * its bugs were about what Save reads and when: a snapshot taken before the
 * policy settles, and validation stuck behind an unbounded wait.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { createFakeChrome } from "../../shared/__tests__/harness/fake-chrome.js";
import { mountPage, waitFor } from "../../shared/__tests__/harness/mount.js";

const ORG = [
  { name: "Org Blue", hex: "#1A73E8" },
  { name: "Org Green", hex: "#34A853" },
];

// Above MANAGED_READ_TIMEOUT_MS (1500) so the page renders before the answer.
const LATE_MS = 1800;

/** @param {{ mode?: string, value?: unknown, delayMs?: number }} managed */
async function mountOptions(managed) {
  const fake = createFakeChrome({ managed });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
  return { ...page, fake };
}

test("options: an org policy seeds the editor and shows the note", async () => {
  const page = await mountOptions({ mode: "value", value: ORG });
  try {
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"]);
    assert.equal(page.byId("managed-note").hidden, false);
  } finally {
    page.unmount();
  }
});

test("options: saving colors identical to the org palette clears rather than copies", async () => {
  // A personal copy that merely matches the org palette buys the user nothing
  // and costs them every future admin update, so Save must clear instead.
  const page = await mountOptions({ mode: "value", value: ORG });
  try {
    page.click(page.byId("save"));
    await waitFor(() => page.status() !== "", { label: "save status" });
    assert.match(page.status(), /organization's colors/);
    assert.equal("palette" in page.fake.sync.snapshot(), false, "no redundant override stored");
  } finally {
    page.unmount();
  }
});

test("options: deleting every row clears the override instead of re-saving the defaults", async () => {
  const page = await mountOptions({ mode: "absent" });
  try {
    // Re-query each time: removing a row re-renders the container, which
    // detaches every button captured before the click.
    let guard = 20;
    while (page.rows().length > 0 && guard-- > 0) {
      page.click(page.doc.querySelector("#rows .bpi-remove"));
    }
    assert.equal(page.rows().length, 0);

    page.click(page.byId("save"));
    await waitFor(() => /All colors removed/.test(page.status()), { label: "empty-save status" });
    assert.equal("palette" in page.fake.sync.snapshot(), false);
  } finally {
    page.unmount();
  }
});

test("options: an invalid hex is reported immediately, not behind the policy wait", async () => {
  // Validation is pure and has nothing to do with the policy. Running it behind
  // the wait meant a user with a bad hex got no message at all until the read
  // landed, and none ever if it never did.
  const page = await mountOptions({ mode: "never" });
  try {
    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "nothex");

    const startedAt = Date.now();
    page.click(page.byId("save"));
    await waitFor(() => /Fix 1 swatch/.test(page.status()), {
      timeoutMs: 2000,
      label: "the validation message",
    });
    // The save-policy deadline is 3000ms; the message must not wait on it.
    assert.ok(
      Date.now() - startedAt < 1000,
      `validation must not wait for the policy (took ${Date.now() - startedAt}ms)`,
    );
    assert.equal("palette" in page.fake.sync.snapshot(), false);
  } finally {
    page.unmount();
  }
});

test("options: Save re-reads the editor after a late policy re-seeds it", async () => {
  // Review 3763. save() snapshotted the editor BEFORE the await that can
  // re-seed it, so on a managed install with a slow read a user clicking Save
  // persisted the PACKAGED DEFAULTS it had already captured as a permanent
  // personal override, announced "your organization's updates will no longer
  // change them", and reverted the org colors it had just put on screen.
  const page = await mountOptions({ mode: "late", value: ORG, delayMs: LATE_MS });
  try {
    assert.equal(page.rows().length, 7, "rendered the packaged defaults on the deadline");

    page.click(page.byId("save")); // clicked while the policy is still outstanding
    // Match the FINAL message, not the transient "Checking your organization's
    // colors..." that the wait itself puts up — that substring is a trap.
    await waitFor(() => /keep getting their updates/.test(page.status()), {
      timeoutMs: 5000,
      label: "save to resolve against the real policy",
    });

    assert.equal(
      "palette" in page.fake.sync.snapshot(), false,
      "the defaults on screen must not be persisted as an override",
    );
    assert.deepEqual(page.shownHexes(), ["#1A73E8", "#34A853"], "the org colors stay on screen");
  } finally {
    page.unmount();
  }
});

test("options: Reset restores the last SAVED colors without waiting on policy", async () => {
  // Reset used to re-seed the packaged defaults, which meant it had to know
  // whether a policy existed first - a bounded wait that could only refuse.
  // "Back to my last save" needs no policy at all, so the wait is gone: with a
  // policy that never answers, Reset still completes.
  const fake = createFakeChrome({
    managed: { mode: "never" },
    sync: { palette: [{ name: "Mine", hex: "#111111", order: 0 }] },
  });
  const page = { ...(await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome })), fake };
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "the editor" });
    assert.deepEqual(page.shownHexes(), ["#111111"]);
    const before = fake.sync.snapshot();

    const hex = /** @type {HTMLInputElement} */ (page.doc.querySelector("#rows [data-bpi-hex]"));
    hex.value = "#ABCDEF";
    hex.dispatchEvent(new page.window.Event("input", { bubbles: true }));
    await waitFor(() => page.shownHexes()[0] === "#ABCDEF", { label: "the unsaved edit" });

    page.click(page.byId("reset")); // first click arms the confirm
    await waitFor(() => /Really reset/.test(page.byId("reset").textContent ?? ""), { label: "the arm" });
    assert.match(page.status(), /last saved/, "the advisory says what Reset will do");
    page.click(page.byId("reset")); // second click confirms
    await waitFor(() => page.shownHexes()[0] === "#111111", {
      timeoutMs: 4000, label: "the restore (NOT a bounded refusal)",
    });
    assert.match(page.status(), /Restored your last saved colors/);
    assert.ok(!page.byId("status").classList.contains("error"), "restoring is not an error");
    assert.equal(page.byId("reset").textContent, "Reset", "re-armed off after confirming");
    // And it is a pure re-render: Reset must never touch storage.
    assert.deepEqual(fake.sync.snapshot(), before, "Reset wrote nothing");
  } finally {
    page.unmount();
  }
});

test("options: leaving the armed Reset alone disarms it without resetting", async () => {
  const fake = createFakeChrome({
    managed: { mode: "never" },
    sync: { palette: [{ name: "Mine", hex: "#111111", order: 0 }] },
  });
  const page = { ...(await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome })), fake };
  try {
    await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "the editor" });
    const hex = /** @type {HTMLInputElement} */ (page.doc.querySelector("#rows [data-bpi-hex]"));
    hex.value = "#ABCDEF";
    hex.dispatchEvent(new page.window.Event("input", { bubbles: true }));
    await waitFor(() => page.shownHexes()[0] === "#ABCDEF", { label: "the unsaved edit" });

    const reset = page.byId("reset");
    page.click(reset); // arm
    // Click away instead of confirming. jsdom fires blur() only on a FOCUSED
    // element and click does not move focus here, so deliver the event the way
    // the browser would when focus genuinely leaves.
    reset.dispatchEvent(new page.window.FocusEvent("blur"));
    await waitFor(() => reset.textContent === "Reset", { label: "the disarm" });

    page.click(reset); // arming again must be needed; one stray click never resets
    await waitFor(() => /Really reset/.test(reset.textContent ?? ""), { label: "re-armed" });
    assert.equal(page.shownHexes()[0], "#ABCDEF", "no reset happened along the way");
  } finally {
    page.unmount();
  }
});

test("options: the footer carries the manifest version beside the feedback links", async () => {
  // Read from chrome.runtime.getManifest() rather than baked into the markup,
  // so it cannot go stale on a version bump. The fake reports a version the
  // manifest does not have, which is what makes this assertion mean something.
  const fake = createFakeChrome({ version: "9.9.9-test" });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  try {
    await waitFor(() => page.text("version").length > 0, { label: "the version line" });
    // The separator lives inside the span, so the footer never renders a
    // dangling bullet while the fill is pending or if it never happens, and it
    // uses the SAME non-breaking spaces as the markup separator so the two gaps
    // match. `text()` trims, so assert on the raw node.
    const raw = page.byId("version").textContent;
    assert.equal(raw, "\u00A0\u00B7\u00A0Version 9.9.9-test");
    // Inline with the two links, not stranded in its own block.
    const footer = /** @type {HTMLElement} */ (page.doc.querySelector("footer"));
    assert.ok(footer.contains(page.byId("version")), "lives in the footer");
    assert.ok(footer.contains(page.byId("feedback")) && footer.contains(page.byId("report-bug")));
  } finally {
    page.unmount();
  }
});


test("options: the version still shows when the page FAILS to load", async () => {
  // The number's whole job is to be quotable in a bug report, and the moment
  // someone is most likely to file one is when this page has just told them
  // "Failed to load". Stranding the fill behind init()'s awaits left it blank
  // in exactly that state.
  const fake = createFakeChrome({ version: "9.9.9-test" });
  // Break the packaged-palette fetch that init() awaits first.
  const page = await mountPage("options/options.html", "options/options.js", {
    chrome: fake.chrome,
    fetch: async () => { throw new Error("network is down"); },
  });
  try {
    await waitFor(() => /Failed to load/.test(page.status()), { label: "the load failure" });
    assert.match(page.text("version"), /Version 9\.9\.9-test/,
      "the version must survive the failure path");
  } finally {
    page.unmount();
  }
});

test("neither host exposes an on/off switch, and a stored OFF is un-hidden once", async () => {
  // The switch was retired from the UI: nobody turns the colors off rather
  // than uninstalling. The `enabled` MECHANISM stays honored by the content
  // script (see FUTURE_IMPROVEMENTS.md) so re-adding it is a UI-only change -
  // but a 0.1.7 user who had toggled OFF would now be stranded invisible with
  // no control to find, so the worker's migration flips a stored false back
  // once. Both halves are the contract; this pins both.
  const { readFileSync } = await import("node:fs");
  for (const f of ["popup/popup.html", "options/options.html"]) {
    const src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
    assert.ok(!/id="show-colors"|id="enabled"/.test(src), `${f} still ships the retired switch`);
  }
  const fake = createFakeChrome({ sync: { enabled: false } });
  const { retireEnabledToggle } = await import("../../lib/storage.js");
  // The fake is a narrow stand-in, not the whole chrome surface; storage.js
  // only reaches for chrome.storage.sync.
  const g = /** @type {Record<string, unknown>} */ (/** @type {unknown} */ (globalThis));
  const prev = g.chrome;
  g.chrome = fake.chrome;
  try {
    assert.equal(await retireEnabledToggle(), true, "it reports the flip");
    assert.equal(fake.sync.snapshot().enabled, true, "the stranded user gets their colors back");
    assert.equal(await retireEnabledToggle(), false, "and it is a no-op ever after");
  } finally {
    g.chrome = prev;
  }
});

test("every page that uses the hidden attribute carries the [hidden] guard", async () => {
  // An author `display` rule beats the UA's [hidden]{display:none} regardless
  // of specificity, so a styled container silently ignores el.hidden = true.
  // That shipped an always-visible "your organization provides these colors"
  // note and an unhideable palette switcher - three field reports before it
  // was found, because jsdom does not apply CSS to hidden semantics and so no
  // jsdom test CAN catch the live behavior. This pins the guard instead.
  const { readFileSync } = await import("node:fs");
  for (const f of ["popup/popup.html", "options/options.html", "feedback/feedback.html"]) {
    let src;
    try { src = readFileSync(new URL(`../../${f}`, import.meta.url), "utf8"); }
    catch { continue; }
    if (!src.includes("hidden")) continue;
    assert.ok(src.includes("[hidden] { display: none !important; }"),
      `${f} uses the hidden attribute but lacks the [hidden] guard`);
  }
});


// --- m5g: import creates a palette instead of overwriting one ---------------

/** Mount the options page with the opt-in on and one stored palette of the user's. */
async function mountSwitcherOptions(sync = {}) {
  const fake = createFakeChrome({
    managed: { mode: "absent" },
    sync: {
      "pal:a": { name: "Alpha", swatches: [{ name: "A", hex: "#111111", order: 0 }] },
      paletteOrder: ["a"],
      activePaletteId: "a",
      multiPalette: true,
      ...sync,
    },
  });
  const page = await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome });
  await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
  return { ...page, fake };
}

test("options: with Multiple palettes on, import creates a NEW palette and switches to it", async () => {
  // Overwriting whatever palette happens to be selected is a destructive answer
  // to "add these colors" once a switcher exists (bd
  // workspace-custom-palette-m5g). The palette that was active must come
  // through the import byte for byte.
  const page = await mountSwitcherOptions();
  try {
    const box = /** @type {HTMLTextAreaElement} */ (page.byId("text"));
    box.value = "Poppy #FE5917\nGrass #385834";
    assert.equal(page.byId("import").textContent, "Import as new palette", "the button says what it will do");
    page.click(page.byId("import"));
    // The click asks for a name first and creates nothing yet.
    await waitFor(() => !page.byId("import-name-row").hidden, { label: "the name step" });
    assert.match(page.status(), /Found 2 colors/);
    assert.equal(/** @type {HTMLInputElement} */ (page.byId("import-name")).value, "Imported", "a name is suggested");
    assert.deepEqual(page.fake.sync.snapshot().paletteOrder, ["a"], "nothing is created before the name is confirmed");
    page.click(page.byId("import-create"));
    await waitFor(() => /into a new palette/.test(page.status()), { label: "the import" });

    assert.equal(page.byId("import-name-row").hidden, true, "the name step closes");
    assert.match(page.status(), /"Imported"/, "the status names the palette it made");
    assert.deepEqual(page.shownHexes(), ["#FE5917", "#385834"], "the editor is on the imported colors");

    const data = page.fake.sync.snapshot();
    assert.deepEqual(data["pal:a"].swatches.map((/** @type {any} */ sw) => sw.hex), ["#111111"],
      "Alpha, which was active, is untouched");
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    assert.equal(select.value, data.activePaletteId, "the switcher shows what is now active");
    assert.notEqual(data.activePaletteId, "a", "and that is the new palette, not Alpha");
    assert.equal([...select.options].some((o) => o.textContent === "Imported"), true,
      "the new palette is listed by name");
  } finally {
    page.unmount();
  }
});

test("options: a second import does not collide with the first palette's name", async () => {
  const page = await mountSwitcherOptions({
    "pal:i": { name: "Imported", swatches: [{ name: "X", hex: "#999999", order: 0 }] },
    paletteOrder: ["a", "i"],
  });
  try {
    const box = /** @type {HTMLTextAreaElement} */ (page.byId("text"));
    box.value = "Poppy #FE5917";
    page.click(page.byId("import"));
    await waitFor(() => !page.byId("import-name-row").hidden, { label: "the name step" });
    assert.equal(/** @type {HTMLInputElement} */ (page.byId("import-name")).value, "Imported 2");
    page.click(page.byId("import-create"));
    await waitFor(() => /into a new palette/.test(page.status()), { label: "the import" });
    assert.match(page.status(), /"Imported 2"/);
  } finally {
    page.unmount();
  }
});

test("options: an import takes the name typed in the name step, confirmed with Enter", async () => {
  // Owner, 2026-11-12: an import silently became a palette called "Imported".
  // The name is now asked for, and Enter in the field is the same as Create.
  const page = await mountSwitcherOptions();
  try {
    /** @type {HTMLTextAreaElement} */ (page.byId("text")).value = "Poppy #FE5917";
    page.click(page.byId("import"));
    await waitFor(() => !page.byId("import-name-row").hidden, { label: "the name step" });
    const input = /** @type {HTMLInputElement} */ (page.byId("import-name"));
    input.value = "  Client deck  ";
    input.dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => /into a new palette/.test(page.status()), { label: "the import" });
    assert.match(page.status(), /"Client deck"/);
    const data = page.fake.sync.snapshot();
    assert.equal(data[`pal:${data.activePaletteId}`].name, "Client deck", "stored trimmed, and active");
    assert.deepEqual(page.shownHexes(), ["#FE5917"]);
  } finally {
    page.unmount();
  }
});

test("options: confirming the name step twice creates one palette, not two", async () => {
  // A double click, or Enter followed by a click, used to start a second
  // createPalette while the first was pending (roborev 7244).
  const page = await mountSwitcherOptions();
  try {
    /** @type {HTMLTextAreaElement} */ (page.byId("text")).value = "Poppy #FE5917";
    page.click(page.byId("import"));
    await waitFor(() => !page.byId("import-name-row").hidden, { label: "the name step" });
    page.click(page.byId("import-create"));
    page.click(page.byId("import-create"));
    page.byId("import-name").dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
    await waitFor(() => /into a new palette/.test(page.status()), { label: "the import" });
    await new Promise((r) => setTimeout(r, 100));
    const data = page.fake.sync.snapshot();
    assert.equal(data.paletteOrder.length, 2, "Alpha plus exactly one import");
    // Racing creates each read the same order and the last write wins, so the
    // loser is not a second listed palette but an orphaned stored one that
    // nothing lists and that still counts against the sync quota.
    assert.equal(Object.keys(data).filter((k) => k.startsWith("pal:")).length, 2, "no orphaned palette is stored");
  } finally {
    page.unmount();
  }
});

test("options: a blank name falls back to the suggestion", async () => {
  const page = await mountSwitcherOptions();
  try {
    /** @type {HTMLTextAreaElement} */ (page.byId("text")).value = "Poppy #FE5917";
    page.click(page.byId("import"));
    await waitFor(() => !page.byId("import-name-row").hidden, { label: "the name step" });
    /** @type {HTMLInputElement} */ (page.byId("import-name")).value = "   ";
    page.click(page.byId("import-create"));
    await waitFor(() => /into a new palette/.test(page.status()), { label: "the import" });
    assert.match(page.status(), /"Imported"/);
  } finally {
    page.unmount();
  }
});

test("options: cancelling the name step creates nothing", async () => {
  const page = await mountSwitcherOptions();
  try {
    /** @type {HTMLTextAreaElement} */ (page.byId("text")).value = "Poppy #FE5917";
    for (const cancel of [
      () => page.click(page.byId("import-cancel")),
      () => page.byId("import-name").dispatchEvent(new page.window.KeyboardEvent("keydown", { key: "Escape", bubbles: true })),
    ]) {
      page.click(page.byId("import"));
      await waitFor(() => !page.byId("import-name-row").hidden, { label: "the name step" });
      cancel();
      assert.equal(page.byId("import-name-row").hidden, true, "the name step closes");
      assert.match(page.status(), /Nothing was created/);
    }
    const data = page.fake.sync.snapshot();
    assert.deepEqual(data.paletteOrder, ["a"], "no palette was made");
    assert.equal(data.activePaletteId, "a");
    assert.deepEqual(page.shownHexes(), ["#111111"], "the editor is still on Alpha");
  } finally {
    page.unmount();
  }
});

test("options: turning Multiple palettes off closes an open name step", async () => {
  // With the opt-in off an import loads the editor and makes no palette, so a
  // "Create palette" button left on screen would promise the wrong thing.
  const page = await mountSwitcherOptions();
  try {
    /** @type {HTMLTextAreaElement} */ (page.byId("text")).value = "Poppy #FE5917";
    page.click(page.byId("import"));
    await waitFor(() => !page.byId("import-name-row").hidden, { label: "the name step" });
    const toggle = /** @type {HTMLInputElement} */ (page.byId("multi-palette"));
    toggle.checked = false;
    page.fire(toggle, "change");
    assert.equal(page.byId("import-name-row").hidden, true);
    assert.equal(page.byId("import").textContent, "Import from box");
  } finally {
    page.unmount();
  }
});

test("options: with Multiple palettes OFF, import still only loads the editor", async () => {
  // The default experience is deliberately unchanged: no switcher means no
  // second palette to make, so import loads and Save decides.
  // Explicitly opted OUT: the flag defaults ON since 2026-08-24, so the
  // load-into-the-editor path is now the minority case and has to be asked for.
  const fake = createFakeChrome({ managed: { mode: "absent" }, sync: { multiPalette: false } });
  const page = { ...(await mountPage("options/options.html", "options/options.js", { chrome: fake.chrome })), fake };
  await waitFor(() => page.rows().length > 0, { timeoutMs: 4000, label: "editor rows" });
  try {
    const box = /** @type {HTMLTextAreaElement} */ (page.byId("text"));
    box.value = "Poppy #FE5917\nGrass #385834";
    page.click(page.byId("import"));
    await waitFor(() => /Review, then Save/.test(page.status()), { label: "the import" });
    assert.deepEqual(page.shownHexes(), ["#FE5917", "#385834"]);
    assert.equal("palette" in page.fake.sync.snapshot(), false, "nothing written until Save");
  } finally {
    page.unmount();
  }
});


/**
 * Give the mounted page a clipboard. jsdom has none, which is also the
 * "clipboard refused" case, so a test that wants a refusal just skips this.
 * @param {{ window: any }} page @returns {string[]} everything written, in order
 */
function stubClipboard(page) {
  /** @type {string[]} */
  const written = [];
  Object.defineProperty(page.window.navigator, "clipboard", {
    configurable: true,
    value: { writeText: async (/** @type {string} */ t) => { written.push(t); } },
  });
  return written;
}

test("options: Copy current palette puts the palette on the clipboard", async () => {
  // The button said "Copy" and the status said "Copied", but all it did was
  // fill the box (owner, 2026-11-11).
  const page = await mountSwitcherOptions();
  try {
    const written = stubClipboard(page);
    page.click(page.byId("export"));
    await waitFor(() => /clipboard/.test(page.status()), { label: "the copy status" });
    assert.deepEqual(written, ["A #111111"]);
    assert.equal(/** @type {HTMLTextAreaElement} */ (page.byId("text")).value, "A #111111", "the box shows it too");
    assert.equal(page.byId("status").classList.contains("error"), false);
  } finally {
    page.unmount();
  }
});

test("options: a refused clipboard is reported, never a false Copied", async () => {
  const page = await mountSwitcherOptions(); // no clipboard in jsdom: writeText throws
  try {
    page.click(page.byId("export"));
    await waitFor(() => page.status() !== "", { label: "the copy status" });
    assert.match(page.status(), /Could not reach the clipboard/);
    assert.equal(page.byId("status").classList.contains("error"), true);
    assert.equal(/** @type {HTMLTextAreaElement} */ (page.byId("text")).value, "A #111111",
      "the text is still in the box to copy by hand");
  } finally {
    page.unmount();
  }
});

test("options: opening Import / export shows the palette on screen, not the example", async () => {
  const page = await mountSwitcherOptions();
  try {
    const io = /** @type {HTMLDetailsElement} */ (page.byId("io"));
    const box = /** @type {HTMLTextAreaElement} */ (page.byId("text"));
    // jsdom fires `toggle` itself, a task after `open` changes, as a browser
    // does. Wait for that one rather than dispatching a second by hand.
    const settle = () => new Promise((r) => setTimeout(r, 30));
    io.open = true;
    await waitFor(() => box.value !== "", { label: "the preview" });
    assert.equal(box.value, "A #111111");

    // A list the user pasted is a pending import and must survive a reopen.
    box.value = "Poppy #FE5917";
    io.open = false;
    await settle();
    io.open = true;
    await settle();
    assert.equal(box.value, "Poppy #FE5917", "a pasted list was overwritten");
  } finally {
    page.unmount();
  }
});

test("options: Import on the untouched preview does not duplicate the palette", async () => {
  // The box now holds the palette on screen by default, so a stray Import click
  // would otherwise create a copy named "Imported" and switch to it.
  const page = await mountSwitcherOptions();
  try {
    const io = /** @type {HTMLDetailsElement} */ (page.byId("io"));
    io.open = true;
    await waitFor(() => /** @type {HTMLTextAreaElement} */ (page.byId("text")).value !== "", { label: "the preview" });
    page.click(page.byId("import"));
    await waitFor(() => page.status() !== "", { label: "the import status" });
    assert.match(page.status(), /Nothing new to import/);
    assert.deepEqual(page.fake.sync.snapshot().paletteOrder, ["a"], "no new palette was created");
  } finally {
    page.unmount();
  }
});

test("options: Import refuses the page's own preview even after the palette changed under it", async () => {
  // The preview is written when the section opens. Edit a row afterwards and
  // the box no longer equals the palette on screen, so a guard that compares
  // against the current palette misses: Import would create "Imported" from
  // the OLD colors, though the user never touched the box (roborev 7186).
  const page = await mountSwitcherOptions();
  try {
    const box = /** @type {HTMLTextAreaElement} */ (page.byId("text"));
    /** @type {HTMLDetailsElement} */ (page.byId("io")).open = true;
    await waitFor(() => box.value !== "", { label: "the preview" });
    assert.equal(box.value, "A #111111");

    page.typeInto(page.doc.querySelector("#rows [data-bpi-hex]"), "#222222");
    page.click(page.byId("import"));
    await waitFor(() => page.status() !== "", { label: "the import status" });

    assert.match(page.status(), /Nothing new to import/);
    assert.deepEqual(page.fake.sync.snapshot().paletteOrder, ["a"], "a duplicate palette was created");
    assert.deepEqual(page.shownHexes(), ["#222222"], "the unsaved edit was thrown away");
  } finally {
    page.unmount();
  }
});

test("options: an open preview follows a palette switch, but never a pasted list", async () => {
  const page = await mountSwitcherOptions({
    "pal:b": { name: "Beta", swatches: [{ name: "B", hex: "#222222", order: 0 }] },
    paletteOrder: ["a", "b"],
  });
  try {
    const box = /** @type {HTMLTextAreaElement} */ (page.byId("text"));
    const select = /** @type {HTMLSelectElement} */ (page.byId("active-palette"));
    const switchTo = async (/** @type {string} */ id, /** @type {string} */ hex) => {
      select.value = id;
      select.dispatchEvent(new page.window.Event("change", { bubbles: true }));
      await waitFor(() => page.shownHexes()[0] === hex, { label: `the switch to ${id}` });
    };
    /** @type {HTMLDetailsElement} */ (page.byId("io")).open = true;
    await waitFor(() => box.value !== "", { label: "the preview" });

    await switchTo("b", "#222222");
    assert.equal(box.value, "B #222222", "the preview still shows the previous palette");

    box.value = "Poppy #FE5917";
    await switchTo("a", "#111111");
    assert.equal(box.value, "Poppy #FE5917", "a pasted list was overwritten by a switch");
  } finally {
    page.unmount();
  }
});

test("no shipped file branches on HOW the extension was installed", async () => {
  // Force install and Allow install must be indistinguishable to this
  // extension. The managed payload is delivered per extension ID, not per
  // installation, and nothing here may quietly disagree - an admin deploying
  // by force must get exactly the behavior tested under allow.
  //
  // Static rather than behavioral because there is no behavior to test: the
  // guarantee is the ABSENCE of a branch, and the only way that regresses is
  // someone adding one.
  //
  // The file list is DERIVED, not written down. A hand-kept list covered 12 of
  // the 29 shipped modules and silently missed the real content-script entry
  // point (roborev 4129), which made the guarantee weaker than the commit
  // claiming it said. This walks the same directories dev/package.sh zips and
  // applies the same exclusions, so the scan cannot drift from what ships.
  const { readdirSync, readFileSync } = await import("node:fs");
  const { join } = await import("node:path");

  const ROOT = new URL("../../", import.meta.url).pathname;
  const PACKAGED_DIRS = ["background", "content", "config", "feedback", "lib", "options", "popup", "shared"];
  // dev-reload.js is excluded from the zip by dev/package.sh, so it may ask.
  const EXEMPT = new Set(["background/dev-reload.js"]);

  /** @param {string} rel @returns {string[]} */
  function walk(rel) {
    /** @type {string[]} */
    const out = [];
    for (const entry of readdirSync(join(ROOT, rel), { withFileTypes: true })) {
      if (entry.name === "__tests__") continue; // not packaged
      const child = `${rel}/${entry.name}`;
      if (entry.isDirectory()) out.push(...walk(child));
      else if (entry.name.endsWith(".js")) out.push(child);
    }
    return out;
  }

  const shipped = PACKAGED_DIRS.flatMap(walk).filter((f) => !EXEMPT.has(f)).sort();
  // A floor, so a glob that silently returns nothing cannot pass this test by
  // scanning zero files - which is how a derived list fails open.
  assert.ok(shipped.length >= 25, `expected the packaged set, found ${shipped.length}: ${shipped}`);
  for (const must of ["content/loader.js", "content/health-probe.js", "background/service-worker.js"]) {
    assert.ok(shipped.includes(must), `${must} must be scanned`);
  }

  for (const rel of shipped) {
    const src = readFileSync(join(ROOT, rel), "utf8");
    const code = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    assert.equal(/chrome\.management/.test(code), false,
      `${rel} reads chrome.management - install source must not change behavior`);
    assert.equal(/installType/.test(code), false,
      `${rel} reads installType - install source must not change behavior`);
  }
});
