/**
 * picker-observer — watches the DOM for a color picker mounting and triggers
 * injection. Recognizes the picker regardless of which toolbar button opened it
 * (Phase 0: detect by the shared swatch grid / custom-color button, not the
 * per-app menu wrapper). Uses dom-contract resolvers only.
 */

import { isPickerPopup, closestPopupRoot, findSwatchCells } from "./dom-contract.js";
import { injectBrandRow, MARK, LABEL_MARK } from "./injector.js";
import { assertInjected } from "./health-probe.js";

const OWN_ROW = `[${MARK}]`;

/**
 * Start observing `doc.body` for picker popups; inject the Brand row on each.
 * Returns a stop() function.
 * @param {() => { name: string, hex: string, order: number }[]} getPalette  current palette (re-read each open)
 * @param {Document} doc
 * @returns {() => void}
 */
export function observePickers(getPalette, doc = document) {
  const handle = (/** @type {Node} */ node) => {
    if (!(node instanceof HTMLElement)) return;
    // Ignore mutations from our OWN injected Brand row. Its cells are clones of
    // real swatch cells, so they satisfy isPickerPopup — without this skip,
    // injecting the row re-triggers the observer and recurses into a runaway
    // (hundreds of rows). This is the root-cause guard for that loop.
    if (node.closest(OWN_ROW)) return;
    /** @type {HTMLElement} */
    let popup;
    try {
      // The added node may be the popup itself OR an ancestor of it — both are
      // covered here, because isPickerPopup does a DEEP query for the picker
      // markers (swatch grid / custom button) anywhere under the node.
      if (!isPickerPopup(node)) return;
      // Normalize to the ONE enclosing menu: the picker's sub-palettes
      // (STANDARD/CUSTOM) each mount + satisfy isPickerPopup, so without this
      // they would each inject their own Brand row. Collapsing every trigger to
      // the menu means injectBrandRow's per-root idempotency yields exactly one
      // row.
      popup = closestPopupRoot(node) ?? node;
    } catch (err) {
      // Both resolvers reach dom-contract, which throws when no contract is
      // loaded. Uncaught, that killed the MutationObserver callback with a
      // message carrying NO "[brand-palette]" prefix — invisible to anyone
      // filtering the console for this extension, which is exactly how three
      // separate outages in this project became un-attributable. Whatever else
      // is true, our failures must say our name.
      console.warn("[brand-palette] picker detection failed", err);
      return;
    }
    // Defer one frame so the popup finishes painting before we measure/clone.
    requestAnimationFrame(() => {
      let pal;
      try {
        pal = getPalette();
      } catch (err) {
        console.warn("[brand-palette] could not read the palette", err);
        return;
      }
      try {
        injectBrandRow(popup, pal, doc);
      } catch (err) {
        console.warn("[brand-palette] inject failed", err);
      }
      // Post-condition: if we expected to inject but the row isn't there,
      // surface a local "Report this" banner (selectors likely broke). Guarded
      // separately from the injection above: a health check that throws must
      // not be mistaken for an injection that threw.
      try {
        assertInjected(popup, pal, doc);
      } catch (err) {
        console.warn("[brand-palette] health check failed", err);
      }
    });
  };

  const obs = new MutationObserver((muts) => {
    for (const m of muts) for (const n of m.addedNodes) handle(n);
  });
  obs.observe(doc.body, { childList: true, subtree: true });
  return () => obs.disconnect();
}

/**
 * Re-render injected Brand rows after a settings change. Google reuses/caches the
 * color menu, so an already-injected row keeps its OLD colors (and our per-root
 * idempotency skips re-injecting) until a full page reload. This removes our rows
 * + labels and re-injects, with the latest palette, into every picker menu
 * currently in the DOM — visible or cached-hidden — so an options-page edit or
 * the on/off toggle reflects on the next open without a reload. An empty palette
 * (disabled) just leaves the rows removed. No-op when no picker is present.
 * @param {() => { name: string, hex: string, order: number }[]} getPalette
 * @param {Document} doc
 */
export function refreshBrandRows(getPalette, doc = document) {
  // Read the palette BEFORE tearing anything down. It is a pure closure read
  // that cannot depend on the DOM, so doing it first is free — and it means a
  // throw here cannot strand the user with the old rows removed and no new
  // ones. This function is called from onManagedChanged, so that stranding
  // would land on an ADMIN pushing a policy update.
  let pal;
  try {
    pal = getPalette();
  } catch (err) {
    console.warn("[brand-palette] refresh aborted before removing anything: could not read the palette", err);
    return;
  }
  for (const el of Array.from(doc.querySelectorAll(`${OWN_ROW}, [${LABEL_MARK}]`))) el.remove();
  /** @type {Set<HTMLElement>} */
  const menus = new Set();
  try {
    for (const cell of findSwatchCells(doc)) {
      const menu = closestPopupRoot(cell);
      if (menu) menus.add(menu);
    }
  } catch (err) {
    // Reached with the old rows ALREADY removed, so name that consequence
    // rather than just the error: the Brand row is gone until the next picker
    // open re-triggers the observer.
    console.warn("[brand-palette] refresh could not resolve picker menus; rows stay removed until the next open", err);
    return;
  }
  for (const menu of menus) {
    try {
      injectBrandRow(menu, pal, doc);
    } catch (err) {
      console.warn("[brand-palette] refresh failed", err);
    }
  }
}
