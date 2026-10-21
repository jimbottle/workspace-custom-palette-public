/**
 * The brand mark painted from the live palette (shared/brandmark.js).
 *
 * The point of this module is that ONE identity appears in three places — the
 * toolbar icon, the page header mark, and the favicon — so the tests are mostly
 * about agreement: same leading colors, same count, same vertical order, same
 * even tiling as lib/icon.js. A mark that merely looks nice but disagrees with
 * the toolbar icon is the bug this replaced.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { markStripes, stripeGradient, stripeFaviconDataUrl, applyBrandmark } from "../brandmark.js";
import { ICON_STRIPES, stripeBands } from "../../lib/icon.js";

const P = [
  { name: "Cloud", hex: "#F9F4EB", order: 0 },
  { name: "Sky", hex: "#9BDCD7", order: 1 },
  { name: "Poppy", hex: "#FE5917", order: 2 },
];

test("markStripes: takes the leading colors, normalized, in palette order", () => {
  assert.deepEqual(markStripes(P), ["#F9F4EB", "#9BDCD7", "#FE5917"]);
  assert.deepEqual(markStripes([{ name: "x", hex: "#abcdef", order: 0 }]), ["#ABCDEF"],
    "normalized to a single casing, so the gradient and the favicon cannot disagree");
});

test("markStripes: caps at the toolbar icon's stripe count, not some other number", () => {
  // If these two ever diverge the icon and the mark show different palettes,
  // which is exactly the disagreement this module exists to end.
  const many = Array.from({ length: 12 }, (_v, i) => ({ name: `c${i}`, hex: "#112233", order: i }));
  assert.equal(markStripes(many).length, ICON_STRIPES);
});

test("markStripes: drops unusable entries rather than painting them", () => {
  const mixed = [
    { name: "ok", hex: "#123456", order: 0 },
    { name: "bad", hex: "notacolor", order: 1 },
    { name: "alsoOk", hex: "#654321", order: 2 },
  ];
  assert.deepEqual(markStripes(mixed), ["#123456", "#654321"]);
});

test("markStripes: nothing to paint yields nothing, so the packaged mark survives", () => {
  // applyBrandmark keys off this: an empty result must leave the CSS fallback
  // in place rather than painting an empty gradient over it.
  assert.deepEqual(markStripes([]), []);
  assert.deepEqual(markStripes(/** @type {any} */ (null)), []);
  assert.deepEqual(markStripes([{ name: "bad", hex: "zzz", order: 0 }]), []);
});

test("stripeGradient: hard stops that tile evenly, running left to right", () => {
  const g = stripeGradient(["#111111", "#222222", "#333333", "#444444"]);
  assert.match(g, /^linear-gradient\(90deg, /, "90deg = vertical stripes, matching the toolbar icon");
  assert.match(g, /#111111 0\.0000% 25\.0000%/);
  assert.match(g, /#444444 75\.0000% 100\.0000%/, "the last stripe reaches the edge; no gap");
  // Every boundary is shared between neighbours, so there are no seams.
  const stops = [...g.matchAll(/(\d+\.\d+)% (\d+\.\d+)%/g)]
    .map((m) => /** @type {[string, string]} */ ([m[1] ?? "", m[2] ?? ""]));
  for (let i = 1; i < stops.length; i++) {
    assert.equal(stops[i]?.[0], stops[i - 1]?.[1]);
  }
});

test("stripeGradient: one color is a flat fill, not a one-stop gradient", () => {
  assert.equal(stripeGradient(["#FE5917"]), "#FE5917");
});

test("stripeGradient: nothing in, nothing out", () => {
  assert.equal(stripeGradient([]), "");
  assert.equal(stripeGradient(/** @type {any} */ (undefined)), "");
});

test("stripeFaviconDataUrl: an SVG whose bands match lib/icon.js exactly", () => {
  const hexes = ["#111111", "#222222", "#333333"];
  const url = stripeFaviconDataUrl(hexes);
  assert.match(url, /^data:image\/svg\+xml,/);
  const svg = decodeURIComponent(url.slice("data:image/svg+xml,".length));
  // The favicon and the toolbar icon must tile identically, or the same palette
  // renders as two different marks at two different sizes.
  const bands = stripeBands(hexes.length, 32);
  for (const [i, b] of bands.entries()) {
    assert.ok(svg.includes(`x="${b.x}" y="0" width="${b.w}"`), `band ${i} matches stripeBands`);
    assert.ok(svg.includes(`fill="${hexes[i]}"`));
  }
  const widths = [...svg.matchAll(/width="(\d+)"/g)].map((m) => Number(m[1]));
  assert.equal(widths.filter((w) => w !== 32).reduce((a, b) => a + b, 0), 32,
    "the stripes sum to the full width: no rounding gap, no overflow");
});

test("stripeFaviconDataUrl: nothing to paint yields no url", () => {
  assert.equal(stripeFaviconDataUrl([]), "");
});

/** @param {string} [head] */
function page(head = "") {
  const dom = new JSDOM(`<!doctype html><html><head>${head}</head><body></body></html>`);
  return dom.window.document;
}

test("applyBrandmark: sets the override and creates the favicon link", () => {
  const doc = page();
  applyBrandmark(P, doc);
  const gradient = doc.documentElement.style.getPropertyValue("--brandmark-image");
  assert.match(gradient, /^linear-gradient\(90deg, #F9F4EB/);
  const link = doc.querySelector('link[rel="icon"]');
  assert.ok(link, "a page with no favicon link gets one");
  assert.match(link.getAttribute("href") ?? "", /^data:image\/svg\+xml,/);
});

test("applyBrandmark: reuses an existing favicon link rather than stacking them", () => {
  const doc = page('<link rel="icon" href="../icons/icon48.png">');
  applyBrandmark(P, doc);
  applyBrandmark(P, doc);
  assert.equal(doc.querySelectorAll('link[rel="icon"]').length, 1,
    "idempotent: it is called on every render");
});

test("applyBrandmark: with nothing to paint it leaves the packaged mark alone", () => {
  // The fallback guarantee. A page that cannot resolve a palette has to look
  // exactly as it did before this module existed.
  const doc = page('<link rel="icon" href="../icons/icon48.png">');
  applyBrandmark([], doc);
  assert.equal(doc.documentElement.style.getPropertyValue("--brandmark-image"), "",
    "no override, so the CSS gradient in theme.css still applies");
  assert.equal(doc.querySelector('link[rel="icon"]')?.getAttribute("href"), "../icons/icon48.png",
    "and the packaged favicon is untouched");
});
