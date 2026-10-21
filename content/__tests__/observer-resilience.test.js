/**
 * The observer's failures must say our name, and one bad node must not take
 * out the good ones delivered alongside it.
 *
 * WHY THIS FILE EXISTS. `isPickerPopup`, `closestPopupRoot` and `assertInjected`
 * were called from the MutationObserver callback OUTSIDE any try/catch. All
 * three reach dom-contract. Uncaught, a throw aborted the callback — skipping
 * every remaining node in that delivery — and logged with no
 * "[brand-palette]" prefix, so anyone filtering the console for this extension
 * saw nothing while it was plainly broken. That is how a day of diagnosis went
 * sideways, chasing a stored `enabled` flag, an org policy and a phantom
 * palette wipe, none of which were the cause.
 *
 * HOW THESE TESTS INDUCE FAILURE, and why not the obvious way. An earlier draft
 * left the contract unloaded so every resolver threw. That was useless: with
 * detection throwing on every node there was nothing left to survive, so the
 * "survives" test passed identically against the unguarded code. Instead each
 * test loads the real contract and breaks ONE specific element — a node whose
 * `querySelector` throws, or a swatch cell whose `closest` throws — so a
 * healthy picker is present in the same delivery to prove the observer kept
 * going.
 *
 * NOTE ON MODULE STATE: `dom-contract` holds its contract in a module-global,
 * and it is a SINGLE shared instance across this file. A `?case=` query on
 * `picker-observer.js` does NOT isolate it — a relative specifier resolves by
 * path and drops the query, so every instance imports the same dom-contract
 * (verified). Hence every test here loads the contract explicitly rather than
 * depending on module state left behind by another test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { observePickers, refreshBrandRows } from "../picker-observer.js";
import { loadContract } from "../dom-contract.js";
import { MARK } from "../injector.js";

const contract = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../config/selectors.default.json", import.meta.url)), "utf8"),
);
const PALETTE = [{ name: "Poppy", hex: "#FE5917", order: 0 }];

/** Capture console.warn for the duration of `fn`. */
async function captureWarnings(/** @type {() => Promise<void> | void} */ fn) {
  /** @type {string[]} */
  const warnings = [];
  const real = console.warn;
  console.warn = (/** @type {any[]} */ ...args) => { warnings.push(args.map(String).join(" ")); };
  try {
    await fn();
  } finally {
    console.warn = real;
  }
  return warnings;
}

/**
 * A jsdom document plus the globals picker-observer reaches for unqualified as
 * a content script. `HTMLElement` must be jsdom's or the `instanceof` guard in
 * `handle` rejects every jsdom node before anything under test runs.
 */
function makeDoc() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", { pretendToBeVisual: true });
  const { window: win } = dom;
  /** @type {Record<string, any>} */
  const saved = {};
  const globals = {
    MutationObserver: win.MutationObserver,
    HTMLElement: win.HTMLElement,
    requestAnimationFrame: win.requestAnimationFrame.bind(win),
  };
  for (const [k, v] of Object.entries(globals)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  return {
    doc: win.document,
    win,
    restore() {
      for (const [k, d] of Object.entries(saved)) {
        if (d) Object.defineProperty(globalThis, k, d);
        else delete (/** @type {any} */ (globalThis))[k];
      }
      win.close();
    },
  };
}

/** A node that looks ordinary but explodes the moment detection queries it. */
function poisonedNode(/** @type {Document} */ doc) {
  const el = doc.createElement("div");
  // isPickerPopup checks `typeof node.querySelector === "function"` first, so
  // this has to BE a function that throws, not a missing one.
  el.querySelector = () => { throw new Error("detection exploded"); };
  return el;
}

/** A minimal but real picker: a swatch grid injectBrandRow can clone from. */
function healthyPicker(/** @type {Document} */ doc) {
  const menu = doc.createElement("div");
  menu.className = "goog-menu docs-colormenuitems";
  const tbody = doc.createElement("tbody");
  const table = doc.createElement("table");
  const tr = doc.createElement("tr");
  const td = doc.createElement("td");
  td.className = "docs-material-colorpalette-cell";
  td.setAttribute("role", "gridcell");
  td.setAttribute("aria-label", "black");
  td.appendChild(doc.createElement("div"));
  tr.appendChild(td);
  tbody.appendChild(tr);
  table.appendChild(tbody);
  menu.appendChild(table);
  return menu;
}

test("observePickers: a throwing resolver warns WITH the prefix and does not escape", async () => {
  loadContract(contract);
  const { doc, win, restore } = makeDoc();
  const warnings = await captureWarnings(async () => {
    const stop = observePickers(() => PALETTE, doc);
    doc.body.appendChild(poisonedNode(doc));
    await new Promise((r) => win.setTimeout(r, 50));
    stop();
  });
  assert.ok(warnings.length > 0, "the failure was completely silent");
  for (const w of warnings) assert.match(w, /^\[brand-palette\]/, `a failure did not name us: ${w}`);
  restore();
});

test("observePickers: one poisoned node does not take out a healthy picker in the SAME delivery", async () => {
  // THE regression test. A MutationObserver callback receives a batch; an
  // uncaught throw on one node aborts the whole callback, so every node after
  // it in that batch is silently skipped. Google mounts a picker as several
  // nodes at once, so "same delivery" is the real shape of the bug — and it is
  // what makes this test able to tell the guarded code from the unguarded.
  loadContract(contract);
  const { doc, win, restore } = makeDoc();
  const menu = healthyPicker(doc);
  await captureWarnings(async () => {
    const stop = observePickers(() => PALETTE, doc);
    // Both appends before any await, so they arrive in ONE callback invocation.
    doc.body.appendChild(poisonedNode(doc));
    doc.body.appendChild(menu);
    await new Promise((r) => win.setTimeout(r, 80));
    stop();
  });
  assert.ok(
    menu.querySelector(`[${MARK}]`),
    "the healthy picker never got its Brand row: one bad node killed the whole delivery",
  );
  restore();
});

test("refreshBrandRows: a throwing resolver warns WITH the prefix and does not escape", async () => {
  // refreshBrandRows runs from onManagedChanged, so an escaping throw here
  // lands on an ADMIN pushing a policy update.
  loadContract(contract);
  const { doc, restore } = makeDoc();
  const cell = doc.createElement("td");
  cell.className = "docs-material-colorpalette-cell";
  cell.setAttribute("role", "gridcell");
  // closestPopupRoot checks for a callable `closest` before using it.
  cell.closest = () => { throw new Error("menu resolution exploded"); };
  doc.body.appendChild(cell);

  const warnings = await captureWarnings(() => {
    assert.doesNotThrow(() => refreshBrandRows(() => PALETTE, doc));
  });
  assert.ok(warnings.length > 0, "a failed refresh said nothing at all");
  for (const w of warnings) assert.match(w, /^\[brand-palette\]/, `a failure did not name us: ${w}`);
  restore();
});

test("refreshBrandRows: a throwing getPalette aborts BEFORE removing the existing rows", async () => {
  // Ordering, not just guarding: the palette read moved above the teardown so a
  // failure cannot leave the user with the old rows gone and no new ones.
  loadContract(contract);
  const { doc, restore } = makeDoc();
  const row = doc.createElement("div");
  row.setAttribute(MARK, "1");
  doc.body.appendChild(row);

  const warnings = await captureWarnings(() => {
    refreshBrandRows(() => { throw new Error("storage went away"); }, doc);
  });
  // Assert against the LIVE document: restore() closes the jsdom window, after
  // which every query answers 0 and this would pass for the wrong reason.
  assert.equal(
    doc.querySelectorAll(`[${MARK}]`).length, 1,
    "the existing Brand row was torn down by a refresh that could not rebuild it",
  );
  assert.ok(warnings.some((w) => /^\[brand-palette\]/.test(w)), "the aborted refresh did not name us");
  restore();
});
