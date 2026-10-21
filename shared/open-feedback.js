/**
 * Open the dedicated feedback page (a new tab, never a modal — per the
 * standard). Shared by the popup, the options page, and (Phase 4) the in-page
 * error banner's "Report this" deep link. chrome.* glue, not unit-tested.
 *
 * @param {"bug" | "feature" | "feedback"} [type]
 */
export function openFeedbackPage(type) {
  const base = chrome.runtime.getURL("feedback/feedback.html");
  const url = type ? `${base}?type=${encodeURIComponent(type)}` : base;
  if (chrome.tabs?.create) chrome.tabs.create({ url });
  else window.open(url, "_blank", "noopener");
}
