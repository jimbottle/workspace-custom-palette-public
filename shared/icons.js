/**
 * Inline SVG icon builders, built via createElementNS (no innerHTML) so they're
 * CSP-safe and inherit color from the button via `stroke="currentColor"`. One
 * source of truth for glyphs shared across the extension's pages. Pattern
 * mirrors the sibling ebay-watchlist-watch `shared/icons.js`.
 *
 * Each builder takes a pixel `size` and an optional `doc` (so the popup, options
 * page, and jsdom tests can pass their own document). The returned <svg> is
 * `aria-hidden`; the host button carries the accessible label.
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** @param {number} size @param {Document} doc */
function baseSvg(size, doc) {
  const svg = doc.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", String(size));
  svg.setAttribute("height", String(size));
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "2");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  return svg;
}

/** @param {SVGElement} svg @param {string} d @param {Document} doc */
function addPath(svg, d, doc) {
  const path = doc.createElementNS(SVG_NS, "path");
  path.setAttribute("d", d);
  svg.appendChild(path);
}

// Outline trash can (Feather "trash-2"): lid line, can body, handle, two slots.
const TRASH_PATHS = [
  "M3 6h18",
  "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6",
  "M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2",
  "M10 11v6",
  "M14 11v6",
];

/**
 * Build a trash-can icon as an <svg> element.
 * @param {number} [size]
 * @param {Document} [doc]
 * @returns {SVGElement}
 */
export function trashIcon(size = 16, doc = document) {
  const svg = baseSvg(size, doc);
  for (const d of TRASH_PATHS) addPath(svg, d, doc);
  return svg;
}

// Circular undo/redo (Lucide "rotate-ccw" / "rotate-cw"): a near-full circle
// with an arrowhead, counter-clockwise for undo, clockwise for redo.
const UNDO_PATHS = [
  "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8",
  "M3 3v5h5",
];
const REDO_PATHS = [
  "M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8",
  "M21 3v5h-5",
];

/**
 * Build a circular undo (counter-clockwise) icon as an <svg> element.
 * @param {number} [size]
 * @param {Document} [doc]
 * @returns {SVGElement}
 */
export function undoIcon(size = 16, doc = document) {
  const svg = baseSvg(size, doc);
  for (const d of UNDO_PATHS) addPath(svg, d, doc);
  return svg;
}

/**
 * Build a circular redo (clockwise) icon as an <svg> element.
 * @param {number} [size]
 * @param {Document} [doc]
 * @returns {SVGElement}
 */
export function redoIcon(size = 16, doc = document) {
  const svg = baseSvg(size, doc);
  for (const d of REDO_PATHS) addPath(svg, d, doc);
  return svg;
}

// Outline eyedropper (Lucide "pipette"): angled dropper body + sampling tip.
const PIPETTE_PATHS = [
  "m2 22 1-1h3l9-9",
  "M3 21v-3l9-9",
  "m15 6 3.4-3.4a2.1 2.1 0 1 1 3 3L18 9l.4.4a2.1 2.1 0 1 1-3 3l-3.8-3.8a2.1 2.1 0 1 1 3-3l.4.4Z",
];

/**
 * Build an eyedropper (pipette) icon as an <svg> element.
 * @param {number} [size]
 * @param {Document} [doc]
 * @returns {SVGElement}
 */
export function eyedropperIcon(size = 16, doc = document) {
  const svg = baseSvg(size, doc);
  for (const d of PIPETTE_PATHS) addPath(svg, d, doc);
  return svg;
}

// Two opposed arcs with arrowheads (Lucide "refresh-cw"): the conventional
// reload glyph, drawn clockwise so it reads as "fetch again" rather than undo.
const REFRESH_PATHS = [
  "M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8",
  "M21 3v5h-5",
  "M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16",
  "M8 16H3v5",
];

/**
 * Build a refresh (clockwise double arrow) icon as an <svg> element.
 * @param {number} [size]
 * @param {Document} [doc]
 * @returns {SVGElement}
 */
export function refreshIcon(size = 16, doc = document) {
  const svg = baseSvg(size, doc);
  for (const d of REFRESH_PATHS) addPath(svg, d, doc);
  return svg;
}

// Two overlapping rounded squares (Lucide "copy"); the front square is drawn as
// a path so every glyph here stays path-only.
const COPY_PATHS = [
  "M10 8h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2Z",
  "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2",
];

/**
 * Build a copy (two overlapping squares) icon as an <svg> element.
 * @param {number} [size]
 * @param {Document} [doc]
 * @returns {SVGElement}
 */
export function copyIcon(size = 16, doc = document) {
  const svg = baseSvg(size, doc);
  for (const d of COPY_PATHS) addPath(svg, d, doc);
  return svg;
}

// A single tick (Lucide "check"): the confirmation a copy swaps to briefly.
const CHECK_PATHS = ["M20 6 9 17l-5-5"];

/**
 * Build a check (tick) icon as an <svg> element.
 * @param {number} [size]
 * @param {Document} [doc]
 * @returns {SVGElement}
 */
export function checkIcon(size = 16, doc = document) {
  const svg = baseSvg(size, doc);
  for (const d of CHECK_PATHS) addPath(svg, d, doc);
  return svg;
}
