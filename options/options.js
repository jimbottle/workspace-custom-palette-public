/**
 * Options page wiring. Hosts the shared palette-editor component (the same one
 * the popup mounts) and adds the page's power features: explicit Save, Reset,
 * plain-text import/export, and the theme selector. DOM glue only — editing logic
 * lives in shared/palette-editor.js and the pure lib/* helpers.
 */

import { isValidHex } from "../lib/hex.js";
import { normalizePalette, resolvePalette, paletteKey, planPolicyApply, isActivePaletteReadOnly, planPaletteSwitcher, planOptOut, isOrgPaletteId, orgPaletteSwatches, resolveActiveUserPalette, MAX_SWATCHES, MAX_PALETTES } from "../lib/palette.js";
import { formatPaletteText, parsePaletteText } from "../lib/palette-text.js";
import { orgSwatches, orgPalettes } from "../lib/config.js";
import { getUserPalette, setUserPalette, clearUserPalette, getPaletteState, getMultiPalette, setMultiPalette, setActivePalette, createPalette, deletePalette, renamePalette, ensureDefaultPersonalPalette, getManagedPolicyWithin, onManagedChanged, getTheme, setTheme } from "../lib/storage.js";
import { openFeedbackPage } from "../shared/open-feedback.js";
import { initTheme } from "../shared/theme.js";
import { applyBrandmark } from "../shared/brandmark.js";
import { mountPaletteEditor } from "../shared/palette-editor.js";
import { refreshIcon } from "../shared/icons.js";
import { drainBackgroundErrors, installPageErrorListener } from "../shared/page-errors.js";

initTheme().catch(() => {}); // apply the saved light/dark/system theme
installPageErrorListener(window); // this page's own errors -> local notice
drainBackgroundErrors().catch(() => {}); // buffered service-worker errors -> local notice

/** @typedef {{ name: string, hex: string, order: number }} Swatch */

const rowsEl = /** @type {HTMLElement} */ (document.getElementById("rows"));
const statusEl = /** @type {HTMLElement} */ (document.getElementById("status"));

/** @type {Swatch[]} packaged defaults, loaded once */
let defaults = [];
/**
 * The palette a user falls back to when they have no override of their own: the
 * organization's managed policy palette when an admin published one, else the
 * packaged defaults. This is what the editor seeds with and what Reset restores.
 * @type {Swatch[]}
 */
let baseline = [];
/** True when the baseline came from enterprise policy (drives the note + copy). */
let baselineIsManaged = false;
/**
 * Whether THIS editor may be edited. Enforcement freezes the org palette, not
 * the whole page, so once a switcher exists a locked user sitting on a palette
 * of their own still edits it.
 *
 * This is the ONLY lock-derived state this page tracks. "Is enforcement in
 * force at all" is a real and different question, but nothing here asks it any
 * more now that every guard reads the per-entry rule — the note copy is the
 * one place that will need it back, and that is
 * workspace-custom-palette-cyv's to write.
 */
let paletteReadOnly = false;
/** The org palettes the admin published, and whether they are enforced. */
/** @type {{ id: string, name: string, swatches: Swatch[] }[]} */
let orgList = [];
let policyLocked = false;
/** The user's opt-in to multiple palettes. */
let multiPalette = false;
/** The user's own collection, for the switcher. */
/** @type {{ id: string, name: string, swatches: Swatch[] }[]} */
let userList = [];
/** What the switcher currently shows as selected. */
/** @type {unknown} */
let activeId;
/**
 * Set only when the policy read missed the render deadline: the still-pending
 * untimed read. Any write that decides "personal copy vs stay on the org
 * palette" MUST await it first, because a missed deadline means the answer is
 * unknown, not that the install is unmanaged — and guessing "unmanaged" writes
 * an override that permanently detaches the user from admin updates.
 * @type {Promise<void> | null}
 */
let settledPolicy = null;
/**
 * Has a policy answer been established for certain?
 *
 * The ordering rule this enforces: a COMPLETED live policy beats a read that
 * started earlier. `settled` is the read issued at init and captures its
 * payload at call time, while onManagedChanged issues a fresh read - so the
 * older one can land last and resurrect a policy the admin has since deleted.
 * This page needs the guard more than the popup does: its late read is not
 * behind a write path, so nothing has to be in flight for it to fire.
 */
let policyKnown = false;
/** @type {import("../shared/palette-editor.js").PaletteEditor} */
let editor;
/**
 * The user's stored palette as read at load, assigned once. It is ONLY the
 * fallback for a page that loaded already locked and was then unlocked — there
 * is no stash to restore in that case, and reading a load-time value is safe
 * precisely because every write path refuses while locked, so nothing can have
 * moved in between.
 *
 * It used to be re-assigned at all four write branches and doubled as the
 * "does this user have an override" input, which is the four-site invariant
 * that kept going stale. `hasOverride` carries that question now.
 * @type {Swatch[] | undefined}
 */
let userPaletteAtLoad;
/**
 * Whether a personal override is actually STORED. Never inferred from the
 * colors differing from the org's: an override whose colors match the policy
 * still shadows it, so equality would report "attached" while the next admin
 * update silently missed this user. The popup tracks exactly this flag.
 */
let hasOverride = false;
/**
 * What was on screen immediately before a lock took over, so lifting the lock
 * puts THAT back — including a palette saved during this session, which a
 * load-time snapshot would silently revert.
 * @type {Swatch[] | null}
 */
let preLockRendered = null;
/** What the editor is currently SHOWING (the late-policy guard compares against it). */
/** @type {Swatch[]} */
let rendered = [];

/**
 * Repaint the header mark and the favicon from the palette now on screen, so
 * this page wears the same colors as the toolbar icon. Called wherever
 * `rendered` moves — that is the palette a picker would show.
 */
function paintMark() { applyBrandmark(rendered); }

/**
 * Write the organization note to match what is CURRENTLY on screen.
 *
 * Its own function, and called from every path that changes what is on screen,
 * because this note names a control the user is meant to act on next — so it
 * is wrong the moment that control appears or disappears. It was originally
 * inline in applyManaged, which runs on load and on a policy push but not when
 * the user toggles the opt-in, so flipping the checkbox left them reading
 * instructions for the state they had just left: "Turn on Multiple palettes"
 * beside a ticked box, or "Use New palette" beside a button that had just gone
 * (roborev 4133). Every input it reads — paletteReadOnly, multiPalette,
 * userList — can change without a policy event, which is exactly why it cannot
 * live on the policy path alone.
 */
function refreshManagedNote() {
  const note = document.getElementById("managed-note");
  if (!note) return;
  note.hidden = !baselineIsManaged;
  // Enforced and on the org palette: not editable here, but not a dead end.
  // The note names the control that is ACTUALLY on screen, which is why it
  // reads multiPalette and not just whether palettes exist.
  note.textContent = paletteReadOnly
    ? (!multiPalette
      ? "Your organization sets these colors, so they cannot be edited here. Turn on Multiple palettes below to keep colors of your own alongside them."
      : userList.length > 0
        ? "Your organization sets these colors, so they cannot be edited here. Use the Palette selector to switch to colors of your own."
        : "Your organization sets these colors, so they cannot be edited here. Use New palette below to make colors of your own.")
    // Same honesty rule unlocked as locked: point at the selector only when one
    // is on screen, which needs both the opt-in and something to switch between.
    : multiPalette && userList.length > 0
      ? "Your organization provides a default palette. You can change these colors for yourself, and switch to Organization palette in the Palette selector to go back."
      : "Your organization provides a default palette. You can change these colors for yourself.";
}

/**
 * Adopt a resolved policy palette as the baseline and update the note.
 * @param {Swatch[]} managed
 * @param {boolean} [locked]
 * @param {unknown} [activePaletteId]  the pointer, so the lock rule can tell an
 *   enforced org entry from the user's own under the same lock. Callers that go
 *   through planPolicyApply overwrite its answer there; init() relies on THIS
 *   call, so omitting the pointer pinned a locked user who had switched to a
 *   palette of their own behind a read-only editor showing the org's colors
 *   until some later policy event happened to correct it.
 */
function applyManaged(managed, locked = false, activePaletteId) {
  baselineIsManaged = managed.length > 0;
  baseline = baselineIsManaged ? managed : defaults;
  paletteReadOnly = isActivePaletteReadOnly({ managed, locked, activePaletteId });
  refreshManagedNote();
  paintMark();
  applyLockAffordances();
}

/**
 * Render the switcher from the SHARED decision. This function does DOM only —
 * which palettes exist, which is active and whether the control should appear
 * at all are planPaletteSwitcher's to answer, so the popup and this page
 * cannot drift into different ideas of them.
 */
function renderSwitcher() {
  const plan = planPaletteSwitcher({
    orgPalettes: orgList, palettes: userList,
    activePaletteId: activeId, locked: policyLocked, optIn: multiPalette,
  });
  const host = document.getElementById("switcher");
  const select = /** @type {HTMLSelectElement | null} */ (document.getElementById("active-palette"));
  if (host) host.hidden = !plan.visible;
  if (!select) return;
  select.replaceChildren();
  for (const entry of plan.entries) {
    const opt = document.createElement("option");
    opt.value = entry.id;
    // The source is worth saying out loud: "Retail" alone does not tell you
    // whether your organization set it or you did.
    opt.textContent = entry.label;
    opt.selected = entry.active;
    select.append(opt);
  }
  // Creation is offered ONLY on the Multiple palettes opt-in, still including
  // with a single entry (it is how you reach two). An org palette used to
  // reveal it by itself as the enforced user's route to colors of their own;
  // the owner ruling of 2026-08-23 retired that: org colors replace the
  // default palette outright, and CREATING a personal one starts at the
  // opt-in.
  //
  // MANAGING one they already have does not: rename/delete follow the same
  // rule as the switcher itself (plan.visible), not the opt-in flag. Gating
  // them on multiPalette left a migrated 0.1.7 override - or an org-beside-
  // yours state, which the 2026-08-22 rule deliberately surfaces without any
  // opt-in - showing a selectable, editable own entry whose controls were
  // hidden behind a toggle that reads as unrelated (roborev 4101).
  const newBtn = document.getElementById("new-palette");
  if (newBtn) {
    newBtn.hidden = !multiPalette;
    const delBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("delete-palette"));
    if (delBtn) {
      // Only the user's OWN, currently-active palette can be deleted or
      // renamed, and only while the switcher is offering choices at all -
      // plan.visible false means fewer than two entries are in play, so there
      // is nothing for these controls to act on (and A3/B7 expect them gone).
      const active = plan.entries.find((e) => e.active);
      const canEditOwn = !!(plan.visible && active && active.source === "user");
      delBtn.hidden = !canEditOwn;
      const renBtn = document.getElementById("rename-palette");
      if (renBtn) renBtn.hidden = !canEditOwn;
      delBtn.textContent = "Delete palette";
      delete delBtn.dataset.armed;
    }
  }
  const note = document.getElementById("switcher-note");
  if (note) {
    const active = plan.entries.find((e) => e.active);
    note.textContent = active?.readOnly
      ? "Your organization sets these colors, so they cannot be edited here."
      : "";
    // The note sits outside #switcher (the refresh button between them is
    // always shown), so it follows the chooser's visibility by hand: with no
    // chooser the managed note above already says whose colors these are.
    note.hidden = !plan.visible;
  }
}

/**
 * Hide the controls that can only end in a write the lock forbids.
 *
 * Save, Reset, Add and Import all mutate; Export does not, so it stays — being
 * unable to edit the org palette is no reason to be unable to copy it out.
 */
function applyLockAffordances() {
  for (const id of ["save", "reset", "add", "import"]) {
    const el = document.getElementById(id);
    if (el) el.hidden = paletteReadOnly;
  }
}

/**
 * How long a write may wait for the enterprise-policy answer before refusing.
 * The popup bounds both of its write paths for the same reason: a managed read
 * that never settles must not hang the UI silently.
 */
const SAVE_POLICY_DEADLINE_MS = 3000;

/**
 * Resolve the policy for certain before a write whose branch depends on it.
 * Returns whether it is now known — false means "still unknown", which must NOT
 * be treated as "unmanaged".
 * @param {number} [deadlineMs]
 * @returns {Promise<boolean>}
 */
async function ensureManagedKnown(deadlineMs = SAVE_POLICY_DEADLINE_MS) {
  if (!settledPolicy) return true;
  setStatus("Checking your organization's colors...");
  const settled = await Promise.race([
    settledPolicy.then(() => true, () => true),
    new Promise((r) => setTimeout(() => r(false), deadlineMs)),
  ]);
  if (!settled) return false;
  settledPolicy = null;
  return true;
}

/**
 * The ONE place this page writes the stored override, clear and set alike.
 *
 * Both callers already re-check the lock before AND after their awaits, so this
 * is a backstop rather than the primary guard — but it is the backstop the
 * popup turned out to need: round ten of this feature found a third clear path
 * there that had been written past an await with no re-check, and deleted a
 * synced palette under active enforcement. The guard belongs where the write
 * is, so a future call site inherits it instead of having to remember it. It
 * reads the LIVE `paletteReadOnly`, never a value captured before an await.
 * @param {Swatch[] | null} list  the palette to store, or null to clear
 */
async function writeOverride(list) {
  // THE INVARIANT, for every guard on this page: no write may change the
  // ORGANIZATION's palette while enforcement is in force. Not "no write while
  // locked" — under workspace-custom-palette-cv2 a locked user sitting on a
  // palette of their own is entitled to edit it. `paletteReadOnly` is that
  // question; `paletteLocked` is only "is enforcement in force at all".
  if (paletteReadOnly) {
    throw new Error("Your organization sets these colors, so nothing was changed.");
  }
  if (list === null) {
    await clearUserPalette();
    // Set the flag only AFTER the write it describes: a rejected write that had
    // already flipped it would leave later policy decisions planning against an
    // override state that storage disagrees with.
    hasOverride = false;
    return;
  }
  await setUserPalette(list);
  hasOverride = true;
}

/** Rows a user must fix before anything can be saved. Pure: no policy needed. */
function invalidRows(/** @type {Swatch[]} */ list) {
  return list.filter((s) => !isValidHex(s.hex) || !s.name.trim());
}

/** Shared refusal copy for a policy answer that never arrived. */
function reportPolicyUnknown() {
  setStatus("Your organization's colors haven't loaded yet, so nothing was saved. Try again in a moment.", true);
}

async function loadDefaults() {
  const res = await fetch(chrome.runtime.getURL("config/palette.default.json"));
  const doc = await res.json();
  return doc.swatches ?? [];
}

/** @param {string} msg @param {boolean} [isError] */
function setStatus(msg, isError = false) {
  statusEl.textContent = msg;
  statusEl.classList.toggle("error", isError);
}

async function save() {
  // The Save button is hidden under a lock, so reaching here means something
  // else called it. Refuse rather than write: the value could not take effect
  // and would sit in storage waiting to surprise the user if the lock lifted.
  if (paletteReadOnly) {
    setStatus("Your organization sets these colors, so there is nothing to save.", true);
    return;
  }
  // Validate FIRST. It is pure and has nothing to do with the policy, so putting
  // it behind the wait meant a user with a bad hex got no message at all until
  // the read landed — and none ever, if it did not.
  const firstPass = invalidRows(editor.getWorking());
  if (firstPass.length) {
    setStatus(`Fix ${firstPass.length} swatch(es): every row needs a name and a valid hex.`, true);
    return;
  }
  // THEN settle the policy, and only then read the palette to persist.
  // ensureManagedKnown can re-seed the editor with the org palette, so a
  // snapshot taken before it goes stale in exactly the scenario this all exists
  // for: managed install, slow read, user clicks Save while it is outstanding.
  // The re-seed would put the org colors on screen and save() would then persist
  // the packaged defaults it had already captured as a permanent personal
  // override, announcing "your organization's updates will no longer change
  // them", and revert the org colors it had just been shown.
  if (!(await ensureManagedKnown())) {
    reportPolicyUnknown();
    return;
  }
  // Re-check AFTER the await. That await is precisely where a late lock becomes
  // known — applyPolicy runs inside it and can remount this editor read-only on
  // the org palette. Resuming without re-checking meant the code below read the
  // ORG colors out of the freshly-remounted editor, matched them against the
  // baseline, and called clearUserPalette() — permanently deleting a synced
  // personal palette, for a save the user issued against their OWN colors on a
  // page that was not locked when they clicked. The popup guards the same
  // await for the same reason.
  if (paletteReadOnly) {
    setStatus("Your organization sets these colors, so nothing was saved.", true);
    return;
  }
  const working = editor.getWorking(); // re-read: a re-seed may have replaced it
  const invalid = invalidRows(working);
  if (invalid.length) {
    // A re-seed only ever installs a normalized palette, so this should be
    // unreachable — assert it cheaply rather than reason about it.
    setStatus(`Fix ${invalid.length} swatch(es): every row needs a name and a valid hex.`, true);
    return;
  }
  // Persist the normalized form (canonical hex + order). Use normalizePalette,
  // NOT resolvePalette: the latter falls back to the defaults on an empty list,
  // which would silently re-save the packaged palette after the user deleted
  // every row and then claim "Saved N colors" for colors they just removed.
  const normalized = normalizePalette(working);
  if (normalized.length === 0) {
    // Deleting every row means "no override": clear it so the default palette
    // applies, keep the editor empty, and say what actually happened.
    // They deleted everything, so there is no override any more. Leaving one
    // stored meant a later policy change planned against an override that was
    // no longer there.
    await writeOverride(null);
    await refreshCollection();
    setStatus(
      baselineIsManaged
        ? "All colors removed. Pickers will show your organization's palette. Use Reset to load it back here."
        : "All colors removed. Pickers will show the default palette. Use Reset to load it back here.",
    );
    return;
  }
  // Saving colors IDENTICAL to the org's palette must not write a personal
  // copy: that copy would shadow the policy and quietly stop this user from
  // receiving future admin updates, for a "change" they never made. Clearing
  // instead leaves them on the org palette and still connected to it.
  if (baselineIsManaged && paletteKey(normalized) === paletteKey(normalizePalette(baseline))) {
    await writeOverride(null);
    await refreshCollection();
    editor.setPalette(normalized);
    // A code-driven re-seed, so `rendered` advances. It only has to stay put
    // when the editor holds the USER's own content (a save of their edits, an
    // unsaved import) — that is what makes `showing !== rendered` mean "they
    // are typing". Leaving it stale here instead made the guard report
    // mid-edit forever, so a later org-colors change could never reach them.
    rendered = normalized;
    paintMark();
    setStatus("Using your organization's colors. You will keep getting their updates.");
    return;
  }
  await writeOverride(normalized);
  // The write may have CREATED this palette (detaching from the org's does), so
  // the chooser has to be recomputed or it keeps hiding a real second entry.
  await refreshCollection();
  editor.setPalette(normalized);
  rendered = normalized;
  paintMark();
  setStatus(
    baselineIsManaged
      ? `Saved ${normalized.length} colors as your own. Your organization's updates will no longer change them.`
      : `Saved ${normalized.length} colors. Open a picker to see them.`,
  );
}

/**
 * Re-read the user's collection and re-render the switcher.
 *
 * A save can CREATE a palette — detaching from the org palette writes a new
 * entry — or remove one, and the switcher's visibility is a function of how
 * many entries exist. Without this the page kept the collection it read at
 * mount, so the first save under an org policy produced a real second palette
 * that the chooser refused to show until a reload (field, 2026-08-26, C3).
 *
 * Called after every write that can change the collection rather than only the
 * ones believed to: which writes create an entry is exactly the kind of detail
 * that drifts, and re-reading is cheap next to a write that already happened.
 *
 * ADOPTS `activeId` as well as the collection, and that is the point rather
 * than a detail. `setUserPalette` moves the stored pointer, and the owner's
 * ruling (2026-08-26) is that it should: "saving should count as selecting a
 * palette as the palette would have to be selected to be saved." Taking it
 * here is what keeps this page agreeing with storage about which palette the
 * user is on.
 *
 * It decides what a LOCK then does, so it is worth knowing you are changing
 * that if you touch it: an explicit pointer at a personal palette keeps that
 * palette editable under enforcement (the cv2 rule), where an absent one
 * defaults to the organization's. Moving an enforced user onto the org palette
 * is applyEnforcementPush's job in the service worker, not this function's.
 *
 * A failed re-read leaves the pointer un-adopted in memory for now; storage
 * already has it, so the next read is correct, and reporting a save that
 * succeeded as a failure would be the worse outcome.
 */
async function refreshCollection() {
  try {
    const state = await getPaletteState();
    userList = state.palettes;
    activeId = state.activePaletteId;
    renderSwitcher();
  } catch {
    // A failed RE-READ must never turn a successful save into an error. This
    // runs after the write has already landed but before the success status, so
    // letting it throw would surface "Failed: ..." for a palette that was
    // saved (roborev 4204). The chooser simply stays stale until the next
    // refresh. The popup's copy has always done this; the two disagreeing was
    // the oversight.
  }
}

async function resetToDefault() {
  // Reset means "back to the last SAVED state" - discard unsaved edits by
  // re-reading storage and re-rendering, writing NOTHING. The packaged
  // defaults only matter before the first save, where they ARE the effective
  // saved state, so re-resolving covers every case: an override user gets
  // their last save, a managed no-override user re-seeds to the org baseline,
  // a fresh user re-seeds to the defaults. Because nothing is written, the
  // bounded policy wait and the override clear went away with it - but NOT the
  // lock guards below, which protect the re-render, not the write.
  //
  // The LOCK guard stays. Under a lock the editor is read-only, so there are
  // no unsaved edits to discard, and restoring the user's personal colors into
  // a locked editor showing the organization's would only confuse.
  if (paletteReadOnly) {
    setStatus("Your organization sets these colors, so there is nothing to restore.", true);
    return;
  }
  const state = await getPaletteState();
  // Re-check AFTER the await, exactly as save() does. Dropping the write
  // removed the STORAGE half of this race, not the race: a lock landing while
  // that read is outstanding has applyPolicy remount this editor read-only on
  // the organization's palette, and resuming here would paint the user's
  // personal colors straight back over it - under a note reading "your
  // organization sets these colors", in disabled inputs. Not a bypass, but a
  // page lying about whose colors are on screen. applyPolicy already rendered
  // the right thing, so bail and leave it alone. The wording differs from the
  // pre-await refusal above so a test can tell which guard fired.
  if (paletteReadOnly) {
    setStatus("Your organization sets these colors, so nothing was restored.", true);
    return;
  }
  userList = state.palettes;
  activeId = state.activePaletteId;
  rendered = normalizePalette(isOrgPaletteId(activeId)
    ? orgPaletteSwatches(orgList, activeId)
    : resolveActiveUserPalette(state) ?? baseline);
  editor.setPalette(rendered);
  // INVARIANT: every assignment to `rendered` repaints the mark. This was the
  // one site that did not (roborev 4178). No reachable case was found where it
  // showed - Restore re-reads storage into `rendered`, and the mark already
  // tracked `rendered`, so the two were in sync before and after - and two
  // attempts at a regression test passed with this line removed, which is the
  // evidence for that. Kept anyway, and stated as an invariant rather than a
  // fix: three separate defects in this feature have come from a value moving
  // without its dependent surface following, so "every assignment repaints" is
  // cheaper to hold than to keep re-deriving reachability.
  paintMark();
  renderSwitcher();
  setStatus("Restored your last saved colors.");
}

/**
 * Put palette `id` on screen with `swatches`, re-deriving everything that
 * depends on WHICH entry is active: the org baseline, the read-only state and
 * therefore whether the editor must re-mount, the switcher, the mark and the
 * organization note. Storage is not touched. switchPalette moves the pointer
 * and calls this; refreshPalettes reads the pointer back and calls this.
 *
 * The editor's `readOnly` is fixed at mount, so moving between an org entry and
 * one of the user's own has to RE-MOUNT rather than re-seed — the same reason
 * planPolicyApply carries a `remount` flag. Re-seeding would leave an editable
 * editor showing colours that cannot be edited, or the reverse.
 * @param {unknown} id  the stored pointer, which may be absent or stale
 * @param {Swatch[]} swatches  what to render; the caller has already resolved
 *   which entry (or fallback) that is
 * @returns {boolean} whether the editor is now read-only
 */
function presentPalette(id, swatches) {
  const nextReadOnly = isActivePaletteReadOnly({
    managed: orgList[0]?.swatches, locked: policyLocked, activePaletteId: id,
  });
  // The org tier follows the pointer too: with several published palettes,
  // "the organization's palette" is the one now selected, and `baseline` is
  // what save() compares against to decide whether these colors ARE the org's.
  //
  // DELIBERATELY NOT gated on isOrgPaletteId, for the same reason as the
  // popup's `managed` (see there). A personal id falls back to the org's first
  // palette, which is the palette this user would reattach to. Pointing it at
  // `defaults` instead would do something worse than break the reattach rule:
  // `baselineIsManaged` stays true, so saving a palette that merely matched
  // the PACKAGED colors would report "Using your organization's colors" and
  // clear the override. The `defaults` fallback below is only for having no
  // org palette at all. (roborev 4123 proposed the gate; the test named for it
  // fails when applied.)
  baseline = normalizePalette(orgPaletteSwatches(orgList, id));
  if (baseline.length === 0) baseline = defaults;
  rendered = normalizePalette(swatches);
  if (nextReadOnly !== paletteReadOnly) {
    paletteReadOnly = nextReadOnly;
    editor = mountPaletteEditor(rowsEl, { initial: rendered, readOnly: paletteReadOnly });
    applyLockAffordances();
  } else {
    editor.setPalette(rendered);
  }
  renderSwitcher();
  paintMark();
  // The note branches on paletteReadOnly, which may just have changed, so it
  // moves with it. Without this a locked user who switched to a palette of
  // their own was still told they could not edit what was in front of them -
  // the same staleness roborev 4133 found on the opt-in toggle, one path over.
  refreshManagedNote();
  return nextReadOnly;
}

/**
 * Select a different palette: move the stored pointer, then show it.
 * @param {string} id
 */
async function switchPalette(id) {
  await setActivePalette(id);
  activeId = id;
  const nextReadOnly = presentPalette(id, isOrgPaletteId(id)
    ? orgPaletteSwatches(orgList, id)
    : userList.find((p) => p.id === id)?.swatches ?? []);
  setStatus(nextReadOnly
    ? "Showing your organization's colors."
    : "Switched palette. Edit and Save to change it.");
}

/**
 * Re-read the stored palettes and show whatever is there now.
 *
 * This page reads the collection once at mount and, apart from the enterprise
 * policy, never subscribes to storage. A palette renamed or recoloured in the
 * popup, in a second Settings tab or on another signed-in device is therefore
 * stale here until a reload, and nothing on the page said so (owner request,
 * 2026-09-17). The refresh button beside the selector is the deliberate answer
 * rather than a live storage listener: the editor holds unsaved edits, and a
 * listener would have to decide on its own whether to throw them away.
 *
 * Adopts the pointer, the opt-in and the legacy single palette as well as the
 * collection - everything init() read - so a change to any of them shows up,
 * and save()'s "is this an override?" bookkeeping matches storage again.
 * Which entry to render follows init's rule: the pointer's entry when it names
 * one, else the same resolution a fresh mount would make.
 */
async function refreshPalettes() {
  const [state, optIn, userPalette] = await Promise.all([
    getPaletteState(), getMultiPalette(), getUserPalette(),
  ]);
  userList = state.palettes;
  activeId = state.activePaletteId;
  multiPalette = optIn;
  const multiEl = /** @type {HTMLInputElement | null} */ (document.getElementById("multi-palette"));
  if (multiEl) multiEl.checked = multiPalette;
  userPaletteAtLoad = userPalette;
  hasOverride = normalizePalette(userPalette).length > 0;
  const own = userList.find((p) => p.id === activeId);
  let swatches;
  if (isOrgPaletteId(activeId)) {
    swatches = orgPaletteSwatches(orgList, activeId);
  } else if (own) {
    swatches = own.swatches;
  } else {
    // No pointer, or one that no longer resolves: the same fallback the first
    // mount makes. Under a lock the org palette is in effect, so it is what we
    // show; otherwise the user's stored palette over the org's or the packaged
    // defaults. presentPalette recomputes `baseline` from the same inputs.
    const base = normalizePalette(orgPaletteSwatches(orgList, activeId));
    const locked = isActivePaletteReadOnly({
      managed: orgList[0]?.swatches, locked: policyLocked, activePaletteId: activeId,
    });
    swatches = locked
      ? (base.length > 0 ? base : defaults)
      : resolvePalette(userPalette, base.length > 0 ? base : defaults);
  }
  presentPalette(activeId, swatches);
  setStatus("Palettes refreshed.");
}

/**
 * The next free "Palette N".
 *
 * Counting entries and adding one produced "Palette 2" as the FIRST palette
 * someone created, whenever any other entry already existed - which under an
 * org policy it usually does, because saving an edit to the org palette
 * detaches a copy (field, 2026-08-25). Numbering by what is taken rather than
 * by how many exist means the first one you make is Palette 1, and a name is
 * never reused while its palette is still there.
 * @returns {string}
 */
function nextPaletteName() {
  const taken = new Set(userList.map((p) => p.name));
  for (let n = 1; n <= MAX_PALETTES + 1; n++) {
    if (!taken.has(`Palette ${n}`)) return `Palette ${n}`;
  }
  return "Palette";
}

function addRow() {
  if (!editor.addRow()) setStatus(`Limit is ${MAX_SWATCHES} colors.`, true);
}

function exportText() {
  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("text"));
  box.value = formatPaletteText(editor.getWorking());
  setStatus("Copied current palette into the box below.");
}

/**
 * A name for an imported palette that is not already taken: "Imported", then
 * "Imported 2", "Imported 3". Renaming stays available; this only has to be
 * unambiguous in the switcher on the day of the import.
 * @returns {string}
 */
function importedPaletteName() {
  const taken = new Set(userList.map((p) => p.name));
  if (!taken.has("Imported")) return "Imported";
  for (let n = 2; n <= MAX_PALETTES + 1; n++) {
    if (!taken.has(`Imported ${n}`)) return `Imported ${n}`;
  }
  return "Imported";
}

/**
 * Import the pasted list.
 *
 * WHERE the colors land depends on the Multiple palettes opt-in, which is the
 * whole point of bd `workspace-custom-palette-m5g`: once a switcher exists,
 * overwriting whatever palette happens to be selected is a destructive answer
 * to "add these colors", so the import becomes a NEW palette and switches to
 * it. With the opt-in off there is no switcher and no second palette to make,
 * so it keeps the original behavior exactly - load into the editor and let
 * Save decide - and the default experience is unchanged.
 */
async function importText() {
  // Import is hidden outright while the active palette is enforced
  // (applyLockAffordances), so this is the backstop for a direct call. It stays
  // an outright refusal rather than an import-as-new: a locked user reaches
  // import-as-new by first switching to a palette of their own, where this
  // guard is false anyway.
  if (paletteReadOnly) {
    setStatus("Your organization sets these colors, so they cannot be replaced.", true);
    return;
  }
  const box = /** @type {HTMLTextAreaElement} */ (document.getElementById("text"));
  // Use normalizePalette, NOT resolvePalette: the latter falls back to defaults
  // on an empty result, which would silently replace the user's palette with the
  // packaged default and falsely report success. We want a real "nothing valid".
  const next = normalizePalette(parsePaletteText(box.value));
  if (next.length === 0) {
    setStatus("No colors found. Use one per line, like: Brand Blue #1A73E8", true);
    return;
  }
  if (!multiPalette) {
    editor.setPalette(next);
    setStatus(`Imported ${next.length} colors. Review, then Save.`);
    return;
  }
  // Same materialize-first rule as the New palette button: with no org palette
  // and no stored entry, what is on screen is the packaged fallback, which the
  // switcher cannot list - so creating beside it would orphan it.
  if (userList.length === 0 && orgList.length === 0) {
    await ensureDefaultPersonalPalette(defaults);
  }
  const name = importedPaletteName();
  const { id } = await createPalette(name, next);
  userList = (await getPaletteState()).palettes;
  await switchPalette(id); // remounts on the imported colors and re-renders
  setStatus(`Imported ${next.length} colors into a new palette, "${name}".`);
}

/**
 * Adopt a policy discovered after the first render — a late read, or an admin
 * toggling it while this page is open.
 *
 * The decision is `planPolicyApply`, shared with the popup. This function is
 * only the DOM half: re-mount or re-seed the editor, and update the note and
 * the controls. Nothing here decides what should be on screen; that is exactly
 * the duplication the two hosts kept diverging over.
 */
function applyPolicy(/** @type {Swatch[]} */ managed, /** @type {boolean} */ locked) {
  const plan = planPolicyApply({
    managed, locked, wasReadOnly: paletteReadOnly, hasOverride,
    // The pointer rides along so the per-entry lock rule can tell an enforced
    // ORG entry from the user's own under the same lock. Without it a policy
    // edit landing while a locked user sat on their own palette remounted the
    // whole editor read-only over the wrong colors.
    activePaletteId: activeId,
    showing: editor ? editor.getWorking() : rendered,
    rendered, preLock: preLockRendered, userPaletteAtLoad, defaults,
    // The OUTGOING org palette, still in `baseline` until applyManaged below
    // replaces it. Same purpose as the popup's `wasManaged`.
    wasManaged: baselineIsManaged ? baseline : [],
    // This page has an explicit Save, so unsaved rows are work to preserve
    // across a lock. The popup auto-saves and drops its pending edit instead.
    keepUnsavedOnLock: true,
  });
  preLockRendered = plan.preLock;
  policyLocked = plan.locked;
  // The POINTER must ride along here too, not just into planPolicyApply above.
  // applyManaged recomputes readOnly and then renders the note and the lock
  // affordances FROM ITS OWN ANSWER; the adopt below fixes the variable but
  // re-renders nothing. Omitting the pointer therefore hid Save and showed the
  // enforced note for a user sitting on a palette of their own under a lock -
  // whose palette is editable (the cv2 rule) - every time a policy event
  // landed. Latent until a save started moving the pointer (2026-08-26).
  applyManaged(managed, plan.locked, activeId); // baseline, note copy, control visibility
  // ADOPT the plan's read-only rather than trusting applyManaged's recompute,
  // which is pointer-blind and so collapses back onto the lock. The editor is
  // mounted from plan.readOnly below, and the tracked value is what feeds the
  // NEXT plan as wasReadOnly — if the two disagree, a re-mount is missed or
  // fired spuriously. The popup already does this; keeping the recompute for
  // the initial-load path only is what stops the two hosts drifting apart.
  paletteReadOnly = plan.readOnly;
  if (plan.palette) { rendered = plan.palette; paintMark(); }
  if (plan.remount) {
    // `readOnly` is fixed at mount, so a lock change cannot be re-seeded — an
    // editable editor left on screen under a lock invites edits that silently
    // cannot apply, and a read-only one after an unlock is just broken.
    editor = mountPaletteEditor(rowsEl, { initial: rendered, readOnly: plan.readOnly });
  } else if (plan.palette) {
    editor.setPalette(plan.palette);
  }
}

/**
 * Fill the footer version. Runs BEFORE anything is awaited, and outside
 * init()'s failure path: the number's whole job is to be quotable in a bug
 * report, and the moment someone is most likely to file one is when this page
 * has just told them "Failed to load". Stranding it behind the awaits left it
 * blank in exactly that state, and showed a dangling separator until then.
 *
 * Read from the manifest rather than written into the markup, so it cannot go
 * stale on a version bump.
 */
function showVersion() {
  const el = document.getElementById("version");
  // The separator lives with the text, so nothing dangles if this never runs.
  // Non-breaking spaces, matching the separator in the markup exactly: a plain
  // space here rendered a visibly narrower gap than the one before it.
  if (el) el.textContent = `\u00A0\u00B7\u00A0Version ${chrome.runtime.getManifest().version}`;
}
showVersion();

async function init() {
  // Render on a deadline, but keep the untimed read: a missed deadline means
  // "unknown", never "unmanaged". Concluding the latter let Save write a
  // personal override on top of an org palette that had simply not arrived,
  // permanently detaching the user from admin updates.
  const { prompt, settled } = getManagedPolicyWithin();
  const [loadedDefaults, userPalette, firstManaged, paletteState, optIn] = await Promise.all([
    loadDefaults(), getUserPalette(), prompt, getPaletteState(), getMultiPalette(),
  ]);
  defaults = loadedDefaults;
  // Switcher inputs. Read here rather than derived later so the control and the
  // editor are seeded from one snapshot.
  orgList = orgPalettes(firstManaged.value);
  policyLocked = !!firstManaged.value.locked;
  userList = paletteState.palettes;
  activeId = paletteState.activePaletteId;
  multiPalette = optIn;
  // An admin-published palette becomes this user's baseline (their "default"),
  // but never overrides a palette they chose for themselves — same tiering as
  // the content script's resolveEffectivePalette. The pointer rides along so
  // the lock rule sees WHOSE entry is active: this call is what the first mount
  // is built from, and there is no later planPolicyApply to correct it when the
  // policy read landed inside the deadline (the usual case).
  applyManaged(normalizePalette(orgSwatches(firstManaged.value, activeId)), firstManaged.value.locked, activeId);
  // What the editor is actually SHOWING. The re-seed guard below has to compare
  // against this, not against the stored user palette: with no override those
  // two differ by construction (the editor shows the baseline, the stored
  // palette is empty), so a guard written against the stored palette can never
  // fire in the one case that matters — a managed user whose slow read rendered
  // the packaged defaults. They would then get the "your organization provides
  // these colors" note over the wrong colors, and Save would write an override.
  // Under a lock the ORG palette is what is in effect, so it is what we render.
  // resolvePalette gives the USER's stored palette precedence, which would show
  // a locked user their own colors, read-only, beneath a note saying their
  // organization sets them — while every picker rendered the org's. Export would
  // then copy the wrong palette out too. The popup guards the same thing.
  userPaletteAtLoad = userPalette;
  hasOverride = normalizePalette(userPalette).length > 0;
  rendered = paletteReadOnly
    ? normalizePalette(baseline)
    : normalizePalette(resolvePalette(userPalette, baseline));
  policyKnown = !firstManaged.timedOut;
  if (firstManaged.timedOut) {
    settledPolicy = settled.then((raw) => {
      // A live change may have landed while this read was outstanding. Applying
      // the older payload would re-show a deleted policy - re-locking the page
      // read-only on colors that no longer exist, or reverting a colors edit.
      if (policyKnown) return;
      policyKnown = true;
      applyPolicy(normalizePalette(orgSwatches(raw, activeId)), raw.locked);
    });
  }
  editor = mountPaletteEditor(rowsEl, { initial: rendered, readOnly: paletteReadOnly });
  paintMark(); // `rendered` is only final here; applyManaged above ran before it
  renderSwitcher();

  // Registered ONCE, here, for an admin toggling the policy while this page is
  // open. It must not live inside applyPolicy: that only runs on a late read or
  // from this listener, so on a fast read nothing would ever subscribe — and
  // when it did, every lock transition would add another listener.
  onManagedChanged((rawPalette, policy) => {
    // This callback carries a COMPLETED read, so the answer is now known and
    // any older in-flight read must not overwrite it.
    policyKnown = true;
    settledPolicy = null; // ensureManagedKnown can short-circuit from here on
    applyPolicy(normalizePalette(orgSwatches(policy, activeId)), !!policy?.locked);
  });

  // Report a rejected write rather than letting it become an unhandled
  // rejection off the click handler, which is silence from the user's side.
  const report = (/** @type {unknown} */ err) =>
    setStatus(`Failed: ${err instanceof Error ? err.message : err}`, true);
  document.getElementById("rename-palette")?.addEventListener("click", async () => {
    const select = /** @type {HTMLSelectElement | null} */ (document.getElementById("active-palette"));
    const input = /** @type {HTMLInputElement | null} */ (document.getElementById("rename-input"));
    if (!select || !input) return;
    // Swap the selector for an inline input; Enter or blur commits, Escape
    // abandons. No dialogs - the popup pattern everywhere else is inline.
    const current = userList.find((p) => p.id === activeId);
    input.value = current?.name ?? "";
    select.hidden = true; input.hidden = false; input.focus(); input.select();
    const done = async (/** @type {boolean} */ commit) => {
      input.hidden = true; select.hidden = false;
      if (!commit) return;
      try {
        await renamePalette(String(activeId), input.value);
        userList = (await getPaletteState()).palettes;
        renderSwitcher();
        setStatus("Palette renamed.");
      } catch (err) { report(err); }
    };
    input.onkeydown = (ev) => {
      if (ev.key === "Enter") { input.onblur = null; done(true); }
      if (ev.key === "Escape") { input.onblur = null; done(false); }
    };
    input.onblur = () => done(true);
  });
  document.getElementById("delete-palette")?.addEventListener("click", async (e) => {
    const btn = /** @type {HTMLButtonElement} */ (e.target);
    // Destructive and synced everywhere: inline two-step confirm instead of a
    // blocking dialog. First click arms; second deletes; leaving disarms.
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1";
      btn.textContent = "Really delete?";
      btn.addEventListener("blur", () => {
        delete btn.dataset.armed; btn.textContent = "Delete palette";
      }, { once: true });
      return;
    }
    try {
      const id = String(activeId);
      await deletePalette(id);
      const state = await getPaletteState();
      userList = state.palettes;
      activeId = state.activePaletteId;
      const next = userList.find((p) => p.id === activeId) ?? userList[0];
      if (next) {
        await switchPalette(next.id);
      } else {
        rendered = normalizePalette(baseline);
        paintMark();
        editor.setPalette(rendered);
        renderSwitcher();
      }
      setStatus("Palette deleted.");
    } catch (err) { report(err); }
  });
  document.getElementById("new-palette")?.addEventListener("click", async () => {
    try {
      // With no organization palette and no stored entry, the palette on
      // screen is the PACKAGED DEFAULTS - a resolution fallback, not a stored
      // one, so the switcher could never list it and creating would orphan it
      // (field finding, 2026-08-22). Materialize it first as a real, renamable
      // "Default". Under an org palette that fallback is the ORG's instead,
      // which the switcher already lists - so nothing is materialized there:
      // the first personal palette is simply new and empty (owner ruling,
      // 2026-08-23; seeding a personal Default beside the org's also shadowed
      // the org colors on unlocked installs).
      if (userList.length === 0 && orgList.length === 0) {
        await ensureDefaultPersonalPalette(defaults);
        userList = (await getPaletteState()).palettes;
      }
      const { id } = await createPalette(nextPaletteName());
      userList = (await getPaletteState()).palettes;
      await switchPalette(id); // remounts editable-empty and re-renders
      setStatus("New palette created. Add colors and Save.");
    } catch (err) { report(err); }
  });
  document.getElementById("active-palette")?.addEventListener("change", (e) => {
    const id = /** @type {HTMLSelectElement} */ (e.target).value;
    switchPalette(id).catch(report);
  });
  const refreshBtn = /** @type {HTMLButtonElement | null} */ (document.getElementById("refresh-palettes"));
  if (refreshBtn) {
    refreshBtn.replaceChildren(refreshIcon(16));
    refreshBtn.addEventListener("click", async () => {
      // Refreshing replaces what the editor shows, so unsaved edits would go
      // with it - the same shape of harm as Reset, so it gets the same inline
      // two-step confirm when, and only when, there is something to lose:
      // first click arms with an advisory, second refreshes, clicking away
      // disarms. A clean editor refreshes on the first click.
      const dirty = paletteKey(normalizePalette(editor.getWorking())) !== paletteKey(rendered);
      if (dirty && !refreshBtn.dataset.armed) {
        refreshBtn.dataset.armed = "1";
        setStatus("You have unsaved changes. Click refresh again to discard them and load the saved palettes.");
        refreshBtn.addEventListener("blur", () => { delete refreshBtn.dataset.armed; }, { once: true });
        return;
      }
      delete refreshBtn.dataset.armed;
      try {
        await refreshPalettes();
      } catch (err) {
        report(err);
      }
    });
  }

  const multiEl = /** @type {HTMLInputElement | null} */ (document.getElementById("multi-palette"));
  if (multiEl) {
    multiEl.checked = multiPalette;
    multiEl.addEventListener("change", () => {
      multiPalette = multiEl.checked;
      setMultiPalette(multiPalette).catch(report);
      // Revealing or hiding the controls is immediate. The NOTE has to move
      // with them: it names whichever of them the user should act on next, so
      // leaving it behind points them at a control that just vanished, or at
      // the checkbox they are already holding (roborev 4133).
      renderSwitcher();
      refreshManagedNote();
      // Turning the opt-in OFF leaves one palette in play, and under
      // enforcement that has to be the organization's - otherwise opting out
      // strands the user on their own colors with no chooser to leave them.
      // planOptOut owns the rule; this only carries it out, and switchPalette
      // moves the pointer without touching any stored palette.
      const plan = multiPalette ? null : planOptOut({
        managed: orgList[0]?.swatches, locked: policyLocked, activePaletteId: activeId,
      });
      if (plan) switchPalette(plan.activePaletteId).catch(report);
    });
  }

  // Opens in its own tab rather than navigating away: an admin building a
  // payload is usually mid-way through configuring their palette here, and
  // losing that to a one-way trip would be its own small bug.
  document.getElementById("policy-builder")?.addEventListener("click", () => {
    window.open(chrome.runtime.getURL("options/policy-builder.html"), "_blank");
  });

  document.getElementById("add")?.addEventListener("click", addRow);
  document.getElementById("save")?.addEventListener("click", () => { save().catch(report); });
  document.getElementById("reset")?.addEventListener("click", async (e) => {
    const btn = /** @type {HTMLButtonElement} */ (e.currentTarget);
    // Reset silently discards unsaved edits, which users read as losing work -
    // the same shape of harm as deleting a palette, so it gets the same inline
    // two-step confirm: first click arms with an advisory, second resets,
    // clicking away disarms. Under a lock nothing of theirs is on screen to
    // discard, so it refuses without arming (same wording as resetToDefault's
    // own guard, which stays the backstop for the direct call).
    if (paletteReadOnly) {
      setStatus("Your organization sets these colors, so there is nothing to restore.", true);
      return;
    }
    if (!btn.dataset.armed) {
      btn.dataset.armed = "1";
      btn.textContent = "Really reset?";
      setStatus("Reset returns to your last saved colors. Any changes you have not saved will be lost.");
      btn.addEventListener("blur", () => {
        delete btn.dataset.armed;
        btn.textContent = "Reset";
      }, { once: true });
      return;
    }
    try {
      await resetToDefault();
    } catch (err) {
      report(err);
    }
    delete btn.dataset.armed;
    btn.textContent = "Reset";
  });
  document.getElementById("export")?.addEventListener("click", exportText);
  document.getElementById("import")?.addEventListener("click", () => { importText().catch(report); });
  document.getElementById("feedback")?.addEventListener("click", (e) => {
    e.preventDefault();
    openFeedbackPage();
  });
  document.getElementById("report-bug")?.addEventListener("click", (e) => {
    e.preventDefault();
    openFeedbackPage("bug");
  });

  // Theme selector (System / Light / Dark). Persisting it triggers initTheme's
  // storage listener, which applies the change live across open pages.
  const themeSel = /** @type {HTMLSelectElement | null} */ (document.getElementById("theme"));
  if (themeSel) {
    themeSel.value = await getTheme();
    themeSel.addEventListener("change", () => {
      setTheme(/** @type {"system" | "light" | "dark"} */ (themeSel.value)).catch((err) =>
        setStatus(`Failed to save theme: ${err?.message ?? err}`, true),
      );
    });
  }
}

init().catch((err) => setStatus(`Failed to load: ${err?.message ?? err}`, true));
