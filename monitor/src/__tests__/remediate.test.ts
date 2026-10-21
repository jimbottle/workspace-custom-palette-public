/**
 * Unit tests for the pure / file-swap seams of remediate.ts. The live matrix
 * (runMatrixOnce/verifyCandidate body) is exercised by the synthetic monitor,
 * not here; these pin the safety guard, the exit-code mapping, the restore
 * behavior, and that the contract validator is the shared one.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  readConfigBase,
  assertPackagedOnly,
  exitCodeForResolution,
  withSwappedContract,
} from "../remediate.ts";
import { isValidContract } from "../../../lib/config.js";

test("readConfigBase: parses the endpoints.js literal (double, single, empty)", () => {
  assert.equal(readConfigBase('export const CONFIG_BASE = "";'), "");
  assert.equal(readConfigBase('export const CONFIG_BASE = "http://localhost:8787";'), "http://localhost:8787");
  assert.equal(readConfigBase("export const CONFIG_BASE = 'https://cfg.example';"), "https://cfg.example");
  assert.equal(readConfigBase("// nothing here"), "");
});

test("assertPackagedOnly: no-op when CONFIG_BASE is empty, throws otherwise", () => {
  assert.doesNotThrow(() => assertPackagedOnly(""));
  assert.throws(() => assertPackagedOnly("http://localhost:8787"), /packaged-only/);
});

test("exitCodeForResolution: already-green is success (0), no-candidate is failure (1)", () => {
  assert.equal(exitCodeForResolution("already-green"), 0);
  assert.equal(exitCodeForResolution("no-candidate"), 1);
});

test("withSwappedContract: swaps during fn, restores original, removes backup on success", async () => {
  const dir = mkdtempSync(join(tmpdir(), "remediate-"));
  const path = join(dir, "selectors.default.json");
  try {
    writeFileSync(path, JSON.stringify({ version: "ORIGINAL" }));
    const candidate = { version: "CANDIDATE" };
    let seen = "";
    const ret = await withSwappedContract(path, candidate, async () => {
      seen = JSON.parse(readFileSync(path, "utf8")).version;
      return "result";
    });
    assert.equal(ret, "result");
    assert.equal(seen, "CANDIDATE", "fn sees the candidate swapped in");
    assert.equal(JSON.parse(readFileSync(path, "utf8")).version, "ORIGINAL", "original restored");
    assert.equal(existsSync(`${path}.remediate-backup`), false, "backup removed");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withSwappedContract: restores original even when fn throws", async () => {
  const dir = mkdtempSync(join(tmpdir(), "remediate-"));
  const path = join(dir, "selectors.default.json");
  try {
    writeFileSync(path, JSON.stringify({ version: "ORIGINAL" }));
    await assert.rejects(
      withSwappedContract(path, { version: "CANDIDATE" }, async () => {
        throw new Error("matrix blew up");
      }),
      /matrix blew up/,
    );
    assert.equal(JSON.parse(readFileSync(path, "utf8")).version, "ORIGINAL", "original restored after throw");
    assert.equal(existsSync(`${path}.remediate-backup`), false, "backup removed after throw");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("withSwappedContract: restores original on SIGINT (hard interrupt)", async () => {
  const dir = mkdtempSync(join(tmpdir(), "remediate-"));
  const path = join(dir, "selectors.default.json");
  const realExit = process.exit;
  let exitCode: number | undefined;
  // Stub process.exit so the signal handler doesn't tear down the test process.
  process.exit = ((code?: number): never => { exitCode = code; return undefined as never; }) as typeof process.exit;
  try {
    writeFileSync(path, JSON.stringify({ version: "ORIGINAL" }));
    await withSwappedContract(path, { version: "CANDIDATE" }, async () => {
      assert.equal(JSON.parse(readFileSync(path, "utf8")).version, "CANDIDATE", "swapped in during fn");
      // Fire the interrupt handler withSwappedContract registered.
      const listeners = process.listeners("SIGINT");
      const onSignal = listeners[listeners.length - 1];
      if (!onSignal) throw new Error("no SIGINT listener registered");
      onSignal("SIGINT");
      assert.equal(JSON.parse(readFileSync(path, "utf8")).version, "ORIGINAL", "restored on signal");
      assert.equal(existsSync(`${path}.remediate-backup`), false, "backup removed on signal");
    });
    assert.equal(exitCode, 130, "signal handler requested exit(130)");
  } finally {
    process.exit = realExit;
    rmSync(dir, { recursive: true, force: true });
  }
});

test("isValidContract: remediate uses the SHARED extension validator", () => {
  // Spot-check the wired-in validator agrees with the extension's rule.
  const shared = { customColorButton: "a", hexInput: "b", okButton: "c" };
  const contract = (pickers: unknown) => ({ version: "2026-01-01", shared, apps: { docs: { pickers } } });
  assert.equal(isValidContract({}), false);
  assert.equal(isValidContract(contract({ fill: { toolbarButton: "#b", popupRoot: ".m" } })), true);

  // A picker with no popupRoot cannot be found at all, so it is rejected
  // rather than published — the remediator would otherwise ship a contract
  // that silently stops injecting.
  assert.equal(isValidContract(contract({ fill: {} })), false);
  assert.equal(isValidContract(contract({ fill: { toolbarButton: "#b" } })), false);

  // toolbarButton is optional ONLY for a picker that declares its own widget
  // (the Sheets dropdown chip). Without either, the entry is a truncated publish.
  assert.equal(isValidContract(contract({ chip: { popupRoot: ".m" } })), false);
  assert.equal(
    isValidContract(contract({ chip: { popupRoot: ".m", overrides: { customColorButton: ".c", tabIndex: 1 } } })),
    true,
  );
  // A non-string selector in an overrides block reaches querySelectorAll as
  // `undefined` and throws mid-apply, so it must never replace a working contract.
  assert.equal(isValidContract(contract({ chip: { popupRoot: ".m", overrides: { customColorButton: 7 } } })), false);
  assert.equal(isValidContract(contract({ chip: { popupRoot: ".m", overrides: { tabIndex: "1" } } })), false);
});
