/**
 * Playwright-test form of the matrix (for `npm run test:pw` / CI). Launches our
 * own persistent context (the default Playwright browser fixture can't load an
 * MV3 extension), then asserts each matrix check passes. The scheduled
 * production path is src/runner.ts; this exists for interactive/CI runs.
 */
import { test, expect, type BrowserContext, type Page } from "@playwright/test";
import { launchExtensionContext, waitForServiceWorker } from "./src/browser.ts";
import { MATRIX } from "./src/matrix.ts";
import { runCheck } from "./src/check.ts";

test.describe.configure({ mode: "serial" });

let context: BrowserContext;
let page: Page;

test.beforeAll(async () => {
  context = await launchExtensionContext();
  await waitForServiceWorker(context);
  page = context.pages()[0] ?? (await context.newPage());
});

test.afterAll(async () => {
  await context?.close();
});

for (const item of MATRIX) {
  test(item.label, async () => {
    const result = await runCheck(page, item);
    expect(result.ok, result.error ?? "").toBe(true);
  });
}
