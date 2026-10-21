import { test } from "node:test";
import assert from "node:assert/strict";
import { formatPaletteText, parsePaletteText } from "../palette-text.js";

/** @param {string} name @param {string} hex @param {number} order */
const sw = (name, hex, order) => ({ name, hex, order });

test("formatPaletteText: one 'Name #RRGGBB' per line, in order", () => {
  const text = formatPaletteText([sw("Poppy", "#FE5917", 0), sw("Night", "#1A2D27", 1)]);
  assert.equal(text, "Poppy #FE5917\nNight #1A2D27");
});

test("formatPaletteText: normalizes hex and skips rows with an invalid hex", () => {
  const text = formatPaletteText([sw("Short", "#abc", 0), sw("Bad", "nope", 1)]);
  assert.equal(text, "Short #AABBCC");
});

test("parsePaletteText: reads name (with spaces) + hex per line", () => {
  const parsed = parsePaletteText("Brand Blue #1a73e8\nRose #E69C9C");
  assert.deepEqual(parsed, [
    { name: "Brand Blue", hex: "#1A73E8" },
    { name: "Rose", hex: "#E69C9C" },
  ]);
});

test("parsePaletteText: a bare hex line takes the hex as its name", () => {
  assert.deepEqual(parsePaletteText("#385834"), [{ name: "#385834", hex: "#385834" }]);
});

test("parsePaletteText: skips blank lines and lines with no recognizable hex", () => {
  const parsed = parsePaletteText("\nPoppy #FE5917\n\njust a heading\n  \n#1A2D27\n");
  assert.deepEqual(parsed, [
    { name: "Poppy", hex: "#FE5917" },
    { name: "#1A2D27", hex: "#1A2D27" }, // bare hex line still imports
  ]);
});

test("parsePaletteText: a named line needs a leading # (no silent mis-parse)", () => {
  // The final token is a valid bare hex, but the line has a name, so it's dropped
  // rather than inventing {name:"Brand", hex:"#110000"} / {name:"Sky", hex:magenta}.
  assert.deepEqual(parsePaletteText("Brand 100"), []);
  assert.deepEqual(parsePaletteText("Sky F0F"), []);
  // Spelled with the #, it parses as intended.
  assert.deepEqual(parsePaletteText("Sky #F0F"), [{ name: "Sky", hex: "#FF00FF" }]);
});

test("parsePaletteText: tolerates extra whitespace between name and hex", () => {
  assert.deepEqual(parsePaletteText("  Sunshine    #EABF26  "), [{ name: "Sunshine", hex: "#EABF26" }]);
});

test("round-trips: format(parse(x)) is stable for canonical input", () => {
  const canonical = "Poppy #FE5917\nSunshine #EABF26\nGrass #385834";
  const parsed = parsePaletteText(canonical).map((p, i) => ({ ...p, order: i }));
  assert.equal(formatPaletteText(parsed), canonical);
});

test("non-string / non-array inputs never throw", () => {
  assert.deepEqual(parsePaletteText(/** @type {any} */ (null)), []);
  assert.equal(formatPaletteText(/** @type {any} */ (undefined)), "");
});
