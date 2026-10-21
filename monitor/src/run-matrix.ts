/**
 * Shared matrix runner: run every check against an already-open page and return
 * the summary + diagnostic bundles. Used by the scheduled monitor (runner.ts)
 * and the remediation verifier (remediate.ts).
 */
import { mkdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import type { Page } from "@playwright/test";
import { env } from "./env.ts";
import { MATRIX } from "./matrix.ts";
import { runCheck, capture } from "./check.ts";
import { summarize, buildBundle, type CheckResult, type DiagnosticBundle, type RunSummary } from "./diagnostics.ts";

const here = fileURLToPath(new URL(".", import.meta.url));
export const DIAG_DIR = resolve(here, "../.diagnostics");

/** The version string of the extension's packaged contract (for bundle labeling). */
export function contractVersion(): string {
  try {
    return JSON.parse(readFileSync(resolve(env.extensionPath, "config/selectors.default.json"), "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Run the full app x picker matrix on `page`, logging PASS/FAIL per check and
 * capturing a diagnostic bundle for each failure.
 */
export async function runAllChecks(page: Page, at: string): Promise<{ summary: RunSummary; bundles: DiagnosticBundle[] }> {
  mkdirSync(DIAG_DIR, { recursive: true });
  page.on("console", (m) => {
    const t = m.text();
    if (t.includes("brand-palette")) console.log("    [page]", t);
  });

  const results: CheckResult[] = [];
  const bundles: DiagnosticBundle[] = [];
  for (const item of MATRIX) {
    const result = await runCheck(page, item);
    results.push(result);
    console.log(`${result.ok ? "PASS" : "FAIL"}  ${result.label}${result.ok ? "" : `  [${result.stage}] ${result.error}`}`);
    if (!result.ok) {
      const captured = await capture(page, result.id, DIAG_DIR);
      bundles.push(buildBundle(item, result, { ...captured, contractVersion: contractVersion() }, at));
    }
  }
  const summary = summarize(results, at);
  console.log(`\n${summary.passed}/${summary.total} checks passed.`);
  // Print warnings as their own block rather than inline with PASS/FAIL: they
  // belong to green checks, so inline they scroll past unread in a run whose
  // last line says everything passed.
  if (summary.warnings.length > 0) {
    console.warn(`\n${summary.warnings.length} warning(s) - green, but not fully verified:`);
    for (const w of summary.warnings) console.warn(`  WARN  ${w.label}: ${w.message}`);
  }
  return { summary, bundles };
}
