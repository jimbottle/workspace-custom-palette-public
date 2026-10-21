import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { ORG_PALETTE_NAME } from "../palette.js";
import { isValidContract, pickContract, remoteSwatches, managedSwatches, orgPalettes, orgSwatches } from "../config.js";

const packaged = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../config/selectors.default.json", import.meta.url)), "utf8"),
);

test("isValidContract: accepts the packaged contract", () => {
  assert.equal(isValidContract(packaged), true);
});

test("isValidContract: rejects malformed shapes", () => {
  assert.equal(isValidContract(null), false);
  assert.equal(isValidContract({}), false);
  assert.equal(isValidContract({ version: "x", shared: {}, apps: {} }), false); // missing shared keys
  assert.equal(isValidContract({ version: 1, shared: packaged.shared, apps: packaged.apps }), false); // version not string
  assert.equal(isValidContract({ version: "x", shared: packaged.shared, apps: {} }), false); // no apps
  assert.equal(
    isValidContract({ version: "x", shared: packaged.shared, apps: { sheets: { pickers: {} } } }),
    false, // app with no pickers
  );
});

test("pickContract: prefers a valid cached remote contract", () => {
  const cached = JSON.parse(JSON.stringify(packaged));
  cached.version = "2099-01-01";
  assert.equal(pickContract(cached, packaged).version, "2099-01-01");
});

test("pickContract: falls back to packaged when cache is missing/garbage", () => {
  assert.equal(pickContract(undefined, packaged), packaged);
  assert.equal(pickContract({ bogus: true }, packaged), packaged);
  assert.equal(pickContract("not even an object", packaged), packaged);
});

test("pickContract: a newer packaged default overrides a stale cached contract", () => {
  const stale = JSON.parse(JSON.stringify(packaged));
  stale.version = "2020-01-01"; // older than the packaged version
  assert.equal(pickContract(stale, packaged), packaged);
  // equal version => cached still wins (remote is authoritative when current)
  const same = JSON.parse(JSON.stringify(packaged));
  assert.equal(pickContract(same, packaged).version, packaged.version);
});

test("remoteSwatches: unwraps a palette doc, null otherwise", () => {
  assert.deepEqual(remoteSwatches({ swatches: [{ name: "a", hex: "#000" }] }), [{ name: "a", hex: "#000" }]);
  assert.equal(remoteSwatches({ nope: 1 }), null);
  assert.equal(remoteSwatches(undefined), null);
  assert.equal(remoteSwatches([]), null); // array, not a doc with .swatches
});

test("managedSwatches: accepts a bare array AND an Admin-Console {Value: [...]} wrapper", () => {
  const swatches = [{ name: "Org", hex: "#4C8AEC" }];
  assert.deepEqual(managedSwatches(swatches), swatches);
  assert.deepEqual(managedSwatches({ Value: swatches }), swatches);
  assert.deepEqual(managedSwatches([]), []); // empty policy is still a policy
  assert.equal(managedSwatches({ Value: "nope" }), null);
  assert.equal(managedSwatches({ other: swatches }), null);
  assert.equal(managedSwatches(undefined), null); // no policy configured
  assert.equal(managedSwatches("string"), null);
});

// --- the organization's palettes, from a whole managed policy -------------
//
// orgPalettes/orgSwatches is the single entry point every consumer routes
// through, so the {"Value": ...} unwrap is the only thing between an admin
// pasting the form docs/DEPLOY.md documents and the policy resolving to
// nothing. That unwrap is what these pin.

const SW_ORG = [{ name: "Poppy", hex: "#FE5917" }];
const SW_ALT = [{ name: "Grass", hex: "#385834" }];
const MULTI = [
  { name: "Retail", swatches: SW_ORG },
  { name: "Wholesale", swatches: SW_ALT },
];

test("orgPalettes: unwraps the Admin console envelope on the NEW palettes key", () => {
  // Exactly the JSON docs/DEPLOY.md tells an admin to paste. Without the
  // unwrap this resolves to nothing and the admin has no way to tell why.
  const out = orgPalettes({ palettes: { Value: MULTI } });
  assert.deepEqual(out.map((p) => [p.id, p.name]), [["org:0", "Retail"], ["org:1", "Wholesale"]]);
});

test("orgPalettes: unwraps the envelope on the LEGACY palette key too", () => {
  const out = orgPalettes({ palette: { Value: SW_ORG } });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.name, ORG_PALETTE_NAME);
  assert.equal(out[0]?.swatches[0]?.hex, "#FE5917");
});

test("orgPalettes: accepts BARE arrays as well as wrapped ones", () => {
  // Which shape a real managed device delivers has never been confirmed, which
  // is why both are accepted rather than guessed at.
  assert.equal(orgPalettes({ palettes: MULTI }).length, 2);
  assert.equal(orgPalettes({ palette: SW_ORG }).length, 1);
});

test("orgPalettes: the collection wins over the legacy key, wrapped or not", () => {
  const out = orgPalettes({ palettes: { Value: MULTI }, palette: { Value: SW_ORG } });
  assert.equal(out.length, 2);
  assert.equal(out[0]?.name, "Retail");
});

test("orgPalettes: no policy, junk, or null yields nothing and never throws", () => {
  for (const junk of [undefined, null, {}, { palette: null }, { palettes: "nope" },
    { palettes: { Value: "nope" } }, { palettes: { NotValue: MULTI } }]) {
    assert.deepEqual(orgPalettes(/** @type {any} */ (junk)), []);
  }
});

test("orgSwatches: the flat list a consumer wants, honouring the pointer", () => {
  const policy = { palettes: { Value: MULTI } };
  assert.equal(orgSwatches(policy)[0]?.hex, "#FE5917", "no pointer means the first");
  assert.equal(orgSwatches(policy, "org:1")[0]?.hex, "#385834");
  assert.equal(orgSwatches(policy, "org")[0]?.hex, "#FE5917", "bare org means the first");
  assert.deepEqual(orgSwatches(null), []);
});
