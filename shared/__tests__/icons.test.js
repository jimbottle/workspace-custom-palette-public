import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { trashIcon, eyedropperIcon, undoIcon, redoIcon, copyIcon, checkIcon } from "../icons.js";

const doc = new JSDOM("<!doctype html>").window.document;

test("icon builders: aria-hidden svg, currentColor stroke, requested size", () => {
  for (const build of [trashIcon, eyedropperIcon, undoIcon, redoIcon, copyIcon]) {
    const svg = build(14, doc);
    assert.equal(svg.tagName.toLowerCase(), "svg");
    assert.equal(svg.getAttribute("aria-hidden"), "true", "host button carries the label");
    assert.equal(svg.getAttribute("stroke"), "currentColor");
    assert.equal(svg.getAttribute("width"), "14");
    assert.ok(svg.querySelectorAll("path").length >= 2, "glyph has its paths");
  }
});

test("undo/redo icons: mirrored circular arrows (ccw vs cw arcs differ)", () => {
  const d = (/** @type {SVGElement} */ svg) => svg.querySelector("path")?.getAttribute("d") ?? "";
  const undoD = d(undoIcon(14, doc));
  const redoD = d(redoIcon(14, doc));
  assert.notEqual(undoD, redoD);
  assert.match(undoD, /^M3 /, "undo arc anchors left (counter-clockwise)");
  assert.match(redoD, /^M21 /, "redo arc anchors right (clockwise)");
});

test("check icon: aria-hidden single-stroke tick", () => {
  const svg = checkIcon(14, doc);
  assert.equal(svg.getAttribute("aria-hidden"), "true");
  assert.equal(svg.getAttribute("stroke"), "currentColor");
  assert.equal(svg.querySelectorAll("path").length, 1);
});
