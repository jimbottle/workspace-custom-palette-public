import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { mountPaletteEditor, copyText } from "../palette-editor.js";

/** @param {{name:string,hex:string,order:number}[]} initial */
function setup(initial) {
  const dom = new JSDOM("<!doctype html><div id='c'></div>");
  const doc = dom.window.document;
  const container = /** @type {HTMLElement} */ (doc.getElementById("c"));
  /** @type {any[]} */
  const changes = [];
  /** @type {{ settled: boolean }[]} the meta that came with each change, same order */
  const metas = [];
  const editor = mountPaletteEditor(container, {
    initial,
    onChange: (w, m) => { changes.push(w); metas.push(m); },
    doc,
  });
  const fire = (/** @type {Element} */ el, /** @type {string} */ type) =>
    el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  return { doc, container, editor, changes, metas, fire };
}

const P = [
  { name: "Primary", hex: "#1A73E8", order: 0 },
  { name: "Accent", hex: "#34A853", order: 1 },
];

test("palette-editor: renders a row per swatch with color/name/hex inputs", () => {
  const { container } = setup(P);
  const rows = container.querySelectorAll("[data-bpi-row]");
  assert.equal(rows.length, 2);
  assert.equal(/** @type {HTMLInputElement} */ (rows[0]?.querySelector("[data-bpi-name]"))?.value, "Primary");
  assert.equal(/** @type {HTMLInputElement} */ (rows[0]?.querySelector("[data-bpi-hex]"))?.value, "#1A73E8");
  assert.ok(rows[0]?.querySelector("input.bpi-color"));
});

test("palette-editor: the remove button is an icon button carrying an svg + aria-label", () => {
  const { container } = setup(P);
  const remove = /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-remove"));
  assert.ok(remove, "remove button exists");
  assert.ok(remove.querySelector("svg"), "remove renders an SVG glyph, not text");
  assert.equal(remove.textContent, "", "no text label on the icon button");
  assert.match(remove.getAttribute("aria-label") ?? "", /Remove swatch/);
});

test("palette-editor: editing the hex flags invalid, emits onChange, clears on a valid value", () => {
  const { container, changes, fire } = setup(P);
  const hex = /** @type {HTMLInputElement} */ (container.querySelector("[data-bpi-hex]"));
  hex.value = "nothex";
  fire(hex, "input");
  assert.ok(hex.classList.contains("invalid"));
  assert.equal(changes.at(-1)[0].hex, "nothex");
  hex.value = "#000000";
  fire(hex, "input");
  assert.ok(!hex.classList.contains("invalid"));
});

test("palette-editor: the native color input mirrors its value into the hex field", () => {
  const { container, fire } = setup(P);
  const color = /** @type {HTMLInputElement} */ (container.querySelector(".bpi-color"));
  const hex = /** @type {HTMLInputElement} */ (container.querySelector("[data-bpi-hex]"));
  color.value = "#abcdef";
  fire(color, "input");
  assert.equal(hex.value, "#abcdef");
  assert.ok(!hex.classList.contains("invalid"));
});

test("palette-editor: addRow appends, respects the max, removeRow deletes", () => {
  const { container, editor } = setup(P);
  assert.equal(editor.addRow(), true);
  assert.equal(container.querySelectorAll("[data-bpi-row]").length, 3);
  /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-remove"))?.click();
  assert.equal(container.querySelectorAll("[data-bpi-row]").length, 2);

  const many = Array.from({ length: 24 }, (_, i) => ({ name: `c${i}`, hex: "#000000", order: i }));
  assert.equal(setup(many).editor.addRow(), false);
});

test("palette-editor: reorder via the up button swaps order in getWorking", () => {
  const { container, editor } = setup(P);
  const rows = container.querySelectorAll("[data-bpi-row]");
  // first icon in the 2nd row's reorder group is its "up" button
  /** @type {HTMLButtonElement} */ (rows[1]?.querySelector(".bpi-reorder .bpi-icon"))?.click();
  const working = editor.getWorking();
  assert.equal(working[0]?.name, "Accent");
  assert.equal(working[1]?.name, "Primary");
});

test("palette-editor: setPalette replaces rows WITHOUT emitting onChange", () => {
  const { container, editor, changes } = setup(P);
  const before = changes.length;
  editor.setPalette([{ name: "Solo", hex: "#ffffff", order: 0 }]);
  assert.equal(container.querySelectorAll("[data-bpi-row]").length, 1);
  assert.equal(changes.length, before);
});

// ---- Screen eyedropper (EyeDropper API, feature-detected) -------------------

/**
 * Mount an editor in a jsdom window that carries a stubbed EyeDropper.
 * @param {{ result?: { sRGBHex: string }, reject?: Error } } behavior
 */
function setupWithEyeDropper(behavior) {
  const dom = new JSDOM("<!doctype html><div id='c'></div>");
  let opens = 0;
  /** @type {any} */ (dom.window).EyeDropper = class {
    async open() {
      opens++;
      if (behavior.reject) throw behavior.reject;
      return behavior.result;
    }
  };
  const doc = dom.window.document;
  const container = /** @type {HTMLElement} */ (doc.getElementById("c"));
  /** @type {any[]} */
  const changes = [];
  const editor = mountPaletteEditor(container, { initial: P, onChange: (w) => changes.push(w), doc });
  return { doc, container, editor, changes, opens: () => opens };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

test("palette-editor: no eyedropper button when the API is absent", () => {
  const dom = new JSDOM("<!doctype html><div id='c'></div>");
  const doc = dom.window.document;
  const container = /** @type {HTMLElement} */ (doc.getElementById("c"));
  mountPaletteEditor(container, { initial: P, doc });
  assert.equal(container.querySelector(".bpi-pick"), null);
});

test("palette-editor: a pick writes the normalized hex, syncs the chip, and emits", async () => {
  const { container, editor, changes } = setupWithEyeDropper({ result: { sRGBHex: "#a1b2c3" } });
  const pick = /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-pick"));
  assert.ok(pick, "pick button rendered when the API exists");
  assert.ok(pick.querySelector("svg"), "icon button, not text");
  pick.click();
  await tick();
  const hex = /** @type {HTMLInputElement} */ (container.querySelector("[data-bpi-hex]"));
  const chip = /** @type {HTMLInputElement} */ (container.querySelector("input.bpi-color"));
  assert.equal(hex.value, "#A1B2C3");
  assert.equal(chip.value, "#a1b2c3");
  assert.equal(hex.classList.contains("invalid"), false);
  assert.equal(editor.getWorking()[0]?.hex, "#A1B2C3");
  assert.ok(changes.length > 0, "onChange emitted so hosts autosave");
});

test("palette-editor: a cancelled pick (AbortError) changes nothing and does not emit", async () => {
  const abort = new Error("The user canceled the selection.");
  abort.name = "AbortError";
  const { container, changes, opens } = setupWithEyeDropper({ reject: abort });
  const pick = /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-pick"));
  pick.click();
  await tick();
  assert.equal(opens(), 1, "dropper was opened");
  const hex = /** @type {HTMLInputElement} */ (container.querySelector("[data-bpi-hex]"));
  assert.equal(hex.value, "#1A73E8", "hex untouched");
  assert.equal(changes.length, 0, "no emit on cancel");
});

test("palette-editor: a garbage pick result is ignored", async () => {
  const { container, changes } = setupWithEyeDropper({ result: /** @type {any} */ ({ sRGBHex: "not-a-color" }) });
  const pick = /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-pick"));
  pick.click();
  await tick();
  const hex = /** @type {HTMLInputElement} */ (container.querySelector("[data-bpi-hex]"));
  assert.equal(hex.value, "#1A73E8");
  assert.equal(changes.length, 0);
});


// The SETTLED vs INTERIM contract. An auto-saving host writes on settled only,
// so getting this wrong stores colors nobody chose — see the module header and
// bd workspace-custom-palette-iyv.

test("palette-editor: typing a hex is INTERIM; blur/Enter settles it", () => {
  const { container, changes, metas, fire } = setup(P);
  const hex = /** @type {HTMLInputElement} */ (container.querySelector("[data-bpi-hex]"));
  // The exact field shape: #FE5916 is a valid hex that exists only on the way
  // to #FE5917. Neither keystroke may be reported as a choice.
  hex.value = "#FE5916";
  fire(hex, "input");
  assert.equal(metas.at(-1)?.settled, false);
  hex.value = "#FE5917";
  fire(hex, "input");
  assert.equal(metas.at(-1)?.settled, false);
  assert.ok(changes.every((_c, i) => metas[i]?.settled === false), "no keystroke settles");
  // change = blur or Enter
  fire(hex, "change");
  assert.equal(metas.at(-1)?.settled, true);
  assert.equal(changes.at(-1)[0].hex, "#FE5917", "the settled value is the one on screen");
});

test("palette-editor: typing a name is INTERIM until it settles", () => {
  const { container, metas, fire } = setup(P);
  const name = /** @type {HTMLInputElement} */ (container.querySelector("[data-bpi-name]"));
  name.value = "Clou";
  fire(name, "input");
  assert.equal(metas.at(-1)?.settled, false);
  name.value = "Cloud";
  fire(name, "change");
  assert.equal(metas.at(-1)?.settled, true);
});

test("palette-editor: the color chip streams INTERIM while dragged, settles on dismiss", () => {
  const { container, metas, fire } = setup(P);
  const color = /** @type {HTMLInputElement} */ (container.querySelector(".bpi-color"));
  color.value = "#abcdef";
  fire(color, "input"); // OS panel still open, value sweeping
  assert.equal(metas.at(-1)?.settled, false);
  fire(color, "change"); // panel dismissed
  assert.equal(metas.at(-1)?.settled, true);
});

test("palette-editor: structural edits are always SETTLED (no half-typed state)", () => {
  const { container, editor, metas } = setup(P);
  editor.addRow();
  assert.equal(metas.at(-1)?.settled, true, "add");
  /** @type {HTMLButtonElement} */ (container.querySelectorAll(".bpi-icon")[1])?.click(); // move down
  assert.equal(metas.at(-1)?.settled, true, "reorder");
  /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-remove"))?.click();
  assert.equal(metas.at(-1)?.settled, true, "remove");
});

// ---- Copy hex to the clipboard -----------------------------------------------

test("copyText: bare uppercase six digits, no #; null for an invalid hex", () => {
  assert.equal(copyText("#f9f4eb"), "F9F4EB");
  assert.equal(copyText("abc"), "AABBCC");
  assert.equal(copyText(" #1A73E8 "), "1A73E8");
  assert.equal(copyText("nothex"), null);
  assert.equal(copyText(""), null);
});

/**
 * Mount an editor whose window carries a stubbed clipboard.
 * @param {{ readOnly?: boolean, reject?: boolean }} [opts]
 */
function setupWithClipboard(opts = {}) {
  const dom = new JSDOM("<!doctype html><div id='c'></div>");
  /** @type {string[]} */
  const written = [];
  Object.defineProperty(dom.window.navigator, "clipboard", {
    value: {
      async writeText(/** @type {string} */ t) {
        if (opts.reject) throw new Error("NotAllowedError");
        written.push(t);
      },
    },
  });
  const doc = dom.window.document;
  const container = /** @type {HTMLElement} */ (doc.getElementById("c"));
  /** @type {any[]} */
  const changes = [];
  mountPaletteEditor(container, { initial: P, onChange: (w) => changes.push(w), doc, readOnly: opts.readOnly });
  const fire = (/** @type {Element} */ el, /** @type {string} */ type) =>
    el.dispatchEvent(new dom.window.Event(type, { bubbles: true }));
  return { container, written, changes, fire };
}

test("palette-editor: copy sits inside the hex wrapper and writes the bare hex", async () => {
  const { container, written, changes } = setupWithClipboard();
  const copy = /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-hex-wrap .bpi-copy"));
  assert.ok(copy, "copy button is inside the hex wrapper");
  assert.ok(container.querySelector(".bpi-hex-wrap [data-bpi-hex]"), "the hex field shares that wrapper");
  assert.match(copy.getAttribute("aria-label") ?? "", /Copy hex for swatch 1/);
  copy.click();
  await tick();
  assert.deepEqual(written, ["1A73E8"]);
  assert.equal(copy.title, "Copied");
  assert.ok(copy.classList.contains("copied"));
  assert.equal(changes.length, 0, "copying is not an edit");
});

test("palette-editor: copy is disabled while the hex is invalid and re-enables when fixed", async () => {
  const { container, written, fire } = setupWithClipboard();
  const hex = /** @type {HTMLInputElement} */ (container.querySelector("[data-bpi-hex]"));
  const copy = /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-copy"));
  hex.value = "#12";
  fire(hex, "input");
  assert.equal(copy.disabled, true);
  hex.value = "#abcdef";
  fire(hex, "input");
  assert.equal(copy.disabled, false);
  copy.click();
  await tick();
  assert.deepEqual(written, ["ABCDEF"], "copies what is in the field now, normalized");
});

test("palette-editor: a refused clipboard write does not claim Copied", async () => {
  const { container } = setupWithClipboard({ reject: true });
  const copy = /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-copy"));
  copy.click();
  await tick();
  assert.equal(copy.title, "Copy hex");
  assert.ok(!copy.classList.contains("copied"));
});

test("palette-editor: read-only rows keep the copy button, enabled", async () => {
  const { container, written } = setupWithClipboard({ readOnly: true });
  const copy = /** @type {HTMLButtonElement} */ (container.querySelector(".bpi-copy"));
  assert.ok(copy, "copy survives the lock");
  assert.equal(copy.disabled, false);
  assert.equal(container.querySelector(".bpi-remove"), null, "while the editing controls are gone");
  copy.click();
  await tick();
  assert.deepEqual(written, ["1A73E8"]);
});
