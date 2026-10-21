import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeRatingState, recordOpen, shouldShowRatingPrompt, choosePopupBanner,
  RATING_PROMPT_MIN_OPENS, RATING_PROMPT_MIN_DAYS, DEFAULT_RATING_STATE,
} from "../rating.js";

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_700_000_000_000;

/** A state satisfying every gate; tests override one field to attribute failures. */
function readyState(overrides = {}) {
  return {
    popupOpenCount: RATING_PROMPT_MIN_OPENS,
    firstOpenAt: NOW - RATING_PROMPT_MIN_DAYS * DAY,
    dismissedAt: 0,
    ratedAt: 0,
    ...overrides,
  };
}

// ---- shouldShowRatingPrompt (ported from ebay-watchlist-watch's suite) ------

test("rating: shows when both gates clear and neither dismissed nor rated", () => {
  assert.equal(shouldShowRatingPrompt(readyState(), { now: NOW }), true);
});

test("rating: dismissed is one-way suppression", () => {
  assert.equal(shouldShowRatingPrompt(readyState({ dismissedAt: NOW - 1 }), { now: NOW }), false);
});

test("rating: rated is one-way suppression", () => {
  assert.equal(shouldShowRatingPrompt(readyState({ ratedAt: NOW - 1 }), { now: NOW }), false);
});

test("rating: below the open-count threshold suppresses; the boundary is inclusive", () => {
  assert.equal(
    shouldShowRatingPrompt(readyState({ popupOpenCount: RATING_PROMPT_MIN_OPENS - 1 }), { now: NOW }),
    false,
  );
  assert.equal(
    shouldShowRatingPrompt(readyState({ popupOpenCount: RATING_PROMPT_MIN_OPENS }), { now: NOW }),
    true,
  );
});

test("rating: a same-day burst of opens is suppressed by the time gate", () => {
  assert.equal(shouldShowRatingPrompt(readyState({ firstOpenAt: NOW - 1000 }), { now: NOW }), false);
});

test("rating: the minDays boundary is inclusive", () => {
  assert.equal(
    shouldShowRatingPrompt(readyState({ firstOpenAt: NOW - RATING_PROMPT_MIN_DAYS * DAY }), { now: NOW }),
    true,
  );
});

test("rating: missing/zero firstOpenAt suppresses (never treated as infinitely old)", () => {
  assert.equal(shouldShowRatingPrompt(readyState({ firstOpenAt: 0 }), { now: NOW }), false);
});

test("rating: null/undefined state suppresses", () => {
  assert.equal(shouldShowRatingPrompt(null, { now: NOW }), false);
  assert.equal(shouldShowRatingPrompt(undefined, { now: NOW }), false);
});

test("rating: non-finite popupOpenCount (corrupt storage) suppresses", () => {
  for (const bad of [NaN, Infinity, -Infinity, "10", null, undefined]) {
    assert.equal(
      shouldShowRatingPrompt(readyState({ popupOpenCount: bad }), { now: NOW }),
      false,
      `expected non-finite popupOpenCount ${String(bad)} to suppress`,
    );
  }
});

test("rating: unhealthy extension suppresses even when both gates clear", () => {
  assert.equal(
    shouldShowRatingPrompt(readyState(), { now: NOW, isExtensionHealthy: false }),
    false,
  );
});

test("rating: explicit healthy true behaves like the default (omitted)", () => {
  assert.equal(shouldShowRatingPrompt(readyState(), { now: NOW, isExtensionHealthy: true }), true);
  assert.equal(shouldShowRatingPrompt(readyState(), { now: NOW }), true);
});

test("rating: override thresholds are honored", () => {
  assert.equal(shouldShowRatingPrompt(readyState(), { minOpens: 999, now: NOW }), false);
  assert.equal(shouldShowRatingPrompt(readyState(), { minDays: 999, now: NOW }), false);
  assert.equal(
    shouldShowRatingPrompt(
      readyState({ popupOpenCount: 1, firstOpenAt: NOW - 1000 }),
      { minOpens: 1, minDays: 0, now: NOW },
    ),
    true,
  );
});

// ---- normalizeRatingState / recordOpen --------------------------------------

test("normalizeRatingState: garbage degrades to the defaults, never throws", () => {
  assert.deepEqual(normalizeRatingState(undefined), { ...DEFAULT_RATING_STATE });
  assert.deepEqual(normalizeRatingState("junk"), { ...DEFAULT_RATING_STATE });
  assert.deepEqual(
    normalizeRatingState({ popupOpenCount: "9", firstOpenAt: -5, dismissedAt: NaN, ratedAt: 3 }),
    { popupOpenCount: 0, firstOpenAt: 0, dismissedAt: 0, ratedAt: 3 },
  );
});

test("recordOpen: bumps the count and stamps firstOpenAt only on the first open", () => {
  const first = recordOpen(undefined, NOW);
  assert.equal(first.popupOpenCount, 1);
  assert.equal(first.firstOpenAt, NOW);
  const second = recordOpen(first, NOW + DAY);
  assert.equal(second.popupOpenCount, 2);
  assert.equal(second.firstOpenAt, NOW); // anchor unchanged
});

test("recordOpen: corrupt stored state is normalized before bumping", () => {
  const next = recordOpen({ popupOpenCount: "eleven", firstOpenAt: "then" }, NOW);
  assert.equal(next.popupOpenCount, 1);
  assert.equal(next.firstOpenAt, NOW);
});

// ---- choosePopupBanner (single-slot arbitration) -----------------------------

test("choosePopupBanner: errors beat intro beat rating; nothing when nothing applies", () => {
  assert.equal(choosePopupBanner({ hasErrors: true, introSeen: false, ratingEligible: true }), "errors");
  assert.equal(choosePopupBanner({ hasErrors: false, introSeen: false, ratingEligible: true }), "intro");
  assert.equal(choosePopupBanner({ hasErrors: false, introSeen: true, ratingEligible: true }), "rating");
  assert.equal(choosePopupBanner({ hasErrors: false, introSeen: true, ratingEligible: false }), null);
});

test("choosePopupBanner: the post-update notice loses to errors, beats intro and rating", () => {
  assert.equal(choosePopupBanner({ hasErrors: true, hasUpdateNote: true, introSeen: false, ratingEligible: true }), "errors");
  assert.equal(choosePopupBanner({ hasErrors: false, hasUpdateNote: true, introSeen: false, ratingEligible: true }), "update");
  assert.equal(choosePopupBanner({ hasErrors: false, hasUpdateNote: true, introSeen: true, ratingEligible: true }), "update");
  // omitted flag defaults to false (existing callers unaffected)
  assert.equal(choosePopupBanner({ hasErrors: false, introSeen: true, ratingEligible: false }), null);
});
