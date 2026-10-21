/**
 * The app x picker-type check matrix and the shared selectors the monitor needs.
 * These MIRROR the extension's verified contract (config/selectors.default.json
 * + docs/SPEC.md §1b) — keep them in sync. Every picker in the contract has a
 * row: the fill/text pickers proven in Phase 1, and the border/table pickers
 * captured live on 2026-08-30 (bd workspace-custom-palette-7f3). Slides table
 * cells reuse the shape fill/border buttons, so the Slides fill row covers them.
 */

export type App = "sheets" | "docs" | "slides";

/** How to get an editable target selected so the picker opens and apply has effect. */
export type Opener = "sheets-cell" | "sheets-border" | "docs-text" | "docs-table" | "slides-shape";

export interface CheckItem {
  app: App;
  pickerType: string;
  label: string;
  /** URL that creates a fresh editable document for this app. */
  newDocUrl: string;
  /** Toolbar button that opens this picker (from the contract). */
  toolbarButton: string;
  opener: Opener;
  /**
   * UI language forced for this leg (an `hl` code). Absent means the test
   * account's own language, which is English. Part of `checkId`, because two
   * legs that differ ONLY by language would otherwise collide and the second
   * would silently overwrite the first's result and diagnostics.
   */
  locale?: string;
}

/**
 * Force a Google editor into `hl` for one run.
 *
 * BOTH parameters are required and that is the whole trick: `hl` alone is
 * ignored because the account language wins, which is why an earlier
 * investigation concluded a non-English UI needed a second Google account.
 * `forcehl=1` is the part that works. Verified live 2026-08-16 in Docs and
 * Sheets: `documentElement.lang="da"`, menus "Fil/Rediger/Visning", and the
 * full inject + apply path passes. Slides confirmed the same way 2026-08-30
 * (`lang="da"`, "Fil/Rediger/Visning"). NOTE the parameters survive a direct
 * navigation to `/d/<id>/edit` but NOT a click-through from the app's home
 * list, which strips them and reopens the file in the account language.
 */
export function localizedUrl(url: string, hl: string): string {
  return `${url}${url.includes("?") ? "&" : "?"}hl=${hl}&forcehl=1`;
}

/** Shared selectors (mirror contract `shared` + the extension's injected markers). */
export const SELECTORS = {
  brandRow: "[data-brand-palette-row]",
  brandLabel: "[data-brand-palette-label]",
  brandSwatch: '[aria-label^="Brand:"]',
  swatchCell: 'td.docs-material-colorpalette-cell[role="gridcell"]',
  swatchInner: "div.docs-material-colorpalette-colorswatch",
  // Mirrors `shared.swatchSelected`. Google puts this on whichever cell is the
  // CURRENTLY APPLIED colour; a Brand swatch is never that, so finding it on one
  // means the clone kept the source cell's state (bug -auq).
  swatchSelected: "docs-material-colorpalette-cell-selected",
  customColorButton: ".docs-customcolorpalette-add-custom-color-button",
  gooMenu: ".goog-menu",
} as const;

const NEW = {
  sheets: "https://docs.google.com/spreadsheets/create",
  docs: "https://docs.google.com/document/create",
  slides: "https://docs.google.com/presentation/create",
} as const;

// Toolbar buttons are matched by their stable element ids, exactly like the
// extension's contract (docs/SPEC.md §1b) — ids are identical in every UI
// language, where the old aria-label selectors matched nothing outside English.
// NOTE: that makes the SELECTORS here locale-independent, which is necessary
// but not sufficient for running this matrix against a non-English account:
// check.ts's promo dismissal still recognizes some dialogs by English button
// text (it presses Escape first to cover the rest). Confirm a non-English run
// end to end before treating its results as authoritative.
//
// The non-English legs below are the point of all this. Every field bug so far
// (0.1.4 tooltips, 0.1.6 apply in Docs AND Sheets) was a locale bug that every
// automated tier called green, because every tier ran in English. Tier 1 now
// pseudo-localizes a captured fixture, but the monitor is the only END-TO-END
// signal, and until these rows existed it could not have caught 0.1.6 either.
//
// They cost no second Google account: see localizedUrl above.
const DANISH = "da";

export const MATRIX: CheckItem[] = [
  { app: "sheets", pickerType: "fill", label: "Sheets · Fill color", newDocUrl: NEW.sheets, toolbarButton: "#t-cell-color", opener: "sheets-cell" },
  { app: "sheets", pickerType: "text", label: "Sheets · Text color", newDocUrl: NEW.sheets, toolbarButton: "#t-text-color", opener: "sheets-cell" },
  { app: "docs", pickerType: "text", label: "Docs · Text color", newDocUrl: NEW.docs, toolbarButton: "#textColorButton", opener: "docs-text" },
  { app: "slides", pickerType: "fill", label: "Slides · Shape fill", newDocUrl: NEW.slides, toolbarButton: "#fillColorMenuButton", opener: "slides-shape" },
  // The border and table pickers (captured 2026-08-30). The extension injected
  // into all three BEFORE they had contract entries, because each popup carries
  // the same classes as its app's fill/text picker; the entries and these rows
  // exist so the monitor exercises them deliberately. Inject + apply was
  // verified by hand in a real browser (docs/SPEC.md matrix), but these rows
  // have NOT yet been through a scheduled monitor run - no row has, pending
  // MONITOR_GOOGLE_USER/PASS - so a first failure here should be read against
  // the opener in check.ts before it is read as a broken contract.
  { app: "sheets", pickerType: "border", label: "Sheets · Border color", newDocUrl: NEW.sheets, toolbarButton: "#t-border-color", opener: "sheets-border" },
  { app: "docs", pickerType: "border", label: "Docs · Table border color", newDocUrl: NEW.docs, toolbarButton: "#borderColorMenuButton", opener: "docs-table" },
  { app: "docs", pickerType: "tableFill", label: "Docs · Table cell background", newDocUrl: NEW.docs, toolbarButton: "#cellColorMenuButton", opener: "docs-table" },
  // Docs text and Sheets fill are the two surfaces the 2026-08-16 reporter hit,
  // so they are the two worth paying for on every run.
  { app: "docs", pickerType: "text", label: "Docs · Text color (da)", newDocUrl: localizedUrl(NEW.docs, DANISH), toolbarButton: "#textColorButton", opener: "docs-text", locale: DANISH },
  { app: "sheets", pickerType: "fill", label: "Sheets · Fill color (da)", newDocUrl: localizedUrl(NEW.sheets, DANISH), toolbarButton: "#t-cell-color", opener: "sheets-cell", locale: DANISH },
];

/**
 * Stable id for a check (used in result keys / diagnostic filenames).
 *
 * The locale suffix is load-bearing, not cosmetic: `sheets.fill` in English and
 * `sheets.fill` in Danish are different checks, and without the suffix the
 * second would overwrite the first's result and diagnostic bundle — hiding a
 * failure in exactly the leg that exists to catch the failures we keep shipping.
 */
export function checkId(item: CheckItem): string {
  return item.locale ? `${item.app}.${item.pickerType}.${item.locale}` : `${item.app}.${item.pickerType}`;
}
