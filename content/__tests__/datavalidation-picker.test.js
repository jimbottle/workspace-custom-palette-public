/**
 * The Sheets data-validation dropdown-chip picker — bd workspace-custom-palette-gb3.
 *
 * WHY THIS FILE EXISTS. A field report on 2026-09-01 (0.2.0, English UI) showed
 * a brand colour failing to apply in the Data validation side panel with
 * "That brand color couldn't be applied." The picker there is a DIFFERENT
 * Closure widget from the three toolbar pickers: injection worked (it reuses
 * the docs-material-colorpalette markup) but every step of the custom-colour
 * flow resolved to nothing, because the contract only knew one widget.
 *
 * The fix gave a picker an `overrides` block and made dom-contract resolve the
 * open widget into a variant handle. These tests pin the three ways that can
 * silently go wrong — each of which applies the WRONG colour rather than
 * failing loudly, so none of them would surface as a banner:
 *
 *   - resolving the shared widget when the chip picker is open (or vice versa),
 *   - reading the hidden tab's hex/RGB fields because they come first in the DOM,
 *   - leaving the dialog on whatever tab the user last used.
 *
 * The pseudo-localized pass at the bottom is the same guarantee the toolbar
 * pickers get in locale-fixture.test.js: this widget's only distinguishing
 * marks must be class names, never visible text.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  loadContract, getPickerSelectors, findCustomColorEntry, findCustomDialogFor, findOkButtonFor,
  findVariantTab, variantAppliesOnOk, findHexInput, readDialogRgb, findCustomDialog,
  findSwatchByHex, findMainSwatchCells, findSectionLabel, findToolbarButton, isPickerPopup,
  closestPopupRoot,
} from "../dom-contract.js";
import { injectBrandRow, MARK, LABEL_MARK } from "../injector.js";
import { pseudo } from "./locale-fixture.test.js";

const url = (/** @type {string} */ p) => fileURLToPath(new URL(p, import.meta.url));
const contract = JSON.parse(readFileSync(url("../../config/selectors.default.json"), "utf8"));
const CHIP = readFileSync(url("./fixtures/sheets-datavalidation-picker.html"), "utf8");
const TOOLBAR = readFileSync(url("./fixtures/docs-color-picker.html"), "utf8");

const TEXT_ATTRS = [
  "aria-label", "aria-description", "aria-placeholder", "aria-roledescription",
  "aria-valuetext", "title", "data-tooltip", "placeholder", "alt", "label",
];

/** Rewrite every text node and text-bearing attribute into the pseudo-language. */
function pseudoLocalize(/** @type {Element} */ root) {
  const walkEl = (/** @type {Element} */ el) => {
    for (const a of TEXT_ATTRS) {
      const v = el.getAttribute(a);
      if (v !== null) el.setAttribute(a, pseudo(v));
    }
    for (const child of el.children) walkEl(child);
  };
  walkEl(root);
  const tw = root.ownerDocument.createTreeWalker(root, 4 /* SHOW_TEXT */);
  let n;
  while ((n = tw.nextNode())) if (n.nodeValue?.trim()) n.nodeValue = pseudo(n.nodeValue);
}

/**
 * Fixture DOM. As in locale-fixture.test.js, jsdom has no layout, so
 * getClientRects reports everything laid out EXCEPT a [data-test-hidden]
 * subtree — which is how the fixture models the inactive tab's panel.
 * @param {{ html?: string, localized?: boolean }} [opts]
 */
function makeDom({ html = CHIP, localized = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${html}</body></html>`);
  const { document: doc, Element } = dom.window;
  Element.prototype.getClientRects = /** @type {any} */ (function () {
    return this.closest("[data-test-hidden]") ? [] : [{ width: 10, height: 10 }];
  });
  if (localized) pseudoLocalize(doc.body);
  return { doc, menu: /** @type {HTMLElement} */ (doc.querySelector(".previewableColorMenu")) };
}

// ---- the contract entry -----------------------------------------------------

test("the dropdown-chip picker is declared, panel-opened, and applies on OK", () => {
  loadContract(contract);
  const sel = getPickerSelectors("sheets", "dataValidationChip");
  assert.ok(sel, "sheets.dataValidationChip is declared");
  assert.equal(sel.toolbarButton, undefined, "it is opened from a side panel, so it has no toolbar button");
  assert.ok(sel.overrides, "it declares its own widget");
  assert.equal(sel.appliesOnOk, true, "its OK is not isTrusted-gated (verified live 2026-09-01)");
  // Its popupRoot must NOT collide with the toolbar pickers': that is what lets
  // closestPopupRoot normalize the chip picker's two sub-palettes to one menu
  // and inject exactly one Brand row.
  assert.notEqual(sel.popupRoot, getPickerSelectors("sheets", "fill")?.popupRoot);
});

test("findToolbarButton returns null for a picker with no toolbar entry point", () => {
  loadContract(contract);
  const { doc } = makeDom();
  // Regression: the resolver used to pass `undefined` to querySelector, which
  // throws rather than reporting "this picker has no toolbar button".
  assert.equal(findToolbarButton("sheets", "dataValidationChip", /** @type {any} */ (doc)), null);
});

// ---- variant resolution -----------------------------------------------------

test("the OPEN widget decides the variant: chip picker resolves its own flow", () => {
  loadContract(contract);
  const { doc } = makeDom();
  const variant = findCustomColorEntry(doc);
  assert.ok(variant, "the Customize button was not found");
  assert.equal(variant.button.textContent, "Customize");
  assert.equal(variantAppliesOnOk(variant), true);

  const dialog = findCustomDialogFor(variant, /** @type {any} */ (doc));
  assert.ok(dialog, "the chip picker's own dialog was not found");
  assert.ok(dialog.classList.contains("previewableCustomColorMenu"));
  assert.equal(findOkButtonFor(variant, dialog)?.textContent, "OK");
});

test("the shared widget still resolves, and does NOT claim to apply on OK", () => {
  loadContract(contract);
  const { doc } = makeDom({ html: TOOLBAR });
  const variant = findCustomColorEntry(doc);
  assert.ok(variant, "the toolbar picker's custom-color button was not found");
  assert.equal(
    variantAppliesOnOk(variant), false,
    "the shared widget must stay on the register-then-reopen path — Sheets gates its OK on isTrusted",
  );
  const dialog = findCustomDialogFor(variant, /** @type {any} */ (doc));
  assert.ok(dialog?.classList.contains("color-dialog"), "resolved the wrong dialog for the shared widget");
});

// ---- trap 1: the hidden tab's fields come FIRST in the DOM -------------------

test("hex + RGB read the VISIBLE tab, not the first one in the document", () => {
  loadContract(contract);
  const { doc } = makeDom();
  const dialog = /** @type {any} */ (findCustomDialog(doc));
  assert.ok(dialog);

  // The trap, stated explicitly: an unfiltered lookup takes the HIDDEN
  // Background panel, because it is first in document order even though Text
  // is the selected tab.
  assert.equal(
    dialog.querySelector("input.docs-material-hex-input").value, "#123456",
    "fixture no longer models the trap: the first hex input should be the hidden one",
  );
  // The contract resolvers must take the laid-out one instead.
  assert.equal(findHexInput(dialog)?.value, "#000000", "findHexInput read the hidden tab's field");
  assert.deepEqual(readDialogRgb(dialog), { r: 0, g: 0, b: 0 }, "readDialogRgb read the hidden tab's fields");
});

// ---- trap 2: the tab is remembered across opens ------------------------------

test("findVariantTab points at Background and reports it is NOT selected", () => {
  loadContract(contract);
  const { doc } = makeDom();
  const variant = /** @type {any} */ (findCustomColorEntry(doc));
  const dialog = /** @type {any} */ (findCustomDialogFor(variant, /** @type {any} */ (doc)));

  const tab = findVariantTab(variant, dialog);
  assert.ok(tab, "the Background tab was not resolved");
  assert.equal(tab.el.textContent, "Background");
  assert.equal(
    tab.selected, false,
    "the fixture is captured with Text selected — apply must notice and switch",
  );

  // Once Background is selected, the apply path must NOT click again.
  tab.el.classList.add("docs-tabbar-tab-selected");
  assert.equal(findVariantTab(variant, dialog)?.selected, true);
});

test("findVariantTab is null for the untabbed shared widget", () => {
  loadContract(contract);
  const { doc } = makeDom({ html: TOOLBAR });
  const variant = /** @type {any} */ (findCustomColorEntry(doc));
  const dialog = /** @type {any} */ (findCustomDialogFor(variant, /** @type {any} */ (doc)));
  assert.equal(findVariantTab(variant, dialog), null);
});

// ---- injection --------------------------------------------------------------

test("the Brand row mounts in COLORS, not CUSTOM COLORS, and carries a label", () => {
  loadContract(contract);
  const { doc, menu } = makeDom();
  assert.equal(isPickerPopup(menu), true);
  // Both grids are the same size live, so this pins which one wins the tie.
  assert.equal(findMainSwatchCells(menu).length, 4);
  assert.ok(findSectionLabel(menu), "the picker's own COLORS header is the Brand label template");

  const palette = [{ name: "Poppy", hex: "#FE5917", order: 0 }, { name: "Sky", hex: "#9BDCD7", order: 1 }];
  assert.equal(injectBrandRow(menu, palette, doc), true);

  const row = /** @type {HTMLElement} */ (menu.querySelector(`[${MARK}]`));
  assert.ok(row, "no Brand row mounted");
  const grids = [...menu.querySelectorAll("table")];
  assert.equal(row.closest("table"), grids[0], "the Brand row landed in CUSTOM COLORS instead of COLORS");
  assert.deepEqual([...row.children].map((c) => c.getAttribute("aria-label")), ["Brand: Poppy", "Brand: Sky"]);
  assert.equal(menu.querySelector(`[${LABEL_MARK}]`)?.textContent, "Brand");
});

test("a chip-picker sub-palette normalizes to the one menu, so exactly one row injects", () => {
  loadContract(contract);
  const { doc, menu } = makeDom();
  const customCell = /** @type {HTMLElement} */ ([...doc.querySelectorAll("td.docs-material-colorpalette-cell")].at(-1));
  assert.equal(closestPopupRoot(customCell), menu, "the CUSTOM COLORS grid did not normalize up to the menu");

  const palette = [{ name: "Poppy", hex: "#FE5917", order: 0 }];
  assert.equal(injectBrandRow(menu, palette, doc), true);
  assert.equal(injectBrandRow(menu, palette, doc), false, "second inject must be a no-op");
  assert.equal(menu.querySelectorAll(`[${MARK}]`).length, 1);
});

test("findSwatchByHex cannot match a CUSTOM COLORS cell — hence appliesOnOk", () => {
  loadContract(contract);
  const { doc } = makeDom();
  // Live, the registered custom swatches carry no aria-label at all, so the
  // reopen-and-click path this extension uses everywhere else is impossible
  // here. If this ever starts matching, the appliesOnOk shortcut can be
  // revisited — but until then it is load-bearing, not an optimization.
  assert.equal(findSwatchByHex(doc, "#123456"), null);
  // A built-in COLORS cell does embed its hex, and matching one is fine: it
  // applies exactly the colour asked for.
  assert.ok(findSwatchByHex(doc, "#E6E6E6"));
});

// ---- locale -----------------------------------------------------------------

test("every chip-picker resolver survives a fully translated UI", () => {
  loadContract(contract);
  const { doc, menu } = makeDom({ localized: true });
  // Prove the pseudo-localizer actually rewrote this fixture's strings.
  assert.equal(menu.getAttribute("aria-label"), pseudo("Colors"));
  assert.equal(doc.querySelector(".previewableColorMenuCustomizeButton")?.textContent, pseudo("Customize"));

  const variant = findCustomColorEntry(doc);
  assert.ok(variant, "Customize button lost in a translated UI");
  const dialog = /** @type {any} */ (findCustomDialogFor(variant, /** @type {any} */ (doc)));
  assert.ok(dialog, "custom-colour dialog lost in a translated UI");
  assert.ok(findOkButtonFor(variant, dialog), "OK button lost in a translated UI");
  assert.equal(findHexInput(dialog)?.value, "#000000", "hex input lost in a translated UI");
  assert.deepEqual(readDialogRgb(dialog), { r: 0, g: 0, b: 0 }, "RGB readback lost in a translated UI");
  assert.ok(findSectionLabel(menu), "section header lost in a translated UI");
  assert.equal(findMainSwatchCells(menu).length, 4);

  // The tab is resolved by POSITION, so it must survive translation too — and
  // it must still be the second tab, not the one whose text reads "Background".
  const tab = findVariantTab(variant, dialog);
  assert.ok(tab, "Background tab lost in a translated UI");
  assert.equal(tab.el.textContent, pseudo("Background"));
  assert.equal(tab.selected, false);
});
