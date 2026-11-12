import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHex, isValidHex, hexToRgb, cssColorToHex } from "../hex.js";

test("normalizeHex: 6-digit with and without hash", () => {
  assert.equal(normalizeHex("#1a73e8"), "#1A73E8");
  assert.equal(normalizeHex("1a73e8"), "#1A73E8");
});

test("normalizeHex: 3-digit shorthand expands", () => {
  assert.equal(normalizeHex("#abc"), "#AABBCC");
  assert.equal(normalizeHex("f00"), "#FF0000");
});

test("normalizeHex: trims surrounding whitespace", () => {
  assert.equal(normalizeHex("  #202124  "), "#202124");
});

test("normalizeHex: rejects junk", () => {
  for (const bad of ["", "#12", "#1234", "#1234567", "ggg", "#xyzxyz", "rgb(0,0,0)", null, undefined, 123]) {
    assert.equal(normalizeHex(/** @type {any} */ (bad)), null, `should reject ${String(bad)}`);
  }
});

test("isValidHex mirrors normalizeHex", () => {
  assert.equal(isValidHex("#fff"), true);
  assert.equal(isValidHex("nope"), false);
});

test("hexToRgb: matches the Phase 0 live result (#1A73E8 -> 26/115/232)", () => {
  assert.deepEqual(hexToRgb("#1A73E8"), { r: 26, g: 115, b: 232 });
});

test("hexToRgb: throws on invalid", () => {
  assert.throws(() => hexToRgb("nope"));
});

test("cssColorToHex: reads the computed-style forms a browser reports", () => {
  assert.equal(cssColorToHex("rgb(255, 0, 0)"), "#FF0000");
  assert.equal(cssColorToHex("rgb(26, 115, 232)"), "#1A73E8");
  assert.equal(cssColorToHex("rgba(0, 0, 0, 1)"), "#000000");
  assert.equal(cssColorToHex("rgb(0 255 0)"), "#00FF00");
});

test("cssColorToHex: a transparent colour is not black", () => {
  // `rgba(0, 0, 0, 0)` is what an unpainted element reports. Reading it as
  // #000000 would make every colourless cell match a black brand swatch.
  assert.equal(cssColorToHex("rgba(0, 0, 0, 0)"), null);
  assert.equal(cssColorToHex("rgba(255, 0, 0, 0.5)"), null);
});

test("cssColorToHex: rejects anything that is not an rgb colour", () => {
  for (const bad of ["", "transparent", "red", "#ff0000", "rgb(300, 0, 0)", "hsl(0, 100%, 50%)", null, undefined]) {
    assert.equal(cssColorToHex(/** @type {any} */ (bad)), null, `should reject ${String(bad)}`);
  }
});
