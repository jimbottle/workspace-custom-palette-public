/**
 * Matrix shape invariants.
 *
 * These are cheap assertions guarding an expensive, credentialed run: a
 * malformed matrix does not fail loudly at Tier 3, it silently checks the wrong
 * thing or overwrites a result, and the monitor is the only end-to-end signal
 * this project has.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { MATRIX, checkId, localizedUrl, type CheckItem } from "../matrix.ts";
import { localeMatches, localeVerdict } from "../check.ts";

test("checkId is unique across the whole matrix", () => {
  // Two legs differing only by language would collide on `app.pickerType`, and
  // the second would overwrite the first's result and diagnostics — hiding a
  // failure in the very leg added to catch locale bugs.
  const ids = MATRIX.map(checkId);
  assert.equal(new Set(ids).size, ids.length, `duplicate checkId in MATRIX: ${ids.join(", ")}`);
});

test("checkId encodes the locale only when there is one", () => {
  const english: CheckItem = { app: "docs", pickerType: "text", label: "x", newDocUrl: "u", toolbarButton: "#b", opener: "docs-text" };
  assert.equal(checkId(english), "docs.text");
  assert.equal(checkId({ ...english, locale: "da" }), "docs.text.da");
});

test("the matrix covers a non-English UI", () => {
  // The regression this guards is organizational, not technical: an
  // English-only matrix is what let 0.1.6 ship an apply path that was broken in
  // every other language while every tier reported green.
  const localized = MATRIX.filter((item) => item.locale);
  assert.ok(localized.length >= 2, "at least two non-English legs");
  assert.ok(
    localized.some((i) => i.app === "docs") && localized.some((i) => i.app === "sheets"),
    "the two apps the 2026-08-16 reporter hit are both covered",
  );
});

test("every localized leg carries BOTH hl and forcehl", () => {
  // hl alone is silently ignored (the account language wins), so a leg missing
  // forcehl=1 would run in ENGLISH while reporting itself as Danish - a green
  // result that proves nothing, which is worse than no leg at all.
  for (const item of MATRIX.filter((i) => i.locale)) {
    assert.match(item.newDocUrl, new RegExp(`[?&]hl=${item.locale}(&|$)`), `${item.label} sets hl`);
    assert.match(item.newDocUrl, /[?&]forcehl=1(&|$)/, `${item.label} sets forcehl=1`);
  }
});

test("localizedUrl appends correctly whether or not the url already has a query", () => {
  assert.equal(localizedUrl("https://x/create", "da"), "https://x/create?hl=da&forcehl=1");
  assert.equal(localizedUrl("https://x/create?a=1", "da"), "https://x/create?a=1&hl=da&forcehl=1");
});

test("localeMatches compares the primary subtag and never passes an unknown", () => {
  // The URL asking for Danish and the UI BEING Danish are different claims.
  // forcehl=1 is Google's behavior, not ours: if it stops working, the (da)
  // legs would silently re-run the English check and stay green forever, which
  // is worse than not having them. runCheck reads documentElement.lang and
  // compares it here.
  assert.ok(localeMatches("da", "da"));
  assert.ok(localeMatches("da-DK", "da"), "regional variants satisfy the language");
  assert.ok(localeMatches("en-GB", "en"));
  assert.ok(!localeMatches("en", "da"), "an English UI must fail a Danish leg");
  // An absent lang is an UNKNOWN, and treating unknown as a pass is exactly the
  // silent-green failure this guard exists to prevent.
  assert.ok(!localeMatches("", "en"), "empty lang never counts as a match");
  assert.ok(!localeMatches("", "da"));
});

test("localeVerdict: the fail-vs-warn table", () => {
  // This table IS the policy, and getting it wrong in either direction is a
  // real incident: too strict gives a permanent false RED on the project's only
  // authoritative breakage signal, too loose lets a leg silently stop testing
  // what it claims. Both have already happened once, hence the table.
  const read = (lang: string) => ({ ok: true as const, lang });
  const unreadable = { ok: false as const, error: "Target page has been closed" };

  // A locale leg, a real tag, and it disagrees: hl/forcehl did not take.
  const fail = localeVerdict(read("en"), "da", true);
  assert.equal(fail.action, "fail");
  assert.match(fail.action === "fail" ? fail.message : "", /hl\/forcehl did not take/);

  // Matches pass, regional variants included.
  assert.equal(localeVerdict(read("da"), "da", true).action, "pass");
  assert.equal(localeVerdict(read("da-DK"), "da", true).action, "pass");
  assert.equal(localeVerdict(read("en-GB"), "en", false).action, "pass");

  // An English leg reading another language fails too: the shared profile's
  // language changed, and every English result is suspect until it is reset.
  // Promoted from warn once the attribute had been read live on all three apps
  // in both languages (bd workspace-custom-palette-afb, 2026-08-30).
  const drift = localeVerdict(read("da"), "en", false);
  assert.equal(drift.action, "fail", "an English-leg mismatch is positive evidence, so it fails");
  assert.match(drift.action === "fail" ? drift.message : "", /language has changed/);

  // A blank lang fails on every leg: all six live reads carried the attribute,
  // so a blank is Google changing the page, and with it the only proof a Danish
  // leg has of being Danish.
  const blank = localeVerdict(read(""), "da", true);
  assert.equal(blank.action, "fail", "a blank lang is a wrong answer now that it is known to be always set");
  assert.match(blank.action === "fail" ? blank.message : "", /no <html lang>/);
  assert.equal(localeVerdict(read(""), "en", false).action, "fail");

  // The one advisory case: an unreadable page is a navigation race (the
  // evaluate lost its execution context), not evidence about language.
  const unread = localeVerdict(unreadable, "da", true);
  assert.equal(unread.action, "warn", "unreadable never fails, even on a locale leg");
  assert.match(unread.action === "warn" ? unread.message : "", /could not read/);
});

test("localeVerdict outcomes always carry a message a human can act on", () => {
  const cases = [
    localeVerdict({ ok: false, error: "boom" }, "da", true),
    localeVerdict({ ok: true, lang: "" }, "da", true),
    localeVerdict({ ok: true, lang: "da" }, "en", false),
  ];
  for (const v of cases) {
    assert.notEqual(v.action, "pass");
    assert.ok(v.action !== "pass" && v.message.length > 20, "names what happened");
  }
});

test("every matrix entry is fully specified", () => {
  for (const item of MATRIX) {
    assert.ok(item.label.trim(), "has a label");
    assert.match(item.newDocUrl, /^https:\/\/docs\.google\.com\//, `${item.label} targets docs.google.com`);
    assert.match(item.toolbarButton, /^#/, `${item.label} matches its toolbar button by id, not by text`);
  }
});
