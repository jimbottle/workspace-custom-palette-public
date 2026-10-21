/**
 * palette-editor — a reusable editable palette list, mounted by BOTH the options
 * page and the popup so there is one editor, not two. Renders rows (native color
 * picker, name, hex, reorder, remove), validates hex live via hex.js, and calls
 * `onChange(working, { settled })` whenever the palette changes. The host owns
 * persistence (the options page Saves explicitly; the popup auto-saves). Pure
 * transforms live in lib/palette.js — this is DOM glue only.
 *
 * SETTLED vs INTERIM, and why every change carries it. A text field emits on
 * every keystroke, and half of a hex someone is typing is frequently a VALID
 * hex: on the way to #FE5917 the field reads #FE5916 for as long as it takes to
 * fix the last digit. A host that persists per keystroke therefore stores, and
 * records in undo history, colors the user never chose — which is what the
 * field report behind bd workspace-custom-palette-iyv looks like from the
 * inside. So: `input` on any field is INTERIM (settled:false) — safe to preview,
 * never to persist — and `change` (blur or Enter for text, picker-dismissed for
 * the native color chip) is SETTLED (settled:true), as are the structural edits
 * (add, remove, reorder, eyedropper) which have no half-typed state at all.
 * Hosts that auto-save must persist only settled changes; the interim value
 * still lives in the DOM inputs, so a host's own flush-on-teardown path picks up
 * whatever was typed last without it ever being written mid-word.
 *
 * @typedef {{ name: string, hex: string, order: number }} Swatch
 * @typedef {{
 *   getWorking: () => Swatch[],
 *   setPalette: (p: Swatch[]) => void,
 *   addRow: () => boolean,
 *   count: () => number,
 *   destroy: () => void,
 * }} PaletteEditor
 */

import { isValidHex, normalizeHex } from "../lib/hex.js";
import { reorder, MAX_SWATCHES } from "../lib/palette.js";
import { trashIcon, eyedropperIcon, copyIcon, checkIcon } from "./icons.js";

/** How long the copy button shows its tick before reverting, in ms. */
const COPIED_MS = 1200;

/**
 * What the copy button puts on the clipboard: the bare six uppercase digits,
 * no `#` (owner's call, 2026-10-08), or null when the field is not a valid hex.
 * @param {string} hex
 * @returns {string | null}
 */
export function copyText(hex) {
  const n = normalizeHex(hex);
  return n ? n.slice(1) : null;
}

/**
 * A native <input type=color> needs a #rrggbb value; fall back when hex is invalid.
 * @param {string} hex
 * @returns {string}
 */
function colorValue(hex) {
  return isValidHex(hex) ? (normalizeHex(hex) || "#000000").toLowerCase() : "#000000";
}

/**
 * `readOnly` renders the same rows as a non-editable display: every input is
 * disabled and the reorder/remove/eyedropper controls are omitted entirely.
 * The copy-hex button stays, since it changes nothing.
 * It exists for the enterprise lock (`paletteLocked`), where the org palette is
 * enforced and a user's edits could not take effect — showing an editable field
 * whose value will be silently overridden is worse than showing none.
 *
 * It is a display guarantee, not a security boundary: enforcement lives in
 * resolveEffectivePalette and in the hosts refusing to write. Anyone can
 * re-enable an input in devtools, and it still would not change the palette.
 *
 * @param {HTMLElement} container
 * @param {{ initial?: Swatch[], onChange?: (working: Swatch[], meta: { settled: boolean }) => void, maxSwatches?: number, doc?: Document, readOnly?: boolean }} [opts]
 * @returns {PaletteEditor}
 */
export function mountPaletteEditor(container, opts = {}) {
  const { initial = [], onChange = () => {}, maxSwatches = MAX_SWATCHES, doc = document, readOnly = false } = opts;
  // Native screen eyedropper (Chrome 95+). Resolved from the editor's own
  // document so jsdom tests can stub it; when absent the pick button simply
  // isn't rendered — the color chip + hex field remain the full editing path.
  const EyeDropperCtor = /** @type {any} */ (doc.defaultView)?.EyeDropper;
  /** @type {Swatch[]} the working copy being edited (host decides when to persist) */
  let working = initial.map((s, i) => ({ name: s.name, hex: s.hex, order: i }));

  /** Read current input values back into `working` (defensive before structural ops). */
  function syncFromInputs() {
    const rows = container.querySelectorAll("[data-bpi-row]");
    rows.forEach((row, i) => {
      if (!working[i]) return;
      const name = /** @type {HTMLInputElement | null} */ (row.querySelector("[data-bpi-name]"));
      const hex = /** @type {HTMLInputElement | null} */ (row.querySelector("[data-bpi-hex]"));
      if (name) working[i].name = name.value;
      if (hex) working[i].hex = hex.value;
    });
  }

  function getWorking() {
    syncFromInputs();
    return working.map((s, i) => ({ name: s.name, hex: s.hex, order: i }));
  }
  /**
   * @param {boolean} settled true when the value is one the user has committed
   * (blur, Enter, a dismissed color picker, or a structural edit) rather than a
   * keystroke on the way to one. See the SETTLED vs INTERIM note at the top.
   */
  function emit(settled) { onChange(getWorking(), { settled }); }

  function iconBtn(/** @type {string} */ glyph, /** @type {string} */ label, /** @type {() => void} */ onClick) {
    const b = doc.createElement("button");
    b.type = "button";
    b.className = "bpi-icon";
    b.textContent = glyph;
    b.setAttribute("aria-label", label);
    b.addEventListener("click", onClick);
    return b;
  }

  function move(/** @type {number} */ from, /** @type {number} */ to) {
    syncFromInputs();
    working = reorder(working, from, to);
    render();
    emit(true);
  }

  /** @param {Swatch} sw @param {number} i */
  function renderRow(sw, i) {
    const row = doc.createElement("div");
    row.className = "bpi-row";
    row.setAttribute("data-bpi-row", "1");

    const color = doc.createElement("input");
    color.type = "color";
    color.className = "bpi-color";
    color.value = colorValue(sw.hex);
    color.setAttribute("aria-label", `Pick color for swatch ${i + 1}`);

    const name = doc.createElement("input");
    name.type = "text";
    name.className = "bpi-name";
    name.setAttribute("data-bpi-name", "1");
    name.value = sw.name;
    name.placeholder = "Name";
    name.setAttribute("aria-label", `Name for swatch ${i + 1}`);
    name.addEventListener("input", () => { sw.name = name.value; emit(false); });
    name.addEventListener("change", () => { sw.name = name.value; emit(true); });

    const hex = doc.createElement("input");
    hex.type = "text";
    hex.className = "bpi-hex";
    hex.setAttribute("data-bpi-hex", "1");
    hex.value = sw.hex;
    hex.placeholder = "#1A73E8";
    hex.setAttribute("aria-label", `Hex for swatch ${i + 1}`);

    // Copy button, sat inside the right end of the hex field. Kept on read-only
    // rows on purpose: copying is the one useful thing to do with a locked org
    // color. Disabled while the field holds an invalid hex, so it never copies
    // half-typed text.
    const copy = doc.createElement("button");
    copy.type = "button";
    copy.className = "bpi-copy";
    copy.title = "Copy hex";
    copy.setAttribute("aria-label", `Copy hex for swatch ${i + 1}`);
    copy.appendChild(copyIcon(12, doc));
    copy.disabled = !isValidHex(sw.hex);
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let copiedTimer;
    copy.addEventListener("click", async () => {
      const text = copyText(hex.value);
      if (!text) return;
      try {
        await doc.defaultView?.navigator.clipboard.writeText(text);
      } catch {
        return; // Clipboard refused (page not focused) - no false "Copied".
      }
      copy.replaceChildren(checkIcon(12, doc));
      copy.title = "Copied";
      copy.classList.add("copied");
      clearTimeout(copiedTimer);
      copiedTimer = setTimeout(() => {
        copy.replaceChildren(copyIcon(12, doc));
        copy.title = "Copy hex";
        copy.classList.remove("copied");
      }, COPIED_MS);
    });
    const hexWrap = doc.createElement("span");
    hexWrap.className = "bpi-hex-wrap";
    hexWrap.append(hex, copy);

    /** @param {boolean} settled */
    const readHex = (settled) => {
      sw.hex = hex.value;
      const ok = isValidHex(hex.value);
      hex.classList.toggle("invalid", !ok);
      copy.disabled = !ok;
      if (ok) color.value = colorValue(hex.value); // keep the picker chip in sync
      emit(settled);
    };
    hex.addEventListener("input", () => readHex(false));
    // Blur or Enter. This is the event an auto-saving host writes on, so the
    // stored value is the one the user stopped on, not one they typed through.
    hex.addEventListener("change", () => readHex(true));

    // The native picker always yields a valid #rrggbb; mirror it into the hex field.
    // `input` streams while the OS panel is dragged, so it is interim for the
    // same reason typing is: the colors swept over on the way are not choices.
    /** @param {boolean} settled */
    const readChip = (settled) => {
      sw.hex = color.value;
      hex.value = color.value;
      hex.classList.remove("invalid");
      copy.disabled = false;
      emit(settled);
    };
    color.addEventListener("input", () => readChip(false));
    color.addEventListener("change", () => readChip(true));

    if (readOnly) {
      color.disabled = true;
      name.disabled = true;
      hex.disabled = true;
      name.readOnly = true;
      hex.readOnly = true;
    }

    // Screen eyedropper, to the right of the hex entry. Writes through the same
    // update path as typing a hex, so live-sync/autosave/undo in the hosts all
    // behave identically. A cancelled pick (Esc -> AbortError) changes nothing.
    /** @type {HTMLButtonElement | null} */
    let pick = null;
    if (EyeDropperCtor && !readOnly) {
      pick = doc.createElement("button");
      pick.type = "button";
      pick.className = "bpi-pick";
      pick.title = "Pick from screen";
      pick.setAttribute("aria-label", `Pick color for swatch ${i + 1} from the screen`);
      pick.appendChild(eyedropperIcon(16, doc));
      pick.addEventListener("click", async () => {
        try {
          const result = await new EyeDropperCtor().open();
          const picked = normalizeHex(result?.sRGBHex);
          if (!picked) return;
          sw.hex = picked;
          hex.value = picked;
          hex.classList.remove("invalid");
          copy.disabled = false;
          color.value = colorValue(picked);
          emit(true);
        } catch {
          // AbortError (user pressed Esc) or a platform refusal — no change.
        }
      });
    }

    const up = iconBtn("▲", `Move swatch ${i + 1} up`, () => move(i, i - 1));
    up.disabled = i === 0;
    const down = iconBtn("▼", `Move swatch ${i + 1} down`, () => move(i, i + 1));
    down.disabled = i === working.length - 1;
    const reorderEl = doc.createElement("span");
    reorderEl.className = "bpi-reorder";
    reorderEl.append(up, down);

    const remove = doc.createElement("button");
    remove.type = "button";
    remove.className = "bpi-remove";
    remove.title = "Remove";
    remove.setAttribute("aria-label", `Remove swatch ${i + 1}`);
    remove.appendChild(trashIcon(16, doc));
    remove.addEventListener("click", () => { syncFromInputs(); working.splice(i, 1); render(); emit(true); });

    row.append(color, name, hexWrap);
    if (pick) row.append(pick);
    // Omitted rather than disabled when read-only: a row of greyed-out trash
    // and arrow buttons reads as "broken", where their absence reads as
    // "not yours to change", which is what is actually true.
    if (!readOnly) row.append(reorderEl, remove);
    return row;
  }

  function render() {
    container.replaceChildren();
    working.forEach((sw, i) => container.appendChild(renderRow(sw, i)));
  }

  /** Replace the working palette (host-driven, e.g. Reset/Undo/Import); does NOT emit. */
  function setPalette(/** @type {Swatch[]} */ p) {
    working = p.map((s, i) => ({ name: s.name, hex: s.hex, order: i }));
    render();
  }

  function addRow() {
    // Belt and braces: the hosts hide their Add button when locked, but the
    // method is public and a stray caller must not be able to grow a palette
    // the user does not own.
    if (readOnly) return false;
    syncFromInputs();
    if (working.length >= maxSwatches) return false;
    working.push({ name: "New color", hex: "#1A73E8", order: working.length });
    render();
    emit(true);
    return true;
  }

  function count() { syncFromInputs(); return working.length; }
  function destroy() { container.replaceChildren(); }

  render();
  return { getWorking, setPalette, addRow, count, destroy };
}
