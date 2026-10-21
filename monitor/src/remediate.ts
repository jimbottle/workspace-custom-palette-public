/**
 * Remediation — the deterministic, safe half of automated recovery, plus the
 * seam for the AI half.
 *
 *   npm run remediate -- candidate.json   verify that candidate, publish on green
 *   npm run remediate                     run the matrix; if red, ask the
 *                                         configured proposer for a candidate,
 *                                         then verify + publish it
 *
 * A candidate is verified by swapping it into the extension and running the FULL
 * matrix against live Google; it is published to the service ONLY if every check
 * goes green, so a bad candidate can never reach clients. The "propose a
 * candidate from the failure bundle" step is proposer.ts (an LLM seam; the
 * default makes no proposal, so remediation is human-in-the-loop until one is
 * wired). Needs the seeded test-account session (like the monitor); set
 * SERVICE_URL + SERVICE_TOKEN to auto-publish, else it verifies only.
 */
import { readFileSync, writeFileSync, copyFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";
import { env } from "./env.ts";
import { launchExtensionContext, waitForServiceWorker } from "./browser.ts";
import { runAllChecks } from "./run-matrix.ts";
import { noopProposer, type Proposer } from "./proposer.ts";
// Single source of truth for "is this a valid selector contract" — the SAME
// rule the extension applies in pickContract (lib/config.js at the repo root).
// Reusing it (rather than a second copy here) guarantees the remediator's
// verdict on a candidate can't drift from what clients actually accept.
import { isValidContract } from "../../lib/config.js";

const PACKAGED = resolve(env.extensionPath, "config/selectors.default.json");
const ENDPOINTS = resolve(env.extensionPath, "config/endpoints.js");

/** Swap a proposer in here to enable automatic proposals. */
const proposer: Proposer = noopProposer;

/** What `resolveCandidate` decided — distinguishes the success/no-op/broken paths. */
type Resolution =
  | { kind: "candidate"; candidate: unknown }
  | { kind: "already-green" } // matrix is green: nothing to remediate (a SUCCESS)
  | { kind: "no-candidate" }; // matrix is red but no proposal was produced

/** Pull the CONFIG_BASE string literal out of endpoints.js source. */
export function readConfigBase(source: string): string {
  const m = source.match(/CONFIG_BASE\s*=\s*["']([^"']*)["']/);
  return m?.[1] ?? "";
}

/**
 * Remediation verifies a candidate by swapping it into the PACKAGED fallback and
 * running the live matrix. That is only authoritative when the extension build
 * actually resolves the packaged file — i.e. CONFIG_BASE is empty. With a
 * non-empty CONFIG_BASE the service worker caches a remote contract into
 * chrome.storage.local, and the extension's pickContract prefers that cached
 * copy whenever it is valid and not older than packaged — so the matrix could
 * silently verify the WRONG contract and the green/red verdict would no longer
 * reflect the candidate. (With CONFIG_BASE="", the service worker CLEARS that
 * cache on startup, so the swapped packaged file is exactly what content scripts
 * read.) Fail fast on a non-packaged-only build rather than publish on a bogus
 * verdict.
 */
export function assertPackagedOnly(configBase: string): void {
  if (configBase) {
    throw new Error(
      `remediation requires a packaged-only monitor build (CONFIG_BASE=""), but endpoints.js has CONFIG_BASE="${configBase}". ` +
        "A non-empty CONFIG_BASE lets a cached remote contract shadow the swapped packaged file, so the verdict would not reflect the candidate.",
    );
  }
}

/**
 * Run `fn` with `candidate` swapped into `path`, restoring the original
 * afterward — on normal return, on a thrown error (finally), AND on a hard
 * interrupt (SIGINT/SIGTERM) so an aborted run never leaves the repo's packaged
 * contract overwritten with the candidate plus a stray backup file. Extracted as
 * a seam so the swap/restore is unit-testable without launching a browser.
 */
export async function withSwappedContract<T>(path: string, candidate: unknown, fn: () => Promise<T>): Promise<T> {
  const backup = `${path}.remediate-backup`;
  copyFileSync(path, backup);
  let restored = false;
  const restore = () => {
    if (restored) return;
    restored = true;
    try { copyFileSync(backup, path); } catch { /* best effort */ }
    try { rmSync(backup); } catch { /* best effort */ }
  };
  const onSignal = () => { restore(); process.exit(130); };
  process.once("SIGINT", onSignal);
  process.once("SIGTERM", onSignal);
  try {
    writeFileSync(path, JSON.stringify(candidate, null, 2));
    return await fn();
  } finally {
    process.removeListener("SIGINT", onSignal);
    process.removeListener("SIGTERM", onSignal);
    restore();
  }
}

/** Process exit code for the two non-live resolution paths (tested directly). */
export function exitCodeForResolution(kind: "already-green" | "no-candidate"): number {
  return kind === "already-green" ? 0 : 1;
}

/** Launch the extension, run the full matrix once, close. */
async function runMatrixOnce() {
  const context = await launchExtensionContext();
  try {
    await waitForServiceWorker(context);
    const page: Page = context.pages()[0] ?? (await context.newPage());
    return await runAllChecks(page, new Date().toISOString());
  } finally {
    await context.close();
  }
}

async function publish(candidate: unknown): Promise<boolean> {
  if (!env.serviceUrl || !env.serviceToken) {
    console.log("SERVICE_URL/SERVICE_TOKEN not set — verified only, NOT published. Publish manually via POST /config/selectors.");
    return true;
  }
  const r = await fetch(`${env.serviceUrl}/config/selectors`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${env.serviceToken}` },
    body: JSON.stringify(candidate),
  });
  console.log(r.ok ? `Published to ${env.serviceUrl} — clients update on next refresh.` : `Publish failed: HTTP ${r.status}`);
  return r.ok;
}

/** Verify a candidate by running the matrix with it swapped in; restore after. */
async function verifyCandidate(candidate: unknown): Promise<boolean> {
  return withSwappedContract(PACKAGED, candidate, async () => {
    const { summary } = await runMatrixOnce();
    if (!summary.ok) {
      console.error(`\nCandidate still failing (${summary.passed}/${summary.total}). NOT publishing.`);
      return false;
    }
    console.log("\nCandidate is GREEN across the matrix.");
    return true;
  });
}

async function resolveCandidate(): Promise<Resolution> {
  const path = process.argv[2];
  if (path) {
    const candidate = JSON.parse(readFileSync(path, "utf8"));
    if (!isValidContract(candidate)) throw new Error("candidate is not a valid selector contract");
    return { kind: "candidate", candidate };
  }
  // No candidate supplied: run the matrix and, if red, ask the proposer.
  const { summary, bundles } = await runMatrixOnce();
  if (summary.ok) {
    console.log("Monitor is already green — nothing to remediate.");
    return { kind: "already-green" };
  }
  const currentContract = JSON.parse(readFileSync(PACKAGED, "utf8"));
  const candidate = await proposer.propose({
    bundles: bundles.map((b) => ({ id: b.id, stage: b.stage, suspectResolver: b.suspectResolver, pickerOuterHtml: b.pickerOuterHtml })),
    currentContract,
  });
  if (!candidate) {
    console.log("No automatic proposal (default proposer). Read the failure bundle, author a candidate, then: npm run remediate -- <candidate.json>");
    return { kind: "no-candidate" };
  }
  if (!isValidContract(candidate)) throw new Error("proposer returned an invalid contract");
  return { kind: "candidate", candidate };
}

async function main(): Promise<number> {
  // Fail fast on a non-packaged-only build BEFORE any matrix/proposer work: with
  // a non-empty CONFIG_BASE a cached remote contract would shadow the swap and
  // the verdict wouldn't reflect the candidate (see assertPackagedOnly).
  assertPackagedOnly(readConfigBase(readFileSync(ENDPOINTS, "utf8")));
  const r = await resolveCandidate();
  // Already green is a SUCCESS (nothing to do); a red matrix with no candidate
  // is a still-broken state a human/proposer must act on — keep these distinct
  // so a cron/CI wrapper doesn't read "already green" as a failure.
  if (r.kind !== "candidate") return exitCodeForResolution(r.kind);
  if (!(await verifyCandidate(r.candidate))) return 1;
  return (await publish(r.candidate)) ? 0 : 1;
}

// Only auto-run when invoked directly (`npm run remediate`); importing this
// module for unit tests must NOT kick off a live matrix run.
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().then((code) => process.exit(code)).catch((e) => {
    console.error("remediate:", e instanceof Error ? e.message : e);
    process.exit(2);
  });
}
