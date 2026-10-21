import { test } from "node:test";
import assert from "node:assert/strict";
import { applyColor } from "../apply-color.js";

// Replaces the invalid-hex-throws coverage lost when apply-plan was removed.
// applyColor validates the hex first and rejects before touching the DOM, so
// this runs without a browser.
test("applyColor rejects an invalid hex before any DOM access", async () => {
  // Pass a stub doc so the `doc = document` default (undefined in Node) isn't
  // evaluated; the hex is validated first and rejects before the doc is used.
  const doc = /** @type {any} */ ({});
  await assert.rejects(() => applyColor("not-a-color", doc), /invalid hex/);
  await assert.rejects(() => applyColor("", doc), /invalid hex/);
});
