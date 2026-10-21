import { test } from "node:test";
import assert from "node:assert/strict";
import { JSDOM } from "jsdom";
import { showErrorNotice } from "../page-errors.js";

// Smoke tests for the chrome-free renderer only; drainBackgroundErrors and
// installPageErrorListener are chrome.* glue (covered by typecheck + manual).

function setup() {
  const dom = new JSDOM("<!doctype html><body><h1>page</h1></body>");
  return dom.window.document;
}

test("showErrorNotice: renders the message with Report + Dismiss actions at the top", () => {
  const doc = setup();
  showErrorNotice("Something broke.", { doc });
  const box = doc.getElementById("bp-error-notice");
  assert.ok(box, "notice rendered");
  assert.equal(doc.body.firstElementChild, box, "prepended above page content");
  assert.match(box.textContent ?? "", /Something broke\./);
  assert.ok(box.querySelector("button.error-notice-report"), "report button present");
  const buttons = box.querySelectorAll("button");
  assert.equal(buttons.length, 2);
});

test("showErrorNotice: is idempotent (a newer call replaces the notice)", () => {
  const doc = setup();
  showErrorNotice("first", { doc });
  showErrorNotice("second", { doc });
  const boxes = doc.querySelectorAll("#bp-error-notice");
  assert.equal(boxes.length, 1);
  assert.match(boxes[0]?.textContent ?? "", /second/);
});

test("showErrorNotice: report/dismiss fire their callbacks and remove the notice", () => {
  const doc = setup();
  let reported = 0;
  let dismissed = 0;
  showErrorNotice("boom", { doc, onReport: () => reported++, onDismiss: () => dismissed++ });
  /** @type {HTMLButtonElement} */ (doc.querySelector(".error-notice-report")).click();
  assert.equal(reported, 1);
  assert.equal(doc.getElementById("bp-error-notice"), null, "removed after report");

  showErrorNotice("boom again", { doc, onDismiss: () => dismissed++ });
  const dismissBtn = /** @type {HTMLButtonElement} */ (
    doc.querySelector("#bp-error-notice button:not(.error-notice-report)")
  );
  dismissBtn.click();
  assert.equal(dismissed, 1);
  assert.equal(doc.getElementById("bp-error-notice"), null, "removed after dismiss");
});
