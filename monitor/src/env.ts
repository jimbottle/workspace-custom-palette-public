/**
 * Monitor configuration from environment. Secrets (the dedicated test Google
 * account) are NOT stored here — the account session lives in a persistent
 * user-data-dir created once via `npm run auth`. See README.
 */
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";

const here = fileURLToPath(new URL(".", import.meta.url));

export const env = {
  /** Path to the unpacked extension to load — the repo root holds manifest.json. */
  extensionPath: process.env.EXTENSION_PATH ?? resolve(here, "../.."),
  /** Persistent Chromium profile dir holding the test account's Google session. */
  userDataDir: process.env.MONITOR_USER_DATA_DIR ?? resolve(here, "../.user-data"),
  /** Healthchecks.io ping URL — hit on a fully-green run so a missed run also alerts. */
  healthchecksUrl: process.env.HEALTHCHECKS_URL ?? "",
  /** Config service base; the monitor POSTs `${serviceUrl}/monitor-result` on failure. */
  serviceUrl: process.env.SERVICE_URL ?? "",
  /** Bearer token for /monitor-result (must equal the service's MONITOR_TOKEN). */
  serviceToken: process.env.SERVICE_TOKEN ?? "",
  /** Headed by default — Chromium extensions need a real (or new-headless) browser. */
  headless: process.env.MONITOR_HEADLESS === "1",
};
