/**
 * Pure palette logic — no DOM, no chrome.*. The options editor, the content
 * bootstrap, and tests all share these. Storage I/O lives in storage.js; this
 * module only transforms plain data.
 *
 * Source priority, and it is NOT a fixed ladder any more — the ACTIVE POINTER
 * sits in the middle of it (resolveEffectivePalette):
 *
 *   1. remote team palette (Phase 3), when one is configured at all
 *   2. whatever `activePaletteId` NAMES: an org palette when it names one, the
 *      user's own when it names theirs
 *   3. failing that, the fall-through: user overrides (chrome.storage.sync) →
 *      enterprise managed policy (chrome.storage.managed, set by a Workspace
 *      admin) → packaged default
 *
 * Step 2 is what "unlocked org colors are a default, not a mandate" means in
 * code, and it is why a cached org tier is only correct for the pointer it was
 * computed with (forgetting that shipped a bug twice: bd
 * workspace-custom-palette-agi and -5j1). Which palette the pointer names when
 * nobody has chosen is decided elsewhere: resolveActivePaletteId for the lock's
 * default, planEnforcementPush and planOrgDefaultPush for the one-time moves.
 *
 * resolvePalette models the user-vs-default tier alone; the remote and managed
 * tiers are layered in by resolveEffectivePalette.
 *
 * @typedef {{ name: string, hex: string, order: number }} Swatch
 */

import { normalizeHex } from "./hex.js";

/** Max swatches we render in a Brand row — keeps the picker from overflowing. */
export const MAX_SWATCHES = 24;

/**
 * Cap on a swatch's name. Nothing capped it before, which mattered once
 * palettes started sharing one `chrome.storage.sync` item: that item has an
 * 8 KB QUOTA_BYTES_PER_ITEM ceiling, and an uncapped name let a single palette
 * eat it. See workspace-custom-palette-q4r for the per-key storage this still
 * needs; the cap alone does not make MAX_PALETTES reachable.
 */
export const MAX_SWATCH_NAME = 48;

/**
 * Validate + clean an arbitrary list into well-formed, order-stamped, sorted
 * swatches. Drops entries with an invalid hex or blank name; normalizes hex to
 * #RRGGBB; re-stamps `order` to the 0-based index after sorting so the result
 * is canonical. Never throws — bad input yields a shorter (or empty) list.
 * @param {unknown} list
 * @returns {Swatch[]}
 */
export function normalizePalette(list) {
  if (!Array.isArray(list)) return [];
  /** @type {Swatch[]} */
  const cleaned = [];
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_SWATCH_NAME) : "";
    const hex = normalizeHex(raw.hex);
    if (!name || !hex) continue;
    const order = Number.isFinite(raw.order) ? Number(raw.order) : cleaned.length;
    cleaned.push({ name, hex, order });
  }
  cleaned.sort((a, b) => a.order - b.order);
  return cleaned.slice(0, MAX_SWATCHES).map((s, i) => ({ ...s, order: i }));
}

/** Max named palettes a user (or an admin) can keep. Caps the switcher's length. */
export const MAX_PALETTES = 12;

/** Cap on a palette's display name, so a pasted essay cannot wreck the switcher. */
export const MAX_PALETTE_NAME = 40;

/**
 * The id and name given to a pre-multi-palette stored palette when it is
 * migrated forward. Fixed rather than random because there is exactly ONE such
 * palette per account, so a constant is unambiguous and keeps the migration a
 * pure, deterministic function that a test can pin.
 */
export const LEGACY_PALETTE_ID = "personal";

/**
 * Reserved `activePaletteId` meaning "no palette of my own is active" — the
 * user detached, so the org (or packaged) palette applies.
 *
 * Detachment has to be REPRESENTABLE, not implied. Without this, "Use
 * organization palette" had only two ways to express itself: delete the active
 * entry (destroying a named palette the user never asked to lose) or clear the
 * pointer (which falls back to the first entry, so the user is still
 * overriding and the click silently does nothing). Both were wrong, and the
 * second is worse for being invisible.
 *
 * Never a real entry id: normalizePalettes drops any entry claiming it.
 */
export const NO_ACTIVE_PALETTE_ID = "__none__";

/**
 * Reserved `activePaletteId` naming the ORGANIZATION's palette rather than one
 * of the user's own.
 *
 * The active pointer spans two sources now: the user's collection in
 * `chrome.storage.sync` and the admin's policy in `chrome.storage.managed`.
 * Giving the org palette an id is what lets one pointer answer "which palette
 * is active" across both, and what lets a user under enforcement select their
 * own and switch back. (workspace-custom-palette-om8 extends this to several
 * org palettes; the prefix is reserved for that.)
 *
 * Never a user entry id: normalizePalettes drops any entry claiming it.
 */
export const ORG_PALETTE_ID = "org";

/**
 * Display name for organization palettes. A legacy single-palette policy has
 * no name of its own, and the product rule is that org palettes carry a fixed
 * name - they are the one thing a user can never rename.
 *
 * Was "Organization colors" from 2026-08-22; renamed to "Organization palette"
 * by the owner on 2026-08-28 so the label matches the thing it names, since a
 * palette is what the selector lists and what an admin publishes. NOT persisted
 * anywhere: it is derived at read time for a legacy policy that carries no name
 * of its own, so renaming it needs no migration.
 */
export const ORG_PALETTE_NAME = "Organization palette";

/**
 * The id of the organization's Nth palette. Every org entry is `org:<index>`;
 * the bare ORG_PALETTE_ID means "the organization's palette" generically and
 * resolves to the first, which is what an unset pointer under enforcement
 * defaults to and what a legacy single-palette policy has always been.
 * @param {number} index
 * @returns {string}
 */
export function orgPaletteId(index) {
  return `${ORG_PALETTE_ID}:${index}`;
}

/**
 * Is this id one of the ORGANIZATION's palettes?
 *
 * Bare `org` means "the organization's palette" generically; `org:<n>` names a
 * specific one. Both are org, and every resolver must agree on that — an
 * earlier draft taught only some of them about the `org:<n>` form, so with
 * `org:1` selected the editor froze on the org colours while
 * resolveEffectivePalette fell through and applied the USER's palette to the
 * document. Editor and injected row disagreeing is the exact contradiction the
 * detach sentinel had to be fixed for; one predicate is how it stops recurring.
 * @param {unknown} id
 * @returns {boolean}
 */
export function isOrgPaletteId(id) {
  return id === ORG_PALETTE_ID || String(id ?? "").startsWith(`${ORG_PALETTE_ID}:`);
}
// "Default" rather than "My colors": the user meets this entry as the palette
// that was simply there before they made any others, and it is renamable like
// any of theirs (product note, 2026-08-22).
export const LEGACY_PALETTE_NAME = "Default";

/**
 * The name a palette gets when it is created by a SAVE rather than by
 * migration or by materializing the packaged colors.
 *
 * These are not the same thing and calling them both "Default" was a lie the
 * field caught (2026-08-25). A user who edits an org palette and saves is
 * DETACHING: the entry that appears holds the organization's colors with their
 * change, and naming it "Default" claimed it was the extension's default
 * palette, which it demonstrably was not — the tester reported "a Default that
 * didn't even have the actual Default palette", and it also made the next
 * created palette come out as "Palette 2".
 *
 * "Default" is still correct for the two paths that genuinely produce it: the
 * migration of a pre-multi-palette palette, and ensureDefaultPersonalPalette
 * materializing the packaged colors.
 */
export const OWN_PALETTE_NAME = "My colors";

/**
 * Validate + clean a list of NAMED palettes: `{ id, name, swatches }` each.
 *
 * Empty palettes are KEPT, deliberately. Deleting every row is a thing a user
 * does on purpose (it is how you turn the Brand row off), and silently dropping
 * the entry on the next read would delete something they meant to have. Junk
 * `swatches` therefore degrades to an empty palette rather than to no palette.
 * Entries with no usable id or name are dropped, since neither can be invented
 * without guessing which entry the active pointer meant.
 * `keepId` names an entry that must survive truncation. Without it, a device
 * syncing a longer collection than this build's cap would drop whichever entry
 * the active pointer happened to name, and silently switch the user's palette.
 * @param {unknown} list
 * @param {{ keepId?: unknown }} [opts]
 * @returns {{ id: string, name: string, swatches: Swatch[] }[]}
 */
export function normalizePalettes(list, { keepId } = {}) {
  if (!Array.isArray(list)) return [];
  /** @type {{ id: string, name: string, swatches: Swatch[] }[]} */
  const all = [];
  const seen = new Set();
  for (const raw of list) {
    if (!raw || typeof raw !== "object") continue;
    const id = typeof raw.id === "string" ? raw.id.trim() : "";
    const name = typeof raw.name === "string" ? raw.name.trim().slice(0, MAX_PALETTE_NAME) : "";
    // A duplicate id would make the active pointer ambiguous, so first wins.
    // The detach sentinel can never be an entry, or detaching would resolve to
    // a palette instead of to nothing.
    // Reserved ids can never be user entries, or detaching would resolve to a
    // palette and a user entry could impersonate the organization's.
    if (!id || !name || seen.has(id)) continue;
    if (id === NO_ACTIVE_PALETTE_ID || isOrgPaletteId(id)) continue;
    seen.add(id);
    all.push({ id, name, swatches: normalizePalette(raw.swatches) });
  }
  if (all.length <= MAX_PALETTES) return all;
  const kept = all.slice(0, MAX_PALETTES);
  // If the pointed-at entry fell outside the window, swap it in rather than
  // losing sight of the palette the user is actually on.
  if (keepId !== undefined && !kept.some((p) => p.id === keepId)) {
    const wanted = all.find((p) => p.id === keepId);
    if (wanted) kept[MAX_PALETTES - 1] = wanted;
  }
  return kept;
}

/**
 * Is there a stored collection at all?
 *
 * Must be asked of the RAW stored value, NEVER of the normalized view. This
 * distinction has now produced the same defect three times: `normalizePalettes`
 * drops entries this build cannot parse, so an empty normalized list means
 * either "nothing is stored" or "a newer build wrote something we do not
 * understand" — and those two demand opposite actions. Treating the second as
 * the first is how a save, an unattended worker migration, and the detach
 * control each came to delete a collection they simply could not read.
 * @param {unknown} raw the value exactly as stored
 * @returns {raw is unknown[]} a type predicate, so callers keep the narrowing
 */
export function hasStoredPalettes(raw) {
  return Array.isArray(raw) && raw.length > 0;
}

/**
 * The id an entry carries in the RAW stored collection, or "" if it has none.
 *
 * One rule, exported, because "does this entry exist" and "which entry do I
 * write to" must never disagree — they are the same question asked by
 * different call sites, and this module has now been bitten four times by one
 * of them consulting the normalized view instead of the stored one.
 * @param {unknown} entry
 * @returns {string}
 */
export function rawPaletteId(entry) {
  if (!entry || typeof entry !== "object") return "";
  const id = /** @type {any} */ (entry).id;
  return typeof id === "string" ? id.trim() : "";
}

/**
 * The USER tier only: which palette this person has chosen, if any.
 *
 * Deliberately NOT "what is in effect". `resolveEffectivePalette` remains the
 * single answer to that, because it is the only function that knows about the
 * remote, managed and locked tiers. An earlier draft of this took `defaults`
 * and fell back to them, which made it look like a second, competing
 * resolution entry point — and this module's history is emphatic about what
 * two places answering one question costs (see planPolicyApply's comment: six
 * divergences, ten review rounds). It feeds `resolveEffectivePalette`'s `user`
 * slot and nothing else.
 *
 * Tolerates BOTH storage shapes on purpose, and forever, not just at upgrade
 * time: `chrome.storage.sync` means a machine still running an older build can
 * write the single `palette` key back at any moment, long after this device
 * migrated. A migration that only runs on install would leave that user's
 * colors invisible.
 *
 * The pointer and the collection can disagree — the user deleted the active
 * palette, or an admin withdrew the org palette they were on — so a dangling
 * pointer falls back to the first entry rather than to nothing.
 *
 * Returns null for "nothing stored", distinct from `[]` for "an entry exists
 * and is empty". Callers need that difference: null means admin updates should
 * still reach this user. What an EMPTY active palette should mean downstream
 * is deliberately not decided here — today nothing can produce one, because
 * emptying the editor clears the override outright, and the switcher issue
 * (workspace-custom-palette-kbs) owns that question.
 * @param {{ palettes?: unknown, activePaletteId?: unknown, palette?: unknown }} [state]
 * @returns {Swatch[] | null}
 */
export function resolveActiveUserPalette(state) {
  const { palettes, activePaletteId, palette } = state ?? {};
  // Explicitly detached: it does NOT fall through to a stored ENTRY, which is
  // what made the previous "clear the pointer" approach a silent no-op.
  //
  // But it must still consult the legacy key, or this module breaks its own
  // promise to tolerate both shapes forever. `clearUserPalette` writes
  // `palette: []` in the SAME atomic write as the sentinel, so a NON-EMPTY
  // legacy key alongside the sentinel can only mean a machine on an older
  // build wrote after the detach. That is the user's most recent edit, and
  // ignoring it left the two machines showing different colors indefinitely —
  // exactly the divergence the mirror exists to prevent.
  if (activePaletteId === NO_ACTIVE_PALETTE_ID) {
    const afterDetach = normalizePalette(palette);
    return afterDetach.length > 0 ? afterDetach : null;
  }
  // The ORGANIZATION's palette is selected, so nothing of the USER's is active.
  // Same shape as the detach sentinel above: this function answers the user
  // tier, and an org selection means that tier is empty. Falling through would
  // return whichever palette happens to be first, so a user pushed onto the org
  // palette by enforcement would still look like they were on their own.
  if (isOrgPaletteId(activePaletteId)) return null;
  const list = normalizePalettes(palettes, { keepId: activePaletteId });
  // A dangling pointer falls back to the first entry, so this is also the
  // "has any palette at all" test.
  //
  // This fallback also covers a pointer naming an entry this build cannot
  // parse: we show the first entry we CAN read. That is only safe because
  // setUserPalette falls back identically, so what is shown and what is
  // written are the same entry. Change one and you must change the other, or
  // an edit lands in a palette the user was not looking at. The unreadable
  // entry is left untouched and the pointer is never moved, so a newer build
  // keeps seeing its own.
  const active = list.find((p) => p.id === activePaletteId) ?? list[0];
  if (active) return active.swatches;
  const legacy = normalizePalette(palette);
  return legacy.length > 0 ? legacy : null;
}

/**
 * Plan the move from the single-palette shape to the collection. Pure: returns
 * what to write, or null when there is nothing to do.
 *
 * Also repairs a dangling active pointer, because the same read that would
 * migrate is the natural place to notice one, and leaving it dangling makes
 * every later write plan against an entry that is not there.
 *
 * The repair returns the POINTER ALONE, with no `palettes`. That is the whole
 * safety property of this function. `normalizePalettes` is lossy by design —
 * it drops entries this build cannot parse, drops duplicate ids, and truncates
 * at MAX_PALETTES — so writing its output back would turn "fix a dangling
 * pointer" into "rewrite the collection to whatever this build understands",
 * executed unattended by the service worker on every install and every browser
 * start. A device syncing more palettes than this build's cap would have had
 * the surplus permanently deleted, on every machine. Only the genuine legacy
 * migration returns `palettes`, and it only ever writes a collection it just
 * built from a single palette.
 * @param {{ palettes?: unknown, activePaletteId?: unknown, palette?: unknown, raw?: unknown }} [state]
 * @returns {{ palettes?: { id: string, name: string, swatches: Swatch[] }[], activePaletteId: string } | null}
 */
export function planPaletteMigration(state) {
  const { palettes, activePaletteId, palette, raw } = state ?? {};
  // `raw` is the stored value; callers that have only one shape pass it as
  // `palettes`. See hasStoredPalettes for why the raw value is the only honest
  // answer to "is there a collection".
  const stored = raw === undefined ? palettes : raw;
  const existing = normalizePalettes(palettes, { keepId: activePaletteId });
  const [first] = existing;
  if (first) {
    // A deliberate detach is not a dangling pointer. Repairing it would
    // silently re-attach the user to a palette they stepped away from, and if
    // an older build has since written the legacy key, pointing at an entry
    // that does NOT hold that edit would hide it. Resolution honors the legacy
    // key directly, and the next save re-attaches losslessly through
    // setUserPalette's raw splice, so there is nothing to do here.
    if (activePaletteId === NO_ACTIVE_PALETTE_ID) return null;
    // Already migrated. Only act if the pointer names nothing that exists.
    if (existing.some((p) => p.id === activePaletteId)) return null;
    // Not in the NORMALIZED view is not the same as not stored. An entry this
    // build cannot parse is still there, so the pointer is not dangling and
    // repairing it would silently move a user off the palette they are on —
    // unattended, from the worker, on every browser start. (`keepId` rescues
    // the pointed-at entry from MAX_PALETTES truncation, not from being
    // unparseable, so it does not cover this.) Both resolution and the next
    // save already tolerate this state without writing anything.
    if (Array.isArray(stored) && stored.some((e) => rawPaletteId(e) === activePaletteId)) return null;
    return { activePaletteId: first.id }; // pointer only: never rewrite the collection
  }
  // Nothing PARSED, but something may still be stored. If so, leave it
  // completely alone: resolution already falls back to the legacy key, and the
  // next save appends losslessly. Building a collection from the legacy key
  // here would write a single entry over whatever a newer build stored —
  // unattended, from the service worker, on every install and browser start,
  // synced everywhere. This also catches a detached user whose collection this
  // build cannot read, who would otherwise be silently re-attached.
  if (hasStoredPalettes(stored)) return null;
  // Genuinely no collection, so building one from the legacy key is safe even
  // when the pointer says detached.
  const legacy = normalizePalette(palette);
  // Nothing stored at all is not a migration: this user has no override, and
  // writing one here would invent a personal palette they never chose and
  // detach them from an org palette they should still be receiving.
  if (legacy.length === 0) return null;
  return {
    palettes: [{ id: LEGACY_PALETTE_ID, name: LEGACY_PALETTE_NAME, swatches: legacy }],
    activePaletteId: LEGACY_PALETTE_ID,
  };
}

/**
 * Resolve the effective palette from the user override and the packaged default.
 * A non-empty, valid user palette wins; otherwise the default is used. Both are
 * normalized so the consumer always gets canonical data.
 * @param {unknown} userPalette  raw value from chrome.storage.sync (may be undefined)
 * @param {unknown} defaults     packaged default swatches
 * @returns {Swatch[]}
 */
export function resolvePalette(userPalette, defaults) {
  const user = normalizePalette(userPalette);
  if (user.length > 0) return user;
  return normalizePalette(defaults);
}

/**
 * The full source-priority resolution: a central remote team palette wins when
 * present (org rollout — consistent brand colors), else the user's options-page
 * override, else an enterprise managed policy palette (a Workspace admin's
 * org-wide default), else the packaged default. All normalized.
 *
 * Managed sits BELOW the user tier by default, on purpose: the admin request
 * that motivated it asked for org *default* colors, so a managed palette is
 * what staff start from while each person keeps the ability to personalize.
 *
 * `locked` is the escape hatch from that, and the ONLY thing it changes is
 * managed-vs-user. An admin who sets `paletteLocked: true` alongside a palette
 * is stating that staff get the org colors and no others, so managed then
 * outranks the user's own palette. That is precisely the enforcement deferred
 * out of v1 (workspace-custom-palette-sfx: "enforce managed > user").
 *
 * `remote` deliberately still wins over a locked managed palette. The recorded
 * intent was managed-over-USER, and widening it to managed-over-everything is a
 * separate decision that has not been made; in practice it cannot affect a Web
 * Store user, since `CONFIG_BASE` ships empty and remote is therefore absent.
 *
 * A lock with no managed palette does nothing — there is nothing to enforce, so
 * it must not lock a user out of their own colors.
 *
 * Managed data goes through the same normalizePalette path as everything else:
 * Chrome validates the policy's SHAPE against config/managed-schema.json, not
 * that a hex is a real color.
 * @param {{ remote?: unknown, user?: unknown, managed?: unknown, defaults?: unknown, locked?: boolean, activePaletteId?: unknown }} sources
 * @returns {Swatch[]}
 */
export function resolveEffectivePalette({ remote, user, managed, defaults, locked = false, activePaletteId }) {
  const remoteSwatches = normalizePalette(remote);
  if (remoteSwatches.length > 0) return remoteSwatches;
  const managedSwatches = normalizePalette(managed);
  // `locked` no longer displaces the user's palette outright. It decides what
  // an unset pointer DEFAULTS to, and the org palette wins here only when that
  // is what is actually selected. A locked user who has chosen their own gets
  // theirs — the cv2 decision — while a locked user who has chosen nothing
  // still starts on the organization's, which is enforcement's default.
  if (isOrgPaletteId(resolveActivePaletteId({ activePaletteId, managed: managedSwatches, locked }))
    && managedSwatches.length > 0) {
    return managedSwatches;
  }
  const userSwatches = normalizePalette(user);
  if (userSwatches.length > 0) return userSwatches;
  if (managedSwatches.length > 0) return managedSwatches;
  return normalizePalette(defaults);
}

/**
 * The organization's palettes, normalized and given ids.
 *
 * Two policy shapes, and both are supported permanently rather than one being
 * migrated to the other: `palettes` is the named collection an admin publishes
 * when one palette is not enough, and `palette` is the single flat swatch list
 * that shipped first and is already deployed. The collection wins when present;
 * a single palette becomes one entry so everything downstream sees one shape.
 *
 * Values must already be unwrapped from the Admin console's `{"Value": ...}`
 * envelope — lib/config.js `orgPalettes` does that and is the intended caller.
 * @param {{ palettes?: unknown, palette?: unknown }} [policy]
 * @returns {{ id: string, name: string, swatches: Swatch[] }[]}
 */
export function normalizeOrgPalettes(policy) {
  const { palettes, palette } = policy ?? {};
  /** @type {{ id: string, name: string, swatches: Swatch[] }[]} */
  const out = [];
  if (Array.isArray(palettes)) {
    for (const raw of palettes) {
      if (!raw || typeof raw !== "object") continue;
      const name = typeof (/** @type {any} */ (raw).name) === "string"
        ? (/** @type {any} */ (raw).name).trim().slice(0, MAX_PALETTE_NAME)
        : "";
      const swatches = normalizePalette(/** @type {any} */ (raw).swatches);
      // An entry with no name or no usable colours is not a palette a user
      // could pick, so it is dropped rather than shown as an empty choice.
      if (!name || swatches.length === 0) continue;
      out.push({ id: orgPaletteId(out.length), name, swatches });
      if (out.length >= MAX_PALETTES) break;
    }
  }
  if (out.length > 0) return out;
  const legacy = normalizePalette(palette);
  return legacy.length > 0 ? [{ id: orgPaletteId(0), name: ORG_PALETTE_NAME, swatches: legacy }] : [];
}

/**
 * The organization palette currently in effect: the one the pointer names, or
 * the first, which is what bare ORG_PALETTE_ID and an unset pointer both mean.
 * @param {{ id: string, name: string, swatches: Swatch[] }[]} orgList
 * @param {unknown} [activePaletteId]
 * @returns {Swatch[]}
 */
export function orgPaletteSwatches(orgList, activePaletteId) {
  if (!Array.isArray(orgList) || orgList.length === 0) return [];
  const named = orgList.find((p) => p.id === activePaletteId);
  return (named ?? orgList[0])?.swatches ?? [];
}

/**
 * What the palette switcher should offer, and whether it should exist at all.
 *
 * ONE function for both hosts, deliberately. The popup and the options page
 * have diverged on the same policy question six times in this feature's
 * history, every time because the decision lived as branches in two files. The
 * hosts render this; they do not decide it.
 *
 * VISIBILITY. Hidden entirely unless the org palette is enforced or the user
 * turned multi-palette on — that keeps the default experience exactly what
 * ships today. Also hidden when there is nothing to choose between: a lone
 * entry is not a choice, and offering it would be noise.
 *
 * READ-ONLY IS PER ENTRY. Org palettes are admin-only (confirmed 2026-08-20:
 * they are controlled solely from the Workspace admin console, and
 * chrome.storage.managed is read-only to extensions anyway), so an org entry is
 * never editable under enforcement. The user's own entries stay editable even
 * while enforcement is on, which is what the cv2 decision granted.
 * @param {{
 *   orgPalettes?: { id: string, name: string, swatches: Swatch[] }[],
 *   palettes?: { id: string, name: string, swatches: Swatch[] }[],
 *   activePaletteId?: unknown, locked?: boolean, optIn?: boolean,
 * }} [state]
 * @returns {{
 *   visible: boolean, activeId: unknown,
 *   entries: { id: string, name: string, label: string, source: "org" | "user", readOnly: boolean, active: boolean }[],
 * }}
 */
export function planPaletteSwitcher(state) {
  const { orgPalettes = [], palettes = [], activePaletteId, locked = false, optIn = false } = state ?? {};
  const orgList = Array.isArray(orgPalettes) ? orgPalettes : [];
  const userList = Array.isArray(palettes) ? palettes : [];
  const firstOrg = orgList[0]?.swatches;
  const enforced = isPaletteLocked({ managed: firstOrg, locked });
  const activeId = resolveActivePaletteId({ activePaletteId, managed: firstOrg, locked });

  /** @type {{ id: string, name: string, label: string, source: "org" | "user", readOnly: boolean, active: boolean }[]} */
  const entries = [];
  // The display label is decided HERE, not in the hosts: the
  // "Organization (organization)" duplication happened precisely because the
  // suffix rule lived as a ternary copied into two DOM files, and had to be
  // fixed twice. The source matters ("Retail" alone does not say whose it
  // is), except when the name already says it.
  const label = (/** @type {string} */ nm, /** @type {"org"|"user"} */ src) =>
    src !== "org" ? nm
      : nm.toLowerCase().startsWith("organization") ? nm
      : `${nm} (organization)`;
  for (const p of orgList) {
    entries.push({ id: p.id, name: p.name, label: label(p.name, "org"), source: "org", readOnly: enforced, active: false });
  }
  for (const p of userList) {
    entries.push({ id: p.id, name: p.name, label: label(p.name, "user"), source: "user", readOnly: false, active: false });
  }
  // Which entry is actually in effect. This MUST mirror
  // resolveActiveUserPalette, or the switcher highlights something other than
  // the palette the pickers are using — which is the divergence centralizing
  // this decision was supposed to prevent, not introduce.
  //
  //   an explicit id            -> that entry
  //   any org id (bare or org:n) -> the first org entry
  //   nothing selected           -> the FIRST USER entry, because that is what
  //                                 resolveActiveUserPalette falls back to
  //   an explicit detach         -> nothing, because nothing of theirs applies
  const activeEntry = entries.find((e) => e.id === activeId)
    ?? (isOrgPaletteId(activeId)
      ? entries.find((e) => e.source === "org")
      : activeId === NO_ACTIVE_PALETTE_ID
        ? undefined
        : entries.find((e) => e.source === "user"));
  if (activeEntry) activeEntry.active = true;

  // THE OPT-IN IS THE ONLY GATE (owner ruling, 2026-08-24, superseding the
  // 2026-08-22 "any org palette reveals it" rule). Two things changed under
  // that rule: the opt-in now defaults ON, so almost everyone sees the
  // switcher and the old special case earned nothing; and turning it OFF has
  // to mean something, which it could not while an org palette forced the
  // control back on. Off is now the pre-multi-palette experience: one palette,
  // no chooser.
  //
  // Nothing is lost by hiding it. Every palette stays in storage untouched -
  // suppressed, never deleted - so turning the opt-in back on restores the
  // list exactly. And a user who is on their own colors with the opt-in off
  // still has a route to the organization's: the popup's "Use organization
  // colors" button, which exists whenever a policy does.
  //
  // Never with fewer than two entries either: a lone entry is not a choice,
  // and a visible-but-empty control is worse than none - pinned by the
  // empty-dropdown invariant test.
  return { visible: !!optIn && entries.length > 1, entries, activeId };
}

/**
 * Plan the one-time push that happens when the organization's palette BECOMES
 * enforced.
 *
 * The rule (decided by the product owner, 2026-08-20): when the enforced
 * palette becomes active, it becomes the active palette — and the user may then
 * use the switcher to change it. So enforcement is a TRANSITION that writes
 * once, not a standing constraint on selection.
 *
 * That is what makes the stored pointer trustworthy afterwards. Before this,
 * `activePaletteId` was a save artefact: setUserPalette sets it to whichever
 * entry it wrote, so anyone who had ever saved carried a pointer at their own
 * colours, and enforcement had no way to tell that from a deliberate choice.
 * Pushing on the transition overwrites it, so from then on the pointer really
 * does mean "what this person selected".
 *
 * `pushed` is the memory that makes this a transition rather than a state: it
 * records that this enforcement episode has already been applied. Without it
 * every read would re-push and the user could never stay on a palette they
 * chose. It is cleared when enforcement ends so a LATER re-enforcement pushes
 * again — "becomes active" fires each time it becomes active.
 *
 * ASSUMPTION, flagged rather than silently chosen: an admin EDITING the
 * enforced palette during an ongoing enforcement does not re-push. The user's
 * later selection is the more recent intent, and yanking them off it because
 * the admin changed a hex would be surprising. Confirm before relying on it.
 * @param {{ locked?: boolean, managed?: unknown, pushed?: boolean }} [state]
 * @returns {{ pushed: boolean, activePaletteId?: string } | null} null when
 *   there is nothing to do; `activePaletteId` present means also move the pointer
 */
export function planEnforcementPush(state) {
  const { locked = false, managed, pushed = false } = state ?? {};
  const enforced = isPaletteLocked({ managed, locked });
  // Becoming enforced: make the organization's palette the active one.
  if (enforced && !pushed) return { pushed: true, activePaletteId: ORG_PALETTE_ID };
  // Enforcement ended: forget it happened, but leave the pointer alone — the
  // user keeps whatever they were on.
  if (!enforced && pushed) return { pushed: false };
  return null;
}

/**
 * Plan what turning OFF the Multiple palettes opt-in should do.
 *
 * The opt-in is the only thing that shows the chooser, so switching it off
 * leaves exactly one palette in play — and when the organization publishes one,
 * that is the one it should be. Without this, a user who opted in, created a
 * palette, switched to it and then opted out was left sitting on their own
 * colors with no control to leave them (owner, 2026-08-26).
 *
 * APPLIES WHETHER OR NOT THE POLICY IS LOCKED (owner, 2026-08-27, revising the
 * original enforcement-only scope). The first cut reasoned that an unlocked org
 * palette is a starting point rather than a rule, so opting out there should
 * mean "hide the chooser" and leave a palette the user chose alone. The owner
 * decided the other way after testing it: one palette with an org palette
 * published means the org's, and a user who wants their own can say so by
 * leaving the opt-in on. The lock changes whether the org palette is EDITABLE,
 * not which palette a single-palette user is on.
 *
 * A user who has not opted in therefore cannot be stranded on colors they can
 * no longer reach: turning the opt-in back on restores the chooser with every
 * palette still in it.
 *
 * Moves the POINTER and nothing else. Every palette stays in storage — the same
 * suppress-never-delete rule the chooser itself follows.
 * @param {{ managed?: unknown, locked?: boolean, activePaletteId?: unknown }} [state]
 * @returns {{ activePaletteId: string } | null} null when nothing should move
 */
export function planOptOut(state) {
  const { managed, locked = false, activePaletteId } = state ?? {};
  // No organization palette published: nothing to return TO. `locked` is not
  // consulted here on purpose - it decides editability, not the pointer.
  if (normalizePalette(managed).length === 0) return null;
  // Already on the organization's, including via a lock's default for an unset
  // pointer — nothing to move.
  if (isOrgPaletteId(resolveActivePaletteId({ activePaletteId, managed, locked }))) return null;
  return { activePaletteId: ORG_PALETTE_ID };
}

/**
 * Plan the one-time push that happens when an organization palette FIRST
 * APPEARS, for an UNLOCKED policy.
 *
 * The decision (product owner, 2026-08-24, bd `workspace-custom-palette-kyy`,
 * from the field): org colors should be what you land on when your admin
 * publishes them — but only when the palette they would displace was never
 * really chosen.
 *
 * WHY A GUARD AND NOT "ORG ALWAYS WINS". The pointer that shadowed the org
 * palette in the field was set BEFORE any org palette existed, so it could not
 * possibly have meant "I prefer mine to the organization's" — there was nothing
 * to prefer it over. Reading it as a refusal is what produced the report. But
 * the opposite rule, org always wins, silently overrides someone who genuinely
 * did curate their own colors, which is the harm the 0.1.7 org-DEFAULT decision
 * was written to avoid. So the push fires only when the active palette is
 * indistinguishable from the packaged defaults: nothing anyone typed is ever
 * displaced, and the case that actually bites — the "Default" that materializes
 * the first time someone touches the Multiple palettes opt-in — is fixed.
 *
 * LOCKED POLICIES ARE NOT THIS FUNCTION'S BUSINESS. planEnforcementPush owns
 * them, unconditionally and with its own memory, because enforcement is exactly
 * the case where the organization outranks a deliberate choice. Returning null
 * while locked keeps the two episodes independent, so a lock arriving later
 * still pushes even if this one already declined to.
 *
 * `pushed` is the memory, with the same shape as enforcement's: it marks the
 * episode CONSUMED, which is not the same as "the pointer moved". A user whose
 * palette was customized consumes the episode without being moved — otherwise
 * every subsequent read would re-ask, and resetting their colors to the
 * defaults months later would yank them onto the org's for no reason they could
 * connect to anything. Cleared when the org palette goes away, so a later
 * publication is a fresh episode.
 * @param {{ managed?: unknown, locked?: boolean, pushed?: boolean, activeIsCustomized?: boolean }} [state]
 * @returns {{ pushed: boolean, activePaletteId?: string } | null} null when
 *   there is nothing to do; `activePaletteId` present means also move the pointer
 */
export function planOrgDefaultPush(state) {
  const { managed, locked = false, pushed = false, activeIsCustomized = false } = state ?? {};
  const hasOrg = normalizePalette(managed).length > 0;
  // The organization withdrew its palette: forget the episode, leave the
  // pointer alone. Same rule as enforcement ending — the user keeps whatever
  // they are on, and a later publication pushes again.
  if (!hasOrg) return pushed ? { pushed: false } : null;
  if (locked) return null;   // planEnforcementPush owns locked policies
  if (pushed) return null;   // this episode has already been decided
  return activeIsCustomized
    ? { pushed: true }                                     // consumed, nothing moved
    : { pushed: true, activePaletteId: ORG_PALETTE_ID };   // land them on the org's
}

/**
 * Which palette id is active, applying the lock's DEFAULT-SELECTION rule.
 *
 * This is one half of what `paletteLocked` used to mean on its own. Enforcement
 * no longer forces the org palette to win outright (see
 * workspace-custom-palette-cv2): it makes the org palette what a user STARTS
 * on. Someone who has never chosen, under a lock, is on the organization's;
 * someone who picks their own is on theirs, lock or no lock.
 *
 * An explicit pointer therefore always wins, including under enforcement. Only
 * the absence of one consults the lock.
 * @param {{ activePaletteId?: unknown, managed?: unknown, locked?: boolean }} [state]
 * @returns {unknown} the active id, or undefined when nothing is selected
 */
export function resolveActivePaletteId(state) {
  const { activePaletteId, managed, locked = false } = state ?? {};
  const hasOrg = normalizePalette(managed).length > 0;
  // Detached means "none of MY palettes is active", and what applies then IS
  // the org palette when one exists. Mapping it here rather than special-casing
  // it downstream is what keeps this function and resolveEffectivePalette from
  // disagreeing: resolution already falls through to the managed palette for a
  // detached user, so anything that answered "not the org palette" here would
  // have handed a locked, detached user an EDITABLE editor over enforced org
  // colors. With no org palette there is nothing to map it to, and the
  // detached state stands.
  if (activePaletteId === NO_ACTIVE_PALETTE_ID) return hasOrg ? ORG_PALETTE_ID : NO_ACTIVE_PALETTE_ID;
  if (activePaletteId !== undefined && activePaletteId !== null) return activePaletteId;
  return locked && hasOrg ? ORG_PALETTE_ID : undefined;
}

/**
 * May the palette on screen be edited?
 *
 * The other half of the split. Enforcement makes the ORG palette read-only; it
 * does not freeze the whole page. A locked user sitting on a palette of their
 * own may still edit it, which is exactly what the cv2 decision asked for and
 * what `isPaletteLocked` alone could not express.
 * @param {{ activePaletteId?: unknown, managed?: unknown, locked?: boolean }} [stateIn]
 * @returns {boolean}
 */
export function isActivePaletteReadOnly(stateIn) {
  const state = stateIn ?? {};
  if (!isPaletteLocked({ managed: state.managed, locked: state.locked })) return false;
  const active = resolveActivePaletteId(state);
  return isOrgPaletteId(active);
}

/**
 * Is the org palette being ENFORCED right now? True only when an admin set the
 * lock AND published a palette for it to enforce.
 *
 * The UI layers hang every locked behavior off this one predicate — read-only
 * editor, suppressed save, different note copy — so that "locked" cannot come
 * to mean subtly different things in the popup and the options page.
 * @param {{ managed?: unknown, locked?: boolean }} [policy]
 * @returns {boolean}
 */
export function isPaletteLocked(policy) {
  const { managed, locked = false } = policy ?? {};
  return !!locked && normalizePalette(managed).length > 0;
}

/**
 * Stable identity of a palette: its names and hexes, in order. Two palettes
 * with the same key are the same palette as far as a user can tell, so callers
 * use it to answer "did this actually change?" — the popup to skip a no-op
 * save, the options page to avoid writing a personal copy of colors identical
 * to the org's (which would silently shadow the policy).
 * @param {{ name: string, hex: string }[]} list
 * @returns {string}
 */
export function paletteKey(list) {
  return JSON.stringify(list.map(({ name, hex }) => [name, hex]));
}

/**
 * Decide what to show when an enterprise policy arrives AFTER the editor has
 * already rendered — the slow-managed-read case.
 *
 * Pure because the inline version of this was written twice and was wrong both
 * times. The options page compared the editor against the STORED user palette,
 * which with no override differ by construction (the editor shows the baseline,
 * the stored palette is empty), so the branch could never fire in the only case
 * that matters; the popup did not re-seed at all and simply revealed "your
 * organization provides these colors" over the packaged defaults. Both editors
 * then wrote a personal override on the next save, detaching a managed user
 * from a policy they were never actually shown.
 *
 * @param {{ managed?: Swatch[], userPalette?: unknown, showing?: Swatch[], rendered?: Swatch[] }} [state]
 *   `showing` is what the editor currently holds; `rendered` is what it was
 *   seeded with. They differ exactly when the user has started editing.
 * @returns {Swatch[] | null} the palette to display, or null to leave it alone
 */
export function planLatePolicyReseed(state) {
  const { managed = [], userPalette = [], showing = [], rendered = [] } = state ?? {};
  const org = normalizePalette(managed);
  if (org.length === 0) return null; // no policy after all: nothing to correct
  // A stored personal palette outranks the org one, so the screen is already right.
  if (normalizePalette(/** @type {any} */ (userPalette)).length > 0) return null;
  // Mid-edit: a stale baseline is a smaller harm than discarding their typing.
  if (paletteKey(normalizePalette(showing)) !== paletteKey(normalizePalette(rendered))) return null;
  return org;
}

/**
 * Decide what a policy change means for an editor that is already on screen.
 *
 * This is the decision both the popup and the options page make whenever the
 * enterprise policy moves: a late read landing, an admin toggling the lock, an
 * admin editing the org colors, an admin deleting the policy. It used to be
 * imperative branches duplicated across the two hosts, each with its own
 * mutable bookkeeping, and that shape produced the same class of defect nine
 * review rounds running: FIVE times a fix landed in one host and not the other
 * (the locked render branch, the live-listener placement, the removal fallback,
 * the stale-read ordering guard, the post-await write re-check), three times a
 * host planned against a stale snapshot of "does this user have an override",
 * twice a path that had already started overwrote state a later path
 * established. Every individual fix was correct. Nothing stopped the next
 * divergence, because there was no single place the two hosts had to agree.
 *
 * This is that place. Each host now does only its own DOM work — mount or
 * re-mount the editor, hide its own controls, refuse its own writes — and the
 * branch logic exists once.
 *
 * Unifying it turned up a sixth divergence the per-host code had hidden:
 * removing the policy WHILE IT IS LOCKED. Both hosts treated that as an unlock
 * and restored the pre-lock palette, but the options page then returned early
 * and never reached its removal branch, so a user with no override was left
 * looking at the DELETED org colors with the note correctly hidden and nothing
 * explaining them — one Save away from storing them as a permanent override.
 * The popup ran both branches and landed on the packaged defaults. The rule
 * below is the popup's outcome, now reached directly rather than by two
 * branches happening to compose.
 *
 * The rule, for an editor nobody is mid-edit in:
 *   enforced        -> the org palette (it is what is actually in effect)
 *   own palette     -> theirs; on a lock lifting, the one stashed at lock time
 *   neither         -> the org palette, or the packaged defaults with no policy
 *
 * @param {{
 *   managed?: Swatch[], locked?: boolean, wasReadOnly?: boolean, activePaletteId?: unknown,
 *   hasOverride?: boolean, showing?: Swatch[], rendered?: Swatch[],
 *   preLock?: Swatch[] | null, userPaletteAtLoad?: unknown,
 *   defaults?: Swatch[], keepUnsavedOnLock?: boolean, wasManaged?: unknown,
 * }} [state]
 *   `showing` is what the editor holds right now; `rendered` is what it was
 *   seeded with — they differ exactly when the user has started editing.
 *   `hasOverride` is whether a personal palette is actually STORED, never
 *   inferred from the colors differing: an override whose colors match the
 *   policy still shadows it. `preLock` is the stash from the last lock.
 *   `userPaletteAtLoad` is only the fallback for a page that LOADED locked and
 *   was then unlocked, which is safe to read at load time because every write
 *   path refuses while locked, so nothing can have moved in between.
 *   `keepUnsavedOnLock` is the one deliberate host difference: the options page
 *   has an explicit Save, so unsaved rows are work to preserve across a lock,
 *   while the popup auto-saves and deliberately drops its pending debounced
 *   edit (it could not have been written anyway).
 * @returns {{
 *   locked: boolean, readOnly: boolean, remount: boolean,
 *   palette: Swatch[] | null, preLock: Swatch[] | null, hasPolicy: boolean,
 * }}
 *   `locked` is whether enforcement is in force at all; `readOnly` is whether
 *   THIS editor may be edited, which under enforcement depends on whether the
 *   active palette is the organization's or the user's own.
 *   `palette` is null for "leave the editor alone"; `remount` means the
 *   read-only state changed, and since that is fixed at mount the host must
 *   re-mount rather than re-seed.
 */
export function planPolicyApply(state) {
  const {
  managed = [], locked = false, wasReadOnly = false, hasOverride = false,
  showing = [], rendered = [], preLock = null, userPaletteAtLoad = [],
  defaults = [], keepUnsavedOnLock = false, activePaletteId, wasManaged,
} = state ?? {};
  const org = normalizePalette(managed);
  const nextLocked = isPaletteLocked({ managed: org, locked });
  // READ-ONLY is per-entry now, not per-page: enforcement freezes the ORG
  // palette, not the whole editor, so a locked user sitting on a palette of
  // their own may still edit it. With no switcher yet nothing sets
  // activePaletteId, so this equals `nextLocked` today and every existing row
  // below is unaffected — the distinction is what kbs needs to exist.
  const nextReadOnly = isActivePaletteReadOnly({ activePaletteId, managed: org, locked });
  // The editor's readOnly is fixed at mount, so a change to THAT is what
  // forces a re-mount. Previously this asked whether the lock changed, which
  // is the same question only while the two cannot diverge.
  const remount = nextReadOnly !== wasReadOnly;
  const hasPolicy = org.length > 0;
  // The palette a user with nothing of their own falls back to. It moves with
  // the policy in BOTH directions: leaving it on the old org colors after a
  // removal is what let a deleted palette stay on screen.
  const base = hasPolicy ? org : normalizePalette(defaults);

  // Was the stash simply the org palette as it stood before this change? Only
  // meaningful for a user with nothing of their own; someone who chose those
  // colours keeps them whatever the admin does.
  // The previous org palette must actually EXIST for the stash to be a stale
  // copy of it. Without that guard an empty stash — the deliberately-emptied
  // editor — matched an absent previous policy, and the user got colours pushed
  // back at them that they had explicitly deleted. That case is pinned by
  // "deleting every row then locking does not resurrect the deleted palette",
  // and it is exactly why the issue said the naive form of this fix is wrong.
  const previousOrg = normalizePalette(wasManaged);
  const stashIsStaleOrg = previousOrg.length > 0
    && preLock !== null && preLock !== undefined
    && paletteKey(normalizePalette(preLock)) === paletteKey(previousOrg);

  // Only a lock transition moves the stash: taking the lock saves what was on
  // screen, lifting it spends and clears that.
  const nextPreLock = !remount
    ? preLock
    : nextLocked
      ? normalizePalette(keepUnsavedOnLock ? showing : rendered)
      : null;

  /** @type {Swatch[] | null} */
  let palette = nextReadOnly
    ? org
    : remount
      // A lock is lifting, so the org palette is on screen and whatever was
      // there before has to come back. The stash wins over any re-resolution,
      // including for a user with no override: someone who deliberately
      // emptied their editor must not have the org palette pushed back at them
      // just because a lock came and went. That is what makes locking
      // reversible, which is what makes it safe for an admin to try.
      // ...unless the stash is stale. Two ways it can be:
      //
      // The policy is GONE and they have nothing of their own, so the stash
      // holds the deleted org colors. Then the packaged defaults, same as any
      // other removal.
      //
      // Or the admin changed the org COLOURS in the same write that lifted the
      // lock. For a user with nothing of their own the stash is then the
      // PREVIOUS org palette, and restoring it leaves the editor on colours the
      // pickers have already moved off. `wasManaged` is the only way to tell
      // that from a stash the user actually chose — with no override the two
      // are indistinguishable from the new policy alone.
      ? (!hasOverride && (!hasPolicy || stashIsStaleOrg)
        ? base
        : (preLock ?? (hasOverride ? normalizePalette(resolvePalette(userPaletteAtLoad, base)) : base)))
      // No transition. Their own palette is already what is showing, so there
      // is nothing to correct; otherwise follow the policy.
      : hasOverride ? null : base;

  // Mid-edit: a stale baseline is a smaller harm than discarding their typing.
  // Not while READ-ONLY (such an editor holds no edit worth protecting) and
  // not across a re-mount (the transition is authoritative, and no edit could
  // have been saved under it).
  if (palette && !remount && !nextReadOnly
    && paletteKey(normalizePalette(showing)) !== paletteKey(normalizePalette(rendered))) {
    palette = null;
  }

  // Deliberately no `mayWrite`. It would only ever be `!locked`, and a second
  // name for the same fact is how the two drift: the guard a write needs must
  // read the LIVE lock at write time, not a value this plan computed before an
  // await. Each host enforces it in the one function that performs the write.
  return { locked: nextLocked, readOnly: nextReadOnly, remount, palette, preLock: nextPreLock, hasPolicy };
}

/**
 * Decide what the popup's "Use organization palette" control should do.
 *
 * Pure because the alternative kept costing us: this decision lived inline in
 * the popup's click handler and was fixed three times in a row — attachment
 * inferred from colors instead of stored state, then history recorded for a
 * no-op, then the editor left holding a pending edit that the dismissal flush
 * wrote straight back as a fresh override. Each property below is one of those
 * bugs, pinned by a test instead of by care.
 *
 * @param {{ lastSaved?: Swatch[], managed?: Swatch[], hasOverride?: boolean }} [state]
 *   `hasOverride` is whether a personal palette is actually STORED — not
 *   whether the colors differ. An override whose colors match the policy still
 *   shadows it, so the two are not interchangeable.
 * @returns {{ persist: "clear" | "none", record: boolean, editorTarget: Swatch[], message: string }}
 */
export function planManagedReset(state) {
  const { lastSaved = [], managed = [], hasOverride = false } = state ?? {};
  const current = normalizePalette(lastSaved);
  const target = normalizePalette(managed);
  // No policy published: there is nothing to reset to, and the control should
  // not be on screen in the first place.
  if (target.length === 0) {
    return { persist: "none", record: false, editorTarget: current, message: "" };
  }
  const sameColors = paletteKey(current) === paletteKey(target);
  return {
    // ALWAYS the org palette, even when the colors already match: a pending
    // in-debounce edit lives in the DOM inputs, and leaving it there lets the
    // popup's dismissal flush persist it as a new override moments after we
    // told the user they were back on their organization's colors.
    editorTarget: target,
    // Only when the visible colors change. Recording a no-op would add an undo
    // step that re-creates the override the user just shed.
    record: !sameColors,
    // Clearing the stored override is what reattaches them to admin updates.
    // Matching colors with nothing stored means there is genuinely nothing to do.
    persist: !sameColors || hasOverride ? "clear" : "none",
    message:
      sameColors && !hasOverride
        ? "Already using your organization's colors."
        : "Using your organization's colors.",
  };
}

/**
 * Move the swatch at `from` to `to` and re-stamp order. Pure; returns a new
 * array. Out-of-range indices are clamped; a no-op move returns a normalized copy.
 * @param {Swatch[]} list
 * @param {number} from
 * @param {number} to
 * @returns {Swatch[]}
 */
export function reorder(list, from, to) {
  const arr = [...list];
  const n = arr.length;
  if (n === 0) return arr;
  const f = Math.max(0, Math.min(n - 1, from));
  const t = Math.max(0, Math.min(n - 1, to));
  const [moved] = arr.splice(f, 1);
  if (moved) arr.splice(t, 0, moved);
  return arr.map((s, i) => ({ ...s, order: i }));
}
