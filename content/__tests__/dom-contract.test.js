import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import {
  loadContract,
  contractVersion,
  resolveApp,
  getPickerSelectors,
  pickerTypes,
  shared,
  findCustomDialog,
  readDialogRgb,
  findSwatchByHex,
  findExpandedColorButton,
  findMainSwatchCells,
  closestPopupRoot,
} from "../dom-contract.js";

/**
 * Minimal element shim: reports layout via getClientRects.
 * @param {{ rects?: number, kind?: string }} [opts]
 * @returns {any}
 */
function fakeEl({ rects = 1, kind } = {}) {
  return {
    kind,
    getClientRects: () => (rects > 0 ? new Array(rects).fill({}) : []),
  };
}
/**
 * Minimal Document shim whose querySelectorAll returns the preconfigured dialogs.
 * @param {{ dialogs?: any[] }} matches
 * @returns {any}
 */
function fakeDoc(matches) {
  return {
    querySelectorAll: () => matches.dialogs ?? [],
  };
}

const contract = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../config/selectors.default.json", import.meta.url)), "utf8"),
);

test("packaged selectors.default.json loads as a valid contract", () => {
  loadContract(contract);
  assert.equal(contractVersion(), contract.version);
});

test("loadContract rejects malformed shapes", () => {
  assert.throws(() => loadContract(/** @type {any} */ ({})));
  assert.throws(() => loadContract(/** @type {any} */ (null)));
});

test("resolveApp maps Google editor URLs", () => {
  assert.equal(resolveApp({ pathname: "/spreadsheets/d/abc/edit" }), "sheets");
  assert.equal(resolveApp({ pathname: "/document/d/abc/edit" }), "docs");
  assert.equal(resolveApp({ pathname: "/presentation/d/abc/edit" }), "slides");
  assert.equal(resolveApp({ pathname: "/forms/d/abc" }), null);
  assert.equal(resolveApp({ pathname: "" }), null);
});

test("getPickerSelectors returns toolbar + popup for known pickers", () => {
  loadContract(contract);
  const fill = getPickerSelectors("sheets", "fill");
  assert.ok(fill);
  assert.match(String(fill.toolbarButton), /t-cell-color/); // stable id (aria-label is stripped when the picker is open)
  assert.equal(getPickerSelectors("sheets", "nope"), null);
});

test("every app declares at least one picker; popupRoot always, toolbarButton unless panel-opened", () => {
  loadContract(contract);
  for (const app of /** @type {const} */ (["sheets", "docs", "slides"])) {
    const types = pickerTypes(app);
    assert.ok(types.length >= 1, `${app} has no pickers`);
    for (const t of types) {
      const sel = getPickerSelectors(app, t);
      assert.ok(sel?.popupRoot, `${app}.${t} has no popupRoot — injection could not find it`);
      // toolbarButton is optional, but ONLY for a picker that genuinely has no
      // toolbar entry point. Such a picker is invisible to the synthetic
      // monitor (it drives pickers by clicking their toolbar button), so a
      // missing toolbarButton must be a deliberate declaration, not a typo:
      // require the picker to say how it differs via an `overrides` block.
      if (!sel.toolbarButton) {
        assert.ok(sel.overrides, `${app}.${t} has neither a toolbarButton nor an overrides block`);
      }
    }
  }
});

test("the border and table pickers are declared, id-keyed, on the SAME popup roots as their siblings", () => {
  // Captured live 2026-08-30 (bd workspace-custom-palette-7f3). The finding
  // that shaped these entries: every one of these pickers was ALREADY getting
  // the Brand row before it had an entry, because its popup carries the same
  // classes as its app's fill/text picker and closestPopupRoot matches by
  // class. So the entries exist for the MONITOR (it needs a toolbar button to
  // click), not for injection - and that only stays true while the popupRoot
  // is the same selector as the siblings'. A future entry with a DIFFERENT
  // root would be a second injection path and needs its own fixture.
  loadContract(contract);
  const expect = {
    "sheets.border": { toolbarButton: "#t-border-color", sibling: "fill" },
    "docs.border": { toolbarButton: "#borderColorMenuButton", sibling: "text" },
    "docs.tableFill": { toolbarButton: "#cellColorMenuButton", sibling: "text" },
  };
  for (const [key, want] of Object.entries(expect)) {
    const [app, type] = key.split(".");
    const sel = getPickerSelectors(/** @type {any} */ (app), /** @type {string} */ (type));
    assert.ok(sel, `${key} is declared`);
    assert.equal(sel.toolbarButton, want.toolbarButton, `${key} opens by id`);
    assert.match(String(sel.toolbarButton), /^#[A-Za-z-]+$/, `${key} keys on a bare id, nothing translated`);
    const sib = getPickerSelectors(/** @type {any} */ (app), /** @type {string} */ (want.sibling));
    assert.equal(sel.popupRoot, sib?.popupRoot, `${key} shares its sibling's popup root, so injection is one path`);
  }
  // Slides table cells reuse the shape fill/border buttons (verified live
  // 2026-08-30), so there is deliberately no slides.table* entry to pin.
  assert.equal(getPickerSelectors("slides", "tableFill"), null);
});

test("shared selectors include the verified Phase 0 contract", () => {
  loadContract(contract);
  const s = shared();
  assert.match(s.customColorButton, /docs-customcolorpalette-add-custom-color-button/);
  assert.match(s.hexInput, /docs-material-hex-input/);
  assert.match(s.okButton, /docs-material-gm-dialog-call-to-action-button/);
});

test("findCustomDialog picks the VISIBLE dialog, skipping the hidden cached one", () => {
  loadContract(contract);
  const hidden = fakeEl({ rects: 0, kind: "hidden" });
  const visible = fakeEl({ rects: 1, kind: "visible" });
  // order hidden-first to prove it doesn't just take the first match
  const doc = fakeDoc({ dialogs: [hidden, visible] });
  assert.equal(/** @type {any} */ (findCustomDialog(doc))?.kind, "visible");
});

test("findCustomDialog returns null when no dialog is laid out", () => {
  loadContract(contract);
  const doc = fakeDoc({ dialogs: [fakeEl({ rects: 0 }), fakeEl({ rects: 0 })] });
  assert.equal(findCustomDialog(doc), null);
});

test("findSwatchByHex: matches a VISIBLE swatch whose aria-label carries the hex", () => {
  loadContract(contract);
  const cell = (/** @type {string} */ label, /** @type {number} */ rects = 1) => ({
    getClientRects: () => (rects ? [{}] : []),
    getAttribute: () => label,
    closest: () => null, // not inside our Brand row
  });
  const root = /** @type {any} */ ({
    querySelectorAll: () => [
      cell("black"), // built-in, no hex
      cell("Custom Color #1a73e8, close to dark cornflower blue 1", 0), // hidden -> skip
      cell("Custom Color #1a73e8, close to dark cornflower blue 1", 1), // visible match
    ],
  });
  const found = findSwatchByHex(root, "#1A73E8"); // case-insensitive
  assert.ok(found);
  assert.ok((found.getAttribute("aria-label") ?? "").includes("#1a73e8"));
  assert.equal(findSwatchByHex(root, "#ABCDEF"), null); // no false substring match
});

test("findExpandedColorButton: finds the expanded Sheets fill AND text buttons by id, role-independently", () => {
  loadContract(contract);
  // Real DOM so the ACTUAL contract selector (#t-cell-color / #t-text-color) runs
  // through querySelectorAll — not a substring stub. Live Sheets strips
  // aria-label/data-tooltip off the color button while its picker is open; we
  // match by the stable id ALONE and must NOT depend on `role` surviving, so the
  // open button here carries neither aria-label nor role. jsdom has no layout, so
  // stub getClientRects to mark it visible. Regression for the false "can't apply
  // in Sheets without reopening" banner (the aria-label selector matched nothing
  // when open) AND its recurrence risk if role were also stripped.
  const make = (/** @type {string} */ id, /** @type {boolean} */ expanded = true) => {
    const dom = new JSDOM(`<!doctype html><div class="goog-menu docs-colormenuitems"><div id="${id}"></div></div>`);
    const btn = /** @type {any} */ (dom.window.document.getElementById(id));
    btn.setAttribute("aria-expanded", expanded ? "true" : "false"); // NOTE: no aria-label, no role
    btn.getClientRects = () => [{}];
    return { doc: /** @type {any} */ (dom.window.document), btn };
  };
  const fill = make("t-cell-color");
  assert.equal(findExpandedColorButton(fill.doc), fill.btn);
  const text = make("t-text-color");
  assert.equal(findExpandedColorButton(text.doc), text.btn);
  // Not expanded -> null (the closed button must not be treated as the open one).
  assert.equal(findExpandedColorButton(make("t-cell-color", false).doc), null);
});

test("findMainSwatchCells: returns the LARGEST grid's cells (main palette, not STANDARD/CUSTOM)", () => {
  loadContract(contract);
  const dom = new JSDOM(`<!doctype html><div class="goog-menu docs-colormenuitems">
    <table><tbody><tr>
      <td class="docs-material-colorpalette-cell" role="gridcell" aria-label="black"></td>
      <td class="docs-material-colorpalette-cell" role="gridcell" aria-label="red"></td>
      <td class="docs-material-colorpalette-cell" role="gridcell" aria-label="green"></td>
    </tr></tbody></table>
    <table><tbody><tr>
      <td class="docs-material-colorpalette-cell" role="gridcell" aria-label="Theme Color black"></td>
    </tr></tbody></table>
  </div>`);
  const menu = dom.window.document.querySelector(".goog-menu");
  const cells = findMainSwatchCells(/** @type {any} */ (menu));
  assert.equal(cells.length, 3); // the 3-cell grid, not the 1-cell one
  assert.equal(cells[0]?.getAttribute("aria-label"), "black");
});

test("closestPopupRoot: resolves a sub-palette node up to the one enclosing menu", () => {
  loadContract(contract);
  const dom = new JSDOM(`<!doctype html><div class="goog-menu docs-colormenuitems" id="menu">
    <table class="docs-material-colorpalette-table docs-colormenuitems-custom-palette"><tbody><tr>
      <td class="docs-material-colorpalette-cell" role="gridcell" id="sub" aria-label="custom"></td>
    </tr></tbody></table>
  </div>`);
  const subCell = dom.window.document.getElementById("sub");
  const root = closestPopupRoot(/** @type {any} */ (subCell));
  assert.equal(root?.id, "menu"); // sub-palette trigger normalizes to the menu
  assert.equal(closestPopupRoot(/** @type {any} */ (dom.window.document.body)), null);
});

test("readDialogRgb parses R/G/B field values; null when fields missing", () => {
  loadContract(contract);
  // Resolve the shim against the CONTRACT's own selector strings rather than
  // hardcoded ones, so a selector change (e.g. the 2026-08-15 locale hardening
  // that replaced aria-label="R" with .docs-material-rgba-red-input) can't
  // silently break this test's fake without touching the behavior it covers.
  const s = shared();
  /** @type {Record<string, string>} */
  const values = { [s.redInput]: "52", [s.greenInput]: "168", [s.blueInput]: "83" };
  // querySelectorAll + getClientRects, because the readback is visible-filtered:
  // the tabbed dropdown-chip dialog carries a SECOND, hidden R/G/B trio for the
  // inactive tab, so "first match" is not "the one on screen".
  const field = (/** @type {string} */ v, /** @type {boolean} */ vis = true) => ({
    value: v,
    getClientRects: () => (vis ? [{}] : []),
  });
  const dialog = /** @type {any} */ ({
    querySelectorAll: (/** @type {string} */ sel) => (sel in values ? [field(String(values[sel]))] : []),
  });
  assert.deepEqual(readDialogRgb(dialog), { r: 52, g: 168, b: 83 });
  assert.equal(readDialogRgb(/** @type {any} */ ({ querySelectorAll: () => [] })), null);
  // The hidden trio must be skipped, not read: taking the first match here is
  // exactly how a brand colour would get committed off the wrong tab.
  const tabbed = /** @type {any} */ ({
    querySelectorAll: (/** @type {string} */ sel) =>
      (sel in values ? [field("0", false), field(String(values[sel]))] : []),
  });
  assert.deepEqual(readDialogRgb(tabbed), { r: 52, g: 168, b: 83 });
});

/**
 * EVERY selector contract in the repo, not just the packaged fallback. The
 * service's copy is what actually reaches users on a data publish, so a guard
 * that only checks the packaged file protects the wrong artifact: at
 * 2026-08-15 the served copy still carried English aria-labels and had lost
 * `sectionLabel` entirely, so publishing it would have silently reintroduced
 * both the non-English apply failure (7as) and the Docs Brand-label regression.
 * @type {[string, any][]}
 */
const ALL_CONTRACTS = [
  ["config/selectors.default.json", contract],
  [
    "service/data/selectors.json",
    JSON.parse(readFileSync(fileURLToPath(new URL("../../service/data/selectors.json", import.meta.url)), "utf8")),
  ],
];

// Attributes whose values Google translates. Keep in step with
// `_LOCALE_DEPENDENT` in service/alerts.py — this checks the files in the repo,
// that one checks what a remediator publishes, and a selector rejected by one
// must be rejected by the other. Case-insensitive because HTML attribute names
// are: [ARIA-LABEL=...] still matches in the browser.
const TRANSLATED_NAMES =
  "aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext|title|data-tooltip|placeholder|alt|label";
const TRANSLATED_ATTR = new RegExp(`(?:${TRANSLATED_NAMES})\\s*[\\^$*|~]?=`, "i");

// The same rule, anchored to the `[` that opens an attribute selector. Use this
// when scanning SOURCE, not selector strings: over TypeScript the unanchored
// form matches ordinary code such as `const label = item.label` or
// `el.title = x`, so it would fail the hook on lines that contain no selector
// at all. Selector strings always carry the bracket, so nothing real is lost.
const TRANSLATED_ATTR_IN_SELECTOR = new RegExp(`\\[\\s*(?:${TRANSLATED_NAMES})\\s*[\\^$*|~]?=`, "i");

test("every contract's selectors are locale-independent (no translated-text matches)", () => {
  // Regression guard for bd workspace-custom-palette-7as: English aria-labels
  // in the contract silently broke the apply path for non-English Google UIs
  // (a Danish user's picker has no aria-label="Hex color"). Element ids and
  // class names are the same in every language; visible text is not.
  for (const [name, doc] of ALL_CONTRACTS) {
    /** @type {string[]} */
    const offenders = [];
    const check = (/** @type {string} */ label, /** @type {any} */ sel) => {
      if (typeof sel === "string" && TRANSLATED_ATTR.test(sel)) offenders.push(`${label}: ${sel}`);
    };
    // Recurse: every string value at any depth, not a fixed key list. A picker's
    // `overrides` block is a NESTED object of selectors (the Sheets dropdown-chip
    // widget), and a one-level scan would walk straight past it — mirrors
    // _nested_selectors in service/alerts.py, which gates what a remediator can
    // publish. Keep the two in step.
    const walk = (/** @type {string} */ label, /** @type {any} */ node) => {
      for (const [k, v] of Object.entries(node)) {
        if (typeof v === "string") check(`${label}.${k}`, v);
        else if (v && typeof v === "object") walk(`${label}.${k}`, v);
      }
    };
    walk("shared", doc.shared);
    for (const [app, entry] of Object.entries(doc.apps)) {
      for (const [type, picker] of Object.entries(/** @type {any} */ (entry).pickers)) {
        walk(`${app}.${type}`, /** @type {any} */ (picker));
      }
    }
    assert.deepEqual(offenders, [], `locale-dependent selectors in ${name}`);
  }
});

test("the monitor's mirrored selectors are locale-independent too", () => {
  // The monitor is the authoritative break signal, so a translated-text selector
  // there is worse than one in the contract: the matrix goes green in English
  // and we never learn that non-English users are broken. Read as TEXT (no TS
  // execution) so this runs in Tier 1 with the rest of the hook.
  const src = readFileSync(fileURLToPath(new URL("../../monitor/src/matrix.ts", import.meta.url)), "utf8");
  // Our OWN injected markers are exempt: injector.js writes aria-label="Brand: <name>"
  // and the data-brand-palette-* attributes itself, so those strings are ours in
  // every language. Everything else in this file describes Google's DOM.
  const OURS = /Brand:|data-brand-palette/;
  // Scan LINE BY LINE rather than picking string literals out with a regex: a
  // selector's own quotes ('[aria-label="x"]') defeat the obvious
  // literal-matching pattern, and a guard that silently skips exactly the
  // strings it exists to catch is worse than no guard.
  //
  // Do NOT strip `//` comments to do it. matrix.ts is a file of URLs, and
  // `.replace(/\/\/[^\n]*/g, "")` cuts every one of them at "https:" — so a new
  // row written with a literal URL and a bad selector on the SAME line (which
  // is how CheckItem is laid out) would have its selector chopped off unread.
  // Skip whole comment lines instead, leaving code lines intact.
  const isComment = (/** @type {string} */ l) => l.startsWith("//") || l.startsWith("*") || l.startsWith("/*");
  /** @type {string[]} */
  const offenders = src
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => !isComment(l))
    .filter((l) => TRANSLATED_ATTR_IN_SELECTOR.test(l) && !OURS.test(l));
  assert.deepEqual(offenders, [], "locale-dependent selectors in monitor/src/matrix.ts");
});

test("the monitor mirrors the contract's swatchSelected token", () => {
  // matrix.ts says its SELECTORS mirror the contract's `shared` block. The two
  // spellings differ on purpose — the contract holds a selector (".foo"), the
  // monitor a class NAME for classList.contains ("foo") — so only a test keeps
  // them from drifting apart silently, which would leave the live check
  // asserting against a class Google no longer uses.
  loadContract(contract);
  const src = readFileSync(fileURLToPath(new URL("../../monitor/src/matrix.ts", import.meta.url)), "utf8");
  const m = src.match(/swatchSelected:\s*"([^"]+)"/);
  assert.ok(m, "monitor/src/matrix.ts no longer mirrors swatchSelected");
  assert.equal(m[1], (shared().swatchSelected ?? "").replace(/^\./, ""));
});

test("the served contract stays in sync with the packaged one", () => {
  // The service copy drifting behind the packaged one is invisible in normal
  // use — pickContract prefers whichever version string sorts higher — right up
  // until someone publishes, at which point the stale selectors go live.
  const [, packaged] = ALL_CONTRACTS[0] ?? [];
  const [, served] = ALL_CONTRACTS[1] ?? [];
  assert.deepEqual(
    Object.keys(served.shared).sort(),
    Object.keys(packaged.shared).sort(),
    "served contract is missing (or has extra) shared resolvers",
  );
  assert.deepEqual(served.shared, packaged.shared, "served shared selectors differ from packaged");
  assert.deepEqual(Object.keys(served.apps).sort(), Object.keys(packaged.apps).sort());
  for (const app of Object.keys(packaged.apps)) {
    assert.deepEqual(served.apps[app], packaged.apps[app], `served ${app} pickers differ from packaged`);
  }
  assert.equal(served.version, packaged.version, "served contract version is behind the packaged one");
});
