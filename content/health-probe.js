/**
 * health-probe — local-only failure surfacing. Asserts that injection and apply
 * actually succeeded; on failure it shows a small, dismissible in-page banner
 * with a "Report this" link into the feedback flow (?type=bug). It NEVER sends
 * anything anywhere — clicking "Report this" opens the feedback page; the user
 * decides whether to send. This replaces the dropped passive telemetry tier
 * (architecture commitment: no remote telemetry — see CLAUDE.md).
 *
 * The banner lives in a Shadow DOM host so Google's page CSS can't affect it and
 * ours can't leak onto the page.
 */

import { MARK } from "./injector.js";
import { findSwatchCells } from "./dom-contract.js";
import { setLastHealth } from "../lib/storage.js";

/**
 * Record the inject/apply health locally (chrome.storage.local). The popup's
 * rating gate reads it so we never ask for a review while the extension looks
 * broken. Best-effort and tolerant of environments without chrome.* (Node
 * tests) — health is a hint, never load-bearing.
 * @param {boolean} ok
 */
function recordHealth(ok) {
  try {
    setLastHealth(ok).catch(() => {});
  } catch {
    // no chrome.storage here (unit tests) — skip
  }
}

// ---- pure decision helpers (unit-tested) -----------------------------------

/**
 * Should an inject failure be reported? Only when we genuinely expected to
 * inject — palette non-empty AND the popup actually contains swatch cells we
 * should have added our row beside — but the Brand row is absent. Gating on
 * hasSwatchCells avoids a false "Google changed its layout" banner when the
 * popup matched only via the custom-color button, or hasn't finished rendering
 * its grid. (The synthetic monitor remains the authoritative selector-break
 * signal; the local banner stays conservative to avoid spurious user reports.)
 * @param {number} paletteLength
 * @param {boolean} hasSwatchCells
 * @param {boolean} markPresent
 * @returns {boolean}
 */
export function shouldReportInjectFailure(paletteLength, hasSwatchCells, markPresent) {
  return paletteLength > 0 && hasSwatchCells && !markPresent;
}

/**
 * Is a window 'error' event attributable to our extension (vs Google's own page
 * code)? On a third-party page we must only surface OUR errors, so we match the
 * script filename against our extension origin.
 * @param {string | undefined} filename
 * @param {string} extensionOrigin  e.g. chrome.runtime.getURL("") -> "chrome-extension://<id>/"
 * @returns {boolean}
 */
export function isOwnErrorFilename(filename, extensionOrigin) {
  return !!filename && !!extensionOrigin && filename.startsWith(extensionOrigin);
}

// ---- banner (DOM glue) -----------------------------------------------------

const HOST_ID = "brand-palette-health-banner";

/**
 * Show (or replace) the local banner. Idempotent — one banner at a time.
 * @param {string} message
 * @param {Document} [doc]
 */
export function showBanner(message, doc = document) {
  let host = doc.getElementById(HOST_ID);
  if (!host) {
    host = doc.createElement("div");
    host.id = HOST_ID;
    (doc.body || doc.documentElement).appendChild(host);
    host.attachShadow({ mode: "open" });
  }
  const shadow = /** @type {ShadowRoot} */ (host.shadowRoot);
  shadow.replaceChildren();

  const style = doc.createElement("style");
  style.textContent = `
    .bar { position: fixed; left: 16px; bottom: 16px; z-index: 2147483647;
      max-width: 360px; background: #202124; color: #e8eaed; border-radius: 10px;
      box-shadow: 0 2px 12px rgba(0,0,0,.4); padding: 12px 14px;
      font: 13px/1.4 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; }
    .msg { margin: 0 0 8px; }
    .row { display: flex; gap: 10px; align-items: center; }
    button, a { font: inherit; cursor: pointer; }
    a.report { color: #8ab4f8; text-decoration: none; }
    button.close { margin-left: auto; background: none; border: none; color: #9aa0a6;
      font-size: 16px; line-height: 1; padding: 2px 4px; }
  `;
  const bar = doc.createElement("div");
  bar.className = "bar";
  bar.setAttribute("role", "status");

  const msg = doc.createElement("p");
  msg.className = "msg";
  msg.textContent = message;

  const row = doc.createElement("div");
  row.className = "row";

  const report = doc.createElement("a");
  report.className = "report";
  report.href = "#";
  report.textContent = "Report this";
  report.addEventListener("click", (e) => {
    e.preventDefault();
    // Content scripts can't open a tab directly — ask the service worker to.
    // This is the ONLY action; nothing is sent until the user composes in the
    // feedback page that opens.
    chrome.runtime.sendMessage({ action: "openFeedback", type: "bug" });
    host?.remove();
  });

  const close = doc.createElement("button");
  close.className = "close";
  close.setAttribute("aria-label", "Dismiss");
  close.textContent = "×";
  close.addEventListener("click", () => host?.remove());

  row.append(report, close);
  bar.append(msg, row);
  shadow.append(style, bar);
}

/**
 * Post-injection assertion. If we expected to inject but the Brand row isn't
 * present, surface the local banner. Returns whether injection looks healthy.
 * @param {ParentNode} popup
 * @param {{ length: number }} palette
 * @param {Document} [doc]
 * @returns {boolean}
 */
export function assertInjected(popup, palette, doc = document) {
  const markPresent = !!popup.querySelector(`[${MARK}]`);
  const hasSwatchCells = findSwatchCells(popup).length > 0;
  if (shouldReportInjectFailure(palette.length, hasSwatchCells, markPresent)) {
    recordHealth(false);
    showBanner("Brand colors couldn't be added to this color picker. Google may have changed its layout.", doc);
    return false;
  }
  // Only a real, confirmed injection counts as a healthy signal (not the
  // conservative "didn't expect to inject" cases) — the rating gate requires a
  // recorded success, so it also implies the feature was actually used.
  if (palette.length > 0 && hasSwatchCells && markPresent) recordHealth(true);
  return true;
}

/**
 * Report a failed apply (custom-color flow couldn't complete).
 * @param {unknown} _err
 * @param {Document} [doc]
 */
export function reportApplyFailure(_err, doc = document) {
  recordHealth(false);
  showBanner("That brand color couldn't be applied. Google may have changed its color picker.", doc);
}

/**
 * Install a window error listener that surfaces a banner ONLY for errors thrown
 * by our own extension scripts (never Google's page errors). Per the feedback
 * standard, nothing is auto-sent.
 * @param {Window} [win]
 */
export function installContentErrorListener(win = window) {
  const origin = chrome.runtime.getURL("");
  // Generic script errors are always logged, but the banner is shown at most
  // ONCE per page: a single unrelated throw shouldn't repeatedly alarm the user
  // (and re-pop after they dismiss it). The precise, actionable banners come
  // from assertInjected / reportApplyFailure, not from here.
  let bannerShown = false;
  const surface = () => {
    if (bannerShown) return;
    bannerShown = true;
    showBanner("Something went wrong in the Custom Color Palette extension.", win.document);
  };
  win.addEventListener("error", (e) => {
    if (isOwnErrorFilename(e.filename, origin)) {
      console.warn("[brand-palette] script error", e.message);
      surface();
    }
  });
  win.addEventListener("unhandledrejection", (e) => {
    const stack = /** @type {any} */ (e).reason?.stack;
    if (typeof stack === "string" && stack.includes(origin)) {
      console.warn("[brand-palette] unhandled rejection", /** @type {any} */ (e).reason);
      surface();
    }
  });
}
