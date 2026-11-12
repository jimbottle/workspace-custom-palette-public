/**
 * marks — the attribute names the extension stamps on its OWN injected nodes.
 *
 * These are not Google selectors (those live only in the contract, read by
 * dom-contract). They sit in a leaf module because two sides need them: the
 * injector writes them, and dom-contract must be able to tell a Brand cell from
 * a real palette cell. A Brand cell is a CLONE of a palette cell, so it matches
 * every swatch selector in the contract; any lookup that means "one of Google's
 * swatches" has to exclude it explicitly (bd `workspace-custom-palette-ox4`).
 */

/** Attribute marking the injected Brand row. */
export const MARK = "data-brand-palette-row";

/** Attribute marking the cosmetic "Brand" label row (a cloned section header above the swatches). */
export const LABEL_MARK = "data-brand-palette-label";
