/**
 * Theme resolution + application for the extension's own pages (options, popup,
 * feedback). `resolveTheme` is pure (unit-tested); `initTheme` is the browser
 * glue that reads the saved preference, applies the resolved theme as
 * <html data-theme="light|dark">, and keeps it live as the OS scheme OR the saved
 * preference changes. Preference lives in chrome.storage.sync; no telemetry.
 *
 * @typedef {"system" | "light" | "dark"} ThemePref
 */

import { getTheme, onSettingsChanged } from "../lib/storage.js";

/**
 * Resolve a preference to a concrete theme. "system" (and any unknown value)
 * follows the OS; "light"/"dark" force that theme regardless of the OS.
 * @param {ThemePref | string | undefined} pref
 * @param {boolean} prefersDark  whether the OS prefers-color-scheme is dark
 * @returns {"light" | "dark"}
 */
export function resolveTheme(pref, prefersDark) {
  if (pref === "dark") return "dark";
  if (pref === "light") return "light";
  return prefersDark ? "dark" : "light";
}

/**
 * Apply the saved theme to `doc` and keep it in sync with the OS scheme and the
 * stored preference (so changing the selector on the options page updates any
 * open page live). Call once per page on load.
 * @param {Document} [doc]
 * @param {Window} [win]
 * @returns {Promise<void>}
 */
export async function initTheme(doc = document, win = window) {
  const mql = win.matchMedia ? win.matchMedia("(prefers-color-scheme: dark)") : null;
  let pref = /** @type {ThemePref} */ (await getTheme());
  const apply = () => {
    doc.documentElement.dataset.theme = resolveTheme(pref, !!mql?.matches);
  };
  apply();
  // OS scheme changes (only a visible effect while pref is "system").
  mql?.addEventListener?.("change", apply);
  // Preference edits from the options page propagate to any open page.
  onSettingsChanged((change) => {
    if (change.theme) {
      pref = change.theme;
      apply();
    }
  });
}
