import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldReportInjectFailure, isOwnErrorFilename } from "../health-probe.js";

test("shouldReportInjectFailure: only when palette present, swatches present, but row absent", () => {
  assert.equal(shouldReportInjectFailure(3, true, false), true); // recognized palette, no row => broke
  assert.equal(shouldReportInjectFailure(3, true, true), false); // row present => healthy
  // No swatch cells in the popup => not a recognized palette => no false banner
  assert.equal(shouldReportInjectFailure(3, false, false), false);
  // Empty/disabled palette => never a failure
  assert.equal(shouldReportInjectFailure(0, true, false), false);
  assert.equal(shouldReportInjectFailure(0, false, false), false);
});

test("isOwnErrorFilename: matches our extension origin, ignores page errors", () => {
  const origin = "chrome-extension://abcdef/";
  assert.equal(isOwnErrorFilename("chrome-extension://abcdef/content/apply-color.js", origin), true);
  assert.equal(isOwnErrorFilename("https://docs.google.com/static/x.js", origin), false); // Google's own error
  assert.equal(isOwnErrorFilename(undefined, origin), false);
  assert.equal(isOwnErrorFilename("chrome-extension://abcdef/x.js", ""), false); // no origin known
});
