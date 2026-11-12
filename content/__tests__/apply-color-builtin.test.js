/**
 * Two ways a Brand click could go wrong on a healthy picker — bd `workspace-custom-palette-ox4` (field report, 0.2.2, Sheets).
 *
 * 1. THE SWATCH IS NAMED BY ITS HEX. Importing a bare `#1A73E8` line names the
 *    swatch "#1A73E8", so its Brand cell is labelled "Brand: #1A73E8". A Brand
 *    cell is a clone of a palette cell, so findSwatchByHex took it for an
 *    already-registered custom swatch and apply-color "applied" the colour by
 *    clicking the cell the user had just clicked. That re-entered apply until
 *    the stack overflowed: no colour, and (the error being thrown inside an
 *    event listener) no banner either.
 *
 * 2. THE HEX IS ONE OF GOOGLE'S OWN COLOURS. Google adds no custom swatch for a
 *    colour its main grid already has (verified live in Sheets 2026-11-11 with
 *    #000000 and #ff0000), and labels its grid by name, not hex. So the dialog
 *    applied the colour, the confirmation pass could never find a swatch, and
 *    every click bannered a colour that had landed.
 *
 * The DOM is a minimal stand-in, as in apply-color-confirm.test.js: what is
 * under test is which element apply-color chooses to click.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { applyColor } from "../apply-color.js";
import { loadContract, findSwatchByHex, findBuiltinSwatchByColor } from "../dom-contract.js";
import { MARK } from "../marks.js";

const contract = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../config/selectors.default.json", import.meta.url)), "utf8"),
);

const cell = (/** @type {string} */ label, /** @type {string} */ rgb) => `
  <td class="docs-material-colorpalette-cell" role="gridcell" aria-label="${label}">
    <div class="docs-material-colorpalette-colorswatch" style="background-color: ${rgb};"></div></td>`;

/**
 * A toolbar picker: a three-cell main grid (labelled by NAME, in a made-up
 * language, to prove nothing keys on the text), a one-cell theme grid that also
 * holds red, our Brand row, the custom-colour button and its dialog.
 * @param {{ brandLabel?: string, brandRgb?: string, hiddenPicker?: boolean }} [opts]
 */
function mount({ brandLabel = "Brand: Poppy", brandRgb = "rgb(254, 89, 23)", hiddenPicker = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="goog-menu docs-colormenuitems" id="picker" ${hiddenPicker ? "data-test-hidden" : ""}>
      <table id="main"><tbody>
        <tr>${cell("zwart", "rgb(0, 0, 0)")}${cell("rood", "rgb(255, 0, 0)")}${cell("wit", "rgb(255, 255, 255)")}</tr>
        <tr ${MARK}="1">${cell(brandLabel, brandRgb)}</tr>
      </tbody></table>
      <table id="theme"><tbody><tr>${cell("Theme Color rood", "rgb(255, 0, 0)")}</tr></tbody></table>
      <div class="docs-customcolorpalette-add-custom-color-button" role="button"></div>
    </div>
    <div class="docs-material-gm-dialog color-dialog" id="dialog" data-test-hidden>
      <input class="docs-material-hex-input">
      <div role="button" class="docs-material-gm-dialog-call-to-action-button" id="ok"></div>
    </div>
  </body></html>`, { url: "https://docs.google.com/spreadsheets/d/x/edit", pretendToBeVisual: true });
  const { window: win } = dom;
  const doc = win.document;
  win.Element.prototype.getClientRects = /** @type {any} */ (function () {
    return this.closest("[data-test-hidden]") ? [] : [{ width: 10, height: 10 }];
  });
  win.Element.prototype.getBoundingClientRect = /** @type {any} */ (function () {
    return this.closest("[data-test-hidden]")
      ? { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
      : { x: 0, y: 0, width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 };
  });
  if (!win.PointerEvent) /** @type {any} */ (win).PointerEvent = win.MouseEvent;

  const dialog = /** @type {HTMLElement} */ (doc.getElementById("dialog"));
  let dialogOpened = 0;
  doc.querySelector(".docs-customcolorpalette-add-custom-color-button")
    ?.addEventListener("click", () => { dialogOpened++; dialog.removeAttribute("data-test-hidden"); });
  doc.getElementById("ok")?.addEventListener("click", () => dialog.setAttribute("data-test-hidden", ""));

  /** @type {string[]} labels of the swatch cells that received a click, in order */
  const clicked = [];
  doc.addEventListener("click", (e) => {
    const td = /** @type {Element} */ (e.target).closest?.("td[aria-label]");
    if (td) clicked.push(`${td.closest("table")?.id}:${td.getAttribute("aria-label")}`);
  }, true);

  /** @type {Record<string, any>} */
  const saved = {};
  const globals = { window: win, document: doc, location: win.location, PointerEvent: win.PointerEvent,
    MouseEvent: win.MouseEvent, KeyboardEvent: win.KeyboardEvent, Event: win.Event,
    HTMLInputElement: win.HTMLInputElement, requestAnimationFrame: win.requestAnimationFrame.bind(win) };
  for (const [k, v] of Object.entries(globals)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  return {
    doc, clicked,
    dialogOpened: () => dialogOpened,
    restore() {
      for (const [k, d] of Object.entries(saved)) {
        if (d) Object.defineProperty(globalThis, k, d);
        else delete (/** @type {any} */ (globalThis))[k];
      }
      win.close();
    },
  };
}

// ---- 1. a swatch named by its own hex ---------------------------------------

test("findSwatchByHex never returns one of our own Brand cells", () => {
  loadContract(contract);
  const { doc, restore } = mount({ brandLabel: "Brand: #FE5917" });
  try {
    assert.equal(findSwatchByHex(doc, "#FE5917"), null);
  } finally { restore(); }
});

test("a Brand swatch NAMED by its hex goes through the dialog, not back into itself", async () => {
  loadContract(contract);
  const { doc, clicked, dialogOpened, restore } = mount({ brandLabel: "Brand: #FE5917" });
  try {
    await applyColor("#FE5917", doc, null);
    assert.deepEqual(clicked, [], "apply-color clicked a swatch cell; the only candidate was our own Brand cell");
    assert.equal(dialogOpened(), 1, "the colour was never registered through the custom-colour dialog");
  } finally { restore(); }
});

// ---- 2. a brand colour that is one of Google's own --------------------------

test("a brand hex equal to a built-in colour clicks that cell and never opens the dialog", async () => {
  loadContract(contract);
  const { doc, clicked, dialogOpened, restore } = mount({ brandLabel: "Brand: Signal red", brandRgb: "rgb(255, 0, 0)" });
  try {
    await applyColor("#ff0000", doc, () => { throw new Error("must not need a reopen"); });
    // The MAIN grid's cell: not the theme-linked copy, and not our own Brand
    // cell, which is painted the very same colour.
    assert.deepEqual(clicked, ["main:rood"]);
    assert.equal(dialogOpened(), 0);
  } finally { restore(); }
});

test("findBuiltinSwatchByColor matches on the painted colour and skips hidden pickers", () => {
  loadContract(contract);
  const shown = mount();
  try {
    assert.equal(findBuiltinSwatchByColor(shown.doc, "#FFFFFF")?.getAttribute("aria-label"), "wit");
    assert.equal(findBuiltinSwatchByColor(shown.doc, "#fff")?.getAttribute("aria-label"), "wit");
    // A colour only OUR row is painted is not a built-in.
    assert.equal(findBuiltinSwatchByColor(shown.doc, "#FE5917"), null);
    assert.equal(findBuiltinSwatchByColor(shown.doc, "nope"), null);
  } finally { shown.restore(); }
  const hidden = mount({ hiddenPicker: true });
  try {
    assert.equal(findBuiltinSwatchByColor(hidden.doc, "#FFFFFF"), null, "matched a cell in a cached, hidden picker");
  } finally { hidden.restore(); }
});

test("a colour that is NOT built in still takes the dialog route", async () => {
  // The shortcut must not swallow ordinary brand colours.
  loadContract(contract);
  const { doc, clicked, dialogOpened, restore } = mount();
  try {
    await applyColor("#FE5917", doc, null);
    assert.deepEqual(clicked, []);
    assert.equal(dialogOpened(), 1);
  } finally { restore(); }
});
