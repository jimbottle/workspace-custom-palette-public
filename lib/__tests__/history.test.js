import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyHistory, normalizeHistory, record, undo, redo, canUndo, canRedo, MAX_HISTORY } from "../history.js";

/** @param {string} n */
const snap = (n) => [{ name: n, hex: "#000000", order: 0 }];

test("record: pushes previous onto undo, clears redo, sets can* flags", () => {
  let h = emptyHistory();
  h = record(h, snap("A"));
  assert.equal(h.undo.length, 1);
  assert.deepEqual(h.undo[0], snap("A"));
  assert.equal(h.redo.length, 0);
  assert.equal(canUndo(h), true);
  assert.equal(canRedo(h), false);
});

test("undo: last snapshot becomes restored; current moves to redo; null when empty", () => {
  const h = record(emptyHistory(), snap("A")); // undo:[A]
  const res = undo(h, snap("B"));
  assert.ok(res);
  assert.deepEqual(res.restored, snap("A"));
  assert.equal(res.history.undo.length, 0);
  assert.deepEqual(res.history.redo[0], snap("B"));
  assert.equal(undo(emptyHistory(), snap("X")), null);
});

test("redo: mirrors undo; null when empty", () => {
  const h = { undo: [], redo: [snap("A")] };
  const res = redo(h, snap("B"));
  assert.ok(res);
  assert.deepEqual(res.restored, snap("A"));
  assert.deepEqual(res.history.undo[0], snap("B"));
  assert.equal(res.history.redo.length, 0);
  assert.equal(redo(emptyHistory(), snap("X")), null);
});

test("record: caps the undo stack at MAX_HISTORY, dropping the oldest", () => {
  let h = emptyHistory();
  for (let i = 0; i < MAX_HISTORY + 5; i++) h = record(h, snap(`s${i}`));
  assert.equal(h.undo.length, MAX_HISTORY);
  assert.deepEqual(h.undo[0], snap("s5")); // the oldest 5 fell off
  assert.deepEqual(h.undo.at(-1), snap(`s${MAX_HISTORY + 4}`));
});

test("record: a fresh edit clears the redo branch", () => {
  let h = { undo: [snap("A")], redo: [snap("R")] };
  h = record(h, snap("B"));
  assert.equal(h.redo.length, 0);
  assert.equal(h.undo.length, 2);
});

test("normalizeHistory: coerces junk to an empty history, passes valid through", () => {
  assert.deepEqual(normalizeHistory(undefined), emptyHistory());
  assert.deepEqual(normalizeHistory({ undo: "x" }), emptyHistory());
  const good = { undo: [snap("A")], redo: [] };
  assert.deepEqual(normalizeHistory(good), good);
});

test("undo then redo round-trips to the same state", () => {
  const h = record(emptyHistory(), snap("A")); // undo:[A]
  const u = undo(h, snap("B"));
  assert.ok(u);
  const r = redo(u.history, u.restored);
  assert.ok(r);
  assert.deepEqual(r.restored, snap("B"));
  assert.deepEqual(r.history.undo[0], snap("A"));
  assert.equal(r.history.redo.length, 0);
});
