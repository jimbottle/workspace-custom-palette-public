/**
 * Remote config endpoint base. EMPTY by default — the extension ships fully
 * functional on packaged config and only fetches remote config when an org
 * deployment points this at their server (and adds the matching host permission
 * in manifest.json — see docs/DEPLOY.md).
 *
 * To enable (e.g. against the local mock for testing):
 *   CONFIG_BASE = "http://localhost:8787"
 * and add "http://localhost:8787/*" to manifest host_permissions.
 *
 * The service worker GETs `${CONFIG_BASE}/config/selectors` and
 * `${CONFIG_BASE}/config/palette`.
 */
export const CONFIG_BASE = "";

/** Refresh cadence for the chrome.alarms job, in minutes. */
export const REFRESH_PERIOD_MINUTES = 360; // every 6h; config is low-churn
