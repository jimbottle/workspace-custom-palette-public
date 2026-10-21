import { test } from "node:test";
import assert from "node:assert/strict";
import { pressEnter, isPointerEvent, CLICK_SEQUENCE } from "../pointer-sequence.js";

test("CLICK_SEQUENCE: pointer+mouse ordering ending in click", () => {
  assert.equal(CLICK_SEQUENCE.at(-1), "click");
  // pointerdown must precede mousedown, and pointerup must precede mouseup —
  // assert the ordering directly (no short-circuiting presence clause).
  assert.ok(CLICK_SEQUENCE.includes("pointerdown") && CLICK_SEQUENCE.includes("mousedown"));
  assert.ok(CLICK_SEQUENCE.indexOf("pointerdown") < CLICK_SEQUENCE.indexOf("mousedown"));
  assert.ok(CLICK_SEQUENCE.indexOf("pointerup") < CLICK_SEQUENCE.indexOf("mouseup"));
  assert.equal(isPointerEvent("pointermove"), true);
  assert.equal(isPointerEvent("mouseup"), false);
});

test("pressEnter dispatches keydown+keyup Enter only (no keypress, which cancels)", () => {
  const g = /** @type {any} */ (globalThis);
  const orig = g.KeyboardEvent;
  // Shim KeyboardEvent — Node has no DOM; we only need the type/key captured.
  g.KeyboardEvent = class {
    constructor(/** @type {string} */ type, /** @type {any} */ init) {
      this.type = type;
      Object.assign(this, init);
    }
  };
  try {
    /** @type {string[]} */
    const seen = [];
    const el = /** @type {any} */ ({
      dispatchEvent(/** @type {any} */ e) {
        seen.push(`${e.type}:${e.key}`);
        return true;
      },
    });
    assert.equal(pressEnter(el), true);
    assert.deepEqual(seen, ["keydown:Enter", "keyup:Enter"]);
    assert.ok(!seen.some((s) => s.startsWith("keypress")), "must not send keypress Enter");
    assert.equal(pressEnter(null), false);
    assert.equal(pressEnter(undefined), false);
  } finally {
    g.KeyboardEvent = orig;
  }
});
