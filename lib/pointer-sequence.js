/**
 * The pointer/mouse event sequence Google's toolbar menus and Material buttons
 * require to register a "click". Phase 0 proved that a plain `element.click()`
 * does NOT open these menus or commit these buttons — the full sequence below
 * is required. See docs/SPEC.md §3.
 *
 * This module is split so the *ordering* (the load-bearing detail) is pure and
 * unit-testable; the actual dispatch is a thin DOM wrapper.
 */

/** The ordered event types that constitute a Google-compatible synthetic click. */
export const CLICK_SEQUENCE = /** @type {const} */ ([
  "pointerover",
  "pointerenter",
  "pointermove",
  "pointerdown",
  "mousedown",
  "pointerup",
  "mouseup",
  "click",
]);

/**
 * Whether an event type should be constructed as a PointerEvent (vs MouseEvent).
 * @param {string} type
 * @returns {boolean}
 */
export function isPointerEvent(type) {
  return type.startsWith("pointer");
}

/**
 * Dispatch the full Google-compatible click sequence at the center of `el`.
 * Returns false if the element is missing or not laid out.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function syntheticClick(el) {
  if (!el || typeof el.getBoundingClientRect !== "function") return false;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const init = {
    bubbles: true,
    cancelable: true,
    view: window,
    clientX: r.x + r.width / 2,
    clientY: r.y + r.height / 2,
    button: 0,
  };
  for (const type of CLICK_SEQUENCE) {
    const Ctor = isPointerEvent(type) ? PointerEvent : MouseEvent;
    el.dispatchEvent(new Ctor(type, init));
  }
  return true;
}

/**
 * Set an input's value the way Closure/React-controlled inputs require: via the
 * native value setter, then fire `input`/`change`. NOTE: for Google's
 * custom-color hex field the `input` event updates the field TEXT but does NOT
 * recompute RGB — the commit is driven separately by pressEnter() (keydown/keyup
 * Enter). See docs/SPEC.md §3.
 * @param {HTMLInputElement | null | undefined} input
 * @param {string} value
 * @returns {boolean}
 */
export function setNativeInputValue(input, value) {
  if (!input) return false;
  const proto = /** @type {any} */ (input).constructor?.prototype ?? HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set
    ?? Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  input.focus();
  if (setter) setter.call(input, value);
  else input.value = value;
  input.dispatchEvent(new Event("input", { bubbles: true }));
  input.dispatchEvent(new Event("change", { bubbles: true }));
  return true;
}

/**
 * Press Enter on `el` to commit its value. Verified live: Google's custom-color
 * hex field only recomputes RGB on Enter (keydown/keyup) — the `input` event
 * alone does NOT commit. Dispatch keydown + keyup ONLY: a `keypress` Enter
 * closes the dialog WITHOUT applying (acts like cancel). See docs/SPEC.md §3.
 * @param {Element | null | undefined} el
 * @returns {boolean}
 */
export function pressEnter(el) {
  if (!el) return false;
  const init = { key: "Enter", code: "Enter", keyCode: 13, which: 13, bubbles: true };
  el.dispatchEvent(new KeyboardEvent("keydown", init));
  el.dispatchEvent(new KeyboardEvent("keyup", init));
  return true;
}
