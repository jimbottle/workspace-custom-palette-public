/**
 * Pure plain-text palette format — the simplest shareable representation: one
 * swatch per line, "Name #RRGGBB". No DOM, no chrome.*. The options page uses
 * this for import/export; unit-tested.
 *
 * Format rules (kept deliberately forgiving on import, canonical on export):
 *   - One swatch per line; blank lines are skipped.
 *   - The hex is the LAST whitespace-separated token; everything before it is the
 *     name (spaces allowed). A NAMED line must spell the hex with a leading `#`,
 *     so a name whose final token is a bare hex-like value (e.g. `Brand 100`)
 *     isn't silently eaten into `{name:"Brand", hex:"#110000"}` — such a line is
 *     dropped instead.
 *   - A line that is just a hex (no name) takes the hex as its name, so a bare
 *     list of colors still imports; the leading `#` is optional in that case.
 *   - Invalid lines (no recognizable hex) are dropped, not thrown.
 *
 * @typedef {{ name: string, hex: string, order: number }} Swatch
 */

import { normalizeHex } from "./hex.js";

/**
 * Serialize swatches to the plain-text format: one "Name #RRGGBB" per line, in
 * order. Hex is normalized to canonical #RRGGBB; rows with an invalid hex are
 * skipped so export never emits an unparseable line.
 * @param {Swatch[]} swatches
 * @returns {string}
 */
export function formatPaletteText(swatches) {
  if (!Array.isArray(swatches)) return "";
  /** @type {string[]} */
  const lines = [];
  for (const s of swatches) {
    const hex = normalizeHex(s?.hex);
    const name = typeof s?.name === "string" ? s.name.trim() : "";
    if (!hex) continue;
    lines.push(name ? `${name} ${hex}` : hex);
  }
  return lines.join("\n");
}

/**
 * Parse the plain-text format into raw {name, hex} pairs. Never throws; unparseable
 * lines are dropped. The result is intentionally NOT normalized/sorted here —
 * callers run it through normalizePalette so import shares one validation path.
 * @param {string} text
 * @returns {{ name: string, hex: string }[]}
 */
export function parsePaletteText(text) {
  if (typeof text !== "string") return [];
  /** @type {{ name: string, hex: string }[]} */
  const out = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    const tokens = line.split(/\s+/);
    const last = tokens[tokens.length - 1] ?? "";
    // On a named line, the hex must carry a leading `#`. Without this, a name
    // whose final token is a bare hex-like value ("Brand 100", "Sky F0F") would
    // be silently truncated and an unintended color invented. A bare hex is only
    // accepted on a single-token line, where there's no name to mistake it for.
    if (tokens.length > 1 && !last.startsWith("#")) continue;
    const hex = normalizeHex(last);
    if (!hex) continue; // no recognizable hex on this line
    const name = tokens.slice(0, -1).join(" ").trim() || hex;
    out.push({ name, hex });
  }
  return out;
}
