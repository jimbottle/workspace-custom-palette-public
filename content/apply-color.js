/**
 * apply-color — applies a brand hex to the current selection via Google's own
 * UI, using only synthetic events (an extension can't produce trusted events).
 *
 * Why it's not just "open dialog → set hex → OK": Sheets gates the custom-color
 * dialog's OK→apply on event.isTrusted, so a synthetic OK only REGISTERS the
 * color in the picker's CUSTOM row without applying it. But clicking a swatch
 * (built-in OR custom-row) is NOT isTrusted-gated and applies fine. So the
 * robust, cross-app flow is:
 *
 *   1. Fast path: if `hex` is already a custom swatch in the open picker, click
 *      it (applies). Covers repeat use, and Sheets after first registration.
 *   2. Otherwise drive the dialog (custom button → hex + Enter → OK) to REGISTER
 *      the color. This also applies it directly in Docs/Slides. It closes the
 *      picker.
 *   3. Reopen the picker (via the toolbar button captured at injection time) and
 *      click the now-registered custom swatch. This is a CONFIRMATION pass: as
 *      of 2026-09-01 the dialog's OK applies on every picker we can test, so
 *      step 3 is a harmless re-apply, and being unable to run it is NOT
 *      evidence the colour failed to land. It throws only on positive evidence
 *      — the picker reopened and our colour is not in it.
 *
 * Not every picker uses the same custom-color WIDGET. dom-contract resolves the
 * open one into a `variant` handle up front, and a variant may declare that its
 * OK is not isTrusted-gated (`appliesOnOk`), in which case step 3 is skipped —
 * that is the Sheets data-validation dropdown-chip picker, whose OK applies
 * directly and which has no reopen path at all (bd workspace-custom-palette-gb3,
 * verified live 2026-09-01).
 *
 * All verified live (docs/SPEC.md; bug workspace-custom-palette-egn). All element
 * lookups go through dom-contract.
 */

import { normalizeHex, hexToRgb } from "../lib/hex.js";
import {
  findCustomColorEntry, findCustomDialog, findCustomDialogFor, findOkButtonFor, findVariantTab,
  variantAppliesOnOk, findHexInput, readDialogRgb, findSwatchByHex,
} from "./dom-contract.js";
import { syntheticClick, setNativeInputValue, pressEnter } from "../lib/pointer-sequence.js";

/**
 * Poll `pred` each frame until true, up to `timeoutMs`. Resolves true/false
 * (never rejects) so the caller can make a best-effort decision.
 * @param {() => boolean} pred @param {number} [timeoutMs] @returns {Promise<boolean>}
 */
function waitUntil(pred, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const start = performance.now();
    const tick = () => {
      if (pred()) return resolve(true);
      if (performance.now() - start > timeoutMs) return resolve(false);
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * @param {() => HTMLElement | null} getter @param {number} [timeoutMs]
 * @param {string} [what] label for the timeout error, so a failure names its step
 * @returns {Promise<HTMLElement>}
 */
function waitFor(getter, timeoutMs = 1500, what = "element") {
  return new Promise((resolve, reject) => {
    const start = performance.now();
    const tick = () => {
      const el = getter();
      if (el) return resolve(el);
      if (performance.now() - start > timeoutMs) return reject(new Error(`apply-color: timed out waiting for ${what}`));
      requestAnimationFrame(tick);
    };
    tick();
  });
}

/**
 * Register `hex` as a custom color via the dialog (custom button → hex + Enter →
 * OK). Throws if a required element is missing.
 *
 * Which WIDGET this drives is resolved once, up front: `findCustomColorEntry`
 * returns the variant whose entry-point button is visible, and every later step
 * is scoped to that same variant. Most pickers share one widget; the Sheets
 * dropdown-chip picker has its own (see dom-contract customColorVariants).
 * @param {string} hex @param {Document} doc
 * @returns {Promise<import("./dom-contract.js").CustomColorVariant>} the variant driven
 */
async function registerViaDialog(hex, doc) {
  // Query at the document level (visible): the observed picker popup can be a
  // sub-container that excludes the button (e.g. Sheets).
  const variant = findCustomColorEntry(doc);
  if (!variant) throw new Error("apply-color: custom-color button not found");
  syntheticClick(variant.button);

  const dialog = await waitFor(() => findCustomDialogFor(variant, doc), 1500, "custom-color dialog to open");

  // Tabbed dialogs (the dropdown chip's Text/Background) remember the last tab
  // used, so select the one the contract names before touching the hex —
  // otherwise a brand click lands on whichever tab was left open. A miss is
  // deliberately NOT fatal: the tab is identified by position (the only
  // locale-independent handle Google leaves), so if Google reorders the tabs we
  // write to the visible field rather than refusing to apply.
  const tab = findVariantTab(variant, dialog);
  if (tab && !tab.selected) {
    syntheticClick(tab.el);
    await waitUntil(() => findVariantTab(variant, dialog)?.selected === true, 800);
  }

  const input = findHexInput(dialog);
  if (!input) throw new Error("apply-color: hex input not found");
  setNativeInputValue(input, hex);
  pressEnter(input); // commits RGB; the 'input' event alone does not (SPEC §3)

  // Poll until the dialog reflects the committed color (robust to page speed);
  // cap so a missing/localized R/G/B field can't stall apply.
  const want = hexToRgb(hex);
  await waitUntil(() => {
    const got = readDialogRgb(dialog);
    return !!got && got.r === want.r && got.g === want.g && got.b === want.b;
  }, 600);

  const ok = findOkButtonFor(variant, dialog);
  if (!ok) throw new Error("apply-color: OK button not found");
  syntheticClick(ok);
  return variant;
}

/**
 * Apply `hex` to the current selection. All element lookups are document-level
 * (visible), so the caller needn't pass the picker popup. `reopen` (optional)
 * reopens the same picker after the dialog closes it — needed to click the
 * registered custom swatch (Sheets). Resolves when applied.
 * @param {string} hex
 * @param {Document} [doc]
 * @param {(() => boolean | void) | null} [reopen]  returns false if the click was refused
 * @returns {Promise<void>}
 */
export async function applyColor(hex, doc = document, reopen = null) {
  const normalized = normalizeHex(hex);
  if (!normalized) throw new Error(`apply-color: invalid hex ${hex}`);

  // 1. Fast path: already a custom swatch in the open picker — just click it.
  //    Search at the document level (visible) since the observed picker popup
  //    can be a sub-container that doesn't hold every swatch.
  const existing = findSwatchByHex(doc, normalized);
  if (existing) {
    syntheticClick(existing);
    return;
  }

  // 2. Register the color (also applies directly in Docs/Slides).
  const variant = await registerViaDialog(normalized, doc);

  // 2b. Some widgets are not isTrusted-gated at all and have already applied on
  // OK — the Sheets dropdown-chip picker is one (verified live 2026-09-01). For
  // those the reopen+click below is not just redundant but impossible: their
  // CUSTOM COLORS swatches carry no aria-label, so findSwatchByHex can never
  // match one, and there is no toolbar button to reopen the picker with.
  if (variantAppliesOnOk(variant)) return;

  // 3. Reopen and click the now-registered custom swatch — a CONFIRMATION pass,
  //    not the apply.
  //
  //    This step used to rest on "in Sheets the dialog OK only REGISTERS, it
  //    does not apply", and threw whenever it could not run. That premise no
  //    longer holds on any Sheets picker we can test (verified live
  //    2026-09-01): two of them proved it by applying the colour on runs where
  //    this step could not even start — the conditional-formatting panel picker
  //    (bd `workspace-custom-palette-577`) and the border picker
  //    (`workspace-custom-palette-9qg`), plus the toolbar fill picker when a
  //    collapsed toolbar left no clickable reopener. In every case the user got
  //    the right colour and a banner saying it had failed.
  //
  //    So the rule here is now the monitor's rule: FAIL ON EVIDENCE, NEVER ON
  //    ABSENCE. Being unable to confirm is not the same as knowing it failed,
  //    and crying wolf devalues the one signal a real user ever sees. This does
  //    not weaken the genuine-breakage signal: every way Google can actually
  //    break the contract — the custom-colour button, the dialog, the hex
  //    input, the OK button — already throws inside registerViaDialog, above.
  if (!reopen) return; // nothing to confirm with
  await waitUntil(() => !findCustomDialog(doc)); // let the dialog finish closing

  // syntheticClick returns false when it REFUSES a zero-sized element, which is
  // what happens to a picker button nested inside another menu: the dialog's OK
  // closed the enclosing menu too, so the captured opener is still a valid node
  // but is no longer laid out (the Sheets border pencil, `9qg`). Discarding
  // this return value is what turned that into a silent no-op followed by a
  // baffling four-second timeout.
  if (reopen() === false) return; // the opener is no longer clickable — cannot confirm

  // Did the picker actually come back? If it did not, we have no evidence
  // either way and must not claim failure.
  const reopened = await waitUntil(() => !!findCustomColorEntry(doc), 2000);
  if (!reopened) return;

  // The picker IS open and we can see its swatches. NOW an absent swatch is
  // real evidence: the colour we just committed is not in the palette, so the
  // registration did not take. That is worth a banner.
  const swatch = await waitFor(
    () => findSwatchByHex(doc, normalized), 4000,
    "the registered custom swatch to appear in the reopened picker",
  ).catch(() => null);
  if (!swatch) throw new Error(`apply-color: ${normalized} is missing from the reopened picker after registering it`);
  syntheticClick(swatch);
}
