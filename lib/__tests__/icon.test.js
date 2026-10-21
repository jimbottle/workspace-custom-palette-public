import { test } from "node:test";
import assert from "node:assert/strict";
import { topHexes, stripeBands, ICON_STRIPES } from "../icon.js";

/** @param {...string} hexes */
const pal = (...hexes) => hexes.map((hex, order) => ({ name: `c${order}`, hex, order }));

test("topHexes: takes the leading `max` hexes in order", () => {
  const p = pal("#1A73E8", "#34A853", "#FBBC04", "#EA4335", "#202124", "#000000");
  assert.deepEqual(topHexes(p, 5), ["#1A73E8", "#34A853", "#FBBC04", "#EA4335", "#202124"]);
  assert.equal(ICON_STRIPES, 5);
});

test("topHexes: fewer than max returns all; default max is ICON_STRIPES", () => {
  const p = pal("#111111", "#222222");
  assert.deepEqual(topHexes(p), ["#111111", "#222222"]);
});

test("topHexes: empty / non-array / max<=0 yield []", () => {
  assert.deepEqual(topHexes([]), []);
  assert.deepEqual(topHexes(/** @type {any} */ (undefined)), []);
  assert.deepEqual(topHexes(pal("#111111"), 0), []);
});

test("topHexes: skips entries without a string hex", () => {
  const junk = [{ name: "a", hex: 123 }, { name: "b", hex: "#abcabc" }];
  assert.deepEqual(topHexes(/** @type {any} */ (junk)), ["#abcabc"]);
});

test("stripeBands: exactly tiles [0,size) with no gaps or overflow", () => {
  for (const size of [16, 32, 48, 128]) {
    const bands = stripeBands(5, size);
    assert.equal(bands.length, 5);
    assert.equal(bands[0]?.x, 0, "starts at 0");
    let cursor = 0;
    for (const b of bands) {
      assert.equal(b.x, cursor, "bands are contiguous");
      cursor += b.w;
    }
    assert.equal(cursor, size, "widths sum to exactly size");
  }
});

test("stripeBands: count of 1 is a full-width band", () => {
  assert.deepEqual(stripeBands(1, 16), [{ x: 0, w: 16 }]);
});

test("stripeBands: degenerate requests yield []", () => {
  assert.deepEqual(stripeBands(0, 16), []);
  assert.deepEqual(stripeBands(5, 0), []);
  assert.deepEqual(stripeBands(-1, 16), []);
  assert.deepEqual(stripeBands(2.5, 16), []);
});
