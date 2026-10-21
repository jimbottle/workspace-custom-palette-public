/**
 * The brand mark, painted from the LIVE palette.
 *
 * There used to be three different marks for one identity: a CSS gradient of
 * seven hardcoded packaged colors in the page headers (horizontal bands), a
 * packaged PNG for the tab favicon (vertical bands), and the genuinely adaptive
 * toolbar icon the service worker paints from the resolved palette. They
 * disagreed on colors AND on stripe direction, and only the toolbar one ever
 * told the truth about what a picker would show.
 *
 * This module is the single answer: given the palette in effect, it paints the
 * header mark and the favicon to match the toolbar icon — same leading colors,
 * same count (`ICON_STRIPES`), same vertical stripes, same even tiling.
 *
 * PACKAGED FALLBACK IS PRESERVED. Nothing here is required for the pages to
 * render: `.brandmark` keeps its packaged gradient in CSS and is only
 * overridden once a palette is known, and the favicon is only replaced when
 * there is something to replace it with. A page that fails to resolve a palette
 * looks exactly as it did before.
 */

import { topHexes, ICON_STRIPES } from "../lib/icon.js";
import { isValidHex, normalizeHex } from "../lib/hex.js";

/**
 * The stripe colors for a mark, in palette order.
 * @param {{name?: string, hex?: string, order?: number}[]} swatches
 * @param {number} [max]
 * @returns {string[]} normalized `#rrggbb`, possibly empty
 */
export function markStripes(swatches, max = ICON_STRIPES) {
  const list = /** @type {{name: string, hex: string, order: number}[]} */ (
    Array.isArray(swatches) ? swatches : []);
  return topHexes(list, max)
    .filter((h) => isValidHex(h))
    .map((h) => /** @type {string} */ (normalizeHex(h)));
}

/**
 * A CSS `linear-gradient(...)` of hard-stop VERTICAL stripes — the same
 * left-to-right order and even split the toolbar icon uses, so the two read as
 * one mark rather than two designs.
 * @param {string[]} hexes
 * @returns {string} empty when there is nothing to paint
 */
export function stripeGradient(hexes) {
  if (!Array.isArray(hexes) || hexes.length === 0) return "";
  if (hexes.length === 1) return hexes[0] ?? "";
  const stops = hexes.map((hex, i) => {
    const from = ((i * 100) / hexes.length).toFixed(4);
    const to = (((i + 1) * 100) / hexes.length).toFixed(4);
    return `${hex} ${from}% ${to}%`;
  });
  return `linear-gradient(90deg, ${stops.join(", ")})`;
}

/**
 * The same stripes as an SVG data URL, for a `<link rel="icon">`.
 *
 * Deliberately SVG rather than a canvas PNG: it needs no OffscreenCanvas, costs
 * nothing to build, and scales to whatever size the browser asks for. The
 * rounded corner matches the header mark's radius so the favicon and the
 * in-page mark are the same object at different sizes.
 * @param {string[]} hexes
 * @returns {string} empty when there is nothing to paint
 */
export function stripeFaviconDataUrl(hexes) {
  if (!Array.isArray(hexes) || hexes.length === 0) return "";
  const S = 32;
  const rects = hexes.map((hex, i) => {
    // Integer bands that exactly tile the width, matching lib/icon.js
    // stripeBands: no seams from rounding, and no final stripe left short.
    const x = Math.floor((i * S) / hexes.length);
    const w = Math.floor(((i + 1) * S) / hexes.length) - x;
    return `<rect x="${x}" y="0" width="${w}" height="${S}" fill="${hex}"/>`;
  }).join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}">`
    + `<clipPath id="r"><rect width="${S}" height="${S}" rx="7"/></clipPath>`
    + `<g clip-path="url(#r)">${rects}</g></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

/**
 * Paint both surfaces for this page. Safe to call on every render — it is
 * idempotent and does nothing when there is no palette to paint.
 * @param {{name?: string, hex?: string, order?: number}[]} swatches
 * @param {Document} [doc]
 */
export function applyBrandmark(swatches, doc = document) {
  const hexes = markStripes(swatches);
  if (hexes.length === 0) return; // keep the packaged mark
  const gradient = stripeGradient(hexes);
  if (gradient) doc.documentElement.style.setProperty("--brandmark-image", gradient);

  const href = stripeFaviconDataUrl(hexes);
  if (!href) return;
  let link = /** @type {HTMLLinkElement | null} */ (doc.querySelector('link[rel="icon"]'));
  if (!link) {
    link = doc.createElement("link");
    link.rel = "icon";
    doc.head.appendChild(link);
  }
  if (link.getAttribute("href") !== href) link.setAttribute("href", href);
}
