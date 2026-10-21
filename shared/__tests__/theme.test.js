import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveTheme } from "../theme.js";

test("resolveTheme: explicit light/dark override the OS", () => {
  assert.equal(resolveTheme("light", true), "light"); // forced light even when OS is dark
  assert.equal(resolveTheme("light", false), "light");
  assert.equal(resolveTheme("dark", false), "dark"); // forced dark even when OS is light
  assert.equal(resolveTheme("dark", true), "dark");
});

test("resolveTheme: system (and unknown) follows the OS prefers-color-scheme", () => {
  assert.equal(resolveTheme("system", true), "dark");
  assert.equal(resolveTheme("system", false), "light");
  // default/unknown values behave like "system" (matches storage.getTheme's default)
  assert.equal(resolveTheme(undefined, true), "dark");
  assert.equal(resolveTheme(/** @type {any} */ ("bogus"), false), "light");
});
