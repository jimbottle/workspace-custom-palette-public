/**
 * Monitor entrypoint (run on a schedule via systemd timer / cron / GitHub
 * Actions). Loads the extension, runs the full matrix, and:
 *   - all green  -> ping the Healthchecks heartbeat (so a MISSED run also alerts)
 *   - any red    -> POST the summary + diagnostic bundles to
 *                   ${SERVICE_URL}/monitor-result (the Phase 7 failure loop)
 * Exits non-zero on failure so a cron wrapper can alert even without the service.
 *
 * Run: npm run monitor   (after `npm run auth` has saved the test-account session)
 */
import { env } from "./env.ts";
import { launchExtensionContext, waitForServiceWorker } from "./browser.ts";
import { runAllChecks } from "./run-matrix.ts";
import { reportPlan } from "./diagnostics.ts";

async function main(): Promise<number> {
  const context = await launchExtensionContext();
  await waitForServiceWorker(context);
  const page = context.pages()[0] ?? (await context.newPage());
  const { summary, bundles } = await runAllChecks(page, new Date().toISOString());
  await context.close();

  // All routing decisions live in the pure reportPlan (diagnostics.ts) so they
  // can be table-tested; main() only executes them. They are otherwise
  // unreachable from a test and only exercise against a live SERVICE_URL /
  // HEALTHCHECKS_URL, so a regression here would be invisible until production.
  const plan = reportPlan(summary);

  if (plan.ping && env.healthchecksUrl) {
    // fetch does NOT reject on a non-2xx, so a check that rejects the POST body
    // (405, say) would otherwise lose the heartbeat silently on exactly the
    // warned runs - producing the "run never happened" alert this is meant to
    // avoid. Inspect the status and say so.
    await fetch(env.healthchecksUrl, plan.pingBody === undefined
      ? undefined
      : { method: "POST", body: plan.pingBody },
    ).then((res) => {
      if (!res.ok) console.warn(`heartbeat returned ${res.status}; the run may be reported as missed`);
    }).catch((e) => console.warn("heartbeat failed", e));
  }

  if (plan.post && env.serviceUrl) {
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (env.serviceToken) headers.authorization = `Bearer ${env.serviceToken}`;
    await fetch(`${env.serviceUrl}/monitor-result`, {
      method: "POST",
      headers,
      body: JSON.stringify({ kind: plan.kind, summary, bundles }),
    }).catch((e) => console.warn("monitor-result POST failed", e));
  }

  return plan.exitCode;
}

main().then((code) => process.exit(code)).catch((e) => {
  console.error("monitor crashed", e);
  process.exit(2);
});
