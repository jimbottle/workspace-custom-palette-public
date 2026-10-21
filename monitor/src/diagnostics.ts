/**
 * Pure result + diagnostic-bundle shaping. No Playwright, no I/O — so the
 * summary/bundle logic is testable in isolation.
 */
import type { CheckItem } from "./matrix.ts";

/** Which stage of a check failed — maps to the resolver most likely at fault. */
export type Stage = "open-doc" | "opener" | "open-picker" | "inject" | "apply" | "readback";

export interface CheckResult {
  id: string;
  label: string;
  ok: boolean;
  stage?: Stage;
  error?: string;
  /**
   * Non-fatal observations from a check that still PASSED — today, a locale that
   * could not be verified (see check.ts localeVerdict). These must reach a human
   * without failing the run: a warning that only ever hits stdout is invisible
   * on a green run, since the runner pings the heartbeat and POSTs nothing, so
   * the "silent conversion" the locale check exists to catch would stay silent.
   */
  warnings?: string[];
}

export interface RunSummary {
  ok: boolean;
  total: number;
  passed: number;
  failed: CheckResult[];
  /** Every check's warnings, flattened, so a green-but-noteworthy run is reportable. */
  warnings: { id: string; label: string; message: string }[];
  at: string;
}

export interface DiagnosticBundle {
  id: string;
  label: string;
  app: string;
  pickerType: string;
  stage: Stage;
  error: string;
  /** The resolver/selector most implicated by the failed stage. */
  suspectResolver: string;
  url: string;
  pickerOuterHtml: string | null;
  a11yTree: unknown;
  screenshotPath: string | null;
  contractVersion: string;
  at: string;
}

/** Summarize per-check results into a run verdict. Pure. */
export function summarize(results: CheckResult[], at: string): RunSummary {
  const failed = results.filter((r) => !r.ok);
  // Warnings are collected from EVERY result, passing ones included — that is
  // the point: they describe runs that are green but not fully verified.
  const warnings = results.flatMap((r) =>
    (r.warnings ?? []).map((message) => ({ id: r.id, label: r.label, message })),
  );
  return {
    ok: failed.length === 0,
    total: results.length,
    passed: results.length - failed.length,
    failed,
    warnings,
    at,
  };
}

/**
 * What a finished run should report. Pure, so the routing can be table-tested.
 *
 * `kind` travels with the POST so the service can tell a real failure report
 * from an advisory one. That distinction matters because `_handle_alerts` acts
 * on green summaries too: its recovery branch closes every tracked GitHub issue
 * and announces recovery in Slack. Without `kind`, a green run that happened to
 * carry a locale warning would trigger those outbound writes while an identical
 * green run without a warning would not — auto-closing a maintainer's open issue
 * mid-remediation on the strength of an unrelated `<html lang>` read. Outbound
 * writes must not be gated on something that arbitrary.
 *
 * Whether a fully green run SHOULD drive recovery deterministically is a real
 * question, but it is a decision about outbound GitHub/Slack behavior rather
 * than a side effect of a warnings channel: bd `workspace-custom-palette-ykj`.
 */
export interface ReportPlan {
  /** Ping the heartbeat. Green runs only: a red run must stay silent so the check trips. */
  ping: boolean;
  /** Text to send with the ping, so warnings are visible in Healthchecks itself. */
  pingBody?: string;
  /** POST the summary to the config service. */
  post: boolean;
  /** What that POST represents. Absent when nothing is posted. */
  kind?: "failure" | "warnings";
  /** Warnings never change this: a non-zero exit drives cron alerting, i.e. a false RED. */
  exitCode: number;
}

export function reportPlan(summary: RunSummary): ReportPlan {
  const warned = summary.warnings.length > 0;
  if (!summary.ok) {
    // A failure report already carries the warnings inside the summary, so
    // there is nothing extra to route.
    return { ping: false, post: true, kind: "failure", exitCode: 1 };
  }
  if (warned) {
    return {
      ping: true,
      pingBody: summary.warnings.map((w) => `${w.label}: ${w.message}`).join("\n"),
      post: true,
      kind: "warnings",
      exitCode: 0,
    };
  }
  return { ping: true, post: false, exitCode: 0 };
}

/** Map a failed stage to the resolver a fixer should look at first. Pure. */
export function suspectResolver(stage: Stage): string {
  switch (stage) {
    case "open-picker": return "pickers.<app>.<type>.toolbarButton";
    case "inject": return "shared.swatchCell / shared.customColorButton (picker detection)";
    case "apply": return "shared.hexInput / shared.okButton (custom-color flow)";
    case "readback": return "shared.swatchInner (applied-color read-back)";
    default: return "(non-selector: navigation/opener/auth)";
  }
}

/** Assemble a diagnostic bundle from a failed check + captured page artifacts. Pure. */
export function buildBundle(
  item: CheckItem,
  result: CheckResult,
  captured: { url: string; pickerOuterHtml: string | null; a11yTree: unknown; screenshotPath: string | null; contractVersion: string },
  at: string,
): DiagnosticBundle {
  const stage = result.stage ?? "apply";
  return {
    id: result.id,
    label: result.label,
    app: item.app,
    pickerType: item.pickerType,
    stage,
    error: result.error ?? "unknown",
    suspectResolver: suspectResolver(stage),
    url: captured.url,
    pickerOuterHtml: captured.pickerOuterHtml,
    a11yTree: captured.a11yTree,
    screenshotPath: captured.screenshotPath,
    contractVersion: captured.contractVersion,
    at,
  };
}
