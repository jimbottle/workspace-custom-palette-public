/**
 * injector — mounts the "Brand" swatch row into an open color picker. Clones
 * the native swatch markup so the row is visually indistinguishable, and is
 * idempotent (never double-injects if the observer fires twice).
 *
 * On a Brand swatch click it calls back into apply-color to drive Google's
 * native custom-color flow with that swatch's hex. All selector access is via
 * dom-contract; this module knows no raw selectors.
 */

import { findMainSwatchCells, findExpandedColorButton, findSectionLabel, clearSwatchSelection } from "./dom-contract.js";
import { applyColor } from "./apply-color.js";
import { reportApplyFailure } from "./health-probe.js";
import { syntheticClick } from "../lib/pointer-sequence.js";

/** Attribute marking the injected Brand row. Exported so health-probe can verify it mounted. */
export const MARK = "data-brand-palette-row";

/** Attribute marking the cosmetic "Brand" label row (a cloned section header above the swatches). */
export const LABEL_MARK = "data-brand-palette-label";

/**
 * @typedef {{ name: string, hex: string, order: number }} Swatch
 */

/**
 * Inject the Brand row into `pickerRoot` if not already present.
 * @param {HTMLElement} pickerRoot
 * @param {Swatch[]} palette
 * @param {Document} doc
 * @returns {boolean} true if a row was injected this call
 */
export function injectBrandRow(pickerRoot, palette, doc = document) {
  if (!pickerRoot || pickerRoot.querySelector(`[${MARK}]`)) return false; // idempotent
  if (pickerRoot.closest?.(`[${MARK}]`)) return false; // candidate is our own injected content — never recurse into it
  if (!palette || palette.length === 0) return false; // disabled / empty: inject nothing, don't mark
  // Clone from + mount into the MAIN palette grid, never a STANDARD/CUSTOM
  // sub-grid: cloning a custom-swatch cell renders the wrong color, and mounting
  // into each grid produces duplicate Brand rows (see findMainSwatchCells).
  const sample = findMainSwatchCells(pickerRoot)[0];
  if (!sample) return false; // not a palette we recognize
  const grid = sample.parentElement; // the swatch grid row/container the clone came from
  if (!grid) return false;

  // Derive the row tag AND the mount point from one decision: only create a
  // <tr> when we actually have a table row to mount it into. Otherwise a <tr>
  // could land in a non-table parent and never render.
  const sampleRow = sample.closest("tr");
  const row = doc.createElement(sampleRow?.parentElement ? "tr" : "div");
  row.setAttribute(MARK, "1");

  const ordered = [...palette].sort((a, b) => a.order - b.order);
  for (const sw of ordered) {
    const cell = /** @type {HTMLElement} */ (sample.cloneNode(true));
    // The clone carries the SOURCE cell's state, not just its looks. If that
    // source is the currently applied colour, Google has marked it selected and
    // every Brand swatch would render a checkmark and announce as "selected".
    clearSwatchSelection(cell);
    const tip = `${sw.name} (${sw.hex})`;
    cell.setAttribute("aria-label", `Brand: ${sw.name}`);
    cell.setAttribute("title", tip);
    // The clone's DESCENDANTS keep the source cell's tooltip attributes (the
    // inner swatch div carries title="<source color name>", and the innermost
    // title wins on hover) — so without this every Brand swatch tooltips as the
    // clone source's color ("Black", "Sort", ... per UI language). Overwrite
    // title everywhere it appears, and any Google data-tooltip the markup carries.
    for (const el of cell.querySelectorAll("[title]")) el.setAttribute("title", tip);
    for (const el of [cell, ...cell.querySelectorAll("[data-tooltip]")]) {
      if (el.hasAttribute("data-tooltip")) el.setAttribute("data-tooltip", tip);
    }
    const inner = /** @type {HTMLElement | null} */ (cell.querySelector("div")) ?? cell;
    inner.style.backgroundColor = sw.hex;
    // A Brand cell is a clone of a real palette cell, so Google's delegated
    // palette handler also fires on it (on mousedown, before our click) and
    // would apply the clone's SOURCE color, not ours. Swallow the native pointer/
    // mouse events in the CAPTURE phase (stopImmediatePropagation) so Google never
    // sees them — verified live this keeps the picker open and the native handler
    // silent — then drive the apply ourselves on click via the custom-color flow.
    const swallow = (/** @type {Event} */ e) => {
      e.preventDefault();
      e.stopImmediatePropagation();
      e.stopPropagation();
    };
    const apply = () => {
      // Capture the toolbar button whose picker is open NOW so apply-color can
      // reopen the same picker after the custom-color dialog closes it (needed to
      // click the registered custom swatch — see apply-color.js / bug egn).
      // Captured here at CLICK time, NOT at injection time: a row injected by
      // refreshBrandRows into a cached, hidden picker has no expanded toolbar
      // button when injected, but the picker IS expanded when the user clicks a
      // swatch. Read it before applyColor's dialog step closes the picker.
      const reopenBtn = findExpandedColorButton(doc);
      const reopen = reopenBtn ? () => syntheticClick(reopenBtn) : null;
      return applyColor(sw.hex, doc, reopen).catch((err) => {
        console.warn("[brand-palette] apply failed", err);
        reportApplyFailure(err); // local "Report this" banner; nothing auto-sent
      });
    };
    for (const type of ["pointerdown", "mousedown", "pointerup", "mouseup"]) {
      cell.addEventListener(type, swallow, true);
    }
    cell.addEventListener("click", (e) => { swallow(e); apply(); }, true); // beat Google's delegated handler
    // Keyboard activation: a cloned gridcell is also activatable by keyboard
    // (Enter/Space), which would reach Google's delegated key handler and apply
    // the clone's SOURCE color. Swallow ONLY the activation keys (NOT arrows —
    // those navigate the grid) and drive the apply ourselves.
    const isActivate = (/** @type {KeyboardEvent} */ e) => e.key === "Enter" || e.key === " " || e.key === "Spacebar";
    cell.addEventListener("keydown", (e) => { const k = /** @type {KeyboardEvent} */ (e); if (isActivate(k) && !k.repeat) { swallow(e); apply(); } }, true);
    cell.addEventListener("keyup", (e) => { if (isActivate(/** @type {KeyboardEvent} */ (e))) swallow(e); }, true);
    row.appendChild(cell);
  }

  // Optional "Brand" label, cloned from the picker's own section header (the
  // "Standard"/"Custom" headers) so it matches Google's styling exactly. Only for
  // table palettes (mounts as a header row spanning the grid above the swatches);
  // skipped gracefully when the picker has no such header.
  let labelRow = null;
  const labelTemplate = sampleRow?.parentElement ? findSectionLabel(pickerRoot) : null;
  if (labelTemplate) {
    labelRow = doc.createElement("tr");
    labelRow.setAttribute(LABEL_MARK, "1");
    // A cosmetic header row, not a grid row: mark it (and its cell) presentational
    // so it stays out of the native grid's row/column model and doesn't disrupt
    // arrow-key navigation or screen-reader row/col reporting.
    labelRow.setAttribute("role", "presentation");
    const td = doc.createElement("td");
    td.setAttribute("role", "presentation");
    td.setAttribute("colspan", String(sampleRow?.children.length || ordered.length));
    const label = /** @type {HTMLElement} */ (labelTemplate.cloneNode(true));
    label.removeAttribute("id"); // the cloned header may carry an id; avoid duplicates
    label.removeAttribute("aria-label"); // cloneNode copies aria-* (e.g. "Standard"); drop it so the accessible name matches the visible "Brand" text
    label.textContent = "Brand";
    // Neutralize context-specific layout: the Docs "CUSTOM" header class carries
    // stylesheet rules (negative margin-left, fixed width) sized for its home
    // container, which clip the clone when it renders inside our table cell
    // (verified live 2026-08-15). Typography/color still come from the class.
    label.style.margin = "0";
    label.style.width = "auto";
    td.appendChild(label);
    labelRow.appendChild(td);
  }

  // Mount inside the same grid the swatches came from (NOT next to the
  // custom-color button, which often lives in a separate container). The tag
  // chosen above matches this branch so a <tr> always lands in a table section.
  if (sampleRow?.parentElement) {
    if (labelRow) sampleRow.parentElement.appendChild(labelRow); // header above the swatches
    sampleRow.parentElement.appendChild(row); // table palette: new <tr> in the same tbody
  } else {
    (grid.parentElement ?? grid).appendChild(row); // div palette: into the grid container
  }
  return true;
}
