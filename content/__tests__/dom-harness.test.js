/**
 * DOM-harness tests (jsdom) for the content-script glue the synthetic monitor
 * otherwise covers: injectBrandRow (idempotency, cell count/order, mount
 * position, empty palette) and health-probe (assertInjected decision + banner,
 * showBanner idempotency). Closes workspace-custom-palette-idb.
 *
 * No layout in jsdom, so this exercises code paths that don't depend on
 * getClientRects (injection + assertion + banner DOM), not the visible-filter
 * resolvers (those are unit-tested with shims, and covered live by the monitor).
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { injectBrandRow, MARK, LABEL_MARK } from "../injector.js";
import { assertInjected, showBanner } from "../health-probe.js";
import { loadContract, closestPopupRoot } from "../dom-contract.js";
import { refreshBrandRows } from "../picker-observer.js";

const contract = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../config/selectors.default.json", import.meta.url)), "utf8"),
);

/** Build a minimal-but-realistic Sheets-style picker popup in a fresh jsdom doc. */
function makePicker() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;
  const menu = doc.createElement("div");
  menu.className = "goog-menu";
  const tbody = doc.createElement("tbody");
  const table = doc.createElement("table");
  table.appendChild(tbody);
  menu.appendChild(table);
  // a row of built-in swatch cells
  const row = doc.createElement("tr");
  /** @type {[string, string][]} */
  const builtins = [["black", "rgb(0, 0, 0)"], ["red", "rgb(255, 0, 0)"]];
  for (const [name, rgb] of builtins) {
    const td = doc.createElement("td");
    td.className = "docs-material-colorpalette-cell";
    td.setAttribute("role", "gridcell");
    td.setAttribute("aria-label", name);
    const inner = doc.createElement("div");
    inner.className = "docs-material-colorpalette-colorswatch";
    inner.style.backgroundColor = rgb;
    inner.setAttribute("title", name); // live DOM: the inner swatch carries title=<color name>
    td.appendChild(inner);
    row.appendChild(td);
  }
  tbody.appendChild(row);
  // the custom-color button (in its own row)
  const customRow = doc.createElement("tr");
  const customCell = doc.createElement("td");
  const customBtn = doc.createElement("div");
  customBtn.className = "docs-customcolorpalette-add-custom-color-button";
  customBtn.setAttribute("role", "button");
  customBtn.setAttribute("aria-label", "Add a custom color");
  customCell.appendChild(customBtn);
  customRow.appendChild(customCell);
  tbody.appendChild(customRow);
  doc.body.appendChild(menu);
  return { doc, menu, tbody };
}

const PALETTE = [
  { name: "Accent", hex: "#34A853", order: 1 },
  { name: "Primary", hex: "#1A73E8", order: 0 }, // out of order on purpose
];

test("injectBrandRow: one row, cells sorted by order, correct labels + colors", () => {
  loadContract(contract);
  const { doc, menu } = makePicker();
  assert.equal(injectBrandRow(menu, PALETTE, doc), true);

  const rows = menu.querySelectorAll(`[${MARK}]`);
  assert.equal(rows.length, 1);
  const cells = rows[0]?.querySelectorAll("td");
  assert.equal(cells?.length, 2);
  // sorted by order -> Primary (0) then Accent (1)
  assert.equal(cells?.[0]?.getAttribute("aria-label"), "Brand: Primary");
  assert.equal(cells?.[1]?.getAttribute("aria-label"), "Brand: Accent");
  assert.equal(cells?.[0]?.querySelector("div")?.style.backgroundColor, "rgb(26, 115, 232)");
  // title carries the hex (used by the apply fast path / monitor)
  assert.match(cells?.[0]?.getAttribute("title") ?? "", /#1A73E8/);
});

test("injectBrandRow: idempotent — second call is a no-op, still one row", () => {
  loadContract(contract);
  const { doc, menu } = makePicker();
  assert.equal(injectBrandRow(menu, PALETTE, doc), true);
  assert.equal(injectBrandRow(menu, PALETTE, doc), false);
  assert.equal(menu.querySelectorAll(`[${MARK}]`).length, 1);
});

test("injectBrandRow: a palette wider than Google's grid wraps into more rows", () => {
  // One <tr> with every swatch made the table wider than Google's rows; the
  // Slides fill menu has a fixed width, so swatches past the tenth were
  // clipped behind a scrollbar (bd workspace-custom-palette-8j9). The fixture
  // grid is two cells wide, so five swatches must land as 2 + 2 + 1.
  loadContract(contract);
  const { doc, menu, tbody } = makePicker();
  const five = ["#111111", "#222222", "#333333", "#444444", "#555555"]
    .map((hex, i) => ({ name: `C${i}`, hex, order: i }));
  assert.equal(injectBrandRow(menu, five, doc), true);

  const rows = [...menu.querySelectorAll(`[${MARK}]`)];
  assert.deepEqual(rows.map((r) => r.children.length), [2, 2, 1], "no row is wider than the grid");
  assert.ok(rows.every((r) => r.tagName === "TR" && r.parentElement === tbody));
  assert.deepEqual(
    rows.flatMap((r) => [...r.children].map((c) => c.getAttribute("aria-label"))),
    ["Brand: C0", "Brand: C1", "Brand: C2", "Brand: C3", "Brand: C4"],
    "reading order is palette order",
  );
  // The rows are consecutive, so nothing of Google's sits between them.
  assert.equal(rows[0]?.nextElementSibling, rows[1]);
  assert.equal(rows[1]?.nextElementSibling, rows[2]);
  // Still one injection as far as idempotency and removal are concerned.
  assert.equal(injectBrandRow(menu, five, doc), false);
  assert.equal(menu.querySelectorAll(`[${MARK}]`).length, 3);
  refreshBrandRows(() => [], doc);
  assert.equal(menu.querySelectorAll(`[${MARK}]`).length, 0, "every wrapped row is removed");
});

test("injectBrandRow: empty palette injects nothing and leaves no mark", () => {
  loadContract(contract);
  const { doc, menu } = makePicker();
  assert.equal(injectBrandRow(menu, [], doc), false);
  assert.equal(menu.querySelector(`[${MARK}]`), null);
});

test("injectBrandRow: the Brand row mounts in the swatch grid's own tbody", () => {
  loadContract(contract);
  const { doc, menu, tbody } = makePicker();
  injectBrandRow(menu, PALETTE, doc);
  const brandRow = menu.querySelector(`[${MARK}]`);
  assert.ok(brandRow);
  assert.equal(brandRow.tagName, "TR");
  assert.equal(brandRow.parentElement, tbody); // same table section as the swatches
});

/**
 * Build a Sheets-style picker with THREE grids (main / STANDARD / CUSTOM), like
 * the live DOM (80 / 10 / 10 cells). Each is its own docs-material-colorpalette
 * table inside one .goog-menu.docs-colormenuitems.
 */
function makeMultiGridPicker() {
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;
  const menu = doc.createElement("div");
  menu.className = "goog-menu docs-colormenuitems";
  /** @param {[string,string][]} cells */
  const grid = (cells) => {
    const table = doc.createElement("table");
    table.className = "docs-material-colorpalette-table";
    const tbody = doc.createElement("tbody");
    const tr = doc.createElement("tr");
    for (const [name, rgb] of cells) {
      const td = doc.createElement("td");
      td.className = "docs-material-colorpalette-cell";
      td.setAttribute("role", "gridcell");
      td.setAttribute("aria-label", name);
      const inner = doc.createElement("div");
      inner.className = "docs-material-colorpalette-colorswatch";
      inner.style.backgroundColor = rgb;
      td.appendChild(inner);
      tr.appendChild(td);
    }
    tbody.appendChild(tr);
    table.appendChild(tbody);
    menu.appendChild(table);
    return { table, tbody };
  };
  const main = grid([["black", "rgb(0,0,0)"], ["red", "rgb(255,0,0)"], ["green", "rgb(0,128,0)"], ["blue", "rgb(0,0,255)"]]);
  grid([["Theme Color black", "rgb(0,0,0)"], ["Theme Color red", "rgb(255,0,0)"]]); // STANDARD (smaller)
  grid([["Add a custom color", "rgb(255,255,255)"], ["custom blue", "rgb(0,0,255)"]]); // CUSTOM (smaller)
  doc.body.appendChild(menu);
  return { doc, menu, mainTbody: main.tbody };
}

test("injectBrandRow: with main/STANDARD/CUSTOM grids, ONE row into the MAIN grid only", () => {
  loadContract(contract);
  const { doc, menu, mainTbody } = makeMultiGridPicker();
  assert.equal(injectBrandRow(menu, PALETTE, doc), true);
  // Exactly one Brand row across the whole picker (not one per grid).
  const rows = menu.querySelectorAll(`[${MARK}]`);
  assert.equal(rows.length, 1);
  // ...and it landed in the MAIN (largest) grid, not STANDARD/CUSTOM.
  assert.equal(rows[0]?.parentElement, mainTbody);
  // Cloned from a MAIN-grid cell, so the brand colors render (the CUSTOM-grid
  // bug rendered them all as the source swatch's color).
  const cells = rows[0]?.querySelectorAll("td");
  assert.equal(cells?.[0]?.querySelector("div")?.style.backgroundColor, "rgb(26, 115, 232)"); // #1A73E8
  assert.equal(cells?.[1]?.querySelector("div")?.style.backgroundColor, "rgb(52, 168, 83)"); // #34A853
});

test("injectBrandRow: clones a 'Brand' section label above the swatches when the picker has a header", () => {
  loadContract(contract);
  const dom = new JSDOM('<!doctype html><div class="goog-menu docs-colormenuitems"></div>');
  const doc = dom.window.document;
  const menu = /** @type {HTMLElement} */ (doc.querySelector(".goog-menu"));
  // Google's own section header (the template we clone for "Brand").
  const header = doc.createElement("div");
  header.className = "goog-menuheader docs-colormenuitems-scheme-header";
  header.id = "native-std";
  header.textContent = "Standard";
  menu.appendChild(header);
  // A main swatch grid.
  const table = doc.createElement("table");
  const tbody = doc.createElement("tbody");
  const tr = doc.createElement("tr");
  /** @type {[string, string][]} */
  const builtins = [["black", "rgb(0,0,0)"], ["red", "rgb(255,0,0)"]];
  for (const [name, rgb] of builtins) {
    const td = doc.createElement("td");
    td.className = "docs-material-colorpalette-cell";
    td.setAttribute("role", "gridcell");
    td.setAttribute("aria-label", name);
    const inner = doc.createElement("div");
    inner.className = "docs-material-colorpalette-colorswatch";
    inner.style.backgroundColor = rgb;
    td.appendChild(inner);
    tr.appendChild(td);
  }
  tbody.appendChild(tr); table.appendChild(tbody); menu.appendChild(table);

  assert.equal(injectBrandRow(menu, PALETTE, doc), true);
  const labels = menu.querySelectorAll(`[${LABEL_MARK}]`);
  assert.equal(labels.length, 1, "one label row");
  assert.equal(menu.querySelectorAll(`[${MARK}]`).length, 1, "one swatch row");
  // The label sits immediately ABOVE the swatch row, cloned from the native header.
  const swatchRow = menu.querySelector(`[${MARK}]`);
  assert.equal(labels[0]?.nextElementSibling, swatchRow);
  const labelInner = labels[0]?.querySelector(".goog-menuheader");
  assert.equal(labelInner?.textContent, "Brand");
  assert.equal(labelInner?.id, "", "cloned header's id is stripped to avoid duplicates");
  // Idempotent: a second call adds neither another swatch row nor another label.
  injectBrandRow(menu, PALETTE, doc);
  assert.equal(menu.querySelectorAll(`[${MARK}]`).length, 1);
  assert.equal(menu.querySelectorAll(`[${LABEL_MARK}]`).length, 1);
});

test("injectBrandRow: no section header -> swatch row injected without a label (graceful)", () => {
  loadContract(contract);
  const { doc, menu } = makePicker(); // makePicker has no goog-menuheader
  assert.equal(injectBrandRow(menu, PALETTE, doc), true);
  assert.equal(menu.querySelectorAll(`[${MARK}]`).length, 1);
  assert.equal(menu.querySelectorAll(`[${LABEL_MARK}]`).length, 0);
});

test("injectBrandRow: Docs-style header (docs-colormenuitems-custom-header) yields a layout-neutralized 'Brand' label", () => {
  // Regression for the field reports of 2026-08-15: the Docs picker has NO
  // .goog-menuheader — its only heading is the "CUSTOM" div — so the label was
  // silently skipped and the Brand row blended into Google's grid unlabeled.
  loadContract(contract);
  const { doc, menu } = makePicker();
  const header = doc.createElement("div");
  header.className = "docs-colormenuitems-custom-header";
  header.textContent = "Custom";
  menu.appendChild(header);
  assert.equal(injectBrandRow(menu, PALETTE, doc), true);
  const label = menu.querySelector(`[${LABEL_MARK}] .docs-colormenuitems-custom-header`);
  assert.ok(label, "label cloned from the Docs CUSTOM header");
  assert.equal(label?.textContent, "Brand");
  // The Docs header class carries context-specific negative margin / fixed
  // width from Google's stylesheet; the clone must neutralize both inline or
  // the label clips outside the menu (verified live 2026-08-15).
  assert.equal(/** @type {HTMLElement} */ (label)?.style.margin, "0px");
  assert.equal(/** @type {HTMLElement} */ (label)?.style.width, "auto");
});

test("injectBrandRow: cloned tooltip attributes are overwritten with the brand name", () => {
  // Regression for the Danish field report of 2026-08-15: the clone source is
  // the first main-grid swatch (black), and its inner div's title survives the
  // clone — the innermost title wins on hover, so every Brand swatch showed
  // "black" ("sort" in a Danish UI) instead of the brand color name.
  loadContract(contract);
  const { doc, menu } = makePicker();
  assert.equal(injectBrandRow(menu, PALETTE, doc), true);
  const cells = menu.querySelectorAll(`[${MARK}] td`);
  assert.equal(cells[0]?.getAttribute("title"), "Primary (#1A73E8)");
  assert.equal(cells[0]?.querySelector("div")?.getAttribute("title"), "Primary (#1A73E8)", "inner title no longer says 'black'");
  assert.equal(cells[1]?.querySelector("div")?.getAttribute("title"), "Accent (#34A853)");
});

test("observer dedup: separate sub-palette triggers normalize to one menu -> ONE row", () => {
  loadContract(contract);
  const { doc, menu, mainTbody } = makeMultiGridPicker();
  // Reproduce the duplicate-row bug's mechanism: the observer fires SEPARATELY
  // for each grid (main + STANDARD + CUSTOM — each satisfies isPickerPopup). The
  // observer normalizes every trigger via closestPopupRoot, then injects; the
  // shared per-root idempotency on the one menu must yield exactly one row. If
  // closestPopupRoot ever returned the sub-grid instead of the menu, this fails.
  const grids = Array.from(menu.querySelectorAll("table"));
  assert.equal(grids.length, 3);
  for (const g of grids) {
    const root = closestPopupRoot(/** @type {any} */ (g)) ?? menu;
    assert.equal(root, menu, "each sub-palette trigger resolves to the one menu");
    injectBrandRow(root, PALETTE, doc);
  }
  const rows = menu.querySelectorAll(`[${MARK}]`);
  assert.equal(rows.length, 1, "exactly one Brand row across all triggers");
  assert.equal(rows[0]?.parentElement, mainTbody, "and it's in the main grid");
});

test("refreshBrandRows: re-renders the row with the updated palette into the cached menu", () => {
  loadContract(contract);
  const { doc, menu, mainTbody } = makeMultiGridPicker();
  injectBrandRow(menu, PALETTE, doc);
  assert.equal(menu.querySelector(`[${MARK}]`)?.querySelector("div")?.style.backgroundColor, "rgb(26, 115, 232)"); // Primary #1A73E8
  // User edits the palette: first color is now green. Google reused the menu, so
  // the stale blue row is still mounted; refresh must swap it for the new colors.
  refreshBrandRows(() => [{ name: "Primary", hex: "#34A853", order: 0 }], doc);
  const rows = menu.querySelectorAll(`[${MARK}]`);
  assert.equal(rows.length, 1, "still exactly one row");
  assert.equal(rows[0]?.parentElement, mainTbody, "still in the main grid");
  assert.equal(rows[0]?.querySelector("div")?.style.backgroundColor, "rgb(52, 168, 83)"); // now #34A853 green
});

test("refreshBrandRows: empty palette (toggle off) removes the row from a cached picker", () => {
  loadContract(contract);
  const { doc, menu } = makeMultiGridPicker();
  injectBrandRow(menu, PALETTE, doc);
  assert.equal(menu.querySelectorAll(`[${MARK}]`).length, 1);
  refreshBrandRows(() => [], doc);
  assert.equal(menu.querySelectorAll(`[${MARK}]`).length, 0);
});

test("refreshBrandRows: no-op when no picker is present in the DOM", () => {
  loadContract(contract);
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;
  assert.doesNotThrow(() => refreshBrandRows(() => PALETTE, doc));
  assert.equal(doc.querySelectorAll(`[${MARK}]`).length, 0, "nothing injected without a picker");
});

test("refreshBrandRows: two cached menus each get exactly one row", () => {
  loadContract(contract);
  const dom = new JSDOM("<!doctype html><html><body></body></html>");
  const doc = dom.window.document;
  const addPicker = () => {
    const menu = doc.createElement("div");
    menu.className = "goog-menu docs-colormenuitems";
    const table = doc.createElement("table");
    table.className = "docs-material-colorpalette-table";
    const tbody = doc.createElement("tbody");
    const tr = doc.createElement("tr");
    /** @type {[string, string][]} */
    const builtins = [["black", "rgb(0,0,0)"], ["red", "rgb(255,0,0)"]];
    for (const [name, rgb] of builtins) {
      const td = doc.createElement("td");
      td.className = "docs-material-colorpalette-cell";
      td.setAttribute("role", "gridcell");
      td.setAttribute("aria-label", name);
      const inner = doc.createElement("div");
      inner.className = "docs-material-colorpalette-colorswatch";
      inner.style.backgroundColor = rgb;
      td.appendChild(inner);
      tr.appendChild(td);
    }
    tbody.appendChild(tr); table.appendChild(tbody); menu.appendChild(table);
    doc.body.appendChild(menu);
    return menu;
  };
  const menuA = addPicker();
  const menuB = addPicker();
  refreshBrandRows(() => PALETTE, doc);
  assert.equal(menuA.querySelectorAll(`[${MARK}]`).length, 1, "one row in menu A");
  assert.equal(menuB.querySelectorAll(`[${MARK}]`).length, 1, "one row in menu B");
  assert.equal(doc.querySelectorAll(`[${MARK}]`).length, 2, "two rows total, one per menu");
});

test("injectBrandRow: cloned label drops the native aria-label and is presentational", () => {
  loadContract(contract);
  const dom = new JSDOM('<!doctype html><div class="goog-menu docs-colormenuitems"></div>');
  const doc = dom.window.document;
  const menu = /** @type {HTMLElement} */ (doc.querySelector(".goog-menu"));
  // Native section header carrying an aria-label, like Google's own headers.
  const header = doc.createElement("div");
  header.className = "goog-menuheader docs-colormenuitems-scheme-header";
  header.setAttribute("aria-label", "Standard");
  header.textContent = "Standard";
  menu.appendChild(header);
  const table = doc.createElement("table");
  const tbody = doc.createElement("tbody");
  const tr = doc.createElement("tr");
  /** @type {[string, string][]} */
  const builtins = [["black", "rgb(0,0,0)"], ["red", "rgb(255,0,0)"]];
  for (const [name, rgb] of builtins) {
    const td = doc.createElement("td");
    td.className = "docs-material-colorpalette-cell";
    td.setAttribute("role", "gridcell");
    td.setAttribute("aria-label", name);
    const inner = doc.createElement("div");
    inner.className = "docs-material-colorpalette-colorswatch";
    inner.style.backgroundColor = rgb;
    td.appendChild(inner);
    tr.appendChild(td);
  }
  tbody.appendChild(tr); table.appendChild(tbody); menu.appendChild(table);

  assert.equal(injectBrandRow(menu, PALETTE, doc), true);
  const labelRow = menu.querySelector(`[${LABEL_MARK}]`);
  // The label row and its cell are out of the grid's row/col model.
  assert.equal(labelRow?.getAttribute("role"), "presentation");
  assert.equal(labelRow?.querySelector("td")?.getAttribute("role"), "presentation");
  // The cloned header no longer announces the stale "Standard" label; its
  // accessible name is the visible "Brand" text.
  const labelInner = labelRow?.querySelector(".goog-menuheader");
  assert.equal(labelInner?.getAttribute("aria-label"), null, "stale aria-label stripped");
  assert.equal(labelInner?.textContent, "Brand");
});

test("assertInjected: healthy when the row is present (no banner)", () => {
  loadContract(contract);
  const { doc, menu } = makePicker();
  injectBrandRow(menu, PALETTE, doc);
  assert.equal(assertInjected(menu, PALETTE, doc), true);
  assert.equal(doc.getElementById("brand-palette-health-banner"), null);
});

test("assertInjected: palette+swatches present but no row -> false + Shadow-DOM banner", () => {
  loadContract(contract);
  const { doc, menu } = makePicker(); // swatches present, but we DON'T inject
  assert.equal(assertInjected(menu, PALETTE, doc), false);
  const host = doc.getElementById("brand-palette-health-banner");
  assert.ok(host, "banner host created");
  assert.ok(host.shadowRoot, "banner is in a shadow root");
  assert.ok(host.shadowRoot.querySelector(".report"), "has a Report this control");
});

test("showBanner: idempotent — one host even when called twice", () => {
  const { doc } = makePicker();
  showBanner("first", doc);
  showBanner("second", doc);
  assert.equal(doc.querySelectorAll("#brand-palette-health-banner").length, 1);
});
