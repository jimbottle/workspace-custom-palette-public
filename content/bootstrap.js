/**
 * bootstrap — the ESM content-script entry. Resolves the active selector
 * contract and the effective palette, then starts the picker observer.
 *
 * Config sources, highest priority first:
 *   - selectors: remote-cached (chrome.storage.local, refreshed by the service
 *     worker) → packaged default. A garbage/absent cache falls back cleanly.
 *   - palette: remote team palette (cached) → user override (storage.sync) →
 *     enterprise managed policy (storage.managed, set by a Workspace admin) →
 *     packaged default.
 * User edits + the enabled toggle are re-read live via onSettingsChanged, and an
 * admin policy update via onManagedChanged, so both apply on the next picker
 * open with no reload.
 */

import { loadContract, resolveApp } from "./dom-contract.js";
import { observePickers, refreshBrandRows } from "./picker-observer.js";
import { planSettingsChange } from "./settings-plan.js";
import { installContentErrorListener } from "./health-probe.js";
import { resolveEffectivePalette, resolveActiveUserPalette } from "../lib/palette.js";
import { pickContract, remoteSwatches, orgSwatches } from "../lib/config.js";
import {
  getPaletteState, getEnabled, getCachedConfig, getManagedPolicy,
  onSettingsChanged, onManagedChanged,
} from "../lib/storage.js";

/** @param {string} path @returns {Promise<any>} */
async function fetchJson(path) {
  const res = await fetch(chrome.runtime.getURL(path));
  return res.json();
}

async function main() {
  if (!resolveApp(location)) return; // not a targeted Google editor surface

  // Surface our own runtime errors locally (filtered to our scripts); nothing
  // is auto-sent — the banner only offers a "Report this" link.
  installContentErrorListener(window);

  // NOTE the absentee: getManagedPolicy() is deliberately NOT awaited here.
  // Enterprise policy is an optional extra that only a managed install has, and
  // it is read from the platform's policy provider — so awaiting it puts the
  // entire Brand row behind a call that can be slow or, on a machine with no
  // policy configured, never answer at all. That failure is silent and total:
  // observePickers() below would never run, with no error and no health banner.
  // Start on what we can read reliably; fold the org palette in when it lands.
  const [packagedContract, packagedPaletteDoc, cached, paletteState, enabledInit] = await Promise.all([
    fetchJson("config/selectors.default.json"),
    fetchJson("config/palette.default.json"),
    getCachedConfig(),
    getPaletteState(),
    getEnabled(),
  ]);

  // Selectors: remote-cached if valid, else packaged.
  loadContract(pickContract(cached.selectors, packagedContract));

  const defaults = packagedPaletteDoc.swatches ?? [];
  const remote = remoteSwatches(cached.palette); // central team palette, if published
  // The ACTIVE POINTER travels with the user tier into every resolution below.
  // It cannot be derived from the mirror: a locked user who switched to a
  // palette of their own is distinguished from one still on the org's only by
  // the pointer, and resolveActivePaletteId defaults an ABSENT pointer to the
  // org under a lock — so omitting it here pinned a locked switcher-user to the
  // org palette in every open tab (field, 2026-08-23, TESTING-0.2.0 B4/B5/D2).
  let activeId = paletteState.activePaletteId;
  let user = resolveActiveUserPalette(paletteState) ?? undefined;
  /** @type {unknown[] | null} org default set by a Workspace admin; filled in below */
  let managed = null;
  /**
   * The raw policy the org palette above was derived from, kept so `managed`
   * can be RE-derived when the pointer moves. An admin may publish several
   * named palettes and the pointer decides which is in force, so a cached
   * `managed` is only correct for the pointer it was computed with - switching
   * between two org palettes moved the pointer and left this tab rendering the
   * previous one (field, 2026-08-24).
   * @type {{ palette?: unknown, palettes?: unknown } | null}
   */
  let policyRaw = null;
  /** True when the admin ENFORCES that palette (paletteLocked), so it outranks the user's. */
  let locked = false;
  let enabled = enabledInit;
  let palette = resolveEffectivePalette({ remote, user, managed, defaults, locked, activePaletteId: activeId });

  const getPalette = () => (enabled ? palette : []);

  // Re-derive the user tier from full storage state. The change event's mirror
  // value would do for the swatches themselves, but only a re-read also picks up
  // which palette the pointer names - and both hosts may have moved it.
  let stateRead = 0;
  async function refreshUserTier() {
    const seq = ++stateRead;
    const state = await getPaletteState();
    if (seq !== stateRead) return; // a newer change superseded this read
    activeId = state.activePaletteId;
    user = resolveActiveUserPalette(state) ?? undefined;
    // Re-derive the ORG tier too: the pointer that just moved may name a
    // different one of the admin's palettes.
    if (policyRaw) managed = orgSwatches(policyRaw, activeId);
    palette = resolveEffectivePalette({ remote, user, managed, defaults, locked, activePaletteId: activeId });
    refreshBrandRows(getPalette, document);
  }

  onSettingsChanged((change) => {
    // The decision is in content/settings-plan.js so it can be tested; the side
    // effects stay here, where the tier state lives. Google reuses/caches the
    // color menu, so an already-open or cached picker is updated now rather
    // than waiting for a full page reload — but only when the palette or
    // enabled state actually changed, since a needless teardown/rebuild wastes
    // work and widens the surface for apply bugs.
    const plan = planSettingsChange(change);
    if (plan.rereadUserTier) refreshUserTier(); // refreshes rows itself once its read lands
    if (plan.enabled !== null) enabled = plan.enabled;
    if (plan.refreshRowsNow) refreshBrandRows(getPalette, document);
  });

  // An admin publishing or editing the org palette applies the same way a user
  // edit does — no browser restart, no page reload. Only visible when the user
  // has no override of their own (managed sits below the user tier).
  // Set once the policy value in `managed` came from an admin change rather than
  // the initial read. The initial read is issued AFTER this listener is
  // installed, so without this flag a policy edit landing mid-read is undone by
  // the older in-flight answer resolving last — pinning the tab to a stale org
  // palette (or resurrecting one the admin just removed) until the next change.
  let policyApplied = false;
  onManagedChanged((rawPalette, policy) => {
    policyApplied = true;
    // The whole policy, not `rawPalette`: an admin may publish several named
    // palettes under `palettes`, and orgSwatches resolves either shape. The
    // POINTER decides WHICH of them; without it this tab shows the first org
    // palette whatever the user selected (field, 2026-08-24).
    policyRaw = policy;
    managed = orgSwatches(policy, activeId);
    // A lock toggled on its own changes no palette but changes which palette
    // WINS, so it has to be picked up here too or enforcement would wait for a
    // page reload.
    locked = !!policy?.locked;
    palette = resolveEffectivePalette({
      remote, user, managed, defaults, locked, activePaletteId: activeId,
    });
    refreshBrandRows(getPalette, document);
  });

  // Re-read on every picker open: toggling enabled / editing the palette applies
  // immediately. Disabled => inject nothing.
  observePickers(getPalette, document);

  // Now that the row is live, fold in the org palette if this is a managed
  // install. Deliberately after observePickers and unawaited (see above): a
  // policy read that stalls must cost us the org DEFAULT, never the feature.
  // Untimed on purpose: nothing awaits this, so a hanging read costs nothing,
  // while a capped one turned "slow" into "never" — the handler below would
  // early-return on the undefined and this tab would show no org palette for
  // its whole life, since onManagedChanged only fires on a later policy EDIT.
  getManagedPolicy()
    .then((/** @type {{palette: unknown, palettes: unknown, locked: boolean}} */ policy) => {
      if (policyApplied) return; // an admin change already won; never regress to the older read
      const next = orgSwatches(policy, activeId);
      if (next.length === 0) return; // no policy — the common case
      policyRaw = policy;
      managed = next;
      locked = policy.locked;
      palette = resolveEffectivePalette({
        remote, user, managed, defaults, locked, activePaletteId: activeId,
      });
      // A picker may already be open/cached from before the policy arrived.
      refreshBrandRows(getPalette, document);
    })
    .catch(() => {}); // never surface: policy is optional by definition
}

main().catch((err) => console.error("[brand-palette] bootstrap error", err));
