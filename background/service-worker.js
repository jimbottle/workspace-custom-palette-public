/**
 * Background service worker. Refreshes remote selector/palette config into
 * chrome.storage.local on a schedule (chrome.alarms) and at startup, so a remote
 * fix propagates to content scripts on their next load. No DOM access; no
 * telemetry (architecture commitment: the extension sends no user data — the
 * only network call here is a read-only GET of config).
 *
 * When CONFIG_BASE is empty (default), remote config is disabled and clients run
 * on packaged defaults — see config/endpoints.js.
 */

import { CONFIG_BASE, REFRESH_PERIOD_MINUTES } from "../config/endpoints.js";
import { isValidContract, remoteSwatches, orgSwatches } from "../lib/config.js";
import { appendError, normalizeErrorBuffer } from "../lib/error-buffer.js";
import {
  setCachedConfig, clearCachedConfig, getCachedConfig,
  getErrorBuffer, setErrorBuffer, setUpdateNoteVersion,
  applyEnforcementPush, applyOrgDefaultPush, getManagedPolicy, getManagedPolicyWithin, getPaletteState,
  onManagedChanged, runStartupMigrations,
} from "../lib/storage.js";
import { versionToNote } from "../lib/update-note.js";
import { resolveEffectivePalette, resolveActiveUserPalette } from "../lib/palette.js";
import { topHexes, stripeBands, ICON_STRIPES } from "../lib/icon.js";
import { openFeedbackPage } from "../shared/open-feedback.js";

// Dev-only hot reload (`npm run dev`). Excluded from the packaged zip, so this
// import is a harmless no-op in a Web Store install.
import("./dev-reload.js").catch(() => {});

const ALARM = "refresh-config";

// ---- Background error surfacing (feedback standard) -------------------------
// A worker error has no UI of its own, so record it into the errorBuffer in
// chrome.storage.session; the popup/options drain it into a local notice with
// a "Report this" link on their next open. Local surfacing only — nothing is
// ever sent anywhere (no-telemetry commitment).

/** @param {unknown} message */
async function recordWorkerError(message) {
  try {
    const buffer = normalizeErrorBuffer(await getErrorBuffer());
    await setErrorBuffer(appendError(buffer, { message, at: Date.now() }));
  } catch {
    // The error path must never itself throw (and re-enter these listeners).
  }
}

self.addEventListener("error", (e) => {
  console.warn("[brand-palette] worker error", e.message);
  recordWorkerError(e.message || /** @type {any} */ (e).error?.message);
});
self.addEventListener("unhandledrejection", (e) => {
  const reason = /** @type {any} */ (e).reason;
  console.warn("[brand-palette] worker unhandled rejection", reason);
  recordWorkerError(reason?.message ?? reason);
});

/** GET + parse JSON, or null on any failure (network, non-2xx, bad JSON). */
async function fetchJsonSafe(/** @type {string} */ url) {
  try {
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * Fetch both config docs and cache only the ones that came back valid, so a
 * partial/failed fetch never clobbers a previously-good cache or the packaged
 * fallback.
 */
async function refreshConfig() {
  if (!CONFIG_BASE) {
    // Remote config disabled: drop any stale cache so clients revert to the
    // packaged defaults rather than a previously-cached (possibly stale) remote.
    await clearCachedConfig();
    return;
  }
  const [selectors, palette] = await Promise.all([
    fetchJsonSafe(`${CONFIG_BASE}/config/selectors`),
    fetchJsonSafe(`${CONFIG_BASE}/config/palette`),
  ]);
  /** @type {{ selectors?: unknown, palette?: unknown }} */
  const patch = {};
  if (isValidContract(selectors)) patch.selectors = selectors; // never cache a garbage contract
  // Symmetric with selectors: only cache a palette that has a usable swatch
  // array, so a garbage publish can't clobber a good cached team palette.
  if (remoteSwatches(palette) !== null) patch.palette = palette;
  if (patch.selectors !== undefined || patch.palette !== undefined) {
    await setCachedConfig(patch);
  }
}

/**
 * Paint `hexes` as vertical stripes on a square OffscreenCanvas and return its
 * ImageData (MV3 service workers have no DOM, but OffscreenCanvas works here).
 * @param {string[]} hexes
 * @param {number} size
 * @returns {ImageData | null}
 */
function paletteImageData(hexes, size) {
  const ctx = new OffscreenCanvas(size, size).getContext("2d");
  if (!ctx) return null;
  const bands = stripeBands(hexes.length, size);
  bands.forEach((b, i) => {
    ctx.fillStyle = /** @type {string} */ (hexes[i]);
    ctx.fillRect(b.x, 0, b.w, size);
  });
  return ctx.getImageData(0, 0, size, size);
}

/**
 * Repaint the toolbar action icon from the effective palette's leading colors,
 * resolved exactly like the picker row: remote team palette -> ACTIVE user
 * palette -> org policy (which outranks under a lock) -> packaged default, with
 * the pointer deciding which user palette leads. Resolving from the legacy
 * mirror alone kept painting whatever palette was active at startup, so the
 * icon lagged a switch made in the popup or options page (field, 2026-08-23).
 *
 * The policy read uses the prompt half of getManagedPolicyWithin: the icon is
 * cosmetic, so an untimed managed read that never answers must not stall every
 * later repaint behind it. A deadline miss paints without the org tier once,
 * then the settled answer corrects it if it disagreed.
 *
 * Toolbar icon only — manifest.icons (the extensions page + Web Store listing)
 * is static and can't change at runtime. Non-fatal: any failure just leaves the
 * packaged icon in place.
 */
async function renderActionIcon() {
  try {
    const defaultsDoc = await fetchJsonSafe(chrome.runtime.getURL("config/palette.default.json"));
    const [cached, state] = await Promise.all([getCachedConfig(), getPaletteState()]);
    const remote = remoteSwatches(cached.palette);
    /** @param {{ palette: unknown, palettes: unknown, locked: boolean }} policy */
    async function paint(policy) {
      const palette = resolveEffectivePalette({
        remote,
        user: resolveActiveUserPalette(state) ?? undefined,
        // The pointer picks WHICH org palette when an admin published several;
        // without it the icon paints the first one regardless of the selection.
        managed: orgSwatches(policy, state.activePaletteId),
        locked: !!policy.locked,
        activePaletteId: state.activePaletteId,
        defaults: defaultsDoc?.swatches,
      });
      const hexes = topHexes(palette, ICON_STRIPES);
      if (hexes.length === 0) return; // nothing to draw — keep the manifest icon
      /** @type {Record<number, ImageData>} */
      const imageData = {};
      for (const size of [16, 32]) {
        const img = paletteImageData(hexes, size);
        if (img) imageData[size] = img;
      }
      if (Object.keys(imageData).length) await chrome.action.setIcon({ imageData });
    }
    const { prompt, settled } = getManagedPolicyWithin();
    const first = await prompt;
    await paint(first.value);
    if (first.timedOut) {
      // The untimed read may name an org palette the quick paint missed.
      settled.then(paint).catch(() => {}); // idempotent when they agree
    }
  } catch {
    // Drawing/setIcon is best-effort polish; never let it break the worker.
  }
}

chrome.runtime.onInstalled.addListener((details) => {
  chrome.alarms.create(ALARM, { periodInMinutes: REFRESH_PERIOD_MINUTES });
  // Move a pre-multi-palette account onto the collection shape. Done HERE and
  // not on a read path because it is a write, and the popup and options pages
  // read during init, where a surprise write would interleave with the policy
  // machinery. Reads stay shape-tolerant regardless, so this running late is a
  // tidiness problem, never a correctness one.
  migratePalettes();
  pushEnforcedPalette();
  refreshConfig();
  renderActionIcon();
  noteUpdate(details);
});

/**
 * One-time post-update notice: when the version we just updated TO has an entry
 * in lib/update-note.js, store it for the popup's banner slot and put a small
 * badge on the toolbar icon so users who never open the popup still see that
 * something changed. The popup clears the badge on open and the flag on
 * dismiss. Fresh installs get the intro instead (versionToNote gates on
 * reason === "update"). Best-effort — never let notice plumbing break install.
 * @param {{ reason?: string }} details
 */
async function noteUpdate(details) {
  try {
    const version = versionToNote(details?.reason, chrome.runtime.getManifest().version);
    if (!version) return;
    await setUpdateNoteVersion(version);
    await chrome.action.setBadgeBackgroundColor({ color: "#4C8AEC" });
    await chrome.action.setBadgeText({ text: "NEW" });
  } catch {
    // Notice is polish; a failure here must not affect the update itself.
  }
}
/**
 * Run the palette-shape migration, best-effort. A failure is recoverable: every
 * read resolves both shapes, so the worst case is the account keeps being read
 * through the legacy key until the next start.
 */
/**
 * Make the organization's palette active when enforcement begins. Best-effort:
 * a failure leaves the marker unset, so the next start tries again rather than
 * silently skipping the push.
 *
 * This deliberately does NOT seed a personal palette beside the org's. It used
 * to materialize a Default from the packaged colors whenever an org palette was
 * in play ("a personal made by default", so the switcher always had two
 * entries), but that contradicts how org-only should read on screen (owner
 * ruling, 2026-08-23): org colors REPLACE the default palette, and a personal
 * editable palette appears only when the user opts into Multiple palettes.
 * Seeding also misrendered UNLOCKED installs — the phantom Default sat above
 * the user tier while the user's pointer still named the org palette, so the
 * picker showed packaged colors where the admin's were meant to show
 * (TESTING-0.2.0 C2).
 */
async function pushEnforcedPalette() {
  try {
    const policy = await getManagedPolicy();
    // No pointer needed here: both plans only ask whether an org palette
    // EXISTS, never which one is selected.
    const managed = orgSwatches(policy);
    await applyEnforcementPush({ locked: policy.locked, managed });
    // The unlocked counterpart (bd workspace-custom-palette-kyy): an org
    // palette appearing should be what staff land on, unless the palette it
    // would displace was actually theirs. Runs after the enforcement push and
    // is a no-op while locked, so the two episodes never fight over the
    // pointer. Defaults are read here rather than plumbed through the policy
    // because "never customized" is defined against the packaged palette.
    const defaultsDoc = await fetchJsonSafe(chrome.runtime.getURL("config/palette.default.json"));
    await applyOrgDefaultPush({ locked: policy.locked, managed }, defaultsDoc?.swatches ?? []);
  } catch {
    // Never let policy plumbing break install, startup, or a policy change.
  }
}

// An admin turning enforcement on while the browser is running is the common
// case, not an edge one — waiting for a restart would leave staff on their own
// colours for the rest of the day.
//
// The icon has to repaint here too, and the storage listener below cannot do
// it: a user sitting ON the org palette has pointer "org" and an EMPTY mirror,
// so an admin swapping the published colors changes nothing in sync or local
// and fires none of the events that listener watches. The toolbar icon then
// keeps wearing the previous org palette indefinitely (field, 2026-08-25:
// the policy moved to Org Blue / Org Green and the icon stayed on Poppy /
// Sunshine). Awaiting the push first so the repaint reads post-push state.
onManagedChanged(() => { pushEnforcedPalette().then(renderActionIcon); });

// Both migrations, each isolated from the other, enabled-repair first. The
// composition lives in lib/storage.js so it can be unit-tested; it used to be
// a shared try block here, where a throwing palette migration silently skipped
// the only rescue for an `enabled: false` profile (bd
// `workspace-custom-palette-7se`).
const migratePalettes = runStartupMigrations;

chrome.runtime.onStartup.addListener(() => {
  migratePalettes(); // an older machine may have written the legacy key since
  pushEnforcedPalette();
  refreshConfig();
  renderActionIcon(); // the icon resets to the manifest default across restarts
});
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM) refreshConfig();
});

// Repaint when the palette the icon reflects changes: the user's edits landing
// in the active palette (sync "palette"), a palette SWITCH moving the pointer
// (sync "activePaletteId" — the icon follows it like the picker row does), or a
// refreshed/cleared remote team palette (local "cachedPalette").
// setCachedConfig/clearCachedConfig both fire that last one.
chrome.storage.onChanged.addListener((changes, area) => {
  if ((area === "sync" && (changes.palette || changes.activePaletteId)) ||
      (area === "local" && changes.cachedPalette)) {
    renderActionIcon();
  }
});

// Content scripts can't open a tab directly; the in-page "Report this" banner
// asks us to open the feedback page (?type=bug). This is the only thing that
// happens on report — nothing is sent until the user composes in that page.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.action === "openFeedback") openFeedbackPage(msg.type);
});
