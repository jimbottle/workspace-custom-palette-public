/**
 * Launch a persistent Chromium context with the unpacked extension loaded.
 * Extensions require a persistent context (not storageState), so the test
 * account's Google session is kept in the user-data-dir and reused across runs.
 */
import { chromium, type BrowserContext } from "@playwright/test";
import { env } from "./env.ts";

/**
 * @returns the launched context. MV3 service worker may take a moment to spin
 * up; callers that need it can await context.serviceWorkers / waitForEvent.
 */
export async function launchExtensionContext(): Promise<BrowserContext> {
  const context = await chromium.launchPersistentContext(env.userDataDir, {
    headless: env.headless,
    channel: "chromium",
    args: [
      `--disable-extensions-except=${env.extensionPath}`,
      `--load-extension=${env.extensionPath}`,
    ],
    viewport: { width: 1680, height: 1000 },
  });
  return context;
}

/** Best-effort wait for the extension's MV3 service worker to register. */
export async function waitForServiceWorker(context: BrowserContext, timeoutMs = 5000): Promise<void> {
  if (context.serviceWorkers().length > 0) return;
  await Promise.race([
    context.waitForEvent("serviceworker"),
    new Promise((r) => setTimeout(r, timeoutMs)),
  ]);
}
