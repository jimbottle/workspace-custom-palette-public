/**
 * Pure rating-prompt logic, ported from the fleet's proven module
 * (ebay-watchlist-watch / haunted-doll-watchlist `shared/rating.js`) and split
 * to this repo's convention: ALL state math and predicates live here with no
 * DOM and no chrome.*; storage I/O lives in lib/storage.js; the popup wires
 * them together. Unit-tested in Node.
 *
 * The prompt shows at most once, only after real sustained use (open-count AND
 * time gates), and only while the extension looks healthy — asking someone to
 * rate a broken-looking extension is asking for a bad review.
 *
 * @typedef {{ popupOpenCount: number, firstOpenAt: number, dismissedAt: number, ratedAt: number }} RatingState
 */

/** Chrome Web Store extension ID (the live listing's; provided by Evan
 * 2026-08-15, bd workspace-custom-palette-iml). If ever empty again, RATE_URL
 * is empty and the prompt is suppressed entirely (see the popup gate). */
export const EXTENSION_ID = "hchpnnppgakgmobkbldgkohmplkcahjl";

/** The Web Store reviews deep link, or "" while EXTENSION_ID is unset. */
export const RATE_URL = EXTENSION_ID
  ? `https://chromewebstore.google.com/detail/${EXTENSION_ID}/reviews`
  : "";

/** Open-count gate: popup opens before the prompt is considered. */
export const RATING_PROMPT_MIN_OPENS = 10;

/** Time gate: days since the FIRST popup open (a same-day burst of opens
 * shouldn't trigger the prompt). */
export const RATING_PROMPT_MIN_DAYS = 5;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/** @type {Readonly<RatingState>} */
export const DEFAULT_RATING_STATE = Object.freeze({
  popupOpenCount: 0,
  firstOpenAt: 0,
  dismissedAt: 0,
  ratedAt: 0,
});

/**
 * Coerce arbitrary stored data into a valid RatingState (defensive on read).
 * Non-finite / negative fields fall back to 0 so corrupt storage degrades to
 * "not yet," never to a crash or an instant prompt.
 * @param {unknown} raw
 * @returns {RatingState}
 */
export function normalizeRatingState(raw) {
  const obj = raw && typeof raw === "object" ? /** @type {any} */ (raw) : {};
  const num = (/** @type {unknown} */ v) => (typeof v === "number" && Number.isFinite(v) && v > 0 ? v : 0);
  return {
    popupOpenCount: num(obj.popupOpenCount),
    firstOpenAt: num(obj.firstOpenAt),
    dismissedAt: num(obj.dismissedAt),
    ratedAt: num(obj.ratedAt),
  };
}

/**
 * Bookkeeping for a popup open: bump the count and stamp firstOpenAt only on
 * the very first open, so the time gate anchors to the user's first engagement.
 * Pure — the caller persists the result.
 * @param {unknown} state  raw stored state (normalized internally)
 * @param {number} [now]
 * @returns {RatingState}
 */
export function recordOpen(state, now = Date.now()) {
  const s = normalizeRatingState(state);
  return {
    ...s,
    popupOpenCount: s.popupOpenCount + 1,
    firstOpenAt: s.firstOpenAt || now,
  };
}

/**
 * Should the rating prompt show? True only when ALL hold:
 *   - the user has neither dismissed nor rated (both one-way)
 *   - popupOpenCount reached the open-count threshold
 *   - at least minDays passed since the first popup open
 *   - the extension is currently healthy (caller-supplied; here that means the
 *     last inject/apply health probe on a Google editor succeeded)
 * Non-finite counts / missing timestamps suppress (corrupt storage must never
 * be treated as "infinitely old").
 * @param {RatingState | null | undefined} state
 * @param {{ minOpens?: number, minDays?: number, now?: number, isExtensionHealthy?: boolean }} [opts]
 * @returns {boolean}
 */
export function shouldShowRatingPrompt(
  state,
  { minOpens = RATING_PROMPT_MIN_OPENS, minDays = RATING_PROMPT_MIN_DAYS, now = Date.now(), isExtensionHealthy = true } = {},
) {
  if (!state) return false;
  if (!isExtensionHealthy) return false;
  if (state.ratedAt || state.dismissedAt) return false;
  if (!Number.isFinite(state.popupOpenCount)) return false;
  if (state.popupOpenCount < minOpens) return false;
  if (!Number.isFinite(state.firstOpenAt) || state.firstOpenAt <= 0) return false;
  const daysSinceFirst = (now - state.firstOpenAt) / MS_PER_DAY;
  if (daysSinceFirst < minDays) return false;
  return true;
}

/**
 * Single-slot arbitration for the popup's banner area (adopted from
 * local-ebay-sniper's chooseBanner): at most ONE banner per open, most
 * important first. Errors beat everything (something is wrong), the one-time
 * post-update notice beats the first-run intro (an update means this is not a
 * first run — but keep the ordering explicit), and both beat the rating ask
 * (orient/inform before asking a favor).
 * @param {{ hasErrors: boolean, hasUpdateNote?: boolean, introSeen: boolean, ratingEligible: boolean }} p
 * @returns {"errors" | "update" | "intro" | "rating" | null}
 */
export function choosePopupBanner({ hasErrors, hasUpdateNote = false, introSeen, ratingEligible }) {
  if (hasErrors) return "errors";
  if (hasUpdateNote) return "update";
  if (!introSeen) return "intro";
  if (ratingEligible) return "rating";
  return null;
}
