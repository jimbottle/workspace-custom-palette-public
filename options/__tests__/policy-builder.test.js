/**
 * The admin policy builder (options/policy-builder.html).
 *
 * Its only job is to emit JSON that Google's Admin console accepts and this
 * extension then parses, for an admin who should never have to hand-write it
 * (bd workspace-custom-palette-24y). So the assertions are exactly that: the
 * `Value` wrapper Chrome requires is present, the keys match
 * config/managed-schema.json, and what comes out the other side survives the
 * extension's OWN normalizers unchanged. A generator that produced
 * plausible-looking JSON the extension quietly dropped would be worse than no
 * generator at all.
 */

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JSDOM } from "jsdom";
import { orgPalettes, orgSwatches } from "../../lib/config.js";
import { MAX_PALETTES, MAX_SWATCHES } from "../../lib/palette.js";

const HTML = new URL("../policy-builder.html", import.meta.url);
const SCHEMA = JSON.parse(readFileSync(new URL("../../config/managed-schema.json", import.meta.url), "utf8"));

function open() {
  // The page's logic lives in an external file now (MV3 CSP forbids inline
  // script on extension pages), and jsdom does not fetch relative <script src>
  // from a string. Injecting it keeps this test exercising the real code -
  // but note it can no longer prove the page WIRES ITSELF, since jsdom has no
  // CSP: that is the real-Chromium page smoke's job, added for this reason.
  const dom = new JSDOM(readFileSync(HTML, "utf8"), { runScripts: "dangerously" });
  const doc = dom.window.document;
  const el = doc.createElement("script");
  el.textContent = readFileSync(new URL("../policy-builder.js", import.meta.url), "utf8");
  doc.body.appendChild(el);
  /** @param {string} id @returns {HTMLElement} */
  const byId = (id) => {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`no #${id} in the builder page`);
    return el;
  };
  const out = () => JSON.parse(byId("out").textContent ?? "");
  /** @param {Element} el @param {string} type */
  const fire = (el, type) => el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  /** @param {string} value */
  const setMode = (value) => {
    const radio = /** @type {HTMLInputElement} */ (doc.querySelector(`input[name="mode"][value="${value}"]`));
    radio.checked = true;
    fire(radio, "change");
  };
  return { dom, doc, byId, out, fire, setMode, problems: () => byId("problems").textContent ?? "" };
}

test("policy-builder: the default payload is a wrapped single palette", () => {
  const { out } = open();
  const policy = out();
  // paletteLocked ships CHECKED (owner, 2026-08-25: enforcement is what most
  // admins actually expect when publishing brand colors), so the default
  // payload carries both keys.
  assert.deepEqual(Object.keys(policy).sort(), ["palette", "paletteLocked"]);
  assert.ok(Array.isArray(policy.palette.Value), "wrapped in Value, which is how Chrome types a policy");
  assert.equal(policy.palette.Value.length, 3);
  assert.deepEqual(Object.keys(policy.palette.Value[0]).sort(), ["hex", "name"]);
});

test("policy-builder: every key it emits exists in the extension's policy schema", () => {
  const { out, doc, setMode, fire } = open();
  const seen = new Set(Object.keys(out()));
  setMode("many");
  Object.keys(out()).forEach((k) => seen.add(k));
  const locked = /** @type {HTMLInputElement} */ (doc.getElementById("locked"));
  locked.checked = true;
  fire(locked, "change");
  Object.keys(out()).forEach((k) => seen.add(k));
  for (const key of seen) {
    assert.ok(key in SCHEMA.properties, `${key} is a real policy key`);
  }
  assert.ok(seen.has("palette") && seen.has("palettes") && seen.has("paletteLocked"),
    "all three reachable from the UI");
});

test("policy-builder: what it emits is what staff would actually see", () => {
  // The end-to-end contract, minus the browser: the payload goes through the
  // SAME reader the extension runs on a delivered policy (lib/config.js), Value
  // envelope and all, so nothing can be silently dropped in between.
  const { out } = open();
  const policy = out();
  const swatches = orgSwatches(policy);
  assert.deepEqual(swatches.map((/** @type {any} */ s) => s.name), ["Poppy", "Sunshine", "Grass"]);
  assert.deepEqual(swatches.map((/** @type {any} */ s) => s.hex), policy.palette.Value.map((/** @type {any} */ s) => s.hex));
});

test("policy-builder: several palettes come out under `palettes`, with swatches", () => {
  const { out, setMode } = open();
  setMode("many");
  const policy = out();
  assert.ok(Array.isArray(policy.palettes.Value));
  assert.equal("palette" in policy, false, "the single-palette key is not also emitted");
  const entry = policy.palettes.Value[0];
  assert.deepEqual(Object.keys(entry).sort(), ["name", "swatches"]);
  // Again through the extension's own reader: the named palette arrives named,
  // with its colors, and is the one staff start on.
  const read = orgPalettes(policy);
  const first = /** @type {{name: string, swatches: {hex: string}[]}} */ (read[0]);
  assert.equal(first.name, entry.name);
  assert.deepEqual(first.swatches.map((s) => s.hex), entry.swatches.map((/** @type {any} */ s) => s.hex));
});

test("policy-builder: the lock is on by default, and unticking it removes the key", () => {
  // Not merely "false" - the key must be ABSENT, so an admin who deliberately
  // opts out publishes a payload with nothing to enforce rather than one that
  // says enforcement is off.
  const { out, doc, fire } = open();
  assert.deepEqual(out().paletteLocked, { Value: true }, "recommended, and pre-selected");
  const locked = /** @type {HTMLInputElement} */ (doc.getElementById("locked"));
  locked.checked = false;
  fire(locked, "change");
  assert.equal("paletteLocked" in out(), false);
});

test("policy-builder: an unusable color is dropped from the payload AND called out", () => {
  // Silently emitting a color the extension will skip is the failure mode that
  // makes an admin think they published something they did not.
  const { doc, out, fire, problems } = open();
  const hex = /** @type {HTMLInputElement} */ (doc.querySelectorAll("input.chex")[1]);
  hex.value = "notacolor";
  fire(hex, "input");
  const names = out().palette.Value.map((/** @type {any} */ s) => s.name);
  assert.equal(names.includes("Sunshine"), false, "the bad entry is not published");
  assert.match(problems(), /Sunshine/, "and the admin is told which one and why");
  assert.match(problems(), /skipped/);
});

test("policy-builder: a bare six-digit hex is accepted, the way a brand guide writes it", () => {
  const { doc, out, fire } = open();
  const hex = /** @type {HTMLInputElement} */ (doc.querySelectorAll("input.chex")[0]);
  hex.value = "1a73e8";
  fire(hex, "input");
  assert.equal(out().palette.Value[0].hex, "#1A73E8");
});

test("policy-builder: an empty palette says so rather than emitting a policy that does nothing", () => {
  const { doc, problems, fire } = open();
  const rows = doc.querySelectorAll("input.cname");
  rows.forEach((el) => { /** @type {HTMLInputElement} */ (el).value = ""; fire(el, "input"); });
  assert.match(problems(), /no usable colors/);
});


test("policy-builder: its caps are the extension's real caps, not a guess", () => {
  // roborev 4108: this shipped claiming to match lib/palette.js while capping
  // palettes at 10 against a real cap of 12, so an admin could not build the
  // 11th or 12th palette in the tool that exists to spare them the JSON.
  // Assert against the exports so the two cannot drift again in silence.
  const src = readFileSync(new URL("../policy-builder.js", import.meta.url), "utf8");
  const read = (/** @type {string} */ name) => {
    // Any declaration keyword: the cap is what matters, not how it is bound.
    const m = new RegExp(`(?:var|let|const) ${name} = (\\d+);`).exec(src);
    assert.ok(m, `${name} is declared in the page`);
    return Number(m[1]);
  };
  assert.equal(read("MAX_PALETTES"), MAX_PALETTES);
  assert.equal(read("MAX_SWATCHES"), MAX_SWATCHES);
});

test("policy-builder: ONE empty palette beside full ones is named, not silently dropped", () => {
  // roborev 4108. The extension drops any org palette with no usable colors
  // outright (normalizeOrgPalettes), so publishing one is publishing a name
  // that never appears. The tool's whole promise is naming what it skips.
  const { doc, out, fire, setMode, byId } = open();
  setMode("many");
  byId("add-palette").dispatchEvent(new (/** @type {any} */ (doc.defaultView)).MouseEvent("click", { bubbles: true }));

  // Empty the SECOND palette completely; the first keeps its colors.
  const boxes = doc.querySelectorAll(".palette");
  assert.equal(boxes.length, 2, "two palettes on screen");
  let guard = 0;
  const second = boxes[1];
  assert.ok(second, "the several-palettes mode should have produced a second box");
  while (second.querySelectorAll(".row").length > 0 && guard++ < 50) {
    /** @type {Element} */ (second.querySelector(".row .icon")).dispatchEvent(new (/** @type {any} */ (doc.defaultView)).MouseEvent("click", { bubbles: true }));
  }

  const policy = out();
  assert.equal(policy.palettes.Value[0].swatches.length > 0, true, "the first palette still has colors");
  assert.equal(policy.palettes.Value[1].swatches.length, 0, "the second is the empty one");
  const said = byId("problems").textContent ?? "";
  assert.match(said, /has no usable colors, so that whole palette will be skipped/);
  assert.equal(/no usable colors yet/.test(said), false,
    "and it does NOT claim the whole payload is empty, because it is not");

  // The extension's own reader confirms the consequence being warned about.
  assert.equal(orgPalettes(policy).length, 1, "the extension drops the empty entry");
  fire(byId("locked"), "change");
});


// --- The header chip previews the colors being set up (owner, 2026-08-26) ----

/** jsdom reports `style.background` with colors normalized to rgb(). */
const rgb = (/** @type {string} */ hex) => `rgb(${[1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(", ")})`;

test("policy-builder: the chip paints every color currently in the payload", () => {
  // Not the leading few the toolbar icon shows: at 16px an icon summarises, and
  // the whole value here is seeing the set an admin is choosing.
  const { byId } = open();
  const bg = byId("preview").style.background;
  assert.match(bg, /^linear-gradient\(90deg, /);
  for (const hex of ["#FE5917", "#EABF26", "#385834"]) {
    assert.ok(bg.includes(rgb(hex)), `${hex} is in the preview: ${bg}`);
  }
  assert.match(byId("preview").getAttribute("aria-label") ?? "", /#FE5917/,
    "and it is announced, since the chip is the only view of the set");
});

test("policy-builder: the chip follows an edit", () => {
  const { doc, fire, byId } = open();
  const hex = /** @type {HTMLInputElement} */ (doc.querySelectorAll("input.chex")[0]);
  hex.value = "#0000FF";
  fire(hex, "input");
  assert.ok(byId("preview").style.background.includes(rgb("#0000FF")),
    byId("preview").style.background);
});

test("policy-builder: an unusable color leaves the chip, as it leaves the payload", () => {
  const { doc, fire, byId } = open();
  const hex = /** @type {HTMLInputElement} */ (doc.querySelectorAll("input.chex")[1]);
  hex.value = "notacolor";
  fire(hex, "input");
  const bg = byId("preview").style.background;
  assert.equal(bg.includes(rgb("#EABF26")), false, "the skipped color is not previewed");
  assert.ok(bg.includes(rgb("#FE5917")), "the usable ones still are");
});

test("policy-builder: with nothing usable the chip falls back rather than going blank", () => {
  const { doc, fire, byId } = open();
  doc.querySelectorAll("input.cname").forEach((el) => {
    /** @type {HTMLInputElement} */ (el).value = "";
    fire(el, "input");
  });
  assert.equal(byId("preview").style.background, "",
    "cleared, so the packaged gradient in CSS shows through");
});

test("policy-builder: several palettes preview the FIRST, and say so", () => {
  // Staff start on the first, so that is the honest one to show - and an admin
  // editing palette two would otherwise read the chip as theirs.
  const { setMode, byId } = open();
  setMode("many");
  assert.match(byId("preview-note").textContent ?? "", /the palette staff start on/);
  assert.match(byId("preview-note").textContent ?? "", /Brand/, "named, so it is unambiguous");
});

// --- The "Where it goes" instructions -----------------------------------------
// These are the only instructions a Workspace admin gets, and getting them
// wrong costs a support round trip rather than a crash, so nothing louder than
// a passing build would ever report the damage. roborev 4224 noted the
// restructuring below had no test at all.

test("policy-builder: the setup guide is linked before anything else on the page", () => {
  // Owner, 2026-11-19. The same address Settings links (#admin-guide), so the
  // two cannot drift to different guides.
  const { doc } = open();
  const guide = doc.getElementById("guide");
  assert.ok(guide, "the guide link exists");
  const settings = readFileSync(new URL("../options.html", import.meta.url), "utf8");
  const href = guide.getAttribute("href") ?? "";
  assert.equal(href, "https://raylytics.io/custom-color-palette/admin");
  assert.ok(settings.includes(`id="admin-guide" href="${href}"`), "Settings links the same guide");
  assert.equal(guide.getAttribute("target"), "_blank");
  assert.match(guide.getAttribute("rel") ?? "", /noopener/);
  const fieldset = doc.querySelector("fieldset");
  assert.ok(fieldset && (guide.compareDocumentPosition(fieldset) & 4) !== 0, "it comes before the form");
});

test("policy-builder: the Web Store steps stay broken out, not folded back into prose", () => {
  // Owner, 2026-08-27: adding the extension is four discrete console actions
  // and read as a five-sentence paragraph. They are sub-bullets now. A later
  // copy edit that flattens them back would silently undo that.
  const { doc } = open();
  const steps = [...doc.querySelectorAll("ol.steps > li")];
  assert.ok(steps.length >= 5, "the console walkthrough should still be a numbered list");

  const addStep = steps.find((li) => /Add from Chrome Web Store/.test(li.textContent ?? ""));
  assert.ok(addStep, "the add-from-Web-Store instructions must still exist somewhere");
  const nested = addStep.querySelectorAll(":scope > ul > li > ul > li");
  assert.ok(nested.length >= 4,
    `the four Web Store actions should be their own bullets, found ${nested.length}`);

  // The warning is a sibling of the "if it is not there" case, not a trailing
  // clause on it: an admin who already sees the extension still needs it.
  const topSubs = [...addStep.querySelectorAll(":scope > ul > li")];
  assert.ok(topSubs.some((li) => /extension by ID/.test(li.textContent ?? "")),
    "the do-not-use-Add-by-ID warning should be its own bullet");
});

test("policy-builder: the paste step names WHAT to paste", () => {
  // "paste this over it" made the reader connect "this" to a payload generated
  // further up the page. It names the generated text now (owner, 2026-08-27).
  const { doc } = open();
  const paste = [...doc.querySelectorAll("ol.steps > li")]
    .find((li) => /Policy for extensions/.test(li.textContent ?? "")
      && /paste/i.test(li.textContent ?? ""));
  assert.ok(paste, "there should be a step about pasting into Policy for extensions");
  assert.match(paste.textContent ?? "", /paste the above generated text over it/i);
});

// --- Start from an existing palette (owner request, 2026-08-28; bd uh4) -------
// The page is a classic script that `import()`s the shared editor and the
// storage reader at runtime, because Chrome refuses ES modules on a file://
// page and a mailed copy is opened exactly that way. jsdom cannot perform that
// import either, so the tests inject the REAL modules through the
// `__policyBuilderDeps` seam - and the no-seam case below is the mailed copy.

import { mountPaletteEditor } from "../../shared/palette-editor.js";

/**
 * @param {{ deps?: any, chrome?: any }} [opts]
 */
function openWith({ deps, chrome } = {}) {
  const dom = new JSDOM(readFileSync(HTML, "utf8"), { runScripts: "dangerously" });
  const win = /** @type {any} */ (dom.window);
  if (deps) win.__policyBuilderDeps = deps;
  if (chrome) win.chrome = chrome;
  const doc = dom.window.document;
  const el = doc.createElement("script");
  el.textContent = readFileSync(new URL("../policy-builder.js", import.meta.url), "utf8");
  doc.body.appendChild(el);
  /** @param {string} id @returns {HTMLElement} */
  const byId = (id) => {
    const found = doc.getElementById(id);
    if (!found) throw new Error(`no #${id} in the builder page`);
    return found;
  };
  const out = () => JSON.parse(byId("out").textContent ?? "");
  /** @param {Element} node @param {string} type */
  const fire = (node, type) => node.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  const settle = () => new Promise((r) => setTimeout(r, 0));
  /** Resolves once the runtime import has been tried. */
  const ready = async () => { const r = await win.policyBuilderReady; await settle(); return r; };
  return { dom, doc, byId, out, fire, settle, ready };
}

const CHROME_WITH_SYNC = { storage: { sync: { get() { return Promise.resolve({}); } } } };

test("policy-builder: with no chrome and no shared modules it still builds a valid payload, and offers no import", async () => {
  // The mailed copy. The path most likely to regress and least likely to be
  // noticed, since the normal flow always has both.
  const { byId, out, ready, doc } = openWith();
  const result = await ready();
  assert.equal(result.sharedEditor, false, "no shared editor could load");
  assert.equal(result.importAvailable, false);
  assert.equal(byId("import").hidden, true, "the import control is ABSENT, not disabled or broken");
  assert.equal(doc.querySelectorAll(".row").length, 3, "the self-contained rows render");
  assert.equal(doc.querySelectorAll(".bpi-row").length, 0);
  const policy = out();
  assert.equal(orgSwatches(policy).length, 3, "and the payload is one the extension accepts");
  assert.ok(policy.paletteLocked);
});

test("policy-builder: with the shared editor loaded, the rows ARE the shared editor and edits reach the payload", async () => {
  const { byId, out, ready, doc, fire } = openWith({ deps: { mountPaletteEditor } });
  const result = await ready();
  assert.equal(result.sharedEditor, true);
  assert.equal(result.importAvailable, false, "the editor alone does not make storage readable");
  assert.equal(byId("import").hidden, true);
  assert.equal(doc.querySelectorAll(".bpi-row").length, 3, "the shared rows replaced the self-contained ones");
  assert.equal(doc.querySelectorAll(".row").length, 0);

  // A typed hex flows through the SAME validation as before.
  const hex = /** @type {HTMLInputElement} */ (doc.querySelectorAll("[data-bpi-hex]")[0]);
  hex.value = "0000ff";              // no '#', the brand-guide paste case
  fire(hex, "input");
  assert.equal(out().palette.Value[0].hex, "#0000FF");
  assert.ok(byId("preview").style.background.includes(rgb("#0000FF")), "the chip repaints from a shared-editor edit");

  hex.value = "notacolor";
  fire(hex, "input");
  assert.equal(out().palette.Value.length, 2, "an unusable colour leaves the payload");
  assert.match(byId("problems").textContent ?? "", /not a six-digit hex/);

  // Structural edits come from the shared editor: add and remove.
  const add = /** @type {HTMLButtonElement} */ ([...doc.querySelectorAll("button")].find((b) => b.textContent === "Add color"));
  add.click();
  assert.equal(doc.querySelectorAll(".bpi-row").length, 4);
  assert.equal(out().palette.Value.length, 3, "the new row is a usable default colour");
  /** @type {HTMLButtonElement} */ (doc.querySelector(".bpi-remove")).click();
  assert.equal(doc.querySelectorAll(".bpi-row").length, 3);
});

test("policy-builder: Start from my palettes reads EVERY palette and switches to several", async () => {
  const stored = {
    palettes: [
      { id: "a", name: "Retail", swatches: [{ name: "Red", hex: "#111111", order: 0 }, { name: "Blue", hex: "#222222", order: 1 }] },
      { id: "b", name: "Print", swatches: [{ name: "Ink", hex: "#333333", order: 0 }, { name: "Broken", hex: "nope", order: 1 }] },
    ],
    activePaletteId: "b",
  };
  const { byId, out, ready, doc, settle } = openWith({
    deps: { mountPaletteEditor, getPaletteState: async () => stored },
    chrome: CHROME_WITH_SYNC,
  });
  const result = await ready();
  assert.equal(result.importAvailable, true);
  assert.equal(byId("import").hidden, false, "offered, because storage is readable here");

  byId("import-palettes").click();
  await settle(); await settle();

  const policy = out();
  assert.ok(policy.palettes, "two palettes only fit the several-palettes payload, so the mode switched");
  assert.equal(/** @type {HTMLInputElement} */ (doc.querySelector('input[name="mode"][value="many"]')).checked, true);
  assert.deepEqual(policy.palettes.Value.map((/** @type {any} */ p) => p.name), ["Retail", "Print"], "all of them, not just the active one");
  assert.deepEqual(policy.palettes.Value[1].swatches.map((/** @type {any} */ s) => s.hex), ["#333333"],
    "an imported unusable colour goes through the same validation and is dropped");
  assert.match(byId("problems").textContent ?? "", /"Broken" in "Print" is not a six-digit hex/);
  assert.equal(orgPalettes(policy).length, 2, "and the extension's own reader accepts the result");
  assert.ok(byId("preview").style.background.includes(rgb("#111111")), "the chip repainted from the imported colours");
  assert.match(byId("import-note").textContent ?? "", /Brought in 2 palettes/);
  assert.equal(doc.querySelectorAll(".bpi-row").length, 4, "every imported colour is an editable shared row");
});

test("policy-builder: a single imported palette keeps the one-palette payload", async () => {
  const stored = { palettes: [{ id: "a", name: "Brand", swatches: [{ name: "Red", hex: "#111111", order: 0 }] }], activePaletteId: "a" };
  const { byId, out, ready, settle } = openWith({
    deps: { mountPaletteEditor, getPaletteState: async () => stored },
    chrome: CHROME_WITH_SYNC,
  });
  await ready();
  byId("import-palettes").click();
  await settle(); await settle();
  const policy = out();
  assert.ok(policy.palette, "still the single-palette key");
  assert.deepEqual(policy.palette.Value, [{ name: "Red", hex: "#111111" }]);
});

test("policy-builder: importing past the caps clamps AND says so", async () => {
  // Real data cannot exceed the caps today (lib/palette.js normalizes to the
  // same limits), but silent truncation is the failure this page exists to
  // prevent, so the clamp is pinned rather than trusted.
  const many = Array.from({ length: MAX_PALETTES + 1 }, (_, i) => ({
    id: `p${i}`, name: `P${i}`, swatches: [{ name: "x", hex: "#111111", order: 0 }],
  }));
  /** @type {any} */ (many[0]).swatches = Array.from({ length: MAX_SWATCHES + 1 }, (_, i) => ({ name: `c${i}`, hex: "#222222", order: i }));
  const { byId, out, ready, settle } = openWith({
    deps: { mountPaletteEditor, getPaletteState: async () => ({ palettes: many, activePaletteId: "p0" }) },
    chrome: CHROME_WITH_SYNC,
  });
  await ready();
  byId("import-palettes").click();
  await settle(); await settle();
  const policy = out();
  assert.equal(policy.palettes.Value.length, MAX_PALETTES);
  assert.equal(policy.palettes.Value[0].swatches.length, MAX_SWATCHES);
  const note = byId("import-note").textContent ?? "";
  assert.match(note, new RegExp(`Only the first ${MAX_PALETTES} of your ${MAX_PALETTES + 1} palettes`));
  assert.match(note, new RegExp(`"P0" has ${MAX_SWATCHES + 1} colors; only the first ${MAX_SWATCHES}`));
  assert.equal(byId("import-note").className, "note warn");
});

test("policy-builder: nothing stored yet is said plainly, and the page is left as it was", async () => {
  const { byId, out, ready, settle } = openWith({
    deps: { mountPaletteEditor, getPaletteState: async () => ({ palettes: [], activePaletteId: undefined }) },
    chrome: CHROME_WITH_SYNC,
  });
  await ready();
  const before = out();
  byId("import-palettes").click();
  await settle(); await settle();
  assert.match(byId("import-note").textContent ?? "", /no palettes in this browser/);
  assert.deepEqual(out(), before, "the default palette is untouched");
});
