/**
 * Error surfacing for the extension's OWN pages (popup, options, feedback),
 * per the feedback standard: errors become a local, dismissible notice with a
 * "Report this" link into the feedback flow (?type=bug). NOTHING is auto-sent.
 * Two sources feed the same notice:
 *   - drainBackgroundErrors(): the service worker's errorBuffer
 *     (chrome.storage.session, written via lib/error-buffer.js), surfaced on
 *     the next popup/options open per the standard.
 *   - installPageErrorListener(): error/unhandledrejection thrown by the page
 *     itself. Extension pages run only our code, so no origin filtering is
 *     needed (unlike content/health-probe.js on docs.google.com).
 *
 * showErrorNotice is chrome-free (doc + callbacks injected) so it smoke-tests
 * under jsdom; the two installers are chrome.* glue. Styles live in
 * shared/theme.css (.error-notice).
 */

import { normalizeErrorBuffer, errorNoticeMessage } from "../lib/error-buffer.js";
import { getErrorBuffer, clearErrorBuffer } from "../lib/storage.js";
import { openFeedbackPage } from "./open-feedback.js";

const NOTICE_ID = "bp-error-notice";

/**
 * Render (or replace) the error notice at the top of the page. Idempotent —
 * one notice at a time; a newer call replaces the current one.
 * @param {string} message
 * @param {{ doc?: Document, onReport?: (() => void) | null, onDismiss?: (() => void) | null }} [opts]
 * @returns {HTMLElement}
 */
export function showErrorNotice(message, { doc = document, onReport = null, onDismiss = null } = {}) {
  doc.getElementById(NOTICE_ID)?.remove();

  const box = doc.createElement("div");
  box.id = NOTICE_ID;
  box.className = "error-notice";
  box.setAttribute("role", "alert");

  const msg = doc.createElement("p");
  msg.textContent = message;

  const actions = doc.createElement("div");
  actions.className = "error-notice-actions";

  const report = doc.createElement("button");
  report.type = "button";
  report.className = "error-notice-report";
  report.textContent = "Report this";
  report.addEventListener("click", () => {
    onReport?.();
    box.remove();
  });

  const dismiss = doc.createElement("button");
  dismiss.type = "button";
  dismiss.textContent = "Dismiss";
  dismiss.addEventListener("click", () => {
    onDismiss?.();
    box.remove();
  });

  actions.append(report, dismiss);
  box.append(msg, actions);
  doc.body.prepend(box);
  return box;
}

/**
 * Surface any buffered background-worker errors as a notice, per the standard
 * ("read an errorBuffer from chrome.storage.session next time the popup or
 * options page opens"). Both Report and Dismiss clear the buffer so the same
 * errors don't re-alarm on every open; until acted on, the notice returns.
 * @param {{ doc?: Document }} [opts]
 * @returns {Promise<boolean>} whether a notice was shown
 */
export async function drainBackgroundErrors({ doc = document } = {}) {
  let buffer;
  try {
    buffer = normalizeErrorBuffer(await getErrorBuffer());
  } catch {
    return false; // storage unavailable — never let surfacing break the page
  }
  if (buffer.length === 0) return false;
  showErrorNotice(errorNoticeMessage(buffer.length), {
    doc,
    onReport: () => {
      clearErrorBuffer().catch(() => {});
      openFeedbackPage("bug");
    },
    onDismiss: () => {
      clearErrorBuffer().catch(() => {});
    },
  });
  return true;
}

/**
 * Surface this page's own runtime errors. Shown at most ONCE per page load so
 * a repeating throw can't re-pop the notice after a dismiss (same throttle as
 * the content-script listener).
 * @param {Window} [win]
 */
export function installPageErrorListener(win = window) {
  let shown = false;
  const surface = () => {
    if (shown) return;
    shown = true;
    showErrorNotice("Something went wrong on this page.", {
      doc: win.document,
      onReport: () => openFeedbackPage("bug"),
    });
  };
  win.addEventListener("error", (e) => {
    console.warn("[brand-palette] page error", e.message);
    surface();
  });
  win.addEventListener("unhandledrejection", (e) => {
    console.warn("[brand-palette] unhandled rejection", /** @type {any} */ (e).reason);
    surface();
  });
}
