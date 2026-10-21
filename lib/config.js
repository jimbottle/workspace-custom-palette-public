/**
 * Pure config-resolution logic — no DOM, no chrome.*. The service worker caches
 * remote config into chrome.storage.local; the content bootstrap then picks
 * between the cached copy and the packaged default using these helpers. Keeping
 * the choice pure means the "prefer remote, fall back to packaged" rule is
 * unit-tested without a browser or a server.
 *
 * @typedef {import("../content/dom-contract.js").Contract} Contract
 */

import { normalizeOrgPalettes, orgPaletteSwatches } from "./palette.js";

/**
 * Shape-check a parsed selectors contract. Defensive: a malformed remote publish
 * must never replace a working packaged contract. Requires a version string,
 * a shared selector object, and at least one app with at least one picker.
 * @param {unknown} c
 * @returns {boolean}
 */
export function isValidContract(c) {
  if (!c || typeof c !== "object") return false;
  const obj = /** @type {any} */ (c);
  if (typeof obj.version !== "string") return false;
  if (!obj.shared || typeof obj.shared !== "object") return false;
  if (!obj.shared.customColorButton || !obj.shared.hexInput || !obj.shared.okButton) return false;
  if (!obj.apps || typeof obj.apps !== "object") return false;
  const apps = Object.values(obj.apps);
  if (apps.length === 0) return false;
  return apps.every((a) => {
    const pickers = a && typeof a === "object" ? /** @type {any} */ (a).pickers : null;
    if (!pickers || Object.keys(pickers).length === 0) return false;
    return Object.values(pickers).every(isValidPicker);
  });
}

/**
 * Shape-check one picker entry. `popupRoot` is required — without it injection
 * cannot find the picker at all. `toolbarButton` is optional (a picker opened
 * from a side panel has none), but a picker with neither a toolbar button nor
 * an `overrides` block is almost certainly a truncated publish rather than a
 * deliberate one, so it is rejected.
 *
 * `overrides` is where a picker declares a DIFFERENT custom-colour widget (see
 * dom-contract customColorVariants). It is validated rather than trusted: a
 * non-string selector there resolves to `undefined` inside querySelectorAll,
 * which throws mid-apply instead of falling back to the packaged contract.
 * @param {unknown} p
 * @returns {boolean}
 */
function isValidPicker(p) {
  if (!p || typeof p !== "object") return false;
  const o = /** @type {any} */ (p);
  if (typeof o.popupRoot !== "string" || !o.popupRoot) return false;
  if (o.toolbarButton !== undefined && typeof o.toolbarButton !== "string") return false;
  if (o.overrides === undefined) return !!o.toolbarButton;
  if (!o.overrides || typeof o.overrides !== "object") return false;
  for (const [k, v] of Object.entries(o.overrides)) {
    const wantNumber = k === "tabIndex";
    if (wantNumber ? !Number.isInteger(v) : typeof v !== "string" || !v) return false;
  }
  return true;
}

/**
 * Choose the active selector contract: the cached remote copy when it is a valid
 * contract AND not older than the packaged default, otherwise the packaged copy.
 * This makes a remote selector fix propagate on next refresh, while an
 * unreachable/garbage server falls back cleanly — and a newer packaged default
 * (shipped in an extension update) can still override a stale cached contract.
 * Versions are compared as strings; the contract `version` is an ISO date
 * ("YYYY-MM-DD"), which orders correctly lexicographically.
 * @param {unknown} cached    parsed chrome.storage.local copy (may be undefined/garbage)
 * @param {Contract} packaged the bundled selectors.default.json
 * @returns {Contract}
 */
export function pickContract(cached, packaged) {
  if (!isValidContract(cached)) return packaged;
  const c = /** @type {Contract} */ (cached);
  if (typeof packaged?.version === "string" && packaged.version > c.version) return packaged;
  return c;
}

/**
 * Extract the swatch array from a remote palette document, or null if it isn't a
 * usable palette doc. The caller (palette.resolveEffectivePalette) decides the
 * tiering; this only unwraps + guards the remote shape.
 * @param {unknown} cachedPaletteDoc  parsed { version?, swatches: [...] } or undefined
 * @returns {unknown[] | null}
 */
export function remoteSwatches(cachedPaletteDoc) {
  if (!cachedPaletteDoc || typeof cachedPaletteDoc !== "object") return null;
  const swatches = /** @type {any} */ (cachedPaletteDoc).swatches;
  return Array.isArray(swatches) ? swatches : null;
}

/**
 * Extract the swatch array from an enterprise managed-policy value, or null.
 *
 * Tolerates BOTH shapes an admin's policy can arrive in: the plain array Chrome
 * normally delivers, and a `{ "Value": [...] }` wrapper. Google Admin Console
 * authors per-policy JSON in the `{"policyName": {"Value": ...}}` form, and
 * while Chrome unwraps it before handing values to the extension, the failure
 * mode if it ever doesn't is silent (an admin pastes a palette and nothing
 * happens, with no error anywhere). Accepting both costs three lines and
 * removes a support dead end we cannot reproduce without a managed device.
 * @param {unknown} policyValue  the raw chrome.storage.managed "palette" value
 * @returns {unknown[] | null}
 */
/**
 * The organization's palettes from a whole managed policy, unwrapped and
 * normalized. The single entry point for "what has the admin published",
 * so no caller has to know that two policy shapes exist.
 * @param {{ palette?: unknown, palettes?: unknown } | null | undefined} policy
 * @returns {{ id: string, name: string, swatches: {name:string,hex:string,order:number}[] }[]}
 */
export function orgPalettes(policy) {
  return normalizeOrgPalettes({
    // One unwrapper for both keys: the {"Value": ...} envelope is a property
    // of how Chrome delivers policy, not of what the value means.
    palettes: managedSwatches(policy?.palettes),
    palette: managedSwatches(policy?.palette),
  });
}

/**
 * The organization palette in effect, as a flat swatch list — what every
 * caller wants until the switcher lets a user pick a different one.
 * @param {{ palette?: unknown, palettes?: unknown } | null | undefined} policy
 * @param {unknown} [activePaletteId]
 * @returns {{name:string,hex:string,order:number}[]}
 */
export function orgSwatches(policy, activePaletteId) {
  return orgPaletteSwatches(orgPalettes(policy), activePaletteId);
}

/**
 * Unwrap the Admin console envelope around a policy array. Shared by both
 * policy shapes because the envelope is a property of how Chrome delivers
 * policy, not of what the value means.
 * @param {unknown} policyValue
 * @returns {unknown[] | null}
 */
export function managedSwatches(policyValue) {
  if (Array.isArray(policyValue)) return policyValue;
  if (!policyValue || typeof policyValue !== "object") return null;
  const wrapped = /** @type {any} */ (policyValue).Value;
  return Array.isArray(wrapped) ? wrapped : null;
}
