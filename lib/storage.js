/**
 * Thin chrome.storage.sync wrapper for user settings. DOM/logic-free glue (not
 * unit-tested in Node — the pure palette transforms live in palette.js). Two
 * keys only:
 *   - "palette": the user's swatch overrides (array of {name,hex,order}); absent
 *     means "use the packaged/remote default".
 *   - "enabled": master on/off toggle (default true).
 *
 * sync (not local) so a user's palette and toggle follow them across machines.
 *
 * @typedef {{ name: string, hex: string, order: number }} Swatch
 */

import { normalizePalette, normalizePalettes, resolveActiveUserPalette, planPaletteMigration, planEnforcementPush, planOrgDefaultPush, paletteKey, LEGACY_PALETTE_ID, LEGACY_PALETTE_NAME, OWN_PALETTE_NAME, NO_ACTIVE_PALETTE_ID, hasStoredPalettes, rawPaletteId, isOrgPaletteId, MAX_PALETTES, MAX_SWATCHES } from "./palette.js";

const KEY_PALETTE = "palette";
// Multi-palette (workspace-custom-palette-dfg). `palettes` is the collection,
// `activePaletteId` points at the one in effect. KEY_PALETTE is retained as a
// MIRROR of the active palette, not as a second source of truth: a machine
// still on an older build reads only that key, and leaving it stale would show
// that machine colors the user has since changed. Reads here prefer the
// collection, so the mirror can never win.
const KEY_PALETTES = "palettes";
const KEY_ACTIVE_PALETTE = "activePaletteId";
// Each palette gets its OWN sync item, `pal:<id>`, with `paletteOrder` holding
// the ids in order. chrome.storage.sync enforces QUOTA_BYTES_PER_ITEM = 8192,
// and a full palette (24 swatches, long names) serializes to roughly 1.6 KB —
// so a single shared key held five, while MAX_PALETTES advertises twelve. Per
// item the ceiling scales with one palette instead of the collection, and the
// outer limits (QUOTA_BYTES 102400, MAX_ITEMS 512) are far more generous.
//
// The id lives in the KEY, not the value. Storing it in both invites the two
// to disagree, and there is no honest way to resolve that; reads take the key
// as authoritative.
const KEY_PALETTE_PREFIX = "pal:";
const KEY_PALETTE_ORDER = "paletteOrder";
// Records that the CURRENT enforcement episode has already pushed the org
// palette as active. In `sync`, not `local`, deliberately: the push is a
// per-ACCOUNT event. Kept per-machine, a second machine would re-push and yank
// the user back off a palette they had just switched to on the first.
const KEY_ENFORCEMENT_PUSHED = "enforcementPushed";
// The parallel memory for an UNLOCKED org palette first appearing
// (bd workspace-custom-palette-kyy). Deliberately its own key rather than a
// second meaning for enforcementPushed: the two episodes overlap in time and
// must be able to fire independently, or a lock arriving after this one had
// already declined to move a customized user would never push them either.
// Absent means "no episode consumed yet", which is the correct reading for an
// existing install, so no migration is needed.
const KEY_ORG_DEFAULT_PUSHED = "orgDefaultPushed";
// The user's opt-in to multiple palettes. Off by default: someone with one
// palette sees exactly what ships today, no switcher and no extra concepts.
// In `sync` like the other user preferences, so opting in once covers every
// machine.
const KEY_MULTI_PALETTE = "multiPalette";

/** @param {string} id @returns {string} */
function paletteKeyFor(id) {
  return `${KEY_PALETTE_PREFIX}${id}`;
}

/**
 * Rebuild the collection from per-key items, in `paletteOrder`. Entries the
 * order does not mention still load, appended in key order, so a write that
 * landed without its index update is recovered rather than orphaned.
 * @param {Record<string, any>} all everything in sync
 * @returns {unknown[]}
 */
function collectionFromKeys(all) {
  const stored = new Map();
  for (const [k, v] of Object.entries(all)) {
    if (!k.startsWith(KEY_PALETTE_PREFIX) || !v || typeof v !== "object") continue;
    // The key is authoritative for the id, whatever the value claims.
    stored.set(k.slice(KEY_PALETTE_PREFIX.length), { ...v, id: k.slice(KEY_PALETTE_PREFIX.length) });
  }
  if (stored.size === 0) return [];
  const order = Array.isArray(all[KEY_PALETTE_ORDER]) ? all[KEY_PALETTE_ORDER] : [];
  /** @type {unknown[]} */
  const out = [];
  for (const id of order) {
    if (typeof id === "string" && stored.has(id)) { out.push(stored.get(id)); stored.delete(id); }
  }
  for (const leftover of stored.values()) out.push(leftover);
  return out;
}
// Enterprise policy only (chrome.storage.managed). When true AND a policy
// palette exists, the org palette is ENFORCED rather than merely defaulted.
const KEY_PALETTE_LOCKED = "paletteLocked";
// Enterprise policy only. Several NAMED org palettes, when one is not enough.
// Read alongside the legacy single `palette` key, never instead of it: existing
// deployments use that one and must keep working.
const KEY_MANAGED_PALETTES = "palettes";
const KEY_ENABLED = "enabled";
const KEY_THEME = "theme";
// One-time flag: has the popup's first-run intro been dismissed? In `sync` (like
// the other user settings) so dismissing it once clears it on every machine.
const KEY_INTRO_SEEN = "introSeen";
// Remote config cache lives in `local` (per-machine, not synced): the service
// worker refreshes it on a schedule; the content bootstrap reads it at startup.
const KEY_CACHED_SELECTORS = "cachedSelectors";
const KEY_CACHED_PALETTE = "cachedPalette";
// Popup undo/redo history is a local editing aid (per-machine, not synced).
const KEY_PALETTE_HISTORY = "paletteHistory";
// Background-worker error buffer (feedback standard): `session` so it clears
// when the browser closes — stale errors from a past session aren't news.
const KEY_ERROR_BUFFER = "errorBuffer";
// Rating-prompt bookkeeping (local: engagement is per-machine, and a synced
// prompt popping on a second machine after the first dismissed it would be rude).
const KEY_RATING = "ratingPrompt";
// Last inject/apply health result, written by the content script's health
// probe; the popup's rating gate reads it (never prompt while broken).
const KEY_LAST_HEALTH = "lastHealth";
// One-time post-update notice: the version we updated TO, when that version has
// an entry in lib/update-note.js. `local` (like the rating prompt): each
// machine updates on its own schedule, and a dismissal syncing across machines
// would hide the notice on a machine that hasn't seen it.
const KEY_UPDATE_NOTE = "updateNoteVersion";

/** @returns {Promise<Swatch[] | undefined>} the raw stored user palette, if any */
export async function getUserPalette() {
  const state = await getPaletteState();
  // null means nothing stored at all, which callers read as "no override", so
  // admin updates still reach this user. `[]` would say the opposite.
  return resolveActiveUserPalette(state) ?? undefined;
}

/**
 * Last known palette state, so a write does not have to read first.
 *
 * This exists for the popup's DISMISSAL FLUSH. That runs while the popup
 * context is being torn down, and a read-modify-write there loses the write:
 * the `get` is dispatched, the frame dies, and the `set` waiting on the
 * response is never issued. Before the collection existed the write was a
 * single `set` dispatched immediately, and it landed. Keeping a cache from the
 * read every host already performs at init restores that single hop.
 *
 * `raw` is the collection EXACTLY as stored, unnormalized. Writes splice into
 * it so that entries and fields this build does not understand survive a save.
 *
 * Invalidated by the storage listener below, because a page can stay open for
 * hours: without that, a stale cache written back would resurrect deleted
 * entries and clobber edits made to OTHER palettes elsewhere.
 * @type {{ raw: unknown, palettes: {id:string,name:string,swatches:Swatch[]}[], activePaletteId: string | undefined } | null}
 */
let cachedPaletteState = null;

// Any change to the collection that is not the one we just made leaves the
// cache describing a world that no longer exists.
try {
  chrome?.storage?.onChanged?.addListener?.((changes, area) => {
    if (area !== "sync" || !cachedPaletteState) return;
    if (!agreesWithCache(changes)) cachedPaletteState = null;
  });
} catch {
  // No onChanged (a bare test harness): the cache then behaves as it would
  // have without invalidation, and every caller still falls back to a read.
}

/**
 * Does a storage change agree with what the cache already believes?
 *
 * Chrome fires `onChanged` for the extension's OWN writes, so this cannot
 * simply invalidate on any touched key: every save would bust the cache it had
 * just filled, and the next write would fall back to a read. On the popup's
 * teardown flush that is the dropped-edit bug the cache exists to prevent.
 *
 * Rather than tracking which keys this instance wrote — bookkeeping that goes
 * stale the moment a write path is added — this asks whether the incoming
 * values match the model. The cache IS a model of storage: if the event says
 * what the model already says, the model is still good, whoever wrote it.
 * @param {Record<string, {oldValue?: unknown, newValue?: unknown}>} changes
 * @returns {boolean}
 */
function agreesWithCache(changes) {
  const cached = cachedPaletteState;
  if (!cached) return true; // nothing to protect
  const list = Array.isArray(cached.raw) ? cached.raw : [];
  const same = (/** @type {unknown} */ a, /** @type {unknown} */ b) =>
    JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const [key, change] of Object.entries(changes)) {
    if (key.startsWith(KEY_PALETTE_PREFIX)) {
      const id = key.slice(KEY_PALETTE_PREFIX.length);
      const entry = /** @type {any} */ (list.find((e) => rawPaletteId(e) === id));
      // Stored values carry no id: it lives in the key.
      const expected = entry ? (({ id: _drop, ...rest }) => rest)(entry) : undefined;
      if (!same(change?.newValue, expected)) return false;
    } else if (key === KEY_PALETTE_ORDER) {
      if (!same(change?.newValue, list.map((e) => rawPaletteId(e)).filter(Boolean))) return false;
    } else if (key === KEY_ACTIVE_PALETTE) {
      if (change?.newValue !== cached.activePaletteId) return false;
    } else if (key === KEY_PALETTES) {
      if (!same(change?.newValue, cached.raw)) return false;
    }
    // Anything else (the legacy mirror, enabled, theme) cannot make the
    // collection model wrong, so it is not this predicate's business.
  }
  return true;
}

/**
 * Everything the palette shape needs, read in ONE round trip.
 *
 * Deliberately does NOT write. Migration is a write, and this is called during
 * popup and options init, where a surprise write would interleave with the
 * policy machinery that took ten review rounds to get right. Reads stay
 * shape-tolerant instead, so a legacy key arriving from a machine on an older
 * build resolves correctly whether or not the migration has ever run.
 * @returns {Promise<{ raw: unknown, palettes: {id:string,name:string,swatches:Swatch[]}[], activePaletteId: string | undefined, palette: Swatch[] | undefined }>}
 */
export async function getPaletteState() {
  // Everything, in ONE round trip. The per-key shape means the ids are not
  // known until `paletteOrder` is read, and an index-then-fetch would be two
  // trips on a path the teardown flush cannot afford. Sync is small enough
  // (QUOTA_BYTES 102400) that reading all of it is cheaper than the extra hop.
  const got = await chrome.storage.sync.get(null);
  const activePaletteId = /** @type {string | undefined} */ (got[KEY_ACTIVE_PALETTE]);
  // Three shapes, in precedence order. Per-key is current; the single
  // `palettes` array is the interim shape this build briefly wrote and only a
  // dev profile can hold; `palette` is the shipped legacy single palette.
  const perKey = collectionFromKeys(got);
  const raw = perKey.length > 0 ? perKey : got[KEY_PALETTES];
  const state = {
    raw,
    palettes: normalizePalettes(raw, { keepId: activePaletteId }),
    activePaletteId,
    palette: /** @type {Swatch[] | undefined} */ (got[KEY_PALETTE]),
  };
  cachedPaletteState = { raw: state.raw, palettes: state.palettes, activePaletteId };
  return state;
}

/** The cache if it is warm, else a fresh read. @returns {Promise<{raw: unknown, palettes: {id:string,name:string,swatches:Swatch[]}[], activePaletteId: string | undefined}>} */
async function knownPaletteState() {
  return cachedPaletteState ?? await getPaletteState();
}

/**
 * Splice `swatches` into the entry `id` of the RAW stored collection.
 *
 * Writing the normalized view back instead would rebuild every entry as a bare
 * {id, name, swatches} — dropping fields and whole entries a newer build wrote,
 * and truncating past MAX_PALETTES. That is the same "rewrite the collection to
 * whatever this build understands" loss that the unattended migration path was
 * fixed for; an ordinary swatch edit must not do it either.
 * @param {unknown} raw @param {string} id @param {Swatch[]} swatches
 * @returns {unknown[] | null} null when the raw shape cannot carry the write
 */
function spliceRawPalettes(raw, id, swatches) {
  if (!Array.isArray(raw)) return null;
  let found = false;
  const next = raw.map((entry) => {
    // Same id rule the migration uses to decide whether the pointer dangles.
    if (rawPaletteId(entry) !== id) return entry;
    found = true;
    return { .../** @type {any} */ (entry), swatches };
  });
  return found ? next : null;
}

/**
 * Write `palette` into the ACTIVE entry, creating the collection if this is the
 * first write on a pre-multi-palette account.
 *
 * Single-hop whenever the state is already known — see cachedPaletteState for
 * why that matters on the popup's teardown path.
 * @param {Swatch[]} palette @returns {Promise<void>}
 */
export async function setUserPalette(palette) {
  const known = await knownPaletteState();
  const list = known.palettes;
  // A detached user who edits is re-attaching, so fall back to the first entry.
  // The same fallback also covers a pointer naming an entry this build cannot
  // parse. It MUST match resolveActiveUserPalette's, or the edit lands in a
  // palette the user was not looking at.
  const active = list.find((p) => p.id === known.activePaletteId) ?? list[0];
  const id = active?.id ?? LEGACY_PALETTE_ID;
  // Only used when this save CREATES the entry; an existing one keeps its own
  // name (spliceRawPalettes preserves it). "My colors" rather than "Default"
  // because what lands here is whatever the user just saved - most often a
  // detached copy of the ORG palette, which is not the extension's default by
  // any reading (field, 2026-08-25).
  const fresh = { id, name: OWN_PALETTE_NAME, swatches: palette };
  const spliced = spliceRawPalettes(known.raw, id, palette);
  let next;
  if (spliced) {
    next = spliced;
  } else if (hasStoredPalettes(known.raw)) {
    // A stored collection exists but this build could not find the target in
    // it — every entry may be in a shape a newer build wrote. APPEND; never
    // replace. Replacing here meant one ordinary swatch edit on the older
    // build permanently deleted every palette the newer build stored, on every
    // machine, which is the same loss the raw splice above exists to prevent.
    next = [...known.raw, fresh];
  } else if (list.length === 0) {
    next = [fresh];
  } else {
    next = list.map((p) => (p.id === id ? { ...p, swatches: palette } : p));
  }
  // Write ONLY the touched palette's own item, plus the index and the pointer.
  // The whole point of the per-key shape: an edit costs one small item rather
  // than rewriting a collection that cannot fit under the per-item ceiling.
  // Unknown fields on that entry survive because the spread above preserved
  // them, and every OTHER palette is untouched by construction.
  const target = /** @type {any} */ (next.find((e) => rawPaletteId(e) === id)) ?? fresh;
  const { id: _dropId, ...targetValue } = target;
  /** @type {Record<string, unknown>} */
  const write = {
    [paletteKeyFor(id)]: targetValue,
    [KEY_PALETTE_ORDER]: next.map((e) => rawPaletteId(e)).filter(Boolean),
    [KEY_ACTIVE_PALETTE]: id,
    // Mirror, for a machine still running an older build. One release only.
    [KEY_PALETTE]: palette,
  };
  try {
    await chrome.storage.sync.set(write);
  } catch (err) {
    // Each palette now has its own item, so this is far harder to hit than it
    // was — but the total quota and the item count are still finite, and a raw
    // QUOTA_BYTES string tells a user nothing they can act on.
    if (/quota/i.test(String(/** @type {any} */ (err)?.message ?? err))) {
      throw new Error(
        "there is no room left in your synced storage for another palette. Remove some colors or a palette and try again.",
        { cause: err },
      );
    }
    throw err;
  }
  cachedPaletteState = { raw: next, palettes: normalizePalettes(next, { keepId: id }), activePaletteId: id };
}

/**
 * Create a new palette and make it active.
 *
 * The switcher only ever LISTS palettes; this is how a second one comes to
 * exist at all — a gap found in the field, where the opt-in revealed nothing
 * because nothing could create entry number two. Also the only path by which
 * an ENFORCED user gets colors of their own: the org entry cannot be edited,
 * so "switch to colors of your own" needs somewhere of their own to switch to.
 *
 * `swatches` seeds the new palette instead of the starter color. Import uses
 * it, so importing is create + seed + switch in ONE write rather than a second
 * creation path racing a save (bd `workspace-custom-palette-m5g`). Passed
 * colors are normalized and capped here, because this is the write.
 * @param {string} name
 * @param {{name: string, hex: string, order?: number}[]} [swatches]
 * @returns {Promise<{ id: string, name: string }>}
 */
export async function createPalette(name, swatches) {
  const known = await knownPaletteState();
  if (known.palettes.length >= MAX_PALETTES) {
    throw new Error(`you already have ${MAX_PALETTES} palettes, which is the limit. Remove one first.`);
  }
  const id = "p" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  const seeded = normalizePalette(swatches ?? []).slice(0, MAX_SWATCHES);
  const starter = seeded.length > 0 ? seeded : [{ name: "New color", hex: "#1A73E8", order: 0 }];
  const rawIds = Array.isArray(known.raw)
    ? known.raw.map((e) => rawPaletteId(e)).filter(Boolean)
    : known.palettes.map((p) => p.id);
  // The mirror follows the pointer in the same write (mirrorForActivePalette):
  // creation switches to the new palette, and open tabs must hear it.
  const mirror = mirrorForActivePalette([...known.palettes, { id, name, swatches: starter }], id);
  await chrome.storage.sync.set({
    // One starter color when nothing was seeded, not an empty list: creation
    // should visibly do something, and an empty palette blanks the Brand row -
    // which reads as breakage, not as a fresh start (product note, 2026-08-22).
    [paletteKeyFor(id)]: { name, swatches: starter },
    [KEY_PALETTE_ORDER]: [...rawIds, id],
    [KEY_ACTIVE_PALETTE]: id,
    [KEY_PALETTE]: mirror,
  });
  cachedPaletteState = null; // shape changed; re-read rather than patch
  return { id, name };
}

/**
 * Rename a palette. Org palettes are refused - they always display
 * "Organization palette" and are the administrator's to name, not the user's.
 * Writes only the entry's own item, preserving fields this build cannot parse.
 * @param {string} id @param {string} name
 * @returns {Promise<void>}
 */
export async function renamePalette(id, name) {
  if (isOrgPaletteId(id)) {
    throw new Error("your organization's palette cannot be renamed here.");
  }
  const trimmed = name.trim();
  if (!trimmed) throw new Error("a palette needs a name.");
  const known = await knownPaletteState();
  const entry = Array.isArray(known.raw)
    ? /** @type {any} */ (known.raw.find((e) => rawPaletteId(e) === id))
    : undefined;
  if (!entry) throw new Error("that palette no longer exists.");
  const { id: _drop, ...value } = { ...entry, name: trimmed };
  await chrome.storage.sync.set({ [paletteKeyFor(id)]: value });
  cachedPaletteState = null;
  return;
}

/**
 * Delete a palette outright. Destructive and synced everywhere - the UI owns
 * the confirmation; this just refuses the impossible.
 * @param {string} id
 * @returns {Promise<void>}
 */
export async function deletePalette(id) {
  if (isOrgPaletteId(id)) {
    throw new Error("your organization's palettes are managed by your administrator and cannot be deleted here.");
  }
  const known = await knownPaletteState();
  const remaining = known.palettes.filter((p) => p.id !== id);
  /** @type {string[]} */
  const order = (Array.isArray(known.raw) ? known.raw.map((e) => rawPaletteId(e)) : [])
    .filter((x) => x && x !== id);
  const wasActive = known.activePaletteId === id;
  if (remaining.length === 0 && order.length === 0) {
    // The last one: clear every shape so "nothing stored" stays literally true.
    await chrome.storage.sync.remove([paletteKeyFor(id), KEY_PALETTE_ORDER, KEY_ACTIVE_PALETTE, KEY_PALETTE]);
  } else {
    /** @type {Record<string, unknown>} */
    const write = { [KEY_PALETTE_ORDER]: order };
    // A deleted ACTIVE palette moves the pointer to the first survivor rather
    // than dangling - resolution would recover, but the switcher should not
    // have to rely on recovery. The mirror follows it in the same write.
    if (wasActive) {
      write[KEY_ACTIVE_PALETTE] = order[0];
      write[KEY_PALETTE] = mirrorForActivePalette(remaining, order[0]);
    }
    await chrome.storage.sync.set(write);
    await chrome.storage.sync.remove(paletteKeyFor(id));
  }
  cachedPaletteState = null;
}

/**
 * Make sure a personal palette EXISTS when an organization publishes one.
 *
 * The product rule (2026-08-22): an org palette in play means the switcher
 * shows "with a personal made by default" - the org entry beside a personal
 * one, so there is always a real choice. Migrated users already have theirs;
 * this covers a fresh install meeting an org policy. Seeded with the packaged
 * defaults rather than empty (an empty default selection would blank the
 * Brand row), passed in by the caller because the worker is what fetches them.
 * Owned by the WORKER, like the enforcement push, so hosts cannot race on it.
 * @param {Swatch[]} defaults
 * @returns {Promise<boolean>} whether one was created
 */
export async function ensureDefaultPersonalPalette(defaults) {
  const state = await getPaletteState();
  if (state.palettes.length > 0) return false;
  if (Array.isArray(state.palette) && state.palette.length > 0) return false; // legacy entry exists; migration owns it
  const id = "p" + crypto.randomUUID().replace(/-/g, "").slice(0, 8);
  await chrome.storage.sync.set({
    [paletteKeyFor(id)]: { name: LEGACY_PALETTE_NAME, swatches: defaults },
    [KEY_PALETTE_ORDER]: [id],
    // Deliberately NOT the active pointer: what is ACTIVE stays governed by
    // the enforcement push and the user's own selection.
  });
  cachedPaletteState = null;
  return true;
}

/**
 * Detach from the personal override so the org (or packaged) palette applies.
 *
 * DETACH, not delete. The callers are "Use organization palette" and emptying
 * the editor, and both mean "stop using my colors here". An earlier version
 * removed the active entry, which got this wrong twice over: it destroyed a
 * named palette the user never asked to lose, AND it did not actually detach,
 * because resolution then fell back to the next entry and the user carried on
 * overriding the policy. The pointer now goes to NO_ACTIVE_PALETTE_ID, which
 * resolves to null, and every palette stays exactly where it was.
 *
 * With nothing stored at all there is nothing to detach from, so every key
 * goes and "nothing stored" stays literally true.
 *
 * Single-hop from the cache, for the same teardown reason as setUserPalette:
 * this path is reachable from the popup's dismissal flush, when the edited
 * colors match the managed palette.
 * @returns {Promise<void>}
 */
export async function clearUserPalette() {
  const known = await knownPaletteState();
  // Asked of the RAW value, not the normalized view. A collection whose entries
  // this build cannot parse normalizes to nothing, and taking the branch below
  // on that basis deleted the whole collection outright — the same loss the
  // save path was fixed for, reached by the detach control instead. When
  // something is stored, fall through and detach without touching it.
  if (!hasStoredPalettes(known.raw)) {
    await chrome.storage.sync.remove([KEY_PALETTES, KEY_ACTIVE_PALETTE, KEY_PALETTE]);
    cachedPaletteState = { raw: undefined, palettes: [], activePaletteId: undefined };
    return;
  }
  // ONE write, not a set plus a remove. Two operations are not atomic: a
  // failure that lands the second and refuses the first leaves the mirror gone
  // while this client is still attached, so an older machine sees no override
  // and this one still has it. The mirror goes to an EMPTY palette instead of
  // being removed, which is how an older build spells "no override" too
  // (resolvePalette falls through to the defaults on an empty user palette).
  await chrome.storage.sync.set({
    [KEY_ACTIVE_PALETTE]: NO_ACTIVE_PALETTE_ID,
    [KEY_PALETTE]: [],
  });
  cachedPaletteState = { raw: known.raw, palettes: known.palettes, activePaletteId: NO_ACTIVE_PALETTE_ID };
}

/** @returns {Promise<boolean>} has the user opted in to multiple palettes? */
export async function getMultiPalette() {
  const got = await chrome.storage.sync.get(KEY_MULTI_PALETTE);
  // DEFAULTS ON since 2026-08-24 (owner: "the multiple palette behavior is
  // working so well that we want to change the default to having it on").
  // Absent means "never expressed a preference", which now reads as on; only
  // an explicit stored `false` turns it off. That is what makes this safe
  // without a migration - an existing opt-out is a stored false and survives,
  // while everyone else gains a control they can turn off.
  return got?.[KEY_MULTI_PALETTE] !== false;
}

/** @param {boolean} on @returns {Promise<void>} */
export async function setMultiPalette(on) {
  await chrome.storage.sync.set({ [KEY_MULTI_PALETTE]: !!on });
}

/**
 * The legacy mirror's value for a given pointer: the swatches of the user
 * palette it names, or an EMPTY palette when the pointer names the org's, a
 * deliberate detach, or nothing at all — every state where "no personal
 * override applies" is what the mirror must broadcast.
 *
 * WHY A HELPER: the mirror ("palette") is the live-update channel. The content
 * script and the toolbar icon hear a switch through it (bd 3ij: retiring the
 * mirror kills live updates), so EVERY writer that moves the pointer has to
 * rewrite it in the same write — 0.2.0's switch paths did not, and an open
 * Doc kept showing the previous palette until the next save (field, 2026-08-23,
 * TESTING-0.2.0 B4/B5). One helper, called by every pointer-moving writer,
 * is the only way that stays true when the next writer is added.
 * @param {{id: string, swatches: Swatch[]}[]} palettes
 * @param {unknown} [activePaletteId]
 * @returns {Swatch[]}
 */
export function mirrorForActivePalette(palettes, activePaletteId) {
  const list = Array.isArray(palettes) ? palettes : [];
  if (typeof activePaletteId !== "string" || activePaletteId === NO_ACTIVE_PALETTE_ID) return [];
  // An org pointer means "the org's colors apply": the mirror carries no
  // personal override, exactly as clearUserPalette spells detachment, so
  // resolution falls through to the managed tier.
  if (isOrgPaletteId(activePaletteId)) return [];
  return list.find((p) => p.id === activePaletteId)?.swatches ?? [];
}

/**
 * Select a palette. The ONLY writer of the active pointer besides the
 * enforcement push and the detach control — which is what lets the pointer
 * mean "what this person chose" rather than "where the last write landed".
 *
 * The mirror is rewritten in the SAME write (mirrorForActivePalette): a switch
 * that moved only the pointer left every open tab on the previous palette.
 * @param {string} id @returns {Promise<void>}
 */
export async function setActivePalette(id) {
  const known = await knownPaletteState();
  const mirror = mirrorForActivePalette(known.palettes, id);
  await chrome.storage.sync.set({ [KEY_ACTIVE_PALETTE]: id, [KEY_PALETTE]: mirror });
  cachedPaletteState = { raw: known.raw, palettes: known.palettes, activePaletteId: id };
}

/**
 * Apply the one-time push that makes the organization's palette active when
 * enforcement BEGINS, and forget it when enforcement ends.
 *
 * Owned by the service worker rather than by a host. Both hosts and the content
 * script observe policy changes, so leaving this to them would have three
 * contexts racing to perform the same write; the worker sees the same events
 * and is the one place that is not also rendering. Hosts pick the result up
 * through the ordinary storage change.
 * @param {{ locked?: boolean, managed?: unknown }} policy org swatches, already resolved
 * @returns {Promise<boolean>} whether anything was written
 */
export async function applyEnforcementPush(policy) {
  const got = await chrome.storage.sync.get(KEY_ENFORCEMENT_PUSHED);
  const plan = planEnforcementPush({
    locked: policy?.locked,
    managed: policy?.managed,
    pushed: got?.[KEY_ENFORCEMENT_PUSHED] === true,
  });
  if (!plan) return false;
  /** @type {Record<string, unknown>} */
  const write = { [KEY_ENFORCEMENT_PUSHED]: plan.pushed };
  // Only a push moves the pointer. Enforcement ENDING just forgets the
  // episode: the user keeps whatever palette they were on. The mirror follows
  // the push in the same write (mirrorForActivePalette): the pushed pointer
  // names the org's, so the mirror empties and open tabs fall through to the
  // managed tier without a reload.
  if (plan.activePaletteId !== undefined) {
    const state = await knownPaletteState();
    write[KEY_ACTIVE_PALETTE] = plan.activePaletteId;
    write[KEY_PALETTE] = mirrorForActivePalette(state.palettes, plan.activePaletteId);
  }
  await chrome.storage.sync.set(write);
  cachedPaletteState = null; // the pointer moved underneath the cache
  return true;
}

/**
 * Apply the one-time push for an UNLOCKED org palette appearing. Returns
 * whether anything was written. See planOrgDefaultPush for the rule and why it
 * is guarded on the active palette being untouched.
 *
 * `defaults` is the packaged palette, and comparing against it is what "never
 * customized" means here. Deliberately a value comparison rather than a stored
 * "edited" flag: a flag needs a migration and can only ever be as truthful as
 * every write path that maintains it, while paletteKey equality is derivable
 * from what is actually stored and cannot drift.
 * @param {{ locked?: boolean, managed?: unknown }} policy
 * @param {{name:string,hex:string,order?:number}[]} defaults
 * @returns {Promise<boolean>}
 */
export async function applyOrgDefaultPush(policy, defaults) {
  const got = await chrome.storage.sync.get(KEY_ORG_DEFAULT_PUSHED);
  const state = await knownPaletteState();
  // What is on screen for this user right now, as a user-tier palette. An
  // absent or detached pointer means nothing of theirs is shadowing the org's,
  // which counts as "not customized" — there is nothing to protect.
  const activeSwatches = normalizePalette(resolveActiveUserPalette({
    palettes: state.palettes, activePaletteId: state.activePaletteId,
  }));
  const activeIsCustomized = activeSwatches.length > 0
    && paletteKey(activeSwatches) !== paletteKey(normalizePalette(defaults));
  const plan = planOrgDefaultPush({
    locked: policy?.locked,
    managed: policy?.managed,
    pushed: got?.[KEY_ORG_DEFAULT_PUSHED] === true,
    activeIsCustomized,
  });
  if (!plan) return false;
  /** @type {Record<string, unknown>} */
  const write = { [KEY_ORG_DEFAULT_PUSHED]: plan.pushed };
  // Same atomic-mirror discipline as applyEnforcementPush: the pushed pointer
  // names the org palette, so the mirror empties in the SAME write and open
  // tabs fall through to the managed tier without a reload.
  if (plan.activePaletteId !== undefined) {
    write[KEY_ACTIVE_PALETTE] = plan.activePaletteId;
    write[KEY_PALETTE] = mirrorForActivePalette(state.palettes, plan.activePaletteId);
  }
  await chrome.storage.sync.set(write);
  cachedPaletteState = null; // the pointer may have moved underneath the cache
  return true;
}

/**
 * Move a pre-multi-palette account forward, and repair a dangling active
 * pointer. Returns whether anything was written.
 *
 * Writes exactly what the plan carries: a pointer repair writes ONLY the
 * pointer, never the collection. See planPaletteMigration for why that
 * distinction is the whole safety property here.
 *
 * Called from the service worker (install/startup), NOT from a read: see
 * getPaletteState for why the read path must stay side-effect free.
 * @returns {Promise<boolean>}
 */
/**
 * The on/off toggle was retired from the UI (0.2.0): nobody turns the colors
 * off rather than uninstalling. The `enabled` mechanism stays honored by the
 * content script, but a 0.1.7 user who had toggled OFF would now be stranded
 * invisible with no control to find - so the worker un-hides them once.
 * @returns {Promise<boolean>} whether it flipped anything
 */
export async function retireEnabledToggle() {
  const got = await chrome.storage.sync.get(KEY_ENABLED);
  if (got?.[KEY_ENABLED] === false) {
    await chrome.storage.sync.set({ [KEY_ENABLED]: true });
    return true;
  }
  return false;
}

/**
 * Run the install/startup migrations, ISOLATED from each other.
 *
 * Both the order and the isolation are load-bearing, and this exists as its own
 * exported function so both are testable — the service worker's private
 * composition was not (bd `workspace-custom-palette-7se`).
 *
 * `retireEnabledToggle` is the only thing that can rescue a profile stored as
 * `enabled: false`. The toggle was retired from the UI in 0.2.0 but the content
 * script still honours the key, so such a profile injects nothing, banners
 * nothing (an empty palette is not a failed injection), and offers no control
 * to turn it back on — while looking perfectly healthy in chrome://extensions.
 * `enabled` also lives in sync storage, so a `false` written by an older build
 * on another device reaches machines that never had the toggle.
 *
 * Sharing one try block with the palette migration meant any failure there —
 * a quota error, a malformed stored palette, a transient storage fault —
 * silently skipped that rescue on every install and startup. So each migration
 * gets its own catch, and the cheap, more important repair runs FIRST.
 * @returns {Promise<{ enabledRepaired: boolean, palettesMigrated: boolean }>}
 */
export async function runStartupMigrations() {
  let enabledRepaired = false;
  let palettesMigrated = false;
  try {
    enabledRepaired = await retireEnabledToggle();
  } catch {
    // Never let migration plumbing break install or startup.
  }
  try {
    palettesMigrated = await migratePaletteStorage();
  } catch {
    // As above, and independently: neither may suppress the other.
  }
  return { enabledRepaired, palettesMigrated };
}

export async function migratePaletteStorage() {
  const state = await getPaletteState();
  const plan = planPaletteMigration(state);
  // The interim single-key collection has to move to per-key items even when
  // the plan says nothing else needs doing, or it stays under the item ceiling
  // it exists to escape. Only a dev profile can hold it (0.2.0 never shipped),
  // but this build wrote it, so this build clears it up.
  const got = await chrome.storage.sync.get([KEY_PALETTES]);
  const interim = hasStoredPalettes(got[KEY_PALETTES]) ? got[KEY_PALETTES] : null;
  if (!plan && !interim) return false;

  /** @type {Record<string, unknown>} */
  const write = {};
  // Whichever source produced a collection, it lands as one item per palette.
  const collection = plan?.palettes ?? interim;
  if (collection) {
    const ids = [];
    for (const entry of collection) {
      const id = rawPaletteId(entry);
      if (!id) continue;
      const { id: _drop, ...value } = /** @type {any} */ (entry);
      write[paletteKeyFor(id)] = value;
      ids.push(id);
    }
    write[KEY_PALETTE_ORDER] = ids;
  }
  if (plan) {
    write[KEY_ACTIVE_PALETTE] = plan.activePaletteId;
    // The mirror follows the migrated pointer, so a machine that skipped this
    // migration (or an open tab on this one) hears the same collection the
    // per-key shape now serves. The collection to read it from differs by case:
    // a legacy migration just BUILT one (plan.palettes), but a pointer-only
    // repair did not - its entries are already stored under their own keys, and
    // mirroring from the (absent) plan collection would write an EMPTY mirror
    // over an active palette's colors.
    write[KEY_PALETTE] = mirrorForActivePalette(
      plan.palettes
        ? normalizePalettes(plan.palettes, { keepId: plan.activePaletteId })
        : state.palettes,
      plan.activePaletteId,
    );
  }
  await chrome.storage.sync.set(write);
  // Remove the interim key only AFTER its contents are safely stored under
  // their own, so a failure between the two leaves the collection readable
  // rather than gone.
  if (interim) await chrome.storage.sync.remove(KEY_PALETTES);
  cachedPaletteState = null; // re-read rather than trust a half-known shape
  return true;
}

/** @returns {Promise<boolean>} master enabled flag (default true) */
export async function getEnabled() {
  const got = await chrome.storage.sync.get(KEY_ENABLED);
  return got[KEY_ENABLED] !== false;
}

/** @param {boolean} enabled @returns {Promise<void>} */
export async function setEnabled(enabled) {
  await chrome.storage.sync.set({ [KEY_ENABLED]: enabled });
}

/** @returns {Promise<"system" | "light" | "dark">} UI theme preference (default "system") */
export async function getTheme() {
  const got = await chrome.storage.sync.get(KEY_THEME);
  const t = got[KEY_THEME];
  return t === "light" || t === "dark" ? t : "system";
}

/** @param {"system" | "light" | "dark"} theme @returns {Promise<void>} */
export async function setTheme(theme) {
  await chrome.storage.sync.set({ [KEY_THEME]: theme });
}

/** @returns {Promise<boolean>} whether the popup's first-run intro was dismissed */
export async function getIntroSeen() {
  const got = await chrome.storage.sync.get(KEY_INTRO_SEEN);
  return got[KEY_INTRO_SEEN] === true;
}

/** @returns {Promise<void>} mark the first-run intro as seen (dismissed) */
export async function setIntroSeen() {
  await chrome.storage.sync.set({ [KEY_INTRO_SEEN]: true });
}

// ---- Remote config cache (chrome.storage.local) ----------------------------

/** @returns {Promise<{ selectors?: unknown, palette?: unknown }>} the cached remote config */
export async function getCachedConfig() {
  const got = await chrome.storage.local.get([KEY_CACHED_SELECTORS, KEY_CACHED_PALETTE]);
  return { selectors: got[KEY_CACHED_SELECTORS], palette: got[KEY_CACHED_PALETTE] };
}

/**
 * Store fetched remote config. Pass only the keys that were successfully
 * fetched so a partial failure doesn't wipe a previously-good cache.
 * @param {{ selectors?: unknown, palette?: unknown }} cfg
 * @returns {Promise<void>}
 */
export async function setCachedConfig(cfg) {
  /** @type {Record<string, unknown>} */
  const patch = {};
  if (cfg.selectors !== undefined) patch[KEY_CACHED_SELECTORS] = cfg.selectors;
  if (cfg.palette !== undefined) patch[KEY_CACHED_PALETTE] = cfg.palette;
  if (Object.keys(patch).length) await chrome.storage.local.set(patch);
}

/**
 * Drop the remote config cache so clients revert to packaged defaults. Called
 * when remote config is disabled (CONFIG_BASE empty), so a previously-cached
 * (and possibly stale) remote contract can't keep winning indefinitely.
 * @returns {Promise<void>}
 */
export async function clearCachedConfig() {
  await chrome.storage.local.remove([KEY_CACHED_SELECTORS, KEY_CACHED_PALETTE]);
}

// ---- Popup undo/redo history (chrome.storage.local) ------------------------

/** @returns {Promise<unknown>} the raw stored history ({undo,redo} snapshots), or undefined */
export async function getPaletteHistory() {
  const got = await chrome.storage.local.get(KEY_PALETTE_HISTORY);
  return got[KEY_PALETTE_HISTORY];
}

/** @param {unknown} history @returns {Promise<void>} */
export async function setPaletteHistory(history) {
  await chrome.storage.local.set({ [KEY_PALETTE_HISTORY]: history });
}

// ---- Background error buffer (chrome.storage.session) ----------------------

/** @returns {Promise<unknown>} the raw stored error buffer, or undefined */
export async function getErrorBuffer() {
  const got = await chrome.storage.session.get(KEY_ERROR_BUFFER);
  return got[KEY_ERROR_BUFFER];
}

/** @param {{ message: string, at: number }[]} buffer @returns {Promise<void>} */
export async function setErrorBuffer(buffer) {
  await chrome.storage.session.set({ [KEY_ERROR_BUFFER]: buffer });
}

/** @returns {Promise<void>} */
export async function clearErrorBuffer() {
  await chrome.storage.session.remove(KEY_ERROR_BUFFER);
}

// ---- Rating prompt state (chrome.storage.local) -----------------------------

/** @returns {Promise<unknown>} the raw stored rating state (normalize via lib/rating.js) */
export async function getRatingState() {
  const got = await chrome.storage.local.get(KEY_RATING);
  return got[KEY_RATING];
}

/** @param {import("./rating.js").RatingState} state @returns {Promise<void>} */
export async function setRatingState(state) {
  await chrome.storage.local.set({ [KEY_RATING]: state });
}

// ---- Injection health (chrome.storage.local) --------------------------------

/** @returns {Promise<{ ok: boolean, at: number } | undefined>} */
export async function getLastHealth() {
  const got = await chrome.storage.local.get(KEY_LAST_HEALTH);
  const h = got[KEY_LAST_HEALTH];
  return h && typeof h === "object" ? /** @type {{ ok: boolean, at: number }} */ (h) : undefined;
}

/** @param {boolean} ok @returns {Promise<void>} */
export async function setLastHealth(ok) {
  await chrome.storage.local.set({ [KEY_LAST_HEALTH]: { ok: !!ok, at: Date.now() } });
}

// ---- Post-update notice (chrome.storage.local) ------------------------------

/** @returns {Promise<unknown>} the stored updated-to version, or undefined */
export async function getUpdateNoteVersion() {
  const got = await chrome.storage.local.get(KEY_UPDATE_NOTE);
  return got[KEY_UPDATE_NOTE];
}

/** @param {string} version @returns {Promise<void>} */
export async function setUpdateNoteVersion(version) {
  await chrome.storage.local.set({ [KEY_UPDATE_NOTE]: version });
}

/** @returns {Promise<void>} dismiss the notice (or clear a stale/unknown one) */
export async function clearUpdateNoteVersion() {
  await chrome.storage.local.remove(KEY_UPDATE_NOTE);
}

// ---- Enterprise managed policy (chrome.storage.managed, READ-ONLY) ----------
// Set by a Workspace admin in Google Admin Console against the schema in
// config/managed-schema.json (see docs/DEPLOY.md). Read-only by definition:
// writing to this area throws. Absent policy (the normal case for individual
// users) simply yields undefined.

/**
 * How long to wait for the managed-storage read before giving up on it. The
 * managed area is backed by the platform's policy provider, which on a machine
 * with no policy at all can be slow to answer — and a promise that never
 * settles is indistinguishable from a hang for every caller that awaits it.
 */
/** Render deadline for UI callers. Never applied to the shared read itself. */
export const MANAGED_READ_TIMEOUT_MS = 1500;

/**
 * The org's policy palette, or undefined when there is none.
 *
 * NEVER rejects: an absent policy is the normal case for individual users, and
 * the Brand row must not depend on this answer arriving.
 *
 * Deliberately UNTIMED. A timeout here resolved `undefined`, which is the very
 * same value that means "this machine has no policy" — so every caller read a
 * slow managed device as an unmanaged one. In the popup and options page that
 * flipped the whole managed install off at once and let the next edit write a
 * personal override, permanently detaching the user from admin updates; in the
 * content script it dropped the org palette for the life of the page with no
 * retry. Callers that cannot wait must use `getManagedPaletteWithin`, which
 * reports a deadline miss DISTINCTLY, rather than reintroducing a cap here.
 * @returns {Promise<unknown>} the raw managed "palette" policy value, or undefined
 */
export async function getManagedPalette() {
  return (await getManagedPolicy()).palette;
}

/**
 * The whole enterprise policy: the org palette and whether it is ENFORCED.
 *
 * Both keys are read in ONE call. Reading them separately would let a caller
 * observe a half-applied policy — the lock without the palette it locks, or
 * vice versa — and every consumer needs them together anyway to decide whether
 * the palette is actually being enforced (see palette.js isPaletteLocked).
 *
 * NEVER rejects; an absent policy is the normal case. Deliberately UNTIMED for
 * the same reason as getManagedPalette below — see getManagedPolicyWithin.
 * @returns {Promise<{ palette: unknown, palettes: unknown, locked: boolean }>}
 */
export async function getManagedPolicy() {
  try {
    const got = await chrome.storage.managed.get([KEY_PALETTE, KEY_MANAGED_PALETTES, KEY_PALETTE_LOCKED]);
    return {
      palette: got?.[KEY_PALETTE],
      palettes: got?.[KEY_MANAGED_PALETTES],
      locked: managedFlag(got?.[KEY_PALETTE_LOCKED]),
    };
  } catch {
    // No policy configured, or the managed area is unavailable on this platform
    // — both are normal for non-managed installs, not errors worth surfacing.
    return { palette: undefined, palettes: undefined, locked: false };
  }
}

/**
 * Read a boolean policy value, tolerating the Admin console's `{"Value": ...}`
 * wrapper for exactly the reason lib/config.js managedSwatches does: which
 * shape actually arrives has never been confirmed against a real managed
 * device, so both are accepted rather than guessed at.
 * @param {unknown} raw
 * @returns {boolean}
 */
function managedFlag(raw) {
  if (typeof raw === "boolean") return raw;
  if (raw && typeof raw === "object") {
    const wrapped = /** @type {any} */ (raw).Value;
    if (typeof wrapped === "boolean") return wrapped;
  }
  return false;
}

/**
 * A managed read for callers that must render promptly but must NOT mistake a
 * slow answer for "no policy".
 *
 * Returns both halves deliberately:
 *  - `prompt` settles by `timeoutMs` with `{ timedOut, value }` — render from this.
 *  - `settled` is the untimed read, still running. Await it before any write
 *    whose correctness depends on whether a policy exists (see
 *    popup.persistPalette): by save time it has almost always landed, so the
 *    guarantee is free in practice.
 * @param {number} [timeoutMs]
 * @returns {{ prompt: Promise<{ timedOut: boolean, value: unknown }>, settled: Promise<unknown> }}
 */
export function getManagedPaletteWithin(timeoutMs = MANAGED_READ_TIMEOUT_MS) {
  const settled = getManagedPalette();
  const prompt = Promise.race([
    settled.then((value) => ({ timedOut: false, value })),
    new Promise((resolve) => setTimeout(() => resolve({ timedOut: true, value: undefined }), timeoutMs)),
  ]);
  return { prompt, settled };
}

/**
 * `getManagedPaletteWithin` for the whole policy (palette + lock).
 *
 * Same two-halves contract and same reason for it: `prompt` settles by the
 * deadline so the UI can render, `settled` is the untimed read that any write
 * decision must await. A deadline miss is reported as `timedOut`, NEVER as "no
 * policy" — those are different answers, and collapsing them is what once let
 * a slow managed device be treated as unmanaged and written over.
 *
 * The stakes are higher now: mistaking a slow read for "unmanaged" on a LOCKED
 * install would show an editable palette to someone whose colors are actually
 * enforced.
 * @param {number} [timeoutMs]
 * @returns {{ prompt: Promise<{ timedOut: boolean, value: { palette: unknown, palettes: unknown, locked: boolean } }>, settled: Promise<{ palette: unknown, palettes: unknown, locked: boolean }> }}
 */
export function getManagedPolicyWithin(timeoutMs = MANAGED_READ_TIMEOUT_MS) {
  const settled = getManagedPolicy();
  const prompt = Promise.race([
    settled.then((value) => ({ timedOut: false, value })),
    new Promise((resolve) => setTimeout(
      () => resolve({ timedOut: true, value: { palette: undefined, palettes: undefined, locked: false } }),
      timeoutMs,
    )),
  ]);
  return { prompt, settled };
}

/**
 * Subscribe to enterprise policy changes so an admin's palette update applies
 * without a browser restart, the same way user edits apply live.
 * @param {(rawPalette: unknown, policy: { palette: unknown, palettes: unknown, locked: boolean }) => void} cb
 *   called with the new raw palette value AND the whole current policy, since a
 *   lock-only change carries no palette in the change record
 * @returns {() => void} unsubscribe
 */
export function onManagedChanged(cb) {
  /** @param {{ [k: string]: chrome.storage.StorageChange }} changes @param {string} area */
  const listener = (changes, area) => {
    if (area !== "managed") return;
    // React to EITHER key. Watching only the palette meant an admin turning the
    // lock on (or off) changed nothing until the browser restarted — the policy
    // would be enforced in storage while the user carried on editing a palette
    // that no longer applied.
    // Any of the three: an admin can publish several named palettes, edit the
    // single legacy one, or flip the lock, and each on its own changes what
    // applies. Missing the new key here would leave a multi-palette publish
    // invisible until the browser restarted.
    const changedPalette = !!changes[KEY_PALETTE] || !!changes[KEY_MANAGED_PALETTES];
    const changedLock = !!changes[KEY_PALETTE_LOCKED];
    if (!changedPalette && !changedLock) return;
    // Always hand back the CURRENT whole policy rather than just the delta:
    // callers need both halves to decide whether the palette is enforced, and
    // a lock-only change carries no palette in `changes`.
    getManagedPolicy().then((policy) => cb(policy.palette, policy));
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}

/**
 * Subscribe to changes in our sync keys. Calls back with the changed values so
 * the content script can react without an extension reload.
 *
 * `activePaletteId` is surfaced alongside `palette`: the mirror is rewritten by
 * the same writes (mirrorForActivePalette), but a locked user switching to a
 * palette of their own changes WHICH tier wins, and only the pointer says so.
 *
 * `palette` is ALWAYS the user tier's swatches, never a raw key value. Today
 * every writer rewrites the legacy mirror in the same set(), so the change
 * carries it and that value is delivered as is. When a change arrives WITHOUT
 * the mirror - a collection item (`pal:<id>`), `paletteOrder`, or a pointer
 * move on its own - the active palette is resolved from a fresh read instead
 * and delivered on the next tick. That branch is what keeps an already-open
 * Docs/Sheets/Slides tab refreshing on the day the mirror is retired: the
 * mirror was the only key this listener watched, and Tier 1 could not have
 * noticed it going dark (bd workspace-custom-palette-3ij; the pointer-only
 * half of it fired early in the field, bd workspace-custom-palette-agi).
 * Deliveries are serialized so two quick changes cannot land out of order.
 * @param {(change: { palette?: Swatch[], activePaletteId?: unknown, enabled?: boolean, theme?: "system" | "light" | "dark" }) => void} cb
 * @returns {() => void} unsubscribe
 */
export function onSettingsChanged(cb) {
  /** Serializes the async deliveries so a slow read cannot overtake a later change. */
  let queue = Promise.resolve();
  /** @param {{ [k: string]: chrome.storage.StorageChange }} changes @param {string} area */
  const listener = (changes, area) => {
    if (area !== "sync") return;
    /** @type {{ palette?: Swatch[], activePaletteId?: unknown, enabled?: boolean, theme?: "system" | "light" | "dark" }} */
    const out = {};
    if (changes[KEY_PALETTE]) out.palette = /** @type {Swatch[] | undefined} */ (changes[KEY_PALETTE].newValue);
    if (changes[KEY_ACTIVE_PALETTE]) out.activePaletteId = changes[KEY_ACTIVE_PALETTE].newValue;
    if (changes[KEY_ENABLED]) out.enabled = changes[KEY_ENABLED].newValue !== false;
    if (changes[KEY_THEME]) {
      // Normalize like getTheme: a cleared/unknown value reverts to "system", so
      // the change always carries a concrete theme and consumers' truthy guards
      // behave consistently (a removed key still propagates a reset, not nothing).
      const nv = changes[KEY_THEME].newValue;
      out.theme = nv === "light" || nv === "dark" ? nv : "system";
    }
    const collectionChanged = Object.keys(changes).some(
      (k) => k === KEY_PALETTE_ORDER || k === KEY_PALETTES || k.startsWith(KEY_PALETTE_PREFIX),
    );
    // No mirror in the change, but the effective palette may have moved: a
    // collection write, or a switch that moved only the pointer (watching the
    // items alone would miss that one). Resolve rather than guess.
    if (!("palette" in out) && (collectionChanged || "activePaletteId" in out)) {
      queue = queue
        .then(() => getPaletteState())
        .then((state) => {
          cb({
            ...out,
            palette: resolveActiveUserPalette(state) ?? [],
            activePaletteId: state.activePaletteId,
          });
        })
        .catch(() => {}); // a failed read must not wedge later deliveries
      return;
    }
    if ("palette" in out || "activePaletteId" in out || "enabled" in out || "theme" in out) {
      // Keep the order: a synchronous delivery must not overtake a resolve
      // still in flight for an earlier change.
      queue = queue.then(() => cb(out)).catch(() => {});
    }
  };
  chrome.storage.onChanged.addListener(listener);
  return () => chrome.storage.onChanged.removeListener(listener);
}
