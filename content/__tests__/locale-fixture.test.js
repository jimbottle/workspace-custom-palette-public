/**
 * Locale regression tests — bd workspace-custom-palette-7ya.
 *
 * WHY THIS FILE EXISTS. Two field bugs in a row were locale bugs that every
 * automated tier called green, because every tier runs in an English UI:
 *   - 0.1.4: every Brand swatch tooltipped as the clone source's color name
 *     ("sort") in a Danish UI.
 *   - 0.1.6: apply failed outright in Docs AND Sheets for a Danish user. The
 *     contract keyed the hex input on aria-label="Hex color"; Danish renders
 *     "Hex-farve", so findHexInput matched nothing, registerViaDialog threw,
 *     and the user got the custom-color dialog stuck open on its default color
 *     plus "That brand color couldn't be applied."
 *
 * THE APPROACH: pseudo-localization. Rather than needing a Danish Google
 * account, we take a fixture captured from the real (English) picker and
 * rewrite every human-readable string in it — every text node and every
 * text-bearing attribute — into a pseudo-language. Anything the extension can
 * still find afterwards is genuinely locale-independent. This is strictly
 * stronger than testing Danish specifically: it fails for ANY language.
 *
 * Hex tokens (#rrggbb) are deliberately preserved: Google embeds them in custom
 * swatch aria-labels and they are identical in every language, so findSwatchByHex
 * is allowed to depend on them. That carve-out is the ONLY localized-string
 * dependency the extension is permitted.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  loadContract, findCustomColorButton, findCustomDialog, findHexInput, findOkButton,
  readDialogRgb, findMainSwatchCells, findSectionLabel, findSwatchByHex,
  findExpandedColorButton, findToolbarButton, isPickerPopup,
} from "../dom-contract.js";
import { injectBrandRow, MARK, LABEL_MARK } from "../injector.js";

const url = (/** @type {string} */ p) => fileURLToPath(new URL(p, import.meta.url));
const contract = JSON.parse(readFileSync(url("../../config/selectors.default.json"), "utf8"));
const FIXTURE = readFileSync(url("./fixtures/docs-color-picker.html"), "utf8");

// ---- pseudo-localization ---------------------------------------------------

/**
 * Attributes whose values are human-readable text Google translates. A selector
 * that keys on any of these is a locale bug waiting to happen.
 */
const TEXT_ATTRS = [
  "aria-label", "aria-description", "aria-placeholder", "aria-roledescription",
  "aria-valuetext", "title", "data-tooltip", "placeholder", "alt", "label",
];

/**
 * Rewrite `s` into a pseudo-language, preserving #rrggbb tokens (see header).
 *
 * The substitution is a plain letter shift rather than something prettier
 * because it MUST be total: an untranslated letter is a hole in the guard, and
 * that is not hypothetical — an earlier draft of this file used a partial
 * accent table that left R/G/B alone, and 0.1.6's input[aria-label="R"] sailed
 * straight through the "localized" DOM.
 * @param {string} s @returns {string}
 */
export function pseudo(s) {
  /** @type {string[]} */
  const kept = [];
  // Angle-bracketed index as the placeholder, so it cannot collide with digits
  // that occur naturally in the string ("dark grey 4", "255") and survives the
  // letter shift below untouched (it has no letters).
  const masked = s.replace(/#[0-9a-fA-F]{3,8}\b/g, (m) => `<<${kept.push(m) - 1}>>`);
  const shifted = masked.replace(/[a-zA-Z]/g, (ch) => {
    const base = ch <= "Z" ? 65 : 97;
    return String.fromCharCode(((ch.charCodeAt(0) - base + 1) % 26) + base);
  });
  return shifted.replace(/<<(\d+)>>/g, (_, i) => kept[Number(i)] ?? "");
}


/**
 * Translate every text node and text-bearing attribute under `root`, in place.
 * @param {Element} root
 */
function pseudoLocalize(root) {
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
 * Fresh fixture DOM. jsdom has no layout, so getClientRects is shimmed to report
 * everything as laid out EXCEPT nodes marked data-test-hidden — which is how the
 * fixture models Google's retained/cached hidden dialog.
 * @param {{ localized?: boolean }} [opts]
 */
function makeDom({ localized = false } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>${FIXTURE}</body></html>`);
  const { document: doc, Element } = dom.window;
  Element.prototype.getClientRects = /** @type {any} */ (function () {
    return this.closest("[data-test-hidden]") ? [] : [{ width: 10, height: 10 }];
  });
  if (localized) pseudoLocalize(doc.body);
  return { dom, doc, picker: /** @type {HTMLElement} */ (doc.querySelector(".goog-menu")) };
}

/** Every contract resolver the inject + apply path depends on, as name -> check. */
const RESOLVERS = {
  "picker detection": (/** @type {any} */ d, /** @type {any} */ p) => isPickerPopup(p) === true,
  "main swatch grid": (/** @type {any} */ d, /** @type {any} */ p) => findMainSwatchCells(p).length === 12,
  "section label (Brand header template)": (/** @type {any} */ d, /** @type {any} */ p) => !!findSectionLabel(p),
  "custom-color button": (/** @type {any} */ d) => !!findCustomColorButton(d),
  "custom dialog (the visible one)": (/** @type {any} */ d) => !!findCustomDialog(d),
  "hex input": (/** @type {any} */ d) => !!findHexInput(/** @type {any} */ (findCustomDialog(d))),
  "OK button": (/** @type {any} */ d) => !!findOkButton(/** @type {any} */ (findCustomDialog(d))),
  "RGB readback": (/** @type {any} */ d) => {
    const rgb = readDialogRgb(/** @type {any} */ (findCustomDialog(d)));
    return !!rgb && rgb.r === 255 && rgb.g === 0 && rgb.b === 0;
  },
  "registered custom swatch by hex": (/** @type {any} */ d) => !!findSwatchByHex(d, "#1A73E8"),
  "expanded toolbar button (for reopen)": (/** @type {any} */ d) => !!findExpandedColorButton(d),
  "docs text toolbar button": (/** @type {any} */ d) => !!findToolbarButton("docs", "text", d),
  // The table toolset (captured 2026-08-30). Same locale rule: the ids are what
  // the contract keys on, and they are identical in every UI language.
  "docs table border toolbar button": (/** @type {any} */ d) => !!findToolbarButton("docs", "border", d),
  "docs table cell background toolbar button": (/** @type {any} */ d) => !!findToolbarButton("docs", "tableFill", d),
};

// ---- the tests -------------------------------------------------------------

test("fixture is faithful: every resolver finds its element in the English DOM", () => {
  loadContract(contract);
  const { doc, picker } = makeDom();
  for (const [name, check] of Object.entries(RESOLVERS)) {
    assert.ok(check(doc, picker), `resolver failed on the captured English fixture: ${name}`);
  }
});

test("every resolver still works when the whole UI is translated", () => {
  loadContract(contract);
  const { doc, picker } = makeDom({ localized: true });
  // Sanity-check that the pseudo-localizer actually rewrote the strings it
  // should have — otherwise this test could pass by doing nothing at all.
  const hex = doc.querySelector("input.docs-material-hex-input");
  assert.equal(hex?.getAttribute("aria-label"), pseudo("Hex color"));
  assert.notEqual(hex?.getAttribute("aria-label"), "Hex color");
  assert.equal(doc.querySelector(".docs-material-rgba-red-input")?.getAttribute("aria-label"), "S"); // "R" shifted

  /** @type {string[]} */
  const broken = [];
  for (const [name, check] of Object.entries(RESOLVERS)) if (!check(doc, picker)) broken.push(name);
  assert.deepEqual(broken, [], "these resolvers depend on English text and will fail for non-English users");
});

test("the pseudo-locale check would have caught the 0.1.6 apply bug", () => {
  // Frozen copy of the contract that actually shipped in 0.1.6 (selectors
  // version 2026-08-15, dist/custom-color-palette-0.1.6.zip). If this test ever
  // stops failing on the localized DOM, the pseudo-localizer has gone toothless
  // and the guard above is no longer guarding anything.
  const shipped016 = {
    ...contract,
    version: "2026-08-15",
    shared: {
      ...contract.shared,
      hexInput: 'input.docs-material-hex-input[aria-label="Hex color"]',
      redInput: 'input[aria-label="R"]',
      greenInput: 'input[aria-label="G"]',
      blueInput: 'input[aria-label="B"]',
    },
  };
  loadContract(shipped016);

  const english = makeDom();
  assert.ok(findHexInput(/** @type {any} */ (findCustomDialog(english.doc))), "0.1.6 worked in English — that is why it shipped");

  const localized = makeDom({ localized: true });
  const dialog = findCustomDialog(localized.doc);
  assert.equal(findHexInput(/** @type {any} */ (dialog)), null, "0.1.6's hex selector must miss in a translated UI");
  assert.equal(readDialogRgb(/** @type {any} */ (dialog)), null, "0.1.6's RGB readback must miss too");
  // ...which is exactly the user-visible failure: registerViaDialog throws
  // "hex input not found" and leaves the dialog open on its default color.
});

test("the injected Brand row survives a translated UI (0.1.4 tooltip regression)", () => {
  loadContract(contract);
  const { doc, picker } = makeDom({ localized: true });
  const palette = [
    { name: "Poppy", hex: "#FE5917", order: 1 },
    { name: "Sky", hex: "#9BDCD7", order: 0 },
  ];
  assert.equal(injectBrandRow(picker, palette, doc), true);

  const row = picker.querySelector(`[${MARK}]`);
  assert.ok(row, "Brand row did not mount in a translated picker");
  const label = picker.querySelector(`[${LABEL_MARK}]`);
  assert.ok(label, "Brand label did not mount — its template is the localized section header");
  assert.equal(label.textContent, "Brand", "our own label must not inherit the cloned header's text");

  const cells = [...row.children];
  assert.deepEqual(cells.map((c) => c.getAttribute("aria-label")), ["Brand: Sky", "Brand: Poppy"]);
  // The 0.1.4 bug: the clone kept the source cell's title, so every Brand swatch
  // tooltipped as the source color's LOCALIZED name. Assert no descendant still
  // carries the translated source tooltip.
  for (const cell of cells) {
    const tip = /** @type {string} */ (cell.getAttribute("title"));
    assert.match(tip, /^(Sky|Poppy) \(#[0-9A-Fa-f]{6}\)$/);
    for (const el of cell.querySelectorAll("[title]")) {
      assert.equal(el.getAttribute("title"), tip, "a cloned descendant kept the source swatch's translated tooltip");
    }
    // data-tooltip is a SECOND, independent tooltip source: Google's own tooltip
    // layer reads it, so a stale clone name shows through even when every title
    // is correct (monitor/src/check.ts asserts both live). Without this the
    // injector's data-tooltip branch could be deleted with the suite still green.
    for (const el of [cell, ...cell.querySelectorAll("[data-tooltip]")]) {
      if (el.hasAttribute("data-tooltip")) {
        assert.equal(el.getAttribute("data-tooltip"), tip, "a clone kept the source swatch's translated data-tooltip");
      }
    }
  }
  // Guard the guard: if the fixture ever loses its data-tooltip attributes the
  // loop above silently checks nothing, which is how this gap opened.
  assert.ok(
    cells.some((c) => c.querySelectorAll("[data-tooltip]").length > 0 || c.hasAttribute("data-tooltip")),
    "fixture no longer carries data-tooltip, so that half of the clone rewrite is untested",
  );
});

test("a Brand swatch never inherits the source cell's 'selected' state", () => {
  // bug workspace-custom-palette-auq, found by the pre-0.1.7 smoke matrix in the
  // Sheets text picker: injectBrandRow clones a real palette cell, and when that
  // source is the currently applied colour Google has already marked it
  // selected. Every Brand swatch then rendered Google's checkmark and announced
  // as "selected". The fixture's first main-grid cell carries that state, and it
  // is the clone source.
  loadContract(contract);
  const { doc, picker } = makeDom();
  const source = findMainSwatchCells(picker)[0];
  assert.equal(source?.getAttribute("aria-selected"), "true", "fixture no longer models a selected source cell");
  assert.match(source?.className ?? "", /cell-selected/);

  assert.equal(injectBrandRow(picker, [{ name: "Poppy", hex: "#FE5917", order: 0 }], doc), true);
  const cell = /** @type {HTMLElement} */ (picker.querySelector(`[${MARK}]`)?.children[0]);
  assert.ok(cell);
  assert.equal(cell.getAttribute("aria-selected"), "false", "clone kept the source cell's aria-selected");
  assert.equal(cell.querySelectorAll("[aria-selected='true']").length, 0);
  assert.ok(!/cell-selected/.test(cell.outerHTML), "clone kept the selected class, so it renders Google's checkmark");
  // The source itself must be left alone — we clear the CLONE, not the picker.
  assert.equal(source?.getAttribute("aria-selected"), "true", "clearing the clone must not disturb Google's own cell");
});
