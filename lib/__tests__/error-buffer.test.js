import { test } from "node:test";
import assert from "node:assert/strict";
import {
  appendError, normalizeErrorBuffer, errorNoticeMessage,
  MAX_BUFFERED_ERRORS, MAX_MESSAGE_LENGTH,
} from "../error-buffer.js";

test("appendError: appends entries in order", () => {
  let buf = appendError([], { message: "a", at: 1 });
  buf = appendError(buf, { message: "b", at: 2 });
  assert.deepEqual(buf, [{ message: "a", at: 1 }, { message: "b", at: 2 }]);
});

test("appendError: caps at max, dropping the oldest", () => {
  /** @type {{ message: string, at: number }[]} */
  let buf = [];
  for (let i = 0; i < MAX_BUFFERED_ERRORS + 3; i++) {
    buf = appendError(buf, { message: `e${i}`, at: i });
  }
  assert.equal(buf.length, MAX_BUFFERED_ERRORS);
  assert.equal(buf[0]?.message, "e3"); // oldest three dropped
  assert.equal(buf[buf.length - 1]?.message, `e${MAX_BUFFERED_ERRORS + 2}`);
});

test("appendError: a repeat of the newest message updates its timestamp instead of growing", () => {
  let buf = appendError([], { message: "boom", at: 1 });
  buf = appendError(buf, { message: "boom", at: 9 });
  assert.deepEqual(buf, [{ message: "boom", at: 9 }]);
  // ...but an identical message that is NOT newest still appends (distinct errors kept).
  buf = appendError(buf, { message: "other", at: 10 });
  buf = appendError(buf, { message: "boom", at: 11 });
  assert.equal(buf.length, 3);
});

test("appendError: coerces non-string messages and truncates long ones", () => {
  const long = "x".repeat(MAX_MESSAGE_LENGTH * 2);
  let buf = appendError([], { message: long, at: 1 });
  assert.equal(buf[0]?.message.length, MAX_MESSAGE_LENGTH);
  buf = appendError([], { message: undefined, at: 1 });
  assert.equal(buf[0]?.message, "Unknown error");
  buf = appendError([], { message: { weird: true }, at: 1 });
  assert.equal(typeof buf[0]?.message, "string");
});

test("normalizeErrorBuffer: garbage in, empty (or filtered) out", () => {
  assert.deepEqual(normalizeErrorBuffer(undefined), []);
  assert.deepEqual(normalizeErrorBuffer("nope"), []);
  assert.deepEqual(normalizeErrorBuffer({ message: "not-an-array" }), []);
  const mixed = [
    { message: "ok", at: 5 },
    { message: "", at: 5 },          // blank message dropped
    { message: "no-at" },             // missing timestamp dropped
    null,
    { message: "ok2", at: "7" },      // numeric-string at coerces
  ];
  assert.deepEqual(normalizeErrorBuffer(mixed), [
    { message: "ok", at: 5 },
    { message: "ok2", at: 7 },
  ]);
});

test("errorNoticeMessage: singular vs plural", () => {
  assert.equal(errorNoticeMessage(1), "The extension hit an error in the background.");
  assert.match(errorNoticeMessage(3), /3 errors/);
});
