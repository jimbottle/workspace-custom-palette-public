import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { UPDATE_NOTES, versionToNote, noteMessage } from "../update-note.js";

const NOTED = Object.keys(UPDATE_NOTES)[0] ?? "";

test("update-note: the shipped notices exist and say what each release fixed", () => {
  assert.ok(NOTED, "UPDATE_NOTES must not be empty while a notice is meant to ship");
  assert.match(UPDATE_NOTES["0.1.6"] ?? "", /Docs/);
  // 0.1.7 is the non-English apply fix. Assert the copy actually names the
  // situation a user would recognize, not just that some string exists.
  assert.match(UPDATE_NOTES["0.1.7"] ?? "", /language/i);
  assert.match(UPDATE_NOTES["0.1.7"] ?? "", /English/);
});

test("update-note: the 0.1.7 notice routes stragglers to the bug flow, asking for the editor language", () => {
  const copy = UPDATE_NOTES["0.1.7"] ?? "";
  // It must name the popup's OWN control: the notice renders via textContent,
  // so it cannot carry a link, and copy pointing at a button that isn't there
  // is a dead end.
  assert.match(copy, /Report a bug/, "copy must name the popup's bug link verbatim");
  assert.equal(
    readFileSync(new URL("../../popup/popup.html", import.meta.url), "utf8").includes(">Report a bug<"),
    true,
    "popup.html no longer has a link labelled 'Report a bug' — the notice copy now points at nothing",
  );
  // And it must ask for the GOOGLE EDITOR language specifically. The bug form's
  // footer already reports navigator.language (the browser's), which is not the
  // one that breaks apply and is frequently different.
  assert.match(copy, /Google editor is set to/);
});

test("update-note: the 0.2.0 notice names both things a user will actually see", () => {
  // The owner asked for a notice highlighting multiple palettes AND
  // organization-managed palettes. Assert both halves are named, so a later
  // trim of this copy cannot quietly drop one of the two features it exists to
  // announce.
  const copy = UPDATE_NOTES["0.2.0"] ?? "";
  assert.match(copy, /palettes/i, "the multiple-palettes half");
  assert.match(copy, /switch between them/i, "and that switching is the point");
  assert.match(copy, /workplace/i, "the organization-palette half");
  // The reassurance is the load-bearing sentence for an existing user whose
  // colours are suddenly not the only ones in the list.
  assert.match(copy, /without replacing colors you set up yourself/i);
});

test("update-note: the 0.2.1 notice names the surface and how to reach it", () => {
  // The owner chose the feature framing over the bug framing. Pin the two
  // things that make it useful to someone standing in Sheets: WHERE (the Data
  // validation picker) and HOW (the chip next to a dropdown option), so a later
  // edit cannot trim it down to a bare "fixed in Sheets".
  const copy = UPDATE_NOTES["0.2.1"] ?? "";
  assert.match(copy, /Data validation/, "names the surface by Google's own label");
  assert.match(copy, /Sheets/, "says which app");
  assert.match(copy, /dropdown/i, "how to get there");
  assert.match(copy, /color chip/i, "what to click");
});

test("update-note: shipped copy carries no em-dash and no emoji", () => {
  // CLAUDE.md forbids both in user-facing strings. Checked across EVERY entry
  // rather than only the new one, since this is exactly the kind of rule that
  // is remembered when copy is written and forgotten when it is edited.
  for (const [v, copy] of Object.entries(UPDATE_NOTES)) {
    assert.doesNotMatch(copy, /\u2014|\u2013/, `em/en dash in the ${v} notice`);
    assert.doesNotMatch(copy, /\p{Extended_Pictographic}/u, `emoji in the ${v} notice`);
  }
});

test("update-note: every key is a shippable manifest version string", () => {
  // The notice only fires when the key EXACTLY equals the manifest version the
  // user updated to, so a typo ("0.17") is a silent no-op that looks fine in
  // review. Pin the shape.
  for (const v of Object.keys(UPDATE_NOTES)) {
    assert.match(v, /^\d+\.\d+\.\d+$/, `not a manifest version: ${v}`);
  }
});

test("update-note: no notice is keyed to a version that has not shipped", () => {
  // The shape regex catches "0.17" but not "0.1.8" or "0.2.7" — equally silent
  // no-ops and far likelier typos, since the notice only ever fires when the key
  // EXACTLY equals the manifest version the user updated to. Anything ahead of
  // the shipped manifest can never fire, so it is a mistake by construction.
  // `<=` rather than `===` so a routine release with nothing worth announcing
  // stays silent without failing this test.
  const manifest = JSON.parse(readFileSync(new URL("../../manifest.json", import.meta.url), "utf8"));
  const asNums = (/** @type {string} */ v) => v.split(".").map(Number);
  const cmp = (/** @type {string} */ a, /** @type {string} */ b) => {
    const [x, y] = [asNums(a), asNums(b)];
    for (let i = 0; i < 3; i++) if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) - (y[i] ?? 0);
    return 0;
  };
  for (const v of Object.keys(UPDATE_NOTES)) {
    assert.ok(
      cmp(v, manifest.version) <= 0,
      `UPDATE_NOTES["${v}"] is ahead of manifest ${manifest.version}, so it can never fire`,
    );
  }
});

test("update-note: copy follows the shipped-string house rules", () => {
  // CLAUDE.md: no emoji and no em-dashes in user-facing copy. This is the last
  // gate before it renders in the popup.
  for (const [v, copy] of Object.entries(UPDATE_NOTES)) {
    assert.ok(copy.trim().length > 0, `${v} has empty copy`);
    assert.ok(!copy.includes("—"), `${v} copy contains an em-dash`);
    assert.ok(!/\p{Extended_Pictographic}/u.test(copy), `${v} copy contains an emoji`);
  }
});

test("versionToNote: stores only on reason 'update' with a noted version", () => {
  assert.equal(versionToNote("update", NOTED), NOTED);
  assert.equal(versionToNote("install", NOTED), null, "fresh installs get the intro, not this");
  assert.equal(versionToNote("chrome_update", NOTED), null);
  assert.equal(versionToNote(undefined, NOTED), null);
  assert.equal(versionToNote("update", "9.9.9"), null, "unnoted versions store nothing");
});

test("noteMessage: maps a stored version to copy; junk/unknown to null", () => {
  assert.equal(noteMessage(NOTED), UPDATE_NOTES[NOTED]);
  assert.equal(noteMessage("9.9.9"), null);
  assert.equal(noteMessage(undefined), null);
  assert.equal(noteMessage(42), null);
  assert.equal(noteMessage({ v: NOTED }), null);
});

test("update-note: Object.prototype member names never resolve to a notice", () => {
  for (const evil of ["constructor", "toString", "hasOwnProperty", "__proto__"]) {
    assert.equal(noteMessage(evil), null);
    assert.equal(versionToNote("update", evil), null);
  }
});
