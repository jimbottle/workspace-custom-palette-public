import { defineConfig } from "@playwright/test";

// The checks launch their own persistent context (to load the MV3 extension),
// so most browser options here are unused; this mainly sets timeouts/reporter
// for `playwright test`. The scheduled path is `npm run monitor` (src/runner.ts).
export default defineConfig({
  testDir: ".",
  testMatch: /checks\.spec\.ts/,
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: ".diagnostics/report.json" }]],
});
