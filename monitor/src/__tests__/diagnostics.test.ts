import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, suspectResolver, buildBundle, reportPlan, type CheckResult, type Stage } from "../diagnostics.ts";
import type { CheckItem } from "../matrix.ts";

const AT = "2026-05-29T00:00:00.000Z";

test("summarize: verdict math (all pass / some fail)", () => {
  const pass: CheckResult[] = [{ id: "a", label: "A", ok: true }, { id: "b", label: "B", ok: true }];
  assert.deepEqual(summarize(pass, AT), { ok: true, total: 2, passed: 2, failed: [], warnings: [], at: AT });

  const mixed: CheckResult[] = [{ id: "a", label: "A", ok: true }, { id: "b", label: "B", ok: false, stage: "apply", error: "x" }];
  const s = summarize(mixed, AT);
  assert.equal(s.ok, false);
  assert.equal(s.passed, 1);
  assert.equal(s.failed.length, 1);
  assert.equal(s.failed[0]?.id, "b");
});

test("summarize: empty run is vacuously ok", () => {
  assert.deepEqual(summarize([], AT), { ok: true, total: 0, passed: 0, failed: [], warnings: [], at: AT });
});

test("summarize: warnings from PASSING checks survive into the summary", () => {
  // The whole point of the warnings channel. A warning belongs to a check that
  // passed, so if summarize dropped them (or only read failures) a green run
  // would report nothing and the observation would die in a log file - which is
  // what happened before this field existed.
  const results: CheckResult[] = [
    { id: "docs.text", label: "Docs · Text", ok: true, warnings: ["no <html lang>"] },
    { id: "sheets.fill", label: "Sheets · Fill", ok: true },
    { id: "slides.fill", label: "Slides · Fill", ok: false, stage: "inject", error: "x", warnings: ["could not read lang"] },
  ];
  const s = summarize(results, AT);
  assert.equal(s.warnings.length, 2, "collected from passing AND failing checks");
  assert.deepEqual(s.warnings[0], { id: "docs.text", label: "Docs · Text", message: "no <html lang>" });
  // A run can be green and still carry warnings - that combination is the
  // reason the field exists, so pin it.
  const green = summarize([{ id: "a", label: "A", ok: true, warnings: ["unverified"] }], AT);
  assert.equal(green.ok, true);
  assert.equal(green.warnings.length, 1);
});

test("reportPlan: the four routing rows", () => {
  // This routing is why the warnings channel exists at all, and it only ever
  // executes against a live SERVICE_URL / HEALTHCHECKS_URL - so without this
  // table, flipping any branch restores "the warning reaches nobody" with a
  // fully green Tier 2 and nobody finds out until production.
  const base = { total: 1, passed: 1, failed: [], at: AT };
  const warn = [{ id: "a", label: "A", message: "could not read <html lang>" }];

  // Green, quiet: ping only. No body, nothing posted.
  assert.deepEqual(reportPlan({ ...base, ok: true, warnings: [] }),
    { ping: true, post: false, exitCode: 0 });

  // Green, warned: still ping (skipping it would read as a MISSED run and alert
  // for the wrong reason), carry the warnings in the body, and post as advisory.
  const greenWarned = reportPlan({ ...base, ok: true, warnings: warn });
  assert.equal(greenWarned.ping, true);
  assert.match(greenWarned.pingBody ?? "", /could not read <html lang>/);
  assert.equal(greenWarned.post, true);
  assert.equal(greenWarned.kind, "warnings", "advisory, so the service drives no outbound writes");
  assert.equal(greenWarned.exitCode, 0, "a warning must never fail the run");

  // Red: never ping (the missed heartbeat is the alert), post as a failure.
  const red = { ...base, ok: false, passed: 0, failed: [{ id: "a", label: "A", ok: false }] };
  assert.deepEqual(reportPlan({ ...red, warnings: [] }),
    { ping: false, post: true, kind: "failure", exitCode: 1 });

  // Red AND warned: failure wins outright. Reporting this as "warnings" would
  // make the service skip alerting on a genuinely failing run.
  const redWarned = reportPlan({ ...red, warnings: warn });
  assert.equal(redWarned.kind, "failure");
  assert.equal(redWarned.ping, false);
  assert.equal(redWarned.exitCode, 1);
});

test("suspectResolver: maps each stage, incl. the non-selector default", () => {
  assert.match(suspectResolver("open-picker"), /toolbarButton/);
  assert.match(suspectResolver("inject"), /swatchCell|customColorButton/);
  assert.match(suspectResolver("apply"), /hexInput|okButton/);
  assert.match(suspectResolver("readback"), /swatchInner/);
  assert.match(suspectResolver("opener"), /non-selector/);
  assert.match(suspectResolver("open-doc" as Stage), /non-selector/);
});

test("buildBundle: assembles fields, defaults stage/error, derives suspectResolver", () => {
  const item: CheckItem = { app: "sheets", pickerType: "fill", label: "Sheets · Fill", newDocUrl: "u", toolbarButton: "t", opener: "sheets-cell" };
  const result: CheckResult = { id: "sheets.fill", label: "Sheets · Fill", ok: false }; // no stage/error
  const bundle = buildBundle(item, result, {
    url: "https://docs.google.com/x", pickerOuterHtml: "<div/>", a11yTree: null,
    screenshotPath: "/tmp/x.png", contractVersion: "2026-05-29",
  }, AT);
  assert.equal(bundle.stage, "apply"); // default
  assert.equal(bundle.error, "unknown"); // default
  assert.equal(bundle.app, "sheets");
  assert.equal(bundle.pickerType, "fill");
  assert.match(bundle.suspectResolver, /hexInput|okButton/); // from default stage "apply"
  assert.equal(bundle.contractVersion, "2026-05-29");
  assert.equal(bundle.at, AT);
});
