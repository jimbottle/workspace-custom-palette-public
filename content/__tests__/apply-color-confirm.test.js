/**
 * applyColor's step-3 confirmation pass — bd `workspace-custom-palette-9qg`
 * and `workspace-custom-palette-577`.
 *
 * WHAT WENT WRONG. Step 3 (reopen the picker, click the now-registered custom
 * swatch) used to rest on "in Sheets the dialog OK only REGISTERS, it does not
 * apply", and threw whenever it could not run. Verified live 2026-09-01, that
 * premise no longer holds on any Sheets picker we can test: three of them
 * applied the colour on runs where step 3 could not even start —
 *
 *   - the conditional-formatting panel picker, whose opener is not in the
 *     contract, so `reopen` is null (577);
 *   - the border picker, whose pencil lives inside the Borders palette that the
 *     dialog's OK closes, so the captured opener is no longer laid out and
 *     syntheticClick refuses it (9qg);
 *   - the toolbar fill picker whenever a side panel collapses the toolbar.
 *
 * In every case the user got the right colour AND a banner saying it failed.
 *
 * THE RULE NOW: fail on EVIDENCE, never on absence — the same rule the monitor
 * uses for locale. "Could not confirm" and "confirmed broken" are different
 * answers and must not produce the same banner.
 *
 * These tests are the contract for that distinction. The DOM is a minimal
 * stand-in for a picker rather than a captured fixture: what is under test is
 * the decision tree, not selector resolution (that is covered by the fixture
 * suites), and each case has to control precisely what comes back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";
import { applyColor } from "../apply-color.js";
import { loadContract } from "../dom-contract.js";

const contract = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../config/selectors.default.json", import.meta.url)), "utf8"),
);

const HEX = "#FE5917";

/**
 * A picker with a custom-colour button and a dialog, plus a switch for whether
 * the registered swatch shows up after the reopen.
 * @param {{ swatchAfterReopen?: boolean }} [opts]
 */
function mount({ swatchAfterReopen = true } = {}) {
  const dom = new JSDOM(`<!doctype html><html><body>
    <div class="goog-menu docs-colormenuitems" id="picker">
      <table><tbody><tr>
        <td class="docs-material-colorpalette-cell" role="gridcell" aria-label="black">
          <div class="docs-material-colorpalette-colorswatch"></div></td>
      </tr></tbody></table>
      <div class="docs-customcolorpalette-add-custom-color-button" role="button"></div>
    </div>
    <div class="docs-material-gm-dialog color-dialog" id="dialog" data-test-hidden>
      <input class="docs-material-hex-input">
      <input class="docs-material-rgba-red-input" value="254">
      <input class="docs-material-rgba-green-input" value="89">
      <input class="docs-material-rgba-blue-input" value="23">
      <div role="button" class="docs-material-gm-dialog-call-to-action-button" id="ok"></div>
    </div>
  </body></html>`, { url: "https://docs.google.com/spreadsheets/d/x/edit", pretendToBeVisual: true });
  const { window: win } = dom;
  const doc = win.document;
  win.Element.prototype.getClientRects = /** @type {any} */ (function () {
    return this.closest("[data-test-hidden]") ? [] : [{ width: 10, height: 10 }];
  });
  win.Element.prototype.getBoundingClientRect = /** @type {any} */ (function () {
    return this.closest("[data-test-hidden]")
      ? { x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0 }
      : { x: 0, y: 0, width: 10, height: 10, top: 0, left: 0, right: 10, bottom: 10 };
  });
  if (!win.PointerEvent) /** @type {any} */ (win).PointerEvent = win.MouseEvent;

  const dialog = /** @type {HTMLElement} */ (doc.getElementById("dialog"));
  const picker = /** @type {HTMLElement} */ (doc.getElementById("picker"));
  // Clicking the custom-colour button opens the dialog; clicking OK closes it
  // and (as live Google now does) registers the colour.
  doc.querySelector(".docs-customcolorpalette-add-custom-color-button")
    ?.addEventListener("click", () => dialog.removeAttribute("data-test-hidden"));
  doc.getElementById("ok")?.addEventListener("click", () => {
    dialog.setAttribute("data-test-hidden", "");
    // Live behaviour: committing the custom colour closes the picker as well,
    // which is why a reopener is needed at all. Only a reopen() that actually
    // lands brings it back.
    picker.setAttribute("data-test-hidden", "");
    if (!swatchAfterReopen) return;
    const td = doc.createElement("td");
    td.className = "docs-material-colorpalette-cell";
    td.setAttribute("role", "gridcell");
    td.setAttribute("aria-label", `Custom Color ${HEX.toLowerCase()}, close to dark orange 15`);
    td.appendChild(doc.createElement("div"));
    doc.querySelector("#picker tr")?.appendChild(td);
  });

  /** @type {Record<string, any>} */
  const saved = {};
  const globals = { window: win, document: doc, location: win.location, PointerEvent: win.PointerEvent,
    MouseEvent: win.MouseEvent, KeyboardEvent: win.KeyboardEvent, Event: win.Event,
    HTMLInputElement: win.HTMLInputElement, requestAnimationFrame: win.requestAnimationFrame.bind(win) };
  for (const [k, v] of Object.entries(globals)) {
    saved[k] = Object.getOwnPropertyDescriptor(globalThis, k);
    Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
  }
  return {
    doc,
    /** A reopen that lands: re-shows the picker, as clicking a live opener would. */
    workingReopen: () => { picker.removeAttribute("data-test-hidden"); return true; },
    restore() {
      for (const [k, d] of Object.entries(saved)) {
        if (d) Object.defineProperty(globalThis, k, d);
        else delete (/** @type {any} */ (globalThis))[k];
      }
      win.close();
    },
  };
}

test("no reopener: resolves instead of throwing (the 577 conditional-formatting case)", async () => {
  // The CF panel's colour button is not in the contract, so injector.js passes
  // reopen = null. The colour has already been applied by the dialog's OK; the
  // old code threw here purely because the app was Sheets.
  loadContract(contract);
  const { doc, restore } = mount();
  try {
    await assert.doesNotReject(() => applyColor(HEX, doc, null));
  } finally { restore(); }
});

test("a REFUSED reopen click resolves instead of throwing (the 9qg border case)", async () => {
  // The border pencil lives inside the Borders palette, which the dialog's OK
  // closes, so the captured opener is no longer laid out and syntheticClick
  // returns false. Discarding that false is what produced a silent no-op and
  // then a four-second timeout the user saw as "couldn't be applied".
  loadContract(contract);
  const { doc, restore } = mount();
  try {
    let calls = 0;
    const refusedReopen = () => { calls++; return false; };
    const t0 = Date.now();
    await assert.doesNotReject(() => applyColor(HEX, doc, refusedReopen));
    assert.equal(calls, 1, "the reopener must still be attempted once");
    // A refused click is a definitive "cannot confirm", so it must short-circuit
    // rather than fall through to the 2s poll for the picker coming back. Timing
    // is the only observable difference, and the margin is 2000ms, so this is
    // not a flaky assertion — it is what pins the `reopen() === false` branch.
    assert.ok(Date.now() - t0 < 1000, `a refused reopen must return promptly (took ${Date.now() - t0}ms)`);
  } finally { restore(); }
});

test("reopen lands and the swatch is there: it is clicked (the confirmation)", async () => {
  loadContract(contract);
  const { doc, restore, workingReopen } = mount();
  try {
    /** @type {string[]} */
    const clicked = [];
    doc.addEventListener("click", (e) => {
      const el = /** @type {Element} */ (e.target);
      const label = el.closest?.("[aria-label]")?.getAttribute("aria-label");
      if (label) clicked.push(label);
    }, true);
    await applyColor(HEX, doc, workingReopen);
    assert.ok(
      clicked.some((l) => l.toLowerCase().includes(HEX.toLowerCase())),
      `the registered swatch was never clicked (saw ${JSON.stringify(clicked)})`,
    );
  } finally { restore(); }
});

test("the click lands but the picker does not come back: still no banner", async () => {
  // The third shape of "cannot confirm", and the one the reopen guard exists
  // for: syntheticClick reports success (the node was laid out, events were
  // dispatched) but nothing reopened — a stale or detached opener, or one whose
  // handler Google has moved. Without the guard this falls through to the
  // swatch wait, finds nothing because the picker is closed, and banners a
  // colour that was in fact applied.
  loadContract(contract);
  const { doc, restore } = mount();
  try {
    let calls = 0;
    const clicksButDoesNothing = () => { calls++; return true; };
    await assert.doesNotReject(() => applyColor(HEX, doc, clicksButDoesNothing));
    assert.equal(calls, 1);
  } finally { restore(); }
});

test("reopen lands but the colour is ABSENT: that is evidence, so it throws", async () => {
  // The one case that still deserves a banner. We could see the picker and our
  // colour is not in it, so the registration genuinely did not take. Losing
  // this would turn the fix into a blanket "never report anything".
  loadContract(contract);
  const { doc, restore, workingReopen } = mount({ swatchAfterReopen: false });
  try {
    await assert.rejects(() => applyColor(HEX, doc, workingReopen), /missing from the reopened picker/);
  } finally { restore(); }
});

test("a broken contract still throws from the register step", async () => {
  // The genuine-breakage signal must survive: every way Google can actually
  // break the picker is caught in registerViaDialog, before step 3 runs.
  loadContract(contract);
  const { doc, restore, workingReopen } = mount();
  try {
    doc.querySelector(".docs-customcolorpalette-add-custom-color-button")?.remove();
    await assert.rejects(() => applyColor(HEX, doc, workingReopen), /custom-color button not found/);
  } finally { restore(); }
});
