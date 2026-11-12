/**
 * Pure hex-color helpers. No DOM, no chrome.*. Used by apply-color, the options
 * palette editor (Phase 2), and the synthetic monitor. Unit-tested.
 */

/** @typedef {{ name: string, hex: string, order: number }} Swatch */

const SHORT = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i;
const LONG = /^#?([0-9a-f]{6})$/i;

/**
 * Normalize a hex string to canonical `#RRGGBB` uppercase, or return null if it
 * is not a valid 3- or 6-digit hex color. Accepts an optional leading `#`.
 * @param {string} input
 * @returns {string | null}
 */
export function normalizeHex(input) {
  if (typeof input !== "string") return null;
  const s = input.trim();
  const short = SHORT.exec(s);
  if (short) {
    const [, r = "", g = "", b = ""] = short;
    return `#${(r + r + g + g + b + b).toUpperCase()}`;
  }
  const long = LONG.exec(s);
  if (long) {
    const [, six = ""] = long;
    return `#${six.toUpperCase()}`;
  }
  return null;
}

/**
 * @param {string} input
 * @returns {boolean}
 */
export function isValidHex(input) {
  return normalizeHex(input) !== null;
}

/**
 * Convert a hex color to its {r,g,b} components (0-255). Throws on invalid input
 * so callers validate first.
 * @param {string} input
 * @returns {{ r: number, g: number, b: number }}
 */
export function hexToRgb(input) {
  const hex = normalizeHex(input);
  if (!hex) throw new Error(`invalid hex: ${input}`);
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

const CSS_RGB = /^rgba?\(\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*[, ]\s*(\d{1,3})\s*(?:[,/]\s*([\d.]+%?)\s*)?\)$/i;

/**
 * Convert a computed-style colour (`rgb(255, 0, 0)` / `rgba(255, 0, 0, 1)`) to
 * canonical `#RRGGBB`, or null when it is not an opaque rgb colour. A fully or
 * partly transparent colour is null on purpose: `rgba(0, 0, 0, 0)` is what an
 * unpainted element reports, and reading that as black would match every
 * colourless cell.
 * @param {string} input
 * @returns {string | null}
 */
export function cssColorToHex(input) {
  if (typeof input !== "string") return null;
  const m = CSS_RGB.exec(input.trim());
  if (!m) return null;
  const [, r = "", g = "", b = "", a] = m;
  if (a !== undefined && Number(a.endsWith("%") ? Number(a.slice(0, -1)) / 100 : a) !== 1) return null;
  const parts = [r, g, b].map(Number);
  if (parts.some((n) => n > 255)) return null;
  return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("").toUpperCase()}`;
}
