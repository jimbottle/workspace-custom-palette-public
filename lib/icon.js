/**
 * Pure helpers for the dynamic toolbar icon: which colors to show and how to lay
 * them out. No canvas, no chrome.* — the service worker does the actual
 * OffscreenCanvas draw + chrome.action.setIcon using these. Kept pure so the
 * top-N selection and the exact stripe tiling are unit-tested in Node.
 *
 * The icon mirrors dev/gen-icons.py's packaged placeholder: vertical stripes of
 * the palette's leading colors, so the live icon and the static fallback match.
 *
 * @typedef {{ name: string, hex: string, order: number }} Swatch
 */

/** Default number of leading swatches the toolbar icon shows. */
export const ICON_STRIPES = 5;

/**
 * The leading hex colors to paint, in palette order. The input is expected to be
 * an already-resolved/normalized palette (sorted by order — see
 * lib/palette.resolveEffectivePalette); this just takes the first `max` valid
 * hexes. Returns [] when there's nothing to draw, so the caller can leave the
 * packaged manifest icon in place.
 * @param {Swatch[]} swatches
 * @param {number} [max]
 * @returns {string[]}
 */
export function topHexes(swatches, max = ICON_STRIPES) {
  if (!Array.isArray(swatches) || max <= 0) return [];
  const out = [];
  for (const s of swatches) {
    if (s && typeof s.hex === "string") out.push(s.hex);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Integer x-bands that EXACTLY tile [0, size) into `count` vertical stripes — no
 * gaps, no overflow (the widths sum to `size`). Boundaries are
 * floor(i*size/count), the even split dev/gen-icons.py paints. Returns [] for a
 * degenerate request.
 * @param {number} count
 * @param {number} size
 * @returns {{ x: number, w: number }[]}
 */
export function stripeBands(count, size) {
  if (!Number.isInteger(count) || !Number.isInteger(size) || count <= 0 || size <= 0) return [];
  const bands = [];
  for (let i = 0; i < count; i++) {
    const x = Math.floor((i * size) / count);
    const w = Math.floor(((i + 1) * size) / count) - x;
    bands.push({ x, w });
  }
  return bands;
}
