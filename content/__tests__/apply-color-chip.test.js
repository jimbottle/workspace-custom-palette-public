/**
 * applyColor driven end to end against the Sheets dropdown-chip picker fixture
 * — bd workspace-custom-palette-gb3.
 *
 * WHY THIS FILE EXISTS. The apply flow is normally DOM glue verified by the
 * synthetic monitor rather than by Node tests (CLAUDE.md). That does not work
 * here: this picker is opened from a side panel, so it has no toolbar button
 * for the monitor to click, and the monitor's matrix cannot cover it at all.
 * Without this file the fix for the reported bug would ship with no automated
 * coverage of the failure it fixes.
 *
 * So the fixture is driven directly, with just enough of Google's own
 * behaviour simulated to make the flow real: clicking the Background tab swaps
 * which panel is laid out, and typing a hex updates that panel's R/G/B fields.
 * Everything else — the element lookups, the event sequences, the ordering —
 * is the shipping code.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { applyColor } from "../apply-color.js";
import { loadContract } from "../dom-contract.js";
import { hexToRgb } from "../../lib/hex.js";

const url = (/** @type {string} */ p) => fileURLToPath(new URL(p, import.meta.url));
const contract = JSON.parse(readFileSync(url("../../config/selectors.default.json"), "utf8"));
const CHIP = readFileSync(url("./fixtures/sheets-datavalidation-picker.html"), "utf8");

/**
 * Stand the fixture up in jsdom and install the globals apply-color's DOM glue
 * reaches for (it runs as a content script, so it uses them unqualified).
 * Returns a teardown that puts globalThis back.
 */
function mount() {
  const dom = new JSDOM(`<!doctype html><html><body>${CHIP}</body></html>`, {
    url: "https://docs.google.com/spreadsheets/d/abc/edit",
    pretendToBeVisual: true, // gives the window a requestAnimationFrame, which the poll loops use
  });
  const { window: win } = dom;
  const doc = win.document;
  // Layout shim, read live so toggling data-test-hidden really changes which
  // panel counts as visible — that is the behaviour under test.
  win.Element.prototype.getClientRects = /** @type {any} */ (function () {
    return this.closest("[data-test-hidden]") ? [] : [{ width: 10, height: 10 }];
  });
  // syntheticClick refuses a zero-sized element and reads getBoundingClientRect
  // (not getClientRects) to decide, so jsdom's all-zeros default would make
  // every click in the flow a silent no-op — the whole sequence would "pass"
  // while dispatching nothing.
  win.Element.prototype.getBoundingClientRect = /** @type {any} */ (function () {
    return this.closest("[data-test-hidden]")
      ? { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
      : { x: 0, y: 0, width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 };
  });
  // jsdom has no PointerEvent; the sequence only needs a constructible event
  // with the right type, and MouseEvent satisfies every listener here.
  if (!win.PointerEvent) /** @type {any} */ (win).PointerEvent = win.MouseEvent;

  /** @type {Record<string, PropertyDescriptor | undefined>} */
  const saved = {};
  const globals = { window: win, document: doc, location: win.location, PointerEvent: win.PointerEvent,
    MouseEvent: win.MouseEvent, KeyboardEvent: win.KeyboardEvent, Event: win.Event,
    HTMLInputElement: win.HTMLInputElement,
    // NOT performance: jsdom's Performance delegates to the global one, so
    // installing it over Node's makes performance.now() recurse until the stack
    // blows. The poll loops only need a monotonic clock; Node's is fine.
    requestAnimationFrame: win.requestAnimationFrame.bind(win) };
  for (const [k, v] of Object.entries(globals)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  const restore = () => {
    for (const [k, d] of Object.entries(saved)) {
      if (d) Object.defineProperty(globalThis, k, d);
      else delete (/** @type {any} */ (globalThis))[k];
    }
    win.close();
  };
  return { doc, win, restore };
}

/** Wire up the parts of Google's behaviour the flow actually depends on. */
function simulateGoogle(/** @type {Document} */ doc) {
  const log = { tabClicks: 0, okClicks: 0 };
  const tabs = [...doc.querySelectorAll(".docs-tabbar-tab")];
  const panels = [...doc.querySelectorAll(".docs-material-hsv-color-picker")];
  // The fixture is captured with Text selected: tabs = [Text, Background],
  // panels = [Background, Text]. Selecting a tab swaps which panel is laid out.
  const panelFor = (/** @type {number} */ i) => panels[i === 0 ? 1 : 0];
  tabs.forEach((tab, i) => {
    tab.addEventListener("click", () => {
      log.tabClicks++;
      for (const t of tabs) t.classList.remove("docs-tabbar-tab-selected");
      tab.classList.add("docs-tabbar-tab-selected");
      for (const p of panels) p.setAttribute("data-test-hidden", "");
      panelFor(i)?.removeAttribute("data-test-hidden");
    });
  });
  // Typing a hex and pressing Enter recomputes that panel's R/G/B (SPEC §3).
  for (const p of panels) {
    const hex = /** @type {HTMLInputElement} */ (p.querySelector("input.docs-material-hex-input"));
    hex.addEventListener("keydown", (/** @type {any} */ e) => {
      if (e.key !== "Enter") return;
      const rgb = hexToRgb(hex.value);
      if (!rgb) return;
      for (const [c, v] of [["red", rgb.r], ["green", rgb.g], ["blue", rgb.b]]) {
        /** @type {HTMLInputElement} */ (p.querySelector(`input.docs-material-rgba-${c}-input`)).value = String(v);
      }
    });
  }
  doc.querySelector(".previewableCustomColorMenuOkayButton")
    ?.addEventListener("click", () => { log.okClicks++; });
  const panel = (/** @type {number} */ i) => /** @type {HTMLElement} */ (panels[i]);
  const q = (/** @type {number} */ i, /** @type {string} */ sel) =>
    /** @type {HTMLInputElement} */ (panel(i).querySelector(sel));
  return { log, panels, tabs, q };
}

const BRAND = "#FE5917"; // Poppy — deliberately not any swatch in the fixture

test("a brand colour applies through the chip picker, with no reopen and no throw", async () => {
  loadContract(contract);
  const { doc, restore } = mount();
  try {
    const { log, q } = simulateGoogle(doc);

    // reopen = null is the whole point: this picker has no toolbar button, and
    // before the fix that made applyColor throw "can't apply in Sheets without
    // reopening the picker" (or, earlier still, "custom-color button not
    // found") and surface the user's banner.
    await applyColor(BRAND, doc, null);

    assert.equal(log.okClicks, 1, "OK was never clicked, so nothing was committed");
    assert.equal(log.tabClicks, 1, "the Background tab was not selected exactly once");

    // The hex must have landed on BACKGROUND (panels[0]), not on the Text panel
    // that was showing when the dialog opened.
    assert.equal(q(0, "input.docs-material-hex-input").value, BRAND, "the brand hex did not reach the Background field");
    assert.equal(q(1, "input.docs-material-hex-input").value, "#000000", "the brand hex overwrote the TEXT colour");
    // And the RGB fields committed, which is what OK reads.
    assert.equal(q(0, "input.docs-material-rgba-red-input").value, String(hexToRgb(BRAND)?.r));
  } finally {
    restore();
  }
});

test("with Background already selected the tab is left alone", async () => {
  loadContract(contract);
  const { doc, restore } = mount();
  try {
    const { log, panels, tabs, q } = simulateGoogle(doc);
    // Put the dialog in the other remembered state: Background showing.
    tabs[0]?.classList.remove("docs-tabbar-tab-selected");
    tabs[1]?.classList.add("docs-tabbar-tab-selected");
    panels[0]?.removeAttribute("data-test-hidden");
    panels[1]?.setAttribute("data-test-hidden", "");

    await applyColor(BRAND, doc, null);

    assert.equal(log.tabClicks, 0, "an already-selected tab must not be clicked again");
    assert.equal(log.okClicks, 1);
    assert.equal(q(0, "input.docs-material-hex-input").value, BRAND);
  } finally {
    restore();
  }
});

test("a brand colour that IS a built-in chip swatch takes the fast path", async () => {
  loadContract(contract);
  const { doc, restore } = mount();
  try {
    const { log } = simulateGoogle(doc);
    /** @type {string | null} */
    let clicked = null;
    for (const cell of doc.querySelectorAll("td.docs-material-colorpalette-cell")) {
      cell.addEventListener("click", () => { clicked = cell.getAttribute("aria-label"); });
    }
    // #e6e6e6 is a real swatch in the COLORS grid, and its aria-label carries
    // the hex — so applyColor should click it and never open the dialog.
    await applyColor("#E6E6E6", doc, null);
    assert.match(String(clicked), /#e6e6e6/);
    assert.equal(log.okClicks, 0, "the dialog was driven for a colour already on the palette");
  } finally {
    restore();
  }
});
