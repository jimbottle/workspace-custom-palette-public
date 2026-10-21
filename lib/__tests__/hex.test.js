import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeHex, isValidHex, hexToRgb } from "../hex.js";

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
