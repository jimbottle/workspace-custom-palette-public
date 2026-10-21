/**
 * Proposer seam for automated remediation. Given the diagnostic bundle from a
 * failing monitor run (the picker outerHTML, the failed stage, the suspect
 * resolver) plus the current broken contract, a proposer returns a CANDIDATE
 * contract with corrected selectors — or null if it can't.
 *
 * This is the genuinely-AI step. The deterministic, safe half (verify a
 * candidate against live Google, publish on green) lives in remediate.ts and
 * works today with a human-authored candidate. An LLM proposer plugs in here.
 *
 * A real implementation would prompt a model with, roughly:
 *   "Google changed this color picker. Here is the live popup outerHTML: <...>.
 *    Our selector `<suspectResolver>` no longer matches. Here is the current
 *    contract: <selectors.json>. Return a corrected contract (same shape) whose
 *    selectors match this DOM."
 * then return the parsed JSON. It must stay shape-valid (remediate re-validates)
 * and never widen host permissions or change anything but selectors.
 *
 * Not wired to a live model here: that needs an API key + a real captured break
 * to exercise, and would be untested in CI. The interface is the contract.
 */

/** @typedef {{ id: string, stage: string, suspectResolver: string, pickerOuterHtml: string | null }} DiagnosticBundle */
export interface ProposerInput {
  bundles: Array<{ id: string; stage: string; suspectResolver: string; pickerOuterHtml: string | null }>;
  currentContract: unknown;
}

export interface Proposer {
  /** Return a candidate contract, or null if no confident proposal. */
  propose(input: ProposerInput): Promise<unknown | null>;
}

/**
 * Default proposer: makes no automatic proposal (returns null). Replace with an
 * LLM-backed implementation per the module docstring. Until then, remediation is
 * human-in-the-loop: read the GitHub issue's bundle, author a candidate
 * selectors.json, and run `npm run remediate -- <candidate>`.
 */
export const noopProposer: Proposer = {
  async propose() {
    return null;
  },
};
