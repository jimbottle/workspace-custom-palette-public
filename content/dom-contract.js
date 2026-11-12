/**
 * dom-contract — the ONLY module in the extension that knows selector strings.
 * Every other module (picker-observer, injector, apply-color, health-probe)
 * calls the resolver functions here. This is the maintenance lever: when Google
 * changes its DOM, the fix is a new selectors.json, not a code change.
 *
 * Architecture commitment (CLAUDE.md): no raw selector appears anywhere else.
 *
 * The contract object is the parsed selectors.json (remote-with-fallback,
 * loaded by the service worker / content bootstrap). The pure accessors
 * (resolveApp, getPickerSelectors) are unit-tested without a DOM; the DOM
 * resolvers are thin querySelector wrappers over the strings.
 *
 * @typedef {"sheets" | "docs" | "slides"} App
 * @typedef {{
 *   customColorButton?: string, customDialog?: string, okButton?: string,
 *   tab?: string, tabSelected?: string, tabIndex?: number
 * }} PickerOverrides
 * @typedef {{
 *   toolbarButton?: string, popupRoot: string,
 *   appliesOnOk?: boolean, overrides?: PickerOverrides, comment?: string
 * }} PickerSelectors
 * @typedef {{
 *   customColorButton: string, customDialog: string, okButton: string,
 *   tab: string | null, tabSelected: string | null, tabIndex: number,
 *   appliesOnOk: boolean, isShared: boolean
 * }} CustomColorSpec  one custom-colour widget, as declared by the contract
 * @typedef {CustomColorSpec & { button: HTMLElement }} CustomColorVariant
 *   a CustomColorSpec bound to the entry-point button that is open right now.
 *   Opaque to callers: they pass it back to the resolvers below.
 * @typedef {{
 *   swatchCell: string, swatchInner: string, swatchSelected?: string,
 *   customColorButton: string,
 *   customDialog: string, hexInput: string, okButton: string,
 *   redInput: string, greenInput: string, blueInput: string,
 *   sectionLabel?: string
 * }} SharedSelectors
 * @typedef {{
 *   version: string,
 *   shared: SharedSelectors,
 *   apps: Record<App, { pickers: Record<string, PickerSelectors> }>
 * }} Contract
 */

import { normalizeHex, cssColorToHex } from "../lib/hex.js";
import { MARK } from "./marks.js";

/** @type {Contract | null} */
let active = null;

/**
 * Install the active contract (parsed selectors.json). Called once at content
 * bootstrap with the remote-or-packaged contract.
 * @param {Contract} contract
 */
export function loadContract(contract) {
  if (!contract || !contract.shared || !contract.apps) {
    throw new Error("dom-contract: invalid contract shape");
  }
  active = contract;
}

/** @returns {Contract} */
function require_() {
  if (!active) throw new Error("dom-contract: no contract loaded — call loadContract first");
  return active;
}

/** @returns {string} the loaded contract version, or "unloaded". */
export function contractVersion() {
  return active ? active.version : "unloaded";
}

/**
 * Map a document URL to its app. Pure — unit-tested.
 * @param {{ pathname: string }} loc  e.g. window.location
 * @returns {App | null}
 */
export function resolveApp(loc) {
  const p = loc?.pathname ?? "";
  if (p.startsWith("/spreadsheets/")) return "sheets";
  if (p.startsWith("/document/")) return "docs";
  if (p.startsWith("/presentation/")) return "slides";
  return null;
}

/**
 * The picker-type selectors for an app, or null if unknown. Pure.
 * @param {App} app
 * @param {string} pickerType
 * @returns {PickerSelectors | null}
 */
export function getPickerSelectors(app, pickerType) {
  return require_().apps?.[app]?.pickers?.[pickerType] ?? null;
}

/**
 * Every picker-type known for an app. Pure.
 * @param {App} app
 * @returns {string[]}
 */
export function pickerTypes(app) {
  return Object.keys(require_().apps?.[app]?.pickers ?? {});
}

/** @returns {SharedSelectors} */
export function shared() {
  return require_().shared;
}

// ---- custom-color variants -------------------------------------------------

/**
 * Is `el` actually laid out? The single "is this the live instance" test used
 * throughout this module. Google retains hidden/cached copies of the picker,
 * the custom-color dialog AND (in the tabbed dropdown-chip dialog) a whole
 * second set of hex/RGB inputs for the inactive tab — so an unfiltered
 * querySelector routinely returns a node that is in the DOM but invisible, and
 * writing to it fails silently. getClientRects rather than offsetParent:
 * offsetParent is null for position:fixed nodes even when visible.
 * @param {Element} el @returns {boolean}
 */
function laidOut(el) {
  return el.getClientRects().length > 0;
}

/**
 * First laid-out match for `sel` under `root`, or null.
 * @param {ParentNode} root @param {string} sel @returns {any}
 */
function visibleOne(root, sel) {
  return Array.from(root.querySelectorAll(sel)).find(laidOut) ?? null;
}

/**
 * Every custom-color WIDGET the contract knows about, most specific first.
 *
 * Most pickers share one widget (the `shared` block: "add a custom color" ->
 * a gm-dialog with hex/RGB fields -> a call-to-action OK). Some surfaces use a
 * different one entirely and declare it as a picker `overrides` block — the
 * Sheets data-validation dropdown-chip picker is the first (captured live
 * 2026-09-01): its entry point is "Customize", its dialog is a goog-menu, its
 * OK is a flat button, and it carries Text/Background tabs.
 *
 * Overrides come FIRST so a specific widget always wins over the generic
 * fallback; the shared default is last. Resolution is by "whose entry point is
 * VISIBLE right now", so a caller never has to know which picker is open.
 * @returns {CustomColorSpec[]}
 */
function customColorVariants() {
  const c = require_();
  const s = c.shared;
  /** @type {CustomColorSpec} */
  const base = {
    customColorButton: s.customColorButton,
    customDialog: s.customDialog,
    okButton: s.okButton,
    tab: /** @type {string | null} */ (null),
    tabSelected: /** @type {string | null} */ (null),
    tabIndex: -1,
    appliesOnOk: false,
    isShared: true,
  };
  /** @type {CustomColorSpec[]} */
  const out = [];
  for (const appEntry of Object.values(c.apps ?? {})) {
    for (const picker of Object.values(appEntry?.pickers ?? {})) {
      const o = /** @type {any} */ (picker)?.overrides;
      if (!o) continue;
      out.push({
        customColorButton: o.customColorButton ?? base.customColorButton,
        customDialog: o.customDialog ?? base.customDialog,
        okButton: o.okButton ?? base.okButton,
        tab: o.tab ?? null,
        tabSelected: o.tabSelected ?? null,
        tabIndex: typeof o.tabIndex === "number" ? o.tabIndex : -1,
        // The flag lives on the PICKER, not the overrides block: it is a fact
        // about the widget's apply behaviour, not a selector.
        appliesOnOk: /** @type {any} */ (picker).appliesOnOk === true,
        isShared: false,
      });
    }
  }
  out.push(base);
  return out;
}

/**
 * Resolve the custom-color widget that is open RIGHT NOW, by finding the
 * variant whose entry-point button is visible. The returned handle is opaque —
 * callers pass it back to findCustomDialogFor / findOkButtonFor /
 * findVariantTab / variantAppliesOnOk rather than reading selectors off it,
 * which is what keeps every selector string inside this module.
 *
 * Resolving once and carrying the handle also removes the "which widget am I
 * in?" ambiguity from the rest of the flow: the answer is "the one whose button
 * we just clicked".
 * @param {ParentNode} root @returns {CustomColorVariant | null}
 */
export function findCustomColorEntry(root) {
  for (const v of customColorVariants()) {
    const button = visibleOne(root, v.customColorButton);
    if (button) return { ...v, button };
  }
  return null;
}

/** @param {CustomColorVariant | null | undefined} variant @returns {boolean} */
export function variantAppliesOnOk(variant) {
  return variant?.appliesOnOk === true;
}

/**
 * Is this the SHARED custom-colour widget (the toolbar pickers), as opposed to
 * a picker that declares its own `overrides`? Only the shared widget's palette
 * is known to be a grid of plain single colours; an override picker may reuse
 * the markup for something else (the Sheets dropdown chip's cells are
 * text-and-background PAIRS), so "click the built-in cell of this colour" is
 * only a safe shortcut on the shared one.
 * @param {CustomColorVariant | null | undefined} variant @returns {boolean}
 */
export function variantIsShared(variant) {
  return variant?.isShared === true;
}

/**
 * The VISIBLE custom-color dialog for a resolved variant.
 * @param {CustomColorVariant} variant @param {Document} doc @returns {HTMLElement | null}
 */
export function findCustomDialogFor(variant, doc) {
  return visibleOne(doc, variant.customDialog);
}

/**
 * The VISIBLE OK/commit button inside `dialog`, for a resolved variant.
 * @param {CustomColorVariant} variant @param {ParentNode} dialog @returns {HTMLElement | null}
 */
export function findOkButtonFor(variant, dialog) {
  return visibleOne(dialog, variant.okButton);
}

/**
 * The tab a brand colour must be entered on, when the variant's dialog is
 * tabbed, plus whether it is already the selected one. Null when the widget has
 * no tabs (every picker except the dropdown chip today).
 *
 * The dropdown-chip dialog has Text and Background tabs and REMEMBERS which was
 * last used across opens (verified live 2026-09-01), so "whatever tab happens
 * to be showing" is not deterministic: without selecting Background explicitly,
 * a brand click after someone edited a text colour would recolour the text.
 *
 * The tab is identified by POSITION, not by a class or id: the two tabs differ
 * only in their generated Closure ids (`i1sfa:17e`) and their visible text, and
 * keying on text is exactly the locale bug this contract exists to prevent.
 * Position is the only locale-independent handle Google leaves us, so callers
 * must treat a miss as "leave the tab alone", never as an error.
 * @param {CustomColorVariant} variant @param {ParentNode} dialog
 * @returns {{ el: HTMLElement, selected: boolean } | null}
 */
export function findVariantTab(variant, dialog) {
  if (!variant?.tab || variant.tabIndex < 0) return null;
  const el = /** @type {HTMLElement | undefined} */ (Array.from(dialog.querySelectorAll(variant.tab))[variant.tabIndex]);
  if (!el) return null;
  return { el, selected: variant.tabSelected ? el.matches(variant.tabSelected) : false };
}

// ---- DOM resolvers (thin wrappers over the contract strings) ---------------
// Kept deliberately small; the testable logic is above. These never expose a
// raw selector to callers — callers get elements.

/**
 * Is `node` an open color-picker popup? Detected by the shared swatch grid /
 * custom-color button, NOT the per-app menu wrapper class (which varies). This
 * is the Phase 0 insight that makes detection robust across all three apps.
 * @param {Element} node
 * @returns {boolean}
 */
export function isPickerPopup(node) {
  if (!node || node.nodeType !== 1) return false;
  if (typeof node.querySelector !== "function") return false;
  if (node.querySelector(shared().swatchCell)) return true;
  // Not just the shared button: a variant picker (the dropdown chip) has its own
  // entry point, and a palette-less picker would otherwise go undetected.
  return customColorVariants().some((v) => node.querySelector(v.customColorButton));
}

/**
 * The VISIBLE custom-color ("add a custom color") button. Returns the laid-out
 * one so a doc-level lookup hits the open picker's button (the observed picker
 * popup can be a sub-container that doesn't include this button — notably in
 * Sheets — so apply-color queries at the document level).
 * @param {ParentNode} root @returns {HTMLElement | null}
 */
export function findCustomColorButton(root) {
  return findCustomColorEntry(root)?.button ?? null;
}

/** @param {ParentNode} root @returns {HTMLElement[]} */
export function findSwatchCells(root) {
  return Array.from(root.querySelectorAll(shared().swatchCell));
}

/**
 * Swatch cells belonging to the LARGEST swatch grid under `root`. A picker
 * renders several grids — the full main palette plus smaller STANDARD/theme and
 * CUSTOM grids (verified in Sheets 2026-05-29: 80 + 10 + 10 cells across three
 * `docs-material-colorpalette-table`s). The Brand row must clone from and mount
 * into the MAIN palette: cloning a CUSTOM-grid cell renders the wrong color, and
 * mounting into each grid produces duplicate rows. Grouping by the enclosing
 * grid and taking the biggest gives the main palette. Returns [] if none.
 * @param {ParentNode} root
 * @returns {HTMLElement[]}
 */
export function findMainSwatchCells(root) {
  return largestGrid(findSwatchCells(root));
}

/**
 * The cells of the biggest grid among `cells` (see findMainSwatchCells).
 * @param {HTMLElement[]} cells @returns {HTMLElement[]}
 */
function largestGrid(cells) {
  if (cells.length === 0) return [];
  /** @type {Map<Element, HTMLElement[]>} */
  const byGrid = new Map();
  for (const c of cells) {
    const grid = c.closest("table") ?? c.parentElement?.parentElement ?? c.parentElement ?? c;
    const arr = byGrid.get(grid) ?? [];
    arr.push(c);
    byGrid.set(grid, arr);
  }
  /** @type {HTMLElement[]} */
  let best = [];
  for (const arr of byGrid.values()) if (arr.length > best.length) best = arr;
  return best;
}

/**
 * Strip Google's "this is the applied colour" state from a CLONED swatch cell.
 *
 * A Brand cell is a clone of a real palette cell, and when the clone source
 * happens to be the currently applied colour, Google has already marked it
 * selected — so every Brand swatch inherits the checkmark and announces as
 * "selected" to screen readers (bug workspace-custom-palette-auq, seen live in
 * the Sheets text picker where the source cell is the active black).
 *
 * `aria-selected`/`aria-checked` are reset unconditionally: they are state, not
 * styling, and a wrong value is an accessibility defect no matter what the
 * contract says. The class token comes from the contract (`swatchSelected`) and
 * is optional — a contract without it still gets the ARIA fix.
 * @param {HTMLElement} cell
 */
export function clearSwatchSelection(cell) {
  for (const el of [cell, ...cell.querySelectorAll("[aria-selected],[aria-checked]")]) {
    if (el.hasAttribute("aria-selected")) el.setAttribute("aria-selected", "false");
    if (el.hasAttribute("aria-checked")) el.setAttribute("aria-checked", "false");
  }
  const sel = shared().swatchSelected;
  if (!sel) return;
  // The contract stores it as a selector; take the class token(s) so the class
  // can be REMOVED (querySelector can only find it, not strip it). Anything that
  // isn't a plain class selector is skipped rather than guessed at.
  const tokens = sel.split(",").map((s) => s.trim()).filter((s) => /^\.[\w-]+$/.test(s)).map((s) => s.slice(1));
  if (tokens.length === 0) {
    // A published contract can carry a perfectly reasonable-looking value we
    // cannot strip (`td.foo-selected`, `.a .b`). The publish gate rejects those,
    // but say so rather than no-opping in silence if one ever reaches a client:
    // the symptom otherwise is just the checkmark quietly coming back.
    console.warn("[brand-palette] swatchSelected is not a bare class selector; cannot clear cloned state:", sel);
    return;
  }
  for (const el of [cell, ...cell.querySelectorAll("*")]) {
    for (const t of tokens) el.classList.remove(t);
  }
}

/**
 * A section-header element to CLONE for the "Brand" label (so it matches
 * Google's own "Standard"/"Custom" headers exactly). Optional in the contract:
 * returns null when the picker has no such header (e.g. a variant/app without
 * one), in which case the Brand row is injected without a label. Picks the first
 * laid-out header so we clone a real, visible template.
 * @param {ParentNode} root
 * @returns {HTMLElement | null}
 */
export function findSectionLabel(root) {
  const sel = shared().sectionLabel;
  if (!sel) return null;
  const all = /** @type {HTMLElement[]} */ (Array.from(root.querySelectorAll(sel)));
  return all.find((e) => e.getClientRects().length > 0) ?? all[0] ?? null;
}

/**
 * The enclosing picker menu (the per-app `popupRoot`) for any node inside it, or
 * null. The picker's sub-palettes (STANDARD/CUSTOM) each satisfy isPickerPopup
 * and trigger the observer separately; normalizing every trigger up to the one
 * menu means per-root idempotency injects exactly one Brand row per open picker.
 * @param {Element} node
 * @returns {HTMLElement | null}
 */
export function closestPopupRoot(node) {
  if (!node || typeof (/** @type {any} */ (node).closest) !== "function") return null;
  const c = require_();
  // Scope to the ACTIVE app's pickers when we can tell which app we're on, so the
  // result doesn't depend on app iteration order: the Slides popupRoot
  // (`.goog-menu[role="menu"]`) is a superset of the Docs one, so iterating all
  // apps could otherwise resolve via the wrong app's selector. Fall back to all
  // apps when the app is unknown (e.g. Node unit tests, where `location` is
  // absent) so the resolver stays usable there.
  const app = typeof location !== "undefined" ? resolveApp(location) : null;
  const appEntries = app && c.apps[app] ? [c.apps[app]] : Object.values(c.apps);
  for (const appEntry of appEntries) {
    for (const picker of Object.values(appEntry?.pickers ?? {})) {
      const sel = picker?.popupRoot;
      if (!sel) continue;
      const root = node.closest(sel);
      if (root) return /** @type {HTMLElement} */ (root);
    }
  }
  return null;
}

/**
 * The VISIBLE custom-color dialog. Google retains a hidden/cached dialog node in
 * the DOM after first use, so a plain querySelector returns a detached instance
 * — apply-color would then set the hex on the wrong (invisible) input and the
 * apply silently fails. Always filter for the laid-out one. (Verified live —
 * see docs/SPEC.md.)
 *
 * Uses getClientRects().length to test "laid out" rather than offsetParent:
 * offsetParent is null for position:fixed elements (common for modal dialogs)
 * even when visible, which would wrongly reject the real dialog on Docs/Slides.
 * This matches the layout test syntheticClick uses.
 * @param {Document} doc @returns {HTMLElement | null}
 */
export function findCustomDialog(doc) {
  for (const v of customColorVariants()) {
    const dialog = visibleOne(doc, v.customDialog);
    if (dialog) return dialog;
  }
  return null;
}

/** @param {ParentNode} dialog @returns {HTMLInputElement | null} */
export function findHexInput(dialog) {
  // VISIBLE, not just first: the tabbed dropdown-chip dialog holds one hex input
  // per tab and only the active tab's is laid out. Document order does NOT track
  // the selected tab (verified live 2026-09-01 — with Text selected the FIRST
  // input in the DOM was the hidden Background one), so an unfiltered
  // querySelector writes the hex into an invisible field and OK commits the
  // stale colour, with nothing throwing.
  return visibleOne(dialog, shared().hexInput);
}

/** @param {ParentNode} dialog @returns {HTMLElement | null} */
export function findOkButton(dialog) {
  return visibleOne(dialog, shared().okButton);
}

/**
 * Read the custom dialog's current R/G/B field values, or null if the fields
 * aren't present/parseable. apply-color polls this to confirm the dialog has
 * recomputed the color from the hex before committing with OK.
 * @param {ParentNode} dialog
 * @returns {{ r: number, g: number, b: number } | null}
 */
export function readDialogRgb(dialog) {
  const s = shared();
  // Visible-filtered for the same reason as findHexInput: the tabbed dialog has
  // a second, hidden R/G/B trio for the inactive tab.
  const r = /** @type {HTMLInputElement | null} */ (visibleOne(dialog, s.redInput));
  const g = /** @type {HTMLInputElement | null} */ (visibleOne(dialog, s.greenInput));
  const b = /** @type {HTMLInputElement | null} */ (visibleOne(dialog, s.blueInput));
  if (!r || !g || !b) return null;
  const red = Number(r.value), green = Number(g.value), blue = Number(b.value);
  if (![red, green, blue].every(Number.isFinite)) return null;
  return { r: red, g: green, b: blue };
}

/** @param {App} app @param {string} pickerType @param {ParentNode} root @returns {HTMLElement | null} */
export function findToolbarButton(app, pickerType, root) {
  // `toolbarButton` is OPTIONAL: a picker opened from a side panel (the Sheets
  // dropdown chip) has no toolbar entry point at all, and must resolve to null
  // rather than being queried with `undefined`.
  const sel = getPickerSelectors(app, pickerType)?.toolbarButton;
  return sel ? root.querySelector(sel) : null;
}

/**
 * Find a VISIBLE swatch cell whose color matches `hex`, by the hex embedded in
 * its aria-label (Google labels custom swatches "Custom Color #rrggbb" / "Theme
 * Color #rrggbb"). Used to apply an already-registered custom color by clicking
 * it — the only synthetic-event path that applies a custom color in Sheets (its
 * dialog-OK apply is isTrusted-gated). Visible-only so a hidden cached picker's
 * cells aren't matched.
 * @param {ParentNode} root @param {string} hex  e.g. "#1A73E8"
 * @returns {HTMLElement | null}
 */
export function findSwatchByHex(root, hex) {
  const needle = hex.toLowerCase();
  return findSwatchCells(root).find(
    (c) => laidOut(c) && !isOwnCell(c) && (c.getAttribute("aria-label") ?? "").toLowerCase().includes(needle),
  ) ?? null;
}

/**
 * Is `cell` one of OUR injected Brand cells rather than one of Google's? A
 * Brand cell is a clone of a palette cell, so it satisfies `swatchCell`, and
 * its aria-label is "Brand: <the user's name for it>". A swatch NAMED by its
 * hex (which is what importing a bare `#1A73E8` line produces) therefore
 * matched findSwatchByHex, and apply-color "applied" the colour by clicking the
 * very cell the user had just clicked, which re-entered apply until the stack
 * overflowed: no colour, and no banner either, since an error thrown inside
 * an event listener never rejects applyColor (bd `workspace-custom-palette-ox4`,
 * seen live on 0.2.2).
 * @param {Element} cell @returns {boolean}
 */
function isOwnCell(cell) {
  return !!cell.closest(`[${MARK}]`);
}

/**
 * A VISIBLE cell of Google's own MAIN palette grid whose swatch is painted
 * exactly `hex`, or null.
 *
 * Why this exists: Google does not add a CUSTOM swatch for a colour its main
 * grid already has (verified live in Sheets 2026-11-11 with #000000 and
 * #ff0000). Such a colour can never be found by findSwatchByHex, because the
 * grid's cells are labelled by NAME ("black", "red", and translated), not by
 * hex. So a brand colour equal to a built-in went through the dialog on every
 * click and then failed its confirmation, bannering a colour that had applied.
 * Clicking the built-in cell is what a user would do by hand, and a swatch
 * click is not isTrusted-gated.
 *
 * Matched on the painted colour, never on the label: the colour is identical
 * in every UI language. Limited to the main (largest) grid so a theme-linked
 * cell is never chosen over the plain colour, and to laid-out cells so a hidden
 * cached picker is ignored. Our own Brand cells are excluded: they are painted
 * the brand colour by definition.
 * @param {ParentNode} root @param {string} hex
 * @returns {HTMLElement | null}
 */
export function findBuiltinSwatchByColor(root, hex) {
  const want = normalizeHex(hex);
  if (!want) return null;
  const innerSel = shared().swatchInner;
  const grid = largestGrid(findSwatchCells(root).filter((c) => laidOut(c) && !isOwnCell(c)));
  return grid.find((c) => {
    const inner = c.querySelector(innerSel);
    const view = inner?.ownerDocument?.defaultView;
    if (!inner || !view) return false;
    return cssColorToHex(view.getComputedStyle(inner).backgroundColor) === want;
  }) ?? null;
}

/**
 * The color toolbar button whose picker is currently open (aria-expanded=true),
 * scanning every app's toolbarButton selectors. Captured at injection time so
 * apply-color can REOPEN the same picker after the custom-color dialog closes it
 * (needed to click the newly-registered custom swatch). Only one picker is open
 * at a time, so at most one button is expanded.
 * @param {Document} doc @returns {HTMLElement | null}
 */
export function findExpandedColorButton(doc) {
  const c = require_();
  for (const appEntry of Object.values(c.apps)) {
    for (const picker of Object.values(appEntry?.pickers ?? {})) {
      const sel = picker?.toolbarButton;
      if (!sel) continue;
      for (const el of doc.querySelectorAll(sel)) {
        const html = /** @type {HTMLElement} */ (el);
        if (html.getAttribute("aria-expanded") === "true" && html.getClientRects().length > 0) return html;
      }
    }
  }
  return null;
}
