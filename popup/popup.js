/**
 * Popup wiring: the palette switcher plus an inline palette editor that
 * AUTO-SAVES once an edit SETTLES (blur, Enter, a dismissed color picker) —
 * never mid-keystroke, see onEditorChange. Saved edits show up in an open
 * picker live via the content script's refreshBrandRows. Recent changes can be
 * undone/redone from a persisted history (chrome.storage.local). Import/export,
 * reset, and theme live in the options page ("Settings"). Editing logic is the
 * shared palette-editor component; history math is the pure lib/history.js.
 */

import {
  getUserPalette, setUserPalette, clearUserPalette,
  getPaletteHistory, setPaletteHistory,
  getIntroSeen, setIntroSeen,
  getUpdateNoteVersion, clearUpdateNoteVersion,
} from "../lib/storage.js";
import { noteMessage } from "../lib/update-note.js";
import { resolvePalette, normalizePalette, paletteKey, planManagedReset, planPolicyApply, isActivePaletteReadOnly, planPaletteSwitcher, isOrgPaletteId, orgPaletteSwatches } from "../lib/palette.js";
import { orgSwatches, orgPalettes } from "../lib/config.js";
import { getManagedPolicyWithin, onManagedChanged, getPaletteState, getMultiPalette, setActivePalette } from "../lib/storage.js";
import { getRatingState, setRatingState, getLastHealth } from "../lib/storage.js";
import { recordOpen, shouldShowRatingPrompt, choosePopupBanner, RATE_URL } from "../lib/rating.js";
import { openFeedbackPage } from "../shared/open-feedback.js";
import { drainBackgroundErrors, installPageErrorListener } from "../shared/page-errors.js";
import { initTheme } from "../shared/theme.js";
import { applyBrandmark } from "../shared/brandmark.js";
import { mountPaletteEditor } from "../shared/palette-editor.js";
import { record, undo as undoHistory, redo as redoHistory, canUndo, canRedo, normalizeHistory } from "../lib/history.js";
import { undoIcon, redoIcon } from "../shared/icons.js";

initTheme().catch(() => {}); // apply the saved light/dark/system theme

/**
 * How long a write may wait for the enterprise-policy answer before refusing
 * rather than guessing "unmanaged". Two deadlines, because the two paths can
 * afford different waits:
 *  - interactive saves can wait a while and report failure in the status line;
 *  - the dismissal flush runs during teardown, so it gets a short one.
 * Neither may be unbounded: a managed read that never settles would otherwise
 * swallow the edit silently, which is the failure the old 1500ms cap existed to
 * prevent (it just prevented it by guessing wrong instead).
 */
const SAVE_POLICY_DEADLINE_MS = 3000;
const DISMISS_POLICY_DEADLINE_MS = 200;

/** @returns {Promise<{name:string,hex:string,order:number}[]>} */
async function loadDefaults() {
  const res = await fetch(chrome.runtime.getURL("config/palette.default.json"));
  return (await res.json()).swatches ?? [];
}

async function init() {
  const statusEl = /** @type {HTMLElement} */ (document.getElementById("status"));
  const setStatus = (/** @type {string} */ m) => { statusEl.textContent = m; };

  // Surface errors: this page's own throws, and any background-worker errors
  // buffered since the last open (feedback standard). Local notice only.
  installPageErrorListener(window);
  const hasErrors = await drainBackgroundErrors();

  // Rating bookkeeping runs on EVERY open (the banner slot may still give this
  // open to something else). Persist is best-effort — a failed write just
  // means this open isn't counted.
  const rating = recordOpen(await getRatingState());
  setRatingState(rating).catch(() => {});
  const health = await getLastHealth();
  const ratingEligible = !!RATE_URL && shouldShowRatingPrompt(rating, {
    // Healthy = the last real inject/apply on a Google editor SUCCEEDED. A
    // never-written flag stays ineligible: no recorded success means we've
    // never seen the feature work for this user.
    isExtensionHealthy: health?.ok === true,
  });

  // The update badge exists to bring the user HERE; opening the popup is
  // mission accomplished, so clear it regardless of which banner wins the slot
  // (the stored notice itself survives until dismissed). Best-effort.
  chrome.action.setBadgeText({ text: "" }).catch(() => {});

  // Post-update notice: map the stored updated-to version to its message. An
  // unknown/stale version (e.g. after a later update with no notice) maps to
  // null and is cleared so it can't linger forever.
  const storedNoteVersion = await getUpdateNoteVersion();
  const updateMessage = noteMessage(storedNoteVersion);
  if (storedNoteVersion !== undefined && updateMessage === null) clearUpdateNoteVersion().catch(() => {});

  // ONE banner per open: errors > post-update notice > first-run intro > rating ask.
  const banner = choosePopupBanner({
    hasErrors, hasUpdateNote: updateMessage !== null, introSeen: await getIntroSeen(), ratingEligible,
  });

  // Post-update notice: shown until dismissed; dismissal clears the flag.
  const updateEl = /** @type {HTMLElement | null} */ (document.getElementById("update-note"));
  if (updateEl && banner === "update" && updateMessage !== null) {
    const textEl = document.getElementById("update-note-text");
    if (textEl) textEl.textContent = updateMessage;
    updateEl.hidden = false;
    document.getElementById("update-note-dismiss")?.addEventListener("click", () => {
      updateEl.hidden = true;
      clearUpdateNoteVersion().catch(() => {});
    });
  }

  // First-run intro: reveal only until dismissed. Hiding it is local UI; the
  // persisted flag (best-effort) is what keeps it from returning next open.
  const intro = /** @type {HTMLElement | null} */ (document.getElementById("intro"));
  if (intro && banner === "intro") {
    intro.hidden = false;
    document.getElementById("intro-dismiss")?.addEventListener("click", () => {
      intro.hidden = true;
      setIntroSeen().catch(() => {});
    });
  }

  // Milestone-gated review ask. Both outcomes are one-way: Rate is treated as
  // terminal even if the review isn't completed (re-asking someone who
  // accepted is worse than missing a rating), and No thanks never re-asks.
  const ratingEl = /** @type {HTMLElement | null} */ (document.getElementById("rating"));
  if (ratingEl && banner === "rating") {
    ratingEl.hidden = false;
    document.getElementById("rating-rate")?.addEventListener("click", async () => {
      // Persist the one-shot flag BEFORE opening the tab: creating an active
      // tab closes the popup and tears down this context, so anything
      // sequenced after that await may never run (which would re-ask a user
      // who already accepted). A failed tab-open instead reverts the flag —
      // the rarer failure, and the revert is best-effort by nature.
      try {
        await setRatingState({ ...rating, ratedAt: Date.now() });
        await chrome.tabs.create({ url: RATE_URL });
        ratingEl.hidden = true;
      } catch {
        setRatingState({ ...rating, ratedAt: 0 }).catch(() => {});
        setStatus("Couldn't open the Web Store page.");
      }
    });
    document.getElementById("rating-dismiss")?.addEventListener("click", () => {
      ratingEl.hidden = true;
      setRatingState({ ...rating, dismissedAt: Date.now() }).catch(() => {});
    });
  }


  // Render on a deadline, but never conclude "unmanaged" from a missed one:
  // `prompt` says whether the answer is real, and `settledManaged` is the
  // untimed read we consult before any write that could detach this user.
  const { prompt, settled: settledManaged } = getManagedPolicyWithin();
  const [defaults, userPalette, firstManaged] = await Promise.all([
    loadDefaults(), getUserPalette(), prompt,
  ]);
  // Switcher inputs. `orgList` is the admin's published palettes, `userList`
  // the user's own collection, `activeId` what the pointer says.
  let orgList = orgPalettes(firstManaged.value);
  let policyLocked = !!firstManaged.value.locked;
  const paletteState = await getPaletteState();
  let userList = paletteState.palettes;
  let activeId = paletteState.activePaletteId;
  // Baseline = the org's admin-published palette when there is one, else the
  // packaged defaults; a palette the user chose for themselves still wins over
  // both (same tiering as the content script).
  //
  // THE POINTER IS REQUIRED. An admin may publish SEVERAL named palettes, and
  // without it orgSwatches answers "the first one" - so a user sitting on the
  // second org palette got the first one's colors under the second one's name
  // on every read (field, 2026-08-24). Computed after the storage reads above
  // for exactly that reason: activeId has to exist first.
  let managed = normalizePalette(orgSwatches(firstManaged.value, activeId));
  const multiPalette = await getMultiPalette();
  // Whether THIS editor may be edited. Every locked behaviour below hangs off
  // this one flag, so the popup and the options page cannot drift into
  // different ideas of it.
  //
  // Enforcement freezes the ORG palette, not the whole page, so once a switcher
  // exists a locked user sitting on a palette of their own still edits it. That
  // is why this and not "is enforcement in force" is what the guards read; the
  // latter is a real but different question. The pointer is REQUIRED here: an
  // absent-pointer default would resolve to the org under a lock, rendering a
  // locked switcher-user's own palette read-only over the wrong colors (the
  // same omission that pinned open tabs in bootstrap.js). Computed only after
  // the storage reads above, which is what makes activeId available.
  let readOnly = isActivePaletteReadOnly({
    managed, locked: policyLocked, activePaletteId: activeId,
  });
  // True only while a slow read leaves "is this a managed install?" genuinely
  // unknown. It is NOT the same as "managed.length === 0", and the difference is
  // the whole bug: treating unknown as unmanaged is what wrote a personal
  // override over an org palette that simply had not arrived yet.
  let managedUnknown = firstManaged.timedOut;
  let baseline = managed.length > 0 ? managed : defaults;
  // The persisted, normalized palette this popup last knows about. Also what the
  // editor is SHOWING, which is what the late-policy re-seed compares against.
  // What is actually in effect. Under a lock that is the ORG palette, not the
  // user's — showing someone their own stored colors while the pickers render
  // the org's would be a lie the whole feature exists to avoid.
  let lastSaved = readOnly ? managed : normalizePalette(resolvePalette(userPalette, baseline));
  let history = normalizeHistory(await getPaletteHistory());
  // Whether a personal override is actually STORED — the thing that decides if
  // admin updates reach this user. Deliberately not inferred from "does the
  // palette equal the org's": an override whose colors happen to match the
  // policy (an admin later publishing colors this user had already saved, or an
  // override written by an earlier build) still shadows it, so equality would
  // report "attached" while the next admin update silently misses them.
  let hasOverride = normalizePalette(userPalette).length > 0;

  const undoBtn = /** @type {HTMLButtonElement} */ (document.getElementById("undo"));
  const redoBtn = /** @type {HTMLButtonElement} */ (document.getElementById("redo"));
  // Circular arrow icons (shared/icons.js) before the text labels; the svgs are
  // aria-hidden, so the buttons' visible text stays the accessible name.
  undoBtn.prepend(undoIcon(14));
  redoBtn.prepend(redoIcon(14));
  const refreshButtons = () => {
    undoBtn.disabled = !canUndo(history);
    redoBtn.disabled = !canRedo(history);
  };

  const rowsEl = /** @type {HTMLElement} */ (document.getElementById("rows"));
  /**
   * Mounting is a function because `readOnly` is fixed at mount time but the
   * lock is not: a policy that misses the render deadline can turn enforcement
   * on afterwards, and an editable editor left on screen at that point would
   * invite edits that silently cannot apply.
   * @param {{name:string,hex:string,order:number}[]} initial
   */
  function mountEditor(initial) {
    return mountPaletteEditor(rowsEl, { initial, onChange: onEditorChange, readOnly });
  }
  let editor = mountEditor(lastSaved);
  paintMark();

  /**
   * Render the switcher from the SHARED decision — the same one the options
   * page renders, so the two cannot disagree about what exists.
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
      opt.textContent = entry.label;
      opt.selected = entry.active;
      select.append(opt);
    }
  }

  /**
   * Switch to a different palette.
   *
   * FLUSH FIRST. This editor auto-saves, but only once an edit settles, so at
   * the moment of a switch there may be an unsettled edit sitting in the DOM
   * inputs that belongs to the palette being left. Switching without flushing
   * loses it: `lastSaved` moves to the incoming palette, so when that edit does
   * settle it is measured against the wrong baseline — the user's typing either
   * silently evaporates or lands in the palette they just moved to.
   * Worse, if the incoming palette happened to differ, the outgoing edit would
   * be written into it. Flushing settles the edit where it was made.
   * @param {string} id
   */
  async function switchPalette(id) {
    await flushPending(DISMISS_POLICY_DEADLINE_MS).catch(() => {});
    await inflight;
    await setActivePalette(id);
    activeId = id;
    // Whichever palette we land on, our copy of the user's collection may be
    // stale after the flush, so re-read rather than patch it.
    const state = await getPaletteState();
    userList = state.palettes;
    const nextReadOnly = isActivePaletteReadOnly({
      managed: orgList[0]?.swatches, locked: policyLocked, activePaletteId: id,
    });
    // The org tier follows the pointer too: with several published palettes,
    // "the organization's palette" means the one now selected, and everything
    // downstream that reads `managed` (the note, the write guards, the lock
    // rule) would otherwise still be looking at the previous one.
    //
    // DELIBERATELY NOT gated on isOrgPaletteId. For a personal id
    // orgPaletteSwatches falls back to the org's FIRST palette, and that is
    // the correct answer here: `managed` means "the org palette this user
    // would reattach TO", which persistPalette consults precisely while they
    // are on a palette of their own - editing it to match the org's colors
    // drops the redundant override instead of storing a copy that would cost
    // them every future admin update. Emptying it here silently retires that
    // rule for anyone who arrived by the switcher. It also matches how
    // `managed` is computed at mount, so the same state cannot mean two
    // different things depending on how the user got to it. (roborev 4123
    // proposed the gate; the test named for it fails when applied.)
    managed = normalizePalette(orgPaletteSwatches(orgList, id));
    lastSaved = normalizePalette(isOrgPaletteId(id)
      ? orgPaletteSwatches(orgList, id)
      : userList.find((/** @type {{id:string}} */ p) => p.id === id)?.swatches ?? []);
    hasOverride = !isOrgPaletteId(id) && lastSaved.length > 0;
    if (nextReadOnly !== readOnly) {
      // readOnly is fixed at mount, so this must re-mount rather than re-seed.
      readOnly = nextReadOnly;
      editor = mountEditor(lastSaved);
      applyLockAffordances();
    } else {
      editor.setPalette(lastSaved);
    }
    renderSwitcher();
    paintMark();
    // refreshManagedVisibility refreshes the note too, and the note branches on
    // readOnly, which this switch just changed.
    refreshManagedVisibility();
  }

  /**
   * Show the controls that only make sense when the user owns their palette.
   * Undo/redo/add all end in a write, and the reset link offers a way back to
   * colors you are already on and cannot leave — under a lock they are not
   * disabled but GONE, because a disabled control reads as "broken" where an
   * absent one reads as "not yours", which is the true statement.
   */
  function applyLockAffordances() {
    for (const id of ["undo", "redo", "add", "managed-reset"]) {
      const el = document.getElementById(id);
      if (el) el.hidden = readOnly;
    }
  }
  applyLockAffordances();

  /** @type {{name:string,hex:string,order:number}[] | null} */
  let preLockSaved = null;

  /**
   * Adopt a policy state discovered after the first render — a late read, or an
   * admin changing the policy while this popup is open.
   *
   * The decision is `planPolicyApply`, shared with the options page. This
   * function is only the DOM half: re-mount or re-seed the editor and refresh
   * the org note and controls. Nothing here decides what should be on screen —
   * that duplication is what the two hosts kept diverging over.
   * Takes the WHOLE policy rather than just its palette value: an admin may
   * publish several named palettes under `palettes` instead of the single
   * legacy `palette`, and orgSwatches is what knows about both.
   * @param {{ palette?: unknown, palettes?: unknown } | null | undefined} policy
   * @param {boolean} rawLocked  the policy's lock flag
   */
  function applyPolicy(policy, rawLocked) {
    const next = normalizePalette(orgSwatches(policy, activeId));
    const plan = planPolicyApply({
      managed: next,
      locked: rawLocked, wasReadOnly: readOnly, hasOverride,
      // The pointer rides along so the per-entry lock rule can tell an
      // enforced ORG entry from the user's own under the same lock - without
      // it a policy edit landing while a locked user sat on their own palette
      // remounted the editor read-only over the wrong colors.
      activePaletteId: activeId,
      showing: editor.getWorking(), rendered: lastSaved,
      preLock: preLockSaved, userPaletteAtLoad: userPalette, defaults,
      // The OUTGOING policy. `managed` is not replaced until after this call,
      // so the value is already here; it lets the plan tell a stash the user
      // chose from one that is just the previous org palette.
      wasManaged: managed,
      // The popup auto-saves, so anything on screen beyond `lastSaved` is an
      // unsettled edit that could not have been written under a lock
      // anyway. Dropping it is deliberate; the options page, which has an
      // explicit Save, preserves its unsaved rows instead.
      keepUnsavedOnLock: false,
    });
    managed = next;
    // The switcher's view of the policy has to move with it too, or an admin
    // publishing or withdrawing a palette while the popup is open would leave
    // the control offering something that no longer exists.
    orgList = orgPalettes(policy);
    policyLocked = rawLocked;
    // The baseline moves with the policy in BOTH directions. Only advancing it
    // when a palette exists left a removed policy's colors as the baseline.
    baseline = managed.length > 0 ? managed : defaults;
    preLockSaved = plan.preLock;
    readOnly = plan.readOnly;
    applyLockAffordances();
    if (plan.palette) lastSaved = plan.palette;
    if (plan.remount) {
      // Taking the lock must drop the pending edit too — remounting replaces the
      // DOM inputs it lives in, so nothing is left for the dismissal flush to
      // read and write. That is the hole planManagedReset's scrub also closes.
      // `readOnly` is fixed at mount, so this cannot be re-seeded: an editable
      // editor under a lock invites edits that silently cannot apply.
      editor = mountEditor(lastSaved);
    } else if (plan.palette) {
      editor.setPalette(plan.palette); // setPalette does NOT emit, so no re-save
    }
    paintMark();
    refreshManagedVisibility();
  }

  /**
   * Re-read the user's collection and re-render the switcher, after a write
   * that may have changed how many palettes exist.
   *
   * Adopts `activeId` as well as the collection: setUserPalette moves the
   * stored pointer, and the owner's ruling (2026-08-26) is that a save counts
   * as SELECTING the palette, so this page should agree with storage about
   * which one is active. See the fuller note on the options page's copy - the
   * two must stay in step, because between them they decide what a lock does.
   */
  async function refreshCollection() {
    try {
      const state = await getPaletteState();
      userList = state.palettes;
      activeId = state.activePaletteId;
      renderSwitcher();
    } catch {
      // A failed re-read must never turn a successful save into an error; the
      // chooser simply stays as it was until the next one.
    }
  }

  /**
   * Repaint the header mark and the favicon from the palette now in effect, so
   * this page wears the same colors as the toolbar icon. Called wherever
   * `lastSaved` moves — that is the palette a picker would show.
   */
  function paintMark() { applyBrandmark(lastSaved); }

  /**
   * The palette write currently in flight, if any (already `.catch`ed, so
   * awaiting it never throws). Anything that PLANS against `lastSaved` or
   * `hasOverride` must await this first: those move only when a write lands, so
   * a plan computed mid-write is computed against state the write is about to
   * change. Always settles — persistPalette's waits are bounded.
   * @type {Promise<void>}
   */
  let inflight = Promise.resolve();
  /**
   * The editor's change funnel. This popup auto-saves, so what it chooses to
   * write is a data-integrity decision, not a convenience one.
   *
   * ONLY SETTLED CHANGES ARE WRITTEN. A keystroke in the hex field is interim:
   * #FE5916 is a perfectly valid hex that exists only while someone finishes
   * typing #FE5917, and a debounced per-keystroke save wrote exactly that class
   * of value into sync storage and into undo history (bd
   * workspace-custom-palette-iyv, field 0.2.0). Writing on `change` instead —
   * blur, Enter, or a dismissed color picker — stores the value the user
   * stopped on. Nothing is lost by waiting: the interim value stays in the DOM
   * inputs, and every path that ends an edit (switching palettes, undo/redo,
   * dismissing the popup) flushes those inputs through commit() first.
   * @param {{name:string,hex:string,order:number}[]} _working
   * @param {{ settled: boolean }} [meta]
   */
  function onEditorChange(_working, meta) {
    // Checked here rather than by swapping the onChange handler, because the
    // lock can arrive after mount and this is the single funnel every edit
    // path (typing, undo/redo, eyedropper) passes through.
    if (readOnly) return;
    if (!meta?.settled) return; // interim keystroke: preview only, never persist
    commit().catch((err) => setStatus(`Save failed: ${err?.message ?? err}`));
  }

  /**
   * Commit whatever is currently in the editor NOW (returns its promise) — the
   * interim edit sitting in the DOM inputs included, which is the whole point:
   * this is how a value the user typed but never blurred still gets saved.
   * `deadlineMs` is passed through for teardown callers.
   * @param {number} [deadlineMs]
   */
  function flushPending(deadlineMs) {
    return commit(deadlineMs);
  }

  /**
   * Keep the org note honest as the palette changes. Derived from the current
   * palette rather than a flag read at init: because persistPalette clears the
   * override whenever the palette matches the org's, "same as managed" is
   * exactly "still receiving admin updates". Without this, the auto-saved edit
   * that detaches a user left the note still claiming their organization
   * provides these colors.
   */
  function refreshManagedNote() {
    if (managed.length === 0) return;
    const el = document.getElementById("managed-note-text");
    if (!el) return;
    // Enforced and sitting on the org palette. It cannot be edited here.
    // Saying only that is half the truth once a personal palette exists -
    // switching to it is allowed. With none stored, where they go next depends
    // on the opt-in, so the note reads it: since it began defaulting on
    // (2026-08-24) telling people to "turn on Multiple palettes" was telling
    // them to turn on something already on. Creation lives in Settings either
    // way, because the popup has no New palette control.
    el.textContent = readOnly
      ? (userList.length > 0
        ? "Your organization sets these colors, so they cannot be edited here. You can switch to colors of your own at any time."
        : multiPalette
          ? "Your organization sets these colors, so they cannot be edited here. Use New palette in Settings to make colors of your own."
          : "Your organization sets these colors, so they cannot be edited here. Turn on Multiple palettes in Settings to keep colors of your own alongside them.")
      : hasOverride
        // Their own palette. The org palette is still there to go back to,
        // which is the reassurance that makes switching away safe to try.
        ? "You are using your own colors. Your organization's palette is still there to switch back to."
        : "Your organization provides these colors. Editing them here keeps a personal copy.";
  }

  /**
   * Clear the stored override. The ONE place this popup performs that write.
   *
   * Round ten of this feature found the third path that clears — the
   * "Use organization palette" handler — doing it directly, past an await, with
   * no lock re-check, so a lock landing inside `await inflight` deleted a synced
   * personal palette under active enforcement. The two paths that were correct
   * were correct because someone remembered at each call site; this exists so
   * the next call site cannot get it wrong. Every re-check that matters reads
   * the LIVE `readOnly`, never a value captured before an await.
   *
   * Throwing rather than returning is deliberate: it leaves `lastSaved` and the
   * history untouched, which is what keeps the editor and storage agreeing.
   */
  async function clearOverride() {
    // THE INVARIANT, for every guard in this file: no write may change the
    // ORGANIZATION's palette while enforcement is in force. Not "no write
    // while locked" — that was the old, wider rule, and under
    // workspace-custom-palette-cv2 it is wrong: a locked user sitting on a
    // palette of their own is entitled to edit it, and to step away from it.
    // `readOnly` is that question (isActivePaletteReadOnly); `locked` is only
    // "is enforcement in force at all", which is a different thing and is why
    // the two are tracked separately.
    if (readOnly) {
      throw new Error("your organization sets these colors, so nothing was changed.");
    }
    await clearUserPalette();
    // Set the flag only AFTER the write it describes. Flipping it first meant a
    // rejected write (sync quota is plausible behind an auto-save) left
    // hasOverride=false while the override was still stored: the next click of
    // "Use organization palette" then planned `persist: "none"` and told the user
    // "Already using your organization's colors" while a stored override was
    // still shadowing the policy, with no way to retry the clear.
    hasOverride = false;
  }

  /**
   * Persist a palette — but NEVER as a personal copy of the org's own colors.
   *
   * The history model stores palette arrays and cannot represent "no override",
   * so any path that persists (auto-save, undo, redo) would otherwise write the
   * org palette back as a private copy and silently cut this user off from
   * future admin updates. Deciding clear-vs-set here, in the one place that
   * writes, makes every one of those paths correct at once: identical to the
   * org palette means stay attached to it.
   * @param {{name:string,hex:string,order:number}[]} list
   * @param {number} [deadlineMs] bounded wait for the policy answer
   */
  async function persistPalette(list, deadlineMs = SAVE_POLICY_DEADLINE_MS) {
    // Never decide clear-vs-set on an unknown answer: writing setUserPalette
    // here when a policy actually exists is the permanent, syncs-everywhere
    // detachment this whole module is built to avoid. Waiting costs nothing in
    // practice — by the time anyone edits, the read has long since landed.
    if (!(await ensureManagedKnown(deadlineMs))) {
      // Refuse rather than guess. A dropped edit is recoverable and, on the
      // interactive path, reported in the status line; a wrongly-written
      // override is permanent and syncs to every machine. Throwing leaves
      // lastSaved/history untouched (see commit).
      throw new Error("your organization's colors haven't loaded yet, so nothing was saved. Try again in a moment.");
    }
    // Re-check AFTER the await, because that await is exactly where the lock can
    // first become known: a policy that missed the render deadline settles
    // inside ensureManagedKnown, which calls applyLock. Checking only in
    // onEditorChange leaves two ways through — the late-lock ordering above,
    // and the dismissal flush, which calls commit() directly and never passes
    // onEditorChange at all.
    //
    // Both routes end somewhere bad. The write itself stores an override a
    // locked user cannot have; worse, it desyncs lastSaved from the read-only
    // editor, so the next flush compares the on-screen ORG palette against it,
    // decides they differ, and takes persistPalette's clear branch — deleting
    // the personal palette outright. That is the same irreversibility the
    // !locked guard in wireManagedUi exists to prevent, reached another way.
    //
    // Throwing (not returning) leaves lastSaved and history untouched, which is
    // what keeps the editor and storage agreeing afterwards.
    if (readOnly) {
      throw new Error("your organization sets these colors, so nothing was saved.");
    }
    if (managed.length > 0 && paletteKey(list) === paletteKey(managed)) {
      await clearOverride();
      return;
    }
    await setUserPalette(list);
    hasOverride = true;
  }

  /**
   * Resolve the org palette for certain. No-op once the answer is known.
   *
   * `deadlineMs` bounds the wait for callers that cannot block forever (the
   * dismissal flush runs while this context is being torn down). Returns whether
   * the answer is now known — a false return must NOT be treated as "unmanaged".
   * @param {number} [deadlineMs]
   * @returns {Promise<boolean>}
   */
  async function ensureManagedKnown(deadlineMs) {
    if (!managedUnknown) return true;
    /** @type {{ ok: true, value: { palette: unknown, locked: boolean } } | { ok: false }} */
    const got = deadlineMs === undefined
      ? { ok: true, value: await settledManaged }
      : await Promise.race([
        settledManaged.then((value) => /** @type {const} */ ({ ok: true, value })),
        new Promise((r) => setTimeout(() => r(/** @type {const} */ ({ ok: false })), deadlineMs)),
      ]);
    if (!got.ok) return false;
    // Re-check AFTER the await. The entry guard above only covers a call that
    // has not started; a call already PARKED here when the live handler cleared
    // the flag would otherwise resume and overwrite the policy state the
    // handler just established — with the payload this read started fetching,
    // which may predate an admin deleting the policy entirely. If that stale
    // policy was locked, applyLock would re-mount the editor read-only on a
    // palette that no longer exists and persistPalette would refuse every save
    // for the rest of this popup's life.
    if (!managedUnknown) return true;
    managedUnknown = false;
    applyPolicy(got.value, got.value.locked);
    return true;
  }

  /**
   * Persist the current edit (auto-save) and push the prior state onto history.
   * `deadlineMs` bounds the wait for the org-policy answer on teardown paths.
   *
   * The write happens BEFORE lastSaved/history move. Mutating first meant a
   * refused or failed write left the in-memory state claiming "saved" while
   * storage held the old palette, and undo then stepped from a state that was
   * never persisted.
   * @param {number} [deadlineMs]
   */
  async function commit(deadlineMs) {
    // SERIALIZE. This used to overwrite `inflight` with its own write before
    // checking whether an earlier one had settled, so `await inflight` could
    // resolve while an OLDER write was still running. That older write then
    // landed afterwards and clobbered lastSaved/history with the palette it had
    // captured — which, once switching exists, is the palette the user has just
    // left. The next edit on the new palette then recorded its undo snapshot
    // from the wrong colours, and Undo restored a palette the user was no
    // longer on.
    //
    // Claiming the slot BEFORE awaiting is what makes this a queue rather than
    // a race: a second commit arriving now waits on this one, not on the one
    // this is waiting for.
    const previous = inflight;
    /** @type {() => void} */
    let done = () => {};
    inflight = new Promise((resolve) => { done = () => resolve(); });
    try {
      await previous;
      // Read the editor AFTER the earlier write settled: `lastSaved` may have
      // moved, and the diff below is only meaningful against current state.
      const next = normalizePalette(editor.getWorking());
      if (paletteKey(next) === paletteKey(lastSaved)) return; // no real change
      const nextHistory = record(history, lastSaved);
      await persistPalette(next, deadlineMs);
      await setPaletteHistory(nextHistory);
      history = nextHistory;
      lastSaved = next;
      paintMark();
      // The write may have CREATED a palette: editing the org's colors detaches
      // a personal copy, which is a second entry and therefore a chooser where
      // there was none. Without re-reading, this popup keeps the collection it
      // read at mount and hides a palette that exists (field, 2026-08-26, C3 -
      // reported on the options page, same shape here, and this host reaches it
      // sooner because it auto-saves).
      await refreshCollection();
      refreshButtons();
      refreshManagedNote();
      setStatus("Saved");
    } finally {
      done();
    }
  }

  /** Restore a snapshot from undo/redo: update the editor, storage, and history. */
  async function restore(/** @type {{history: any, restored: any[]} | null} */ res, /** @type {string} */ msg) {
    if (!res) return;
    // Persist BEFORE touching the screen, same discipline as commit(). Updating
    // the editor first meant a refused or failed write left the popup showing a
    // palette that was never stored and that lastSaved disagreed with — and the
    // next Undo then recorded the unsaved palette as a fresh history entry, so
    // two presses of Undo returned the user to where they started.
    //
    // On failure the screen must still be scrubbed back to what IS stored. The
    // "Use organization palette" path reaches here with an unsettled edit
    // alive in the DOM inputs, and planManagedReset always hands over an
    // editorTarget precisely so that edit is cleared — otherwise the dismissal
    // flush reads it, sees it differs from lastSaved, and writes it as a fresh
    // personal override moments after the user asked to go back to the org
    // colors. Leaving the inputs untouched on a failed write reopened that hole.
    const write = (async () => {
      try {
        await persistPalette(res.restored);
        await setPaletteHistory(res.history);
      } catch (err) {
        editor.setPalette(lastSaved); // resync the screen with storage, pending edit and all
        throw err;
      }
      history = res.history;
      lastSaved = res.restored;
      paintMark();
    })();
    inflight = write.catch(() => {});
    await write;
    editor.setPalette(res.restored); // setPalette does NOT emit, so no re-record
    refreshButtons();
    refreshManagedNote();
    setStatus(msg);
  }

  /**
   * Flush the pending edit BEFORE computing undo/redo, so undo steps
   * back from the actually-current editor state (otherwise an in-progress edit is
   * dropped and undo over-steps by one). A flush failure is surfaced and the
   * undo/redo is aborted rather than running against unsaved state.
   * @param {(h: any, cur: any[]) => any} step @param {string} msg
   */
  async function flushThen(step, msg) {
    try {
      await flushPending();
    } catch (err) {
      setStatus(`Save failed: ${err instanceof Error ? err.message : err}`);
      return;
    }
    await restore(step(history, lastSaved), msg).catch((err) => setStatus(`Failed: ${err?.message ?? err}`));
  }
  // Org-managed palette: this editor AUTO-SAVES, so a single tweak writes a
  // personal copy and quietly detaches this user from every future admin
  // update. Say so, keep saying it accurately as they edit, and give them the
  // way back.
  /**
   * Show or hide the managed UI for the CURRENT policy.
   *
   * Split out of wireManagedUi because that runs once, by design (it attaches a
   * click listener). Folding visibility into it meant the org note could be
   * revealed and never hidden again — so an admin REMOVING the policy, which
   * docs/DEPLOY.md explicitly tells them to do at the end of a trial, left the
   * note asserting "your organization sets these colors" above an editor whose
   * inputs had just become editable.
   */
  function refreshManagedVisibility() {
    const note = document.getElementById("managed-note");
    if (note) note.hidden = managed.length === 0;
    const reset = document.getElementById("managed-reset");
    // The reset control only makes sense with a policy to go back TO, and never
    // under a lock (you are already on the org colors and cannot leave).
    if (reset) reset.hidden = managed.length === 0 || readOnly;
    refreshManagedNote();
  }

  let managedUiWired = false;
  async function wireManagedUi() {
    if (managed.length === 0 || managedUiWired) return;
    managedUiWired = true;
    // Heal a redundant override on open: if a stored personal palette is
    // identical to the org's, it buys the user nothing and costs them every
    // future admin update. Clearing reattaches them silently and correctly —
    // no visible change, since the colors are the same. Best-effort; the note
    // and button below stay correct either way because they read hasOverride.
    //
    // NEVER while locked. Under a lock `lastSaved` is the ORG palette by
    // definition, so this comparison is true for every locked user and would
    // delete the personal palette of anyone whose admin turned enforcement on —
    // silently, and irreversibly, so lifting the lock would not give it back.
    // Locking must be reversible; that is what makes it safe to try.
    if (!readOnly && hasOverride && paletteKey(lastSaved) === paletteKey(managed)) {
      try {
        await clearOverride();
      } catch { /* leave the override; the button still offers the way back */ }
    }
    refreshManagedVisibility();
    document.getElementById("managed-reset")?.addEventListener("click", async () => {
      // There is no pending SAVE to cancel (only settled changes commit), but
      // the pending EDIT still sits in the DOM inputs, which is why the plan
      // always hands the editor a target.
      // 1. Scrub the pending edit BEFORE any await — the deliberate exception to
      // "persist before paint". Elsewhere painting first lets a failed write
      // leave unstored colors on screen (that was the two-Undo bug); here the
      // edit left in the inputs IS the hazard, because a dismissal mid-write has
      // commit() read it, see it differs from the unmoved lastSaved, and store it
      // as a fresh override. Safe here because a concurrent flush then reads the
      // org palette, which persistPalette resolves to the same clearUserPalette()
      // already in flight. `managed` is what planManagedReset would hand back as
      // editorTarget whenever a policy exists (pinned by test), and this control
      // only exists then, so scrubbing to it needs no plan.
      editor.setPalette(managed); // setPalette does NOT emit, so no re-save
      // 2. Let any in-flight write land before planning. hasOverride and
      // lastSaved move only when a write completes, so a plan computed mid-write
      // reads pre-write state: a click during setUserPalette(E) saw
      // hasOverride=false / lastSaved=O, planned persist:"none", issued no clear,
      // and reported "Already using your organization's colors" while E was on
      // its way to storage and to every other machine.
      await inflight;
      // Re-check AFTER the await, for the same reason persistPalette does: this
      // is exactly where a lock can land. `applyPolicy` then sets
      // `lastSaved = ORG` and re-mounts read-only, so planManagedReset resumes
      // seeing sameColors AND a stored override, plans persist:"clear", and the
      // branch below deletes the user's synced personal palette under active
      // enforcement — permanently, on every machine. The restore() branch would
      // have refused (its persistPalette throws), but the no-record branch
      // bypasses persistPalette entirely. Lifting the lock puts `preLockSaved`
      // back on screen but not in storage, so closing the popup ends it.
      // `clearOverride` refuses too, but returning here is what produces an
      // honest message instead of a "Failed:" report for a refusal.
      if (readOnly) {
        editor.setPalette(lastSaved);
        setStatus("Your organization sets these colors, so nothing was changed.");
        return;
      }
      const plan = planManagedReset({ lastSaved, managed, hasOverride });
      try {
        if (plan.record) {
          // A visible change, so route through restore() to keep it undoable.
          // Its persistPalette call resolves to clearUserPalette, which is what
          // reattaches this user to future admin updates.
          await restore({ history: record(history, lastSaved), restored: plan.editorTarget }, plan.message);
          return;
        }
        if (plan.persist === "clear") await clearOverride();
        lastSaved = plan.editorTarget;
        // Same invariant as options.js resetToDefault: every assignment to
        // lastSaved repaints. This branch moves it directly instead of going
        // through restore(), which is what repaints on the other branch. Not
        // demonstrated reachable - a test exercising this handler took the
        // restore() branch instead - but held for the same reason.
        paintMark();
        refreshManagedNote();
        setStatus(plan.message);
      } catch (err) {
        // Scrub the pending edit even on failure: leaving it in the inputs is
        // what lets the dismissal flush turn it into a personal override.
        editor.setPalette(lastSaved);
        setStatus(`Failed: ${err instanceof Error ? err.message : err}`);
      }
    });
  }
  await wireManagedUi();
  // A read that missed the render deadline still lands. When it reveals a
  // policy, show the org note and the way back rather than leaving this user
  // looking unmanaged for the life of the popup. (The editor keeps the baseline
  // it rendered with; persistPalette is what must be correct, and it is.)
  if (managedUnknown) {
    settledManaged
      .then(async () => { await ensureManagedKnown(); await wireManagedUi(); })
      .catch(() => {});
  }

  // A live policy change (admin toggles the lock while the popup is open).
  // applyLock already handles the transition; this is the trigger it was
  // missing, since ensureManagedKnown only fires when THIS popup's own read
  // timed out — in the normal fast-read case nothing would ever notice.
  onManagedChanged((rawPalette, policy) => {
    // This callback carries a COMPLETED policy read, so "is this managed?" is
    // now answered. Without clearing the flag, a popup whose own initial read
    // HANGS refuses every save for its lifetime ("your organization's colors
    // haven't loaded yet") even after this handler has established there is no
    // policy at all — and a stale in-flight read landing later would walk
    // `managed` back to a palette the admin has since deleted.
    managedUnknown = false;
    applyPolicy(policy, !!policy?.locked);
    wireManagedUi();
  });

  undoBtn.addEventListener("click", () => { flushThen(undoHistory, "Undid last change"); });
  redoBtn.addEventListener("click", () => { flushThen(redoHistory, "Redid change"); });

  // The popup is dismissed on any outside click (which tears down this context).
  // Flush the pending edit on dismissal so a value typed but never blurred
  // isn't silently lost. Both events can fire as the popup closes; guard
  // so the flush runs at most once. (The awaited storage write may not complete
  // before teardown — best-effort by nature.)
  let flushedOnDismiss = false;
  const flushOnDismiss = () => {
    if (flushedOnDismiss) return;
    flushedOnDismiss = true;
    // Bounded: this runs while the popup context is being torn down, so it can
    // never wait on the untimed policy read the way an interactive save does.
    // On a miss persistPalette refuses the write rather than guessing
    // "unmanaged" — losing an unsettled edit is recoverable, a wrongly-written
    // override is permanent and syncs to every machine.
    // Latch on success: reset on failure so a later dismissal event can retry.
    flushPending(DISMISS_POLICY_DEADLINE_MS).catch(() => { flushedOnDismiss = false; });
  };
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushOnDismiss();
  });
  window.addEventListener("pagehide", flushOnDismiss);

  renderSwitcher();
  document.getElementById("active-palette")?.addEventListener("change", (e) => {
    const id = /** @type {HTMLSelectElement} */ (e.target).value;
    switchPalette(id).catch((err) => setStatus(`Failed: ${err?.message ?? err}`));
  });

  document.getElementById("add")?.addEventListener("click", () => { editor.addRow(); });
  document.getElementById("options")?.addEventListener("click", () => {
    chrome.runtime.openOptionsPage();
    window.close();
  });
  document.getElementById("feedback")?.addEventListener("click", (e) => {
    e.preventDefault();
    openFeedbackPage();
  });
  document.getElementById("report-bug")?.addEventListener("click", (e) => {
    e.preventDefault();
    openFeedbackPage("bug");
  });

  refreshButtons();
}

init().catch((err) => console.error("[brand-palette] popup error", err));
