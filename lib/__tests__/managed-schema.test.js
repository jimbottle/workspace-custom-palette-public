/**
 * Guards config/managed-schema.json against Chrome's managed-storage schema
 * rules. This is not style policing: Chrome REFUSES TO LOAD an extension whose
 * managed_schema is invalid, so a mistake here bricks the whole product rather
 * than degrading one feature. Rules per
 * developer.chrome.com/docs/extensions/reference/manifest/storage.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const schema = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../config/managed-schema.json", import.meta.url)), "utf8"),
);
const manifest = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../manifest.json", import.meta.url)), "utf8"),
);

test("manifest points at the managed schema and adds no new permissions", () => {
  assert.equal(manifest.storage?.managed_schema, "config/managed-schema.json");
  // Enterprise policy needs NO extra permission; keep the minimal set intact
  // (a permission addition is a Web Store review signal — see CLAUDE.md).
  assert.deepEqual(manifest.permissions, ["storage", "alarms"]);
});

test("schema obeys Chrome's loading rules (object top level, no additionalProperties)", () => {
  assert.equal(schema.type, "object");
  assert.ok(!("additionalProperties" in schema), "top level must not declare additionalProperties");
  assert.ok(schema.properties && typeof schema.properties === "object");
});

test("uses only attributes Chrome's policy schema parser accepts", () => {
  // Chrome implements a restricted JSON Schema subset. An unrecognized keyword
  // (e.g. draft-07's "$comment") risks an "Invalid schema" load failure, which
  // disables the WHOLE extension — so the allowed set is pinned here rather
  // than discovered in production. Add to this list only after confirming the
  // keyword loads in a real Chrome.
  const ALLOWED = new Set([
    "type", "properties", "items", "required", "title", "description", "$ref", "id",
    "enum", "pattern", "minimum", "maximum", "additionalProperties", "patternProperties",
    "sensitiveValue",
  ]);
  /** @type {string[]} */
  const offenders = [];
  /** @param {any} node @param {string} path */
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return;
    for (const key of Object.keys(node)) if (!ALLOWED.has(key)) offenders.push(`${path}.${key}`);
    if (node.properties) for (const [k, v] of Object.entries(node.properties)) walk(v, `${path}.${k}`);
    if (node.items) walk(node.items, `${path}[]`);
  };
  walk(schema, "(root)");
  assert.deepEqual(offenders, [], "unsupported schema attributes would risk a load failure");
});

test("every subschema declares exactly one type (or a $ref)", () => {
  /** @param {any} node @param {string} path */
  const walk = (node, path) => {
    if (!node || typeof node !== "object") return;
    const typed = typeof node.type === "string";
    assert.ok(typed || typeof node.$ref === "string", `${path} needs a type or $ref`);
    assert.ok(!Array.isArray(node.type), `${path} must not use a type array`);
    if (node.properties) for (const [k, v] of Object.entries(node.properties)) walk(v, `${path}.${k}`);
    if (node.items) walk(node.items, `${path}[]`);
  };
  for (const [k, v] of Object.entries(schema.properties)) walk(v, k);
});

test("declares the palette policy in the shape the admin runbook documents", () => {
  const palette = schema.properties.palette;
  assert.equal(palette.type, "array");
  assert.equal(palette.items.type, "object");
  assert.equal(palette.items.properties.name.type, "string");
  assert.equal(palette.items.properties.hex.type, "string");
  assert.deepEqual(palette.items.required, ["name", "hex"]);
});
