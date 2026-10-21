/**
 * The scraping half of `npm run policy:state`.
 *
 * Worth testing despite being dev tooling: the walkthrough now tells a human to
 * run this after every Admin console Save and to trust what it says. A quiet
 * wrong answer here is worse than no tool, because it is believed - and the
 * shipped version had exactly that, reporting "enforced: no" for every policy
 * ever pushed (roborev 4185).
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { SCAN_KEYS, scanRecords, orderByWrite, firstJsonValue } from "../policy-state.mjs";

test("SCAN_KEYS: no key is listed before a key it prefixes", () => {
  // The invariant behind the High. JS alternation is leftmost-first, not
  // longest-match, so a prefix listed first shadows the longer key forever.
  for (let i = 0; i < SCAN_KEYS.length; i++) {
    for (let j = i + 1; j < SCAN_KEYS.length; j++) {
      const earlier = SCAN_KEYS[i], later = SCAN_KEYS[j];
      assert.equal(later.startsWith(earlier), false,
        `"${earlier}" is listed before "${later}", which it prefixes - "${later}" could never match`);
    }
  }
});

test("scanRecords: paletteLocked is read as itself, not as palette", () => {
  // The exact regression: the enforcement flag is the single fact D1, D5 and F1
  // exist to check, and it was unreadable.
  const raw = 'paletteLockedtrue';
  assert.deepEqual(scanRecords(raw), { paletteLocked: true });
});

test("scanRecords: reads a whole managed policy, enforcement included", () => {
  const raw = 'palette[{"name":"Org Blue","hex":"#1A73E8"}]paletteLockedtrue';
  const got = scanRecords(raw);
  assert.equal(got.paletteLocked, true, "enforced, and it says so");
  assert.deepEqual(got.palette, [{ name: "Org Blue", hex: "#1A73E8" }]);
});

test("scanRecords: paletteOrder and palettes are distinguishable from palette", () => {
  const raw = 'paletteOrder["a","b"]palettes[{"name":"Retail"}]palette[]';
  const got = scanRecords(raw);
  assert.deepEqual(got.paletteOrder, ["a", "b"]);
  assert.deepEqual(got.palettes, [{ name: "Retail" }]);
  assert.deepEqual(got.palette, []);
});

test("scanRecords: per-palette keys survive alongside the prefixes", () => {
  const got = scanRecords('pal:p1a2b3c4{"name":"My colors","swatches":[]}');
  assert.deepEqual(got["pal:p1a2b3c4"], { name: "My colors", swatches: [] });
});

test("scanRecords: a later record wins, which is what makes ordering matter", () => {
  assert.deepEqual(scanRecords('activePaletteId"old"activePaletteId"new"'), { activePaletteId: "new" });
});

test("orderByWrite: compacted .ldb before the live .log, and numerically within each", () => {
  // Unsorted readdir could let a stale compacted value overwrite a newer one,
  // since later records win. .log is the live write-ahead log, so it comes last.
  assert.deepEqual(
    orderByWrite(["000010.log", "000007.ldb", "LOCK", "000003.ldb", "CURRENT", "MANIFEST-000001"]),
    ["000003.ldb", "000007.ldb", "000010.log"],
  );
});

test("orderByWrite: keeps only leveldb data files", () => {
  assert.deepEqual(orderByWrite(["CURRENT", "LOCK", "LOG", "MANIFEST-000001"]), []);
});

test("firstJsonValue: reads the value that follows a key, and refuses a far-off one", () => {
  assert.deepEqual(firstJsonValue('[{"hex":"#FE5917"}]rest'), [{ hex: "#FE5917" }]);
  assert.equal(firstJsonValue("true"), true);
  assert.equal(firstJsonValue('Locked":true'), undefined,
    "a value more than a few bytes past the key is not this key's value");
});
