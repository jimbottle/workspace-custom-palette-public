import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizePalette, resolvePalette, resolveEffectivePalette, paletteKey, planManagedReset, reorder, MAX_SWATCHES, planLatePolicyReseed, isPaletteLocked, planPolicyApply, normalizePalettes, resolveActiveUserPalette, planPaletteMigration, MAX_PALETTES, MAX_PALETTE_NAME, MAX_SWATCH_NAME, LEGACY_PALETTE_ID, NO_ACTIVE_PALETTE_ID, hasStoredPalettes, rawPaletteId, ORG_PALETTE_ID, resolveActivePaletteId, isActivePaletteReadOnly, normalizeOrgPalettes, orgPaletteSwatches, isOrgPaletteId, planEnforcementPush, planOrgDefaultPush, planOptOut, planPaletteSwitcher, ORG_PALETTE_NAME} from "../palette.js";

test("normalizePalette: cleans hex, drops invalid, re-stamps order, sorts", () => {
  const out = normalizePalette([
    { name: "B", hex: "abc", order: 5 },
    { name: "A", hex: "#1a73e8", order: 1 },
    { name: "bad", hex: "nope", order: 2 },
    { name: "  ", hex: "#fff", order: 0 }, // blank name dropped
  ]);
  assert.deepEqual(out, [
    { name: "A", hex: "#1A73E8", order: 0 },
    { name: "B", hex: "#AABBCC", order: 1 },
  ]);
});

test("normalizePalette: non-array and junk yield []", () => {
  assert.deepEqual(normalizePalette(null), []);
  assert.deepEqual(normalizePalette("x"), []);
  assert.deepEqual(normalizePalette([1, "a", {}]), []);
});

test("normalizePalette: caps at MAX_SWATCHES", () => {
  const many = Array.from({ length: MAX_SWATCHES + 10 }, (_, i) => ({ name: `c${i}`, hex: "#000000", order: i }));
  assert.equal(normalizePalette(many).length, MAX_SWATCHES);
});

test("resolvePalette: valid user palette wins over defaults", () => {
  const defaults = [{ name: "Default", hex: "#000000", order: 0 }];
  const user = [{ name: "Mine", hex: "#fff", order: 0 }];
  assert.deepEqual(resolvePalette(user, defaults), [{ name: "Mine", hex: "#FFFFFF", order: 0 }]);
});

test("resolvePalette: falls back to defaults when user palette empty/invalid", () => {
  const defaults = [{ name: "Default", hex: "#123456", order: 0 }];
  assert.deepEqual(resolvePalette([], defaults), [{ name: "Default", hex: "#123456", order: 0 }]);
  assert.deepEqual(resolvePalette(undefined, defaults), [{ name: "Default", hex: "#123456", order: 0 }]);
  assert.deepEqual(resolvePalette([{ name: "x", hex: "zzz" }], defaults), [{ name: "Default", hex: "#123456", order: 0 }]);
});

test("resolveEffectivePalette: remote wins, else user, else defaults", () => {
  const defaults = [{ name: "Default", hex: "#000000", order: 0 }];
  const user = [{ name: "User", hex: "#111111", order: 0 }];
  const remote = [{ name: "Remote", hex: "#222222", order: 0 }];
  assert.equal(resolveEffectivePalette({ remote, user, defaults })[0]?.name, "Remote");
  assert.equal(resolveEffectivePalette({ remote: [], user, defaults })[0]?.name, "User");
  assert.equal(resolveEffectivePalette({ remote: undefined, user: [], defaults })[0]?.name, "Default");
  // invalid remote falls through to user
  assert.equal(resolveEffectivePalette({ remote: [{ name: "x", hex: "zzz" }], user, defaults })[0]?.name, "User");
});

test("resolveEffectivePalette: managed policy sits below user, above packaged defaults", () => {
  const defaults = [{ name: "Default", hex: "#000000", order: 0 }];
  const user = [{ name: "User", hex: "#111111", order: 0 }];
  const managed = [{ name: "Org", hex: "#333333", order: 0 }];
  const remote = [{ name: "Remote", hex: "#222222", order: 0 }];
  // The org palette is the DEFAULT staff start from — a user's own palette still wins.
  assert.equal(resolveEffectivePalette({ user, managed, defaults })[0]?.name, "User");
  assert.equal(resolveEffectivePalette({ user: [], managed, defaults })[0]?.name, "Org");
  assert.equal(resolveEffectivePalette({ user: undefined, managed: [], defaults })[0]?.name, "Default");
  // remote (central service) still outranks everything
  assert.equal(resolveEffectivePalette({ remote, user, managed, defaults })[0]?.name, "Remote");
  // omitting managed entirely leaves existing behavior untouched
  assert.equal(resolveEffectivePalette({ user: [], defaults })[0]?.name, "Default");
});

test("resolveEffectivePalette: a lock puts the org palette ABOVE the user's", () => {
  const defaults = [{ name: "Default", hex: "#000000", order: 0 }];
  const user = [{ name: "User", hex: "#111111", order: 0 }];
  const managed = [{ name: "Org", hex: "#333333", order: 0 }];
  const remote = [{ name: "Remote", hex: "#222222", order: 0 }];

  // The whole point: unlocked the user wins, locked the org does.
  assert.equal(resolveEffectivePalette({ user, managed, defaults })[0]?.name, "User");
  assert.equal(resolveEffectivePalette({ user, managed, defaults, locked: true })[0]?.name, "Org");

  // A lock with NO org palette must not lock someone out of their own colors —
  // there is nothing to enforce, so this falls straight through to the user.
  assert.equal(resolveEffectivePalette({ user, managed: [], defaults, locked: true })[0]?.name, "User");
  assert.equal(resolveEffectivePalette({ user: [], managed: undefined, defaults, locked: true })[0]?.name, "Default");

  // remote still outranks a locked managed palette. Deliberate and narrow: the
  // recorded intent was managed-over-USER, and widening it is a separate call.
  assert.equal(resolveEffectivePalette({ remote, user, managed, defaults, locked: true })[0]?.name, "Remote");

  // locked:false is exactly today's behavior, and so is omitting it.
  assert.equal(resolveEffectivePalette({ user, managed, defaults, locked: false })[0]?.name, "User");
});

test("isPaletteLocked: true only when the lock AND a palette to enforce both exist", () => {
  const managed = [{ name: "Org", hex: "#333333", order: 0 }];
  assert.equal(isPaletteLocked({ managed, locked: true }), true);
  assert.equal(isPaletteLocked({ managed, locked: false }), false);
  // A lock with nothing to enforce is not a lock. Every locked UI behavior
  // hangs off this, so treating it as locked would leave a user staring at an
  // uneditable copy of the packaged defaults.
  assert.equal(isPaletteLocked({ managed: [], locked: true }), false);
  assert.equal(isPaletteLocked({ managed: undefined, locked: true }), false);
  // Junk policy data must not read as enforced.
  assert.equal(isPaletteLocked({ managed: [{ name: "", hex: "nope" }], locked: true }), false);
  assert.equal(isPaletteLocked({}), false);
  assert.equal(isPaletteLocked(), false);
});

test("resolveEffectivePalette: managed policy is normalized, not trusted", () => {
  const defaults = [{ name: "Default", hex: "#000000", order: 0 }];
  // Chrome validates the policy's SHAPE against managed-schema.json; it does not
  // check that a hex is a real color, so junk entries must be dropped here.
  const managed = [
    { name: "Good", hex: "#4C8AEC" },
    { name: "Bad hex", hex: "not-a-color" },
    { name: "", hex: "#123456" },
  ];
  const out = resolveEffectivePalette({ user: [], managed, defaults });
  assert.deepEqual(out, [{ name: "Good", hex: "#4C8AEC", order: 0 }]);
  // an all-junk policy falls through to the packaged defaults rather than
  // leaving the user with an empty Brand row
  assert.equal(
    resolveEffectivePalette({ user: [], managed: [{ name: "x", hex: "zzz" }], defaults })[0]?.name,
    "Default",
  );
});

test("reorder: moves and re-stamps order; clamps out-of-range", () => {
  const list = [
    { name: "A", hex: "#000000", order: 0 },
    { name: "B", hex: "#000000", order: 1 },
    { name: "C", hex: "#000000", order: 2 },
  ];
  assert.deepEqual(reorder(list, 0, 2).map((s) => s.name), ["B", "C", "A"]);
  assert.deepEqual(reorder(list, 2, 0).map((s) => s.name), ["C", "A", "B"]);
  assert.deepEqual(reorder(list, 99, -5).map((s) => s.name), ["C", "A", "B"]); // clamped to 2->0
  assert.deepEqual(reorder([], 0, 1), []);
  // order is re-stamped 0..n-1
  assert.deepEqual(reorder(list, 0, 2).map((s) => s.order), [0, 1, 2]);
});

test("paletteKey: identity is names + hexes in order, ignoring order stamps", () => {
  // Load-bearing for the managed-policy tiering: the popup and options page use
  // this to decide "is this the org's palette?" and therefore whether saving
  // would create a personal copy that shadows the policy.
  const a = [{ name: "Poppy", hex: "#FE5917", order: 0 }, { name: "Grass", hex: "#385834", order: 1 }];
  const b = [{ name: "Poppy", hex: "#FE5917", order: 5 }, { name: "Grass", hex: "#385834", order: 9 }];
  assert.equal(paletteKey(a), paletteKey(b), "order stamps are not identity");
  assert.notEqual(paletteKey(a), paletteKey([...a].reverse()), "sequence matters");
  assert.notEqual(paletteKey(a), paletteKey([{ name: "Poppy", hex: "#FE5918" }, { name: "Grass", hex: "#385834" }]));
  assert.notEqual(paletteKey(a), paletteKey([{ name: "Poppyy", hex: "#FE5917" }, { name: "Grass", hex: "#385834" }]));
  assert.equal(paletteKey([]), paletteKey([]));
});

// ---- planManagedReset -------------------------------------------------------
// Each assertion below corresponds to a bug that shipped and had to be fixed in
// the popup's reset handler; the point of the pure helper is that they cannot
// silently return.

const ORG = [{ name: "Poppy", hex: "#FE5917", order: 0 }, { name: "Grass", hex: "#385834", order: 1 }];
const MINE = [{ name: "Mine", hex: "#123456", order: 0 }];

test("planManagedReset: different colors -> restore org palette, clear override, record history", () => {
  const plan = planManagedReset({ lastSaved: MINE, managed: ORG, hasOverride: true });
  assert.deepEqual(plan.editorTarget, ORG);
  assert.equal(plan.persist, "clear");
  assert.equal(plan.record, true, "a visible change is undoable");
  assert.equal(plan.message, "Using your organization's colors.");
});

test("planManagedReset: same colors but an override IS stored -> still clears, no history", () => {
  // The override shadows the policy even though the colors match (an admin
  // publishing colors this user had already saved), so the button must act.
  const plan = planManagedReset({ lastSaved: ORG, managed: ORG, hasOverride: true });
  assert.equal(plan.persist, "clear", "an override whose colors match still detaches the user");
  assert.equal(plan.record, false, "recording a no-op would create an undo step that re-adds the override");
  assert.deepEqual(plan.editorTarget, ORG, "editor must be resynced so a pending edit is not flushed later");
  assert.equal(plan.message, "Using your organization's colors.");
});

test("planManagedReset: same colors and no override -> nothing to persist, but still resync", () => {
  const plan = planManagedReset({ lastSaved: ORG, managed: ORG, hasOverride: false });
  assert.equal(plan.persist, "none");
  assert.equal(plan.record, false);
  assert.deepEqual(plan.editorTarget, ORG, "the resync is the leg that stops the dismissal flush");
  assert.equal(plan.message, "Already using your organization's colors.");
});

test("planManagedReset: the editor target is the org palette in every actionable case", () => {
  for (const hasOverride of [true, false]) {
    for (const lastSaved of [MINE, ORG, []]) {
      assert.deepEqual(planManagedReset({ lastSaved, managed: ORG, hasOverride }).editorTarget, ORG);
    }
  }
});

test("planManagedReset: no published policy is a no-op that leaves the palette alone", () => {
  const plan = planManagedReset({ lastSaved: MINE, managed: [], hasOverride: true });
  assert.equal(plan.persist, "none");
  assert.equal(plan.record, false);
  assert.deepEqual(plan.editorTarget, MINE, "must not wipe the editor when there is no org palette");
  assert.equal(planManagedReset().persist, "none"); // defensive: no args at all
});

test("planLatePolicyReseed: an untouched editor with no override adopts the late org palette", () => {
  // The case that matters: a managed user whose policy read missed the render
  // deadline is looking at the packaged defaults. When the policy lands, the
  // screen must become the org's colors BEFORE any note claims that it is.
  const managed = [{ name: "Org", hex: "#123456", order: 0 }];
  const defaults = [{ name: "Packaged", hex: "#ABCDEF", order: 0 }];
  assert.deepEqual(
    planLatePolicyReseed({ managed, userPalette: [], showing: defaults, rendered: defaults }),
    normalizePalette(managed),
  );
});

test("planLatePolicyReseed: leaves a stored override and a mid-edit screen alone", () => {
  const managed = [{ name: "Org", hex: "#123456", order: 0 }];
  const defaults = [{ name: "Packaged", hex: "#ABCDEF", order: 0 }];
  const mine = [{ name: "Mine", hex: "#010203", order: 0 }];
  // A stored personal palette outranks the org one — the screen is already right.
  assert.equal(planLatePolicyReseed({ managed, userPalette: mine, showing: mine, rendered: mine }), null);
  // Mid-edit: discarding what they typed would be worse than a stale baseline.
  const edited = [{ name: "Typing", hex: "#0F0F0F", order: 0 }];
  assert.equal(planLatePolicyReseed({ managed, userPalette: [], showing: edited, rendered: defaults }), null);
});

test("planLatePolicyReseed: no policy after all is a no-op, and junk never throws", () => {
  const defaults = [{ name: "Packaged", hex: "#ABCDEF", order: 0 }];
  assert.equal(planLatePolicyReseed({ managed: [], userPalette: [], showing: defaults, rendered: defaults }), null);
  assert.equal(planLatePolicyReseed(), null);
  assert.equal(planLatePolicyReseed({ managed: /** @type {any} */ ("nonsense"), userPalette: null }), null);
});

// --- planPolicyApply: the transition table both hosts consume ------------
//
// One row per transition x locked/unlocked x has-override/not x untouched/
// mid-edit. These rows are the contract; the jsdom cases in popup/__tests__
// and options/__tests__ are the regression net that says each host actually
// obeys it.

const DEF = normalizePalette([{ name: "Def", hex: "#ABCDEF", order: 0 }]);
const NEWORG = normalizePalette([{ name: "New", hex: "#D93025", order: 0 }]);

/** Defaults that make the common case readable at each call site. */
const at = (/** @type {any} */ over) => planPolicyApply({ defaults: DEF, ...over });

test("planPolicyApply: taking the lock shows the org palette read-only and stashes the screen", () => {
  const before = normalizePalette(MINE);
  const plan = at({ managed: ORG, locked: true, wasReadOnly: false, hasOverride: true,
    showing: before, rendered: before });
  assert.equal(plan.locked, true);
  assert.equal(plan.remount, true, "readOnly is fixed at mount, so this must re-mount");
  assert.deepEqual(plan.palette, normalizePalette(ORG), "the org palette is what is in effect");
  assert.deepEqual(plan.preLock, before, "their palette is stashed so unlocking can restore it");
});

test("planPolicyApply: keepUnsavedOnLock is the one deliberate host difference", () => {
  const seeded = normalizePalette(MINE);
  const typed = normalizePalette([{ name: "Typed", hex: "#0F0F0F", order: 0 }]);
  // Options has an explicit Save, so unsaved rows are work worth preserving.
  assert.deepEqual(
    at({ managed: ORG, locked: true, showing: typed, rendered: seeded, keepUnsavedOnLock: true }).preLock,
    typed);
  // The popup auto-saves and deliberately drops its pending debounced edit —
  // it could not have been written under the lock anyway.
  assert.deepEqual(
    at({ managed: ORG, locked: true, showing: typed, rendered: seeded }).preLock,
    seeded);
});

test("planPolicyApply: lifting the lock restores the stash, then clears it", () => {
  const stash = normalizePalette(MINE);
  const plan = at({ managed: ORG, locked: false, wasReadOnly: true, hasOverride: true,
    showing: ORG, rendered: ORG, preLock: stash });
  assert.equal(plan.remount, true);
  assert.deepEqual(plan.palette, stash);
  assert.equal(plan.preLock, null, "spent");
});

test("planPolicyApply: the stash wins on unlock even with no override", () => {
  // A user who deliberately emptied their editor and saved has no override, and
  // must not have the org palette pushed back at them just because a lock came
  // and went. Locking has to be reversible; that is what makes it safe for an
  // admin to try. (Consequence: an admin who edits the colors in the same
  // policy write that lifts the lock leaves the previous palette on screen.
  // Pre-existing on both hosts, tracked separately - not changed here.)
  const plan = at({ managed: NEWORG, locked: false, wasReadOnly: true, hasOverride: false,
    showing: ORG, rendered: ORG, preLock: [] });
  assert.deepEqual(plan.palette, [], "the empty editor they left");
});

test("planPolicyApply: unlocking with no stash and no override follows the policy", () => {
  const plan = at({ managed: NEWORG, locked: false, wasReadOnly: true, hasOverride: false,
    showing: ORG, rendered: ORG, preLock: null });
  assert.deepEqual(plan.palette, NEWORG);
});

test("planPolicyApply: a page that LOADED locked falls back to the stored palette", () => {
  // No stash exists, because no transition happened in this session. Reading
  // the load-time snapshot is safe precisely because every write path refuses
  // while locked, so nothing can have moved in between.
  const plan = at({ managed: ORG, locked: false, wasReadOnly: true, hasOverride: true,
    showing: ORG, rendered: ORG, preLock: null, userPaletteAtLoad: MINE });
  assert.deepEqual(plan.palette, normalizePalette(MINE));
});

test("planPolicyApply: still locked, but the admin edited the org colors", () => {
  const plan = at({ managed: NEWORG, locked: true, wasReadOnly: true,
    showing: ORG, rendered: ORG });
  assert.equal(plan.remount, false, "no re-mount: the read-only state did not change");
  assert.deepEqual(plan.palette, NEWORG);
});

test("planPolicyApply: a locked editor has no edit worth protecting", () => {
  // showing !== rendered can only mean something forced values into read-only
  // inputs. The org palette still wins — it is what every picker renders.
  const forced = normalizePalette([{ name: "Forced", hex: "#000000", order: 0 }]);
  assert.deepEqual(
    at({ managed: NEWORG, locked: true, wasReadOnly: true, showing: forced, rendered: ORG }).palette,
    NEWORG);
});

test("planPolicyApply: unlocked, no override, untouched -> adopt the org palette", () => {
  const plan = at({ managed: ORG, showing: DEF, rendered: DEF });
  assert.equal(plan.remount, false);
  assert.deepEqual(plan.palette, normalizePalette(ORG));
  assert.equal(plan.hasPolicy, true);
});

test("planPolicyApply: unlocked, mid-edit -> leave their typing alone", () => {
  const typed = normalizePalette([{ name: "Typed", hex: "#0F0F0F", order: 0 }]);
  assert.equal(at({ managed: ORG, showing: typed, rendered: DEF }).palette, null);
});

test("planPolicyApply: unlocked with an override -> their palette already shows", () => {
  assert.equal(at({ managed: ORG, hasOverride: true, showing: MINE, rendered: MINE }).palette, null);
});

test("planPolicyApply: removing the policy drops an unowned editor to the packaged defaults", () => {
  const plan = at({ managed: [], showing: ORG, rendered: ORG });
  assert.equal(plan.hasPolicy, false);
  assert.deepEqual(plan.palette, DEF, "never the deleted org colors");
});

test("planPolicyApply: removing the policy leaves a user's OWN palette alone", () => {
  assert.equal(at({ managed: [], hasOverride: true, showing: MINE, rendered: MINE }).palette, null);
});

test("planPolicyApply: removing a LOCKED policy is an unlock AND a removal", () => {
  // The divergence that unifying this table exposed. Both hosts treated it as
  // an unlock and restored the stash; the options page then returned early and
  // never reached its removal branch, leaving the DELETED org colors on screen
  // with the note correctly hidden and nothing explaining them — one Save away
  // from storing them as a permanent personal override.
  const plan = at({ managed: [], locked: true, wasReadOnly: true,
    showing: ORG, rendered: ORG, preLock: normalizePalette(ORG) });
  assert.equal(plan.locked, false, "an empty policy cannot be enforced");
  assert.equal(plan.remount, true, "the editor must become editable again");
  assert.deepEqual(plan.palette, DEF, "the packaged defaults, NOT the deleted org colors");
  assert.equal(plan.preLock, null);
});

test("planPolicyApply: removing a LOCKED policy still gives an owner their palette back", () => {
  const stash = normalizePalette(MINE);
  const plan = at({ managed: [], locked: true, wasReadOnly: true, hasOverride: true,
    showing: ORG, rendered: ORG, preLock: stash });
  assert.deepEqual(plan.palette, stash);
});

test("planPolicyApply: a lock flag with no palette to enforce is not a lock", () => {
  const plan = at({ managed: [], locked: true, wasReadOnly: false, showing: DEF, rendered: DEF });
  assert.equal(plan.locked, false);
  assert.equal(plan.remount, false);
});

test("planPolicyApply: junk never throws and no arguments is a no-op", () => {
  const plan = planPolicyApply();
  assert.deepEqual(plan, { locked: false, readOnly: false, remount: false, palette: [], preLock: null, hasPolicy: false });
  assert.doesNotThrow(() => planPolicyApply({ managed: /** @type {any} */ ("nope"), showing: /** @type {any} */ (null), userPaletteAtLoad: null }));
});

// --- multi-palette: the collection, the active pointer, the migration ------
//
// The rule these all serve: a user who has colors must never see none because
// the two storage shapes, or the pointer and the collection, disagreed.

const P = (/** @type {string} */ id, /** @type {string} */ name, /** @type {any} */ sw) =>
  ({ id, name, swatches: sw });
const ONE = [{ name: "One", hex: "#111111", order: 0 }];
const TWO = [{ name: "Two", hex: "#222222", order: 0 }];

test("normalizePalettes: cleans entries, keeps ids and names, normalizes swatches", () => {
  const out = normalizePalettes([P("a", "  Alpha  ", [{ name: "X", hex: "abc" }])]);
  assert.deepEqual(out, [{ id: "a", name: "Alpha", swatches: [{ name: "X", hex: "#AABBCC", order: 0 }] }]);
});

test("normalizePalettes: an EMPTY palette is kept, not dropped", () => {
  // Deleting every row is how a user turns the Brand row off. Dropping the
  // entry on the next read would delete something they meant to have.
  assert.deepEqual(normalizePalettes([P("a", "Alpha", [])]), [P("a", "Alpha", [])]);
  // Junk swatches degrade to empty rather than to no palette, same reason.
  assert.deepEqual(normalizePalettes([P("a", "Alpha", "nonsense")]), [P("a", "Alpha", [])]);
});

test("normalizePalettes: drops entries with no usable id or name", () => {
  // Neither can be invented without guessing which entry the pointer meant.
  assert.deepEqual(normalizePalettes([P("", "Alpha", ONE), P("b", "   ", ONE), { swatches: ONE }]), []);
});

test("normalizePalettes: a duplicate id keeps the first, so the pointer stays unambiguous", () => {
  const out = normalizePalettes([P("a", "First", ONE), P("a", "Second", TWO)]);
  assert.equal(out.length, 1);
  assert.equal(out[0]?.name, "First");
});

test("normalizePalettes: caps the count and the name length", () => {
  const many = Array.from({ length: MAX_PALETTES + 5 }, (_, i) => P(`id${i}`, `N${i}`, ONE));
  assert.equal(normalizePalettes(many).length, MAX_PALETTES);
  const long = normalizePalettes([P("a", "x".repeat(200), ONE)]);
  assert.equal(long[0]?.name.length, MAX_PALETTE_NAME);
});

test("normalizePalettes: non-array and junk yield [], never throw", () => {
  for (const junk of [null, undefined, "nope", 7, {}, [null, 3, "x"]]) {
    assert.deepEqual(normalizePalettes(/** @type {any} */ (junk)), []);
  }
});

test("resolveActiveUserPalette: the active entry wins", () => {
  assert.deepEqual(
    resolveActiveUserPalette({ palettes: [P("a", "A", ONE), P("b", "B", TWO)], activePaletteId: "b" }),
    normalizePalette(TWO));
});

test("resolveActiveUserPalette: a DANGLING pointer falls back to the first entry, never to nothing", () => {
  // The user deleted the active palette, or an admin withdrew the org one they
  // were on. Returning nothing here would blank the Brand row for someone who
  // plainly has colors.
  assert.deepEqual(
    resolveActiveUserPalette({ palettes: [P("a", "A", ONE)], activePaletteId: "gone" }),
    normalizePalette(ONE));
  assert.deepEqual(
    resolveActiveUserPalette({ palettes: [P("a", "A", ONE)] }),
    normalizePalette(ONE), "and a missing pointer behaves the same");
});

test("resolveActiveUserPalette: an empty entry returns [], NOT null", () => {
  // The whole point of the null/[] split: `[]` means an entry exists and is
  // empty, null means nothing is stored. Callers act on that difference —
  // null is what leaves admin updates reaching this user.
  assert.deepEqual(
    resolveActiveUserPalette({ palettes: [P("a", "A", [])], activePaletteId: "a" }),
    []);
});

test("resolveActiveUserPalette: falls back to the LEGACY single palette, else null", () => {
  assert.deepEqual(resolveActiveUserPalette({ palette: ONE }), normalizePalette(ONE));
  assert.equal(resolveActiveUserPalette(), null, "nothing stored is null, never []");
  assert.equal(resolveActiveUserPalette({ palette: "junk" }), null);
});

test("resolveActiveUserPalette: takes no `defaults`, because it is not the effective palette", () => {
  // It answers the USER tier only. resolveEffectivePalette stays the single
  // function that knows about remote/managed/locked, which is what stops this
  // becoming a second, competing resolution entry point.
  assert.equal(resolveActiveUserPalette(/** @type {any} */ ({ defaults: TWO })), null);
});

test("resolveActiveUserPalette: the collection outranks a legacy key written by an OLDER machine", () => {
  // chrome.storage.sync means a machine on an older build can write `palette`
  // back at any time, long after this device migrated. The migrated collection
  // is the newer truth.
  assert.deepEqual(
    resolveActiveUserPalette({ palettes: [P("a", "A", ONE)], activePaletteId: "a", palette: TWO }),
    normalizePalette(ONE));
});

test("planPaletteMigration: an old single palette moves forward as the one entry", () => {
  const plan = planPaletteMigration({ palette: ONE });
  assert.deepEqual(plan?.palettes, [{ id: LEGACY_PALETTE_ID, name: "Default", swatches: normalizePalette(ONE) }]);
  assert.equal(plan?.activePaletteId, LEGACY_PALETTE_ID);
});

test("planPaletteMigration: NOTHING stored is not a migration", () => {
  // Writing a palette here would invent a personal override this user never
  // chose, and detach them from an org palette they should still receive.
  assert.equal(planPaletteMigration({}), null);
  assert.equal(planPaletteMigration(), null);
  assert.equal(planPaletteMigration({ palette: "junk" }), null);
});

test("planPaletteMigration: an already-migrated account is left alone", () => {
  assert.equal(planPaletteMigration({ palettes: [P("a", "A", ONE)], activePaletteId: "a" }), null);
});

test("planPaletteMigration: the legacy key reappearing after migration does NOT re-migrate", () => {
  // The sync-from-an-older-machine case. Re-migrating would overwrite the
  // collection with one stale palette.
  assert.equal(
    planPaletteMigration({ palettes: [P("a", "A", ONE)], activePaletteId: "a", palette: TWO }),
    null);
});

test("planPaletteMigration: a pointer repair carries NO palettes at all", () => {
  // The safety property. normalizePalettes is lossy (drops unparseable
  // entries, drops duplicate ids, truncates at MAX_PALETTES), so returning it
  // here would turn "fix a dangling pointer" into "rewrite the collection to
  // whatever this build understands" — run unattended by the worker on every
  // install and every browser start.
  const plan = planPaletteMigration({ palettes: [P("a", "A", ONE), P("b", "B", TWO)], activePaletteId: "gone" });
  assert.equal(plan?.activePaletteId, "a");
  assert.equal(plan?.palettes, undefined, "only the pointer may be written");
});

test("planPaletteMigration: a collection LONGER than this build's cap is never rewritten", () => {
  // The realistic loss: a device on a newer build syncs more palettes than
  // this build keeps, with the pointer naming one past the cap. Writing the
  // truncated list back would delete the surplus on every machine.
  const many = Array.from({ length: MAX_PALETTES + 2 }, (_, i) => P(`id${i}`, `N${i}`, ONE));
  const plan = planPaletteMigration({ palettes: many, activePaletteId: `id${MAX_PALETTES + 1}` });
  assert.equal(plan, null, "the pointed-at entry survives truncation, so there is nothing to repair");
});

test("normalizePalettes: truncation keeps the entry the pointer names", () => {
  const many = Array.from({ length: MAX_PALETTES + 2 }, (_, i) => P(`id${i}`, `N${i}`, ONE));
  const kept = normalizePalettes(many, { keepId: `id${MAX_PALETTES + 1}` });
  assert.equal(kept.length, MAX_PALETTES);
  assert.ok(kept.some((p) => p.id === `id${MAX_PALETTES + 1}`),
    "the active palette must not be the one truncation drops");
});

test("normalizePalette: caps a swatch name, so one palette cannot eat the sync item quota", () => {
  const out = normalizePalette([{ name: "n".repeat(500), hex: "#123456" }]);
  assert.equal(out[0]?.name.length, MAX_SWATCH_NAME);
});

test("resolveActiveUserPalette: the detach sentinel still consults the legacy key", () => {
  // Both shapes are tolerated FOREVER, sentinel included. An older build can
  // write the single key at any time, and clearUserPalette writes `palette: []`
  // atomically with the sentinel — so a non-empty legacy key here can only be
  // an edit made after the detach.
  assert.deepEqual(
    resolveActiveUserPalette({
      palettes: [P("a", "A", ONE)], activePaletteId: NO_ACTIVE_PALETTE_ID, palette: TWO,
    }),
    normalizePalette(TWO));
  // An empty one is what detaching itself wrote, so that stays "no override".
  assert.equal(
    resolveActiveUserPalette({
      palettes: [P("a", "A", ONE)], activePaletteId: NO_ACTIVE_PALETTE_ID, palette: [],
    }),
    null);
  // And it never falls through to a stored ENTRY, which was the original bug.
  assert.equal(
    resolveActiveUserPalette({ palettes: [P("a", "A", ONE)], activePaletteId: NO_ACTIVE_PALETTE_ID }),
    null);
});

test("planPaletteMigration: a detach is left alone even when a legacy edit arrives", () => {
  // Pointing at an entry that does not hold that edit would hide it, and
  // rewriting the collection would be the lossy write the pointer-only rule
  // exists to prevent. Resolution handles it; the next save re-attaches.
  assert.equal(
    planPaletteMigration({
      palettes: [P("a", "A", ONE)], activePaletteId: NO_ACTIVE_PALETTE_ID, palette: TWO,
    }),
    null);
});

test("planPaletteMigration: with NO collection, a legacy key migrates even under the sentinel", () => {
  // Nothing to protect, so building the collection is safe.
  const plan = planPaletteMigration({ activePaletteId: NO_ACTIVE_PALETTE_ID, palette: ONE });
  assert.equal(plan?.activePaletteId, LEGACY_PALETTE_ID);
  assert.deepEqual(plan?.palettes?.[0]?.swatches, normalizePalette(ONE));
});

test("planPaletteMigration: a stored collection this build cannot READ is left alone", () => {
  // The third appearance of one root cause: "is there a collection" answered
  // from the normalized view instead of the raw one. Here every entry is in a
  // shape this build drops, so the normalized list is empty and the legacy
  // branch would have written a single entry over whatever a newer build
  // stored — unattended, from the worker, on every browser start.
  const unreadable = [{ id: "p1", label: "renamed by a newer build" }];
  assert.equal(planPaletteMigration({ palettes: unreadable, palette: ONE }), null);
  // Same when the caller separates raw from the normalized view, as the
  // storage layer does.
  assert.equal(
    planPaletteMigration({ palettes: [], raw: unreadable, palette: ONE }),
    null);
  // And a detached user with an unreadable collection is not re-attached.
  assert.equal(
    planPaletteMigration({ palettes: [], raw: unreadable, activePaletteId: NO_ACTIVE_PALETTE_ID, palette: ONE }),
    null);
});

test("hasStoredPalettes: only a non-empty array counts as a collection", () => {
  assert.equal(hasStoredPalettes([{ id: "p1" }]), true);
  for (const junk of [[], null, undefined, "nope", 7, {}]) {
    assert.equal(hasStoredPalettes(/** @type {any} */ (junk)), false);
  }
});

test("planPaletteMigration: a pointer at an entry this build cannot READ is not dangling", () => {
  // Fourth appearance of one root cause, this time as a MEMBERSHIP question
  // rather than a length one: `existing.some(...)` consults the normalized
  // view, which has dropped the pointed-at entry. The entry is still stored,
  // so repairing would silently move the user onto a different palette —
  // unattended, from the worker, on every browser start.
  const mixed = [
    P("readable", "Readable", ONE),
    { id: "written-by-a-newer-build", label: "no `name` this build understands" },
  ];
  assert.equal(
    planPaletteMigration({ palettes: mixed, activePaletteId: "written-by-a-newer-build" }),
    null);
  // The same when raw is passed separately, as the storage layer does.
  assert.equal(
    planPaletteMigration({
      palettes: mixed, raw: mixed, activePaletteId: "written-by-a-newer-build",
    }),
    null);
  // A pointer at an id stored NOWHERE is still repaired.
  const plan = planPaletteMigration({ palettes: mixed, activePaletteId: "never-existed" });
  assert.equal(plan?.activePaletteId, "readable");
});

test("rawPaletteId: one id rule, trimmed, for entries this build cannot otherwise parse", () => {
  assert.equal(rawPaletteId({ id: "  p1  ", label: "unparseable" }), "p1");
  for (const junk of [null, undefined, "nope", 7, {}, { id: 5 }]) {
    assert.equal(rawPaletteId(/** @type {any} */ (junk)), "");
  }
});

// --- v2l: paletteLocked split into default-selection and read-only ---------
//
// Enforcement used to mean one thing: the org palette wins and the page is
// frozen. The cv2 decision splits it. These rows are the difference.

const MYOWN = normalizePalette([{ name: "Mine", hex: "#111111", order: 0 }]);

test("locked with NO choice made starts on the organization's palette", () => {
  // Enforcement's default. This is the half that must not regress.
  assert.deepEqual(
    resolveEffectivePalette({ user: MYOWN, managed: ORG, defaults: DEF, locked: true }),
    normalizePalette(ORG));
});

test("locked but the user SELECTED their own: theirs applies", () => {
  // The cv2 decision. An explicit pointer wins, enforcement or not.
  assert.deepEqual(
    resolveEffectivePalette({ user: MYOWN, managed: ORG, defaults: DEF, locked: true, activePaletteId: "mine" }),
    MYOWN);
});

test("locked and the user switches BACK to the organization's", () => {
  assert.deepEqual(
    resolveEffectivePalette({ user: MYOWN, managed: ORG, defaults: DEF, locked: true, activePaletteId: ORG_PALETTE_ID }),
    normalizePalette(ORG));
});

test("selecting the org palette when NOT locked also works", () => {
  // The pointer is not a lock-only mechanism; an unlocked user may sit on the
  // org palette deliberately rather than by having no override.
  assert.deepEqual(
    resolveEffectivePalette({ user: MYOWN, managed: ORG, defaults: DEF, activePaletteId: ORG_PALETTE_ID }),
    normalizePalette(ORG));
});

test("a lock with the org palette WITHDRAWN falls through to the user's", () => {
  // The pointer still says org, but there is no org palette to enforce.
  assert.deepEqual(
    resolveEffectivePalette({ user: MYOWN, managed: [], defaults: DEF, locked: true, activePaletteId: ORG_PALETTE_ID }),
    MYOWN);
});

test("isActivePaletteReadOnly: only an ORG palette under enforcement is frozen", () => {
  assert.equal(isActivePaletteReadOnly({ managed: ORG, locked: true }), true, "locked, no choice -> org -> frozen");
  assert.equal(isActivePaletteReadOnly({ managed: ORG, locked: true, activePaletteId: ORG_PALETTE_ID }), true);
  assert.equal(isActivePaletteReadOnly({ managed: ORG, locked: true, activePaletteId: "mine" }), false,
    "their own palette stays editable UNDER a lock — the whole point of the split");
  assert.equal(isActivePaletteReadOnly({ managed: ORG, locked: false }), false, "no lock, nothing frozen");
  assert.equal(isActivePaletteReadOnly({ managed: [], locked: true }), false, "a lock with nothing to enforce");
  // The detach sentinel is persisted state TODAY: clearUserPalette writes it
  // whenever someone clicks "Use organization palette". Under a lock that user
  // is on the org palette, so the editor must be frozen — read-only has to
  // agree with what resolveEffectivePalette actually returns.
  assert.equal(isActivePaletteReadOnly({ managed: ORG, locked: true, activePaletteId: NO_ACTIVE_PALETTE_ID }),
    true, "a locked, DETACHED user is on the org palette and must not be editable");
  assert.equal(isActivePaletteReadOnly({ managed: ORG, locked: false, activePaletteId: NO_ACTIVE_PALETTE_ID }),
    false, "no lock, so the org palette is still editable-with-a-copy");
  assert.equal(isActivePaletteReadOnly(), false);
});

test("planPolicyApply: switching to your OWN palette under a lock re-mounts editable", () => {
  const plan = at({ managed: ORG, locked: true, wasReadOnly: true, hasOverride: true,
    activePaletteId: "mine", showing: ORG, rendered: ORG, preLock: MYOWN });
  assert.equal(plan.locked, true, "enforcement is still in force");
  assert.equal(plan.readOnly, false, "but THIS editor is not frozen");
  assert.equal(plan.remount, true, "readOnly changed, and it is fixed at mount");
});

test("planPolicyApply: switching back to the org palette re-mounts read-only", () => {
  const plan = at({ managed: ORG, locked: true, wasReadOnly: false, hasOverride: true,
    activePaletteId: ORG_PALETTE_ID, showing: MYOWN, rendered: MYOWN });
  assert.equal(plan.readOnly, true);
  assert.equal(plan.remount, true);
  assert.deepEqual(plan.palette, normalizePalette(ORG));
});

test("planPolicyApply: an edit on your own palette under a lock is NOT discarded", () => {
  // The mid-edit guard keys on readOnly now. Keyed on `locked` it would have
  // thrown away typing that the user was entitled to be doing.
  const typed = normalizePalette([{ name: "Typed", hex: "#0F0F0F", order: 0 }]);
  const plan = at({ managed: NEWORG, locked: true, wasReadOnly: false, hasOverride: true,
    activePaletteId: "mine", showing: typed, rendered: MYOWN });
  assert.equal(plan.remount, false);
  assert.equal(plan.palette, null, "their typing survives an org-colours change");
});

test("normalizePalettes: a user entry cannot impersonate the organization's", () => {
  const sneaky = [P(ORG_PALETTE_ID, "Not the org", ONE), P("org:1", "Nor this", ONE), P("ok", "Fine", ONE)];
  assert.deepEqual(normalizePalettes(sneaky).map((p) => p.id), ["ok"]);
});

test("resolveActivePaletteId: only the ABSENCE of a choice consults the lock", () => {
  // The default-selection rule in isolation. An explicit pointer always wins,
  // which is what lets a locked user sit on a palette of their own.
  assert.equal(resolveActivePaletteId({ managed: ORG, locked: true }), ORG_PALETTE_ID);
  assert.equal(resolveActivePaletteId({ managed: ORG, locked: false }), undefined,
    "no lock, no choice: nothing is selected and the usual tiering decides");
  assert.equal(resolveActivePaletteId({ managed: [], locked: true }), undefined,
    "a lock with no palette to enforce selects nothing");
  assert.equal(resolveActivePaletteId({ managed: ORG, locked: true, activePaletteId: "mine" }), "mine");
  // A detach means "none of MY palettes", and what applies then IS the org
  // palette. This row asserted the sentinel verbatim one commit ago, which
  // encoded a bug: read-only then disagreed with what resolution actually
  // returned, so a locked detached user would have got an editable editor over
  // enforced org colours.
  assert.equal(resolveActivePaletteId({ managed: ORG, locked: true, activePaletteId: NO_ACTIVE_PALETTE_ID }),
    ORG_PALETTE_ID, "detached with an org palette IS on the org palette");
  assert.equal(resolveActivePaletteId({ managed: [], activePaletteId: NO_ACTIVE_PALETTE_ID }),
    NO_ACTIVE_PALETTE_ID, "with no org palette there is nothing to map it to");
  assert.equal(resolveActivePaletteId(), undefined);
});


test("detached under a lock: resolution and read-only agree", () => {
  // The contradiction this pair exists to prevent. resolveEffectivePalette
  // returns the ORG palette for a detached user; anything that told the editor
  // it was editable would have invited edits that silently cannot apply.
  const state = { managed: ORG, locked: true, activePaletteId: NO_ACTIVE_PALETTE_ID };
  assert.deepEqual(
    resolveEffectivePalette({ ...state, user: MYOWN, defaults: DEF }),
    normalizePalette(ORG), "the org palette is what applies");
  assert.equal(isActivePaletteReadOnly(state), true, "so the editor is frozen");
});

// --- om8: an admin may publish SEVERAL named org palettes -----------------

const ORG_MULTI = [
  { name: "Retail", swatches: [{ name: "Poppy", hex: "#FE5917" }] },
  { name: "Wholesale", swatches: [{ name: "Grass", hex: "#385834" }] },
];

test("normalizeOrgPalettes: a named collection becomes ids, names and swatches", () => {
  const out = normalizeOrgPalettes({ palettes: ORG_MULTI });
  assert.deepEqual(out.map((p) => [p.id, p.name]), [["org:0", "Retail"], ["org:1", "Wholesale"]]);
  assert.deepEqual(out[0]?.swatches, normalizePalette(ORG_MULTI[0]?.swatches));
});

test("normalizeOrgPalettes: the LEGACY single palette still works, as one entry", () => {
  // The shape already deployed. Breaking it would silently unstyle every org
  // running the shipped policy, which is why both are supported permanently.
  const out = normalizeOrgPalettes({ palette: ORG });
  assert.equal(out.length, 1);
  assert.equal(out[0]?.id, "org:0");
  assert.deepEqual(out[0]?.swatches, normalizePalette(ORG));
});

test("normalizeOrgPalettes: the collection wins over the legacy key", () => {
  const out = normalizeOrgPalettes({ palettes: ORG_MULTI, palette: ORG });
  assert.equal(out.length, 2);
  assert.equal(out[0]?.name, "Retail");
});

test("normalizeOrgPalettes: entries with no name or no usable colours are dropped", () => {
  // Neither is a palette a user could pick, so showing it as an empty choice
  // would be worse than not offering it.
  const out = normalizeOrgPalettes({ palettes: [
    { name: "", swatches: [{ name: "X", hex: "#111111" }] },
    { name: "No colours", swatches: [] },
    { name: "Junk colours", swatches: "nope" },
    { name: "Good", swatches: [{ name: "X", hex: "#111111" }] },
  ] });
  assert.deepEqual(out.map((p) => p.name), ["Good"]);
  assert.equal(out[0]?.id, "org:0", "ids are positional in the KEPT list, with no gaps");
});

test("normalizeOrgPalettes: caps the count, and junk never throws", () => {
  const many = Array.from({ length: MAX_PALETTES + 3 },
    (_, i) => ({ name: `P${i}`, swatches: [{ name: "X", hex: "#111111" }] }));
  assert.equal(normalizeOrgPalettes({ palettes: many }).length, MAX_PALETTES);
  for (const junk of [undefined, null, "nope", 7, {}, { palettes: "x", palette: 9 }]) {
    assert.deepEqual(normalizeOrgPalettes(/** @type {any} */ (junk)), []);
  }
});

test("orgPaletteSwatches: the named one, else the first", () => {
  const list = normalizeOrgPalettes({ palettes: ORG_MULTI });
  assert.deepEqual(orgPaletteSwatches(list, "org:1"), list[1]?.swatches);
  assert.deepEqual(orgPaletteSwatches(list), list[0]?.swatches, "no pointer means the first");
  assert.deepEqual(orgPaletteSwatches(list, ORG_PALETTE_ID), list[0]?.swatches,
    "bare 'org' means the organization's palette generically, which is the first");
  assert.deepEqual(orgPaletteSwatches(list, "org:99"), list[0]?.swatches, "a dangling org id falls back");
  assert.deepEqual(orgPaletteSwatches([]), []);
});

test("an org palette is read-only under a lock whichever one is selected", () => {
  // The ids the switcher will use must all satisfy the per-entry rule, or
  // picking the second org palette would hand the user an editable editor.
  const list = normalizeOrgPalettes({ palettes: ORG_MULTI });
  for (const p of list) {
    assert.equal(isActivePaletteReadOnly({ managed: p.swatches, locked: true, activePaletteId: p.id }),
      true, `${p.id} must be frozen under enforcement`);
  }
});

test("every policy resolver tolerates null, not just undefined", () => {
  // `= {}` defaults only on undefined, so each of these threw on null until
  // om8. null is the likeliest junk a caller passes — an absent policy read,
  // a JSON.parse of "null", a storage key that exists but is empty.
  const N = /** @type {any} */ (null);
  assert.deepEqual(normalizeOrgPalettes(N), []);
  assert.equal(resolveActiveUserPalette(N), null);
  assert.equal(planPaletteMigration(N), null);
  assert.equal(resolveActivePaletteId(N), undefined);
  assert.equal(isPaletteLocked(N), false);
  assert.equal(isActivePaletteReadOnly(N), false);
  assert.equal(planLatePolicyReseed(N), null);
  assert.equal(planManagedReset(N).persist, "none");
  assert.equal(planPolicyApply(N).locked, false);
});

test("resolveEffectivePalette and read-only agree for ANY org id, not just the bare one", () => {
  // The pair that disagreed: isActivePaletteReadOnly accepted the org: prefix
  // while resolveEffectivePalette compared only against bare "org", so with
  // org:1 selected the editor froze on the org colours while the document got
  // the USER's palette. Same contradiction as the detach sentinel, new id space.
  for (const id of [ORG_PALETTE_ID, "org:0", "org:1"]) {
    assert.deepEqual(
      resolveEffectivePalette({ user: MYOWN, managed: ORG, defaults: DEF, locked: true, activePaletteId: id }),
      normalizePalette(ORG), `${id}: the document gets the org palette`);
    assert.equal(isActivePaletteReadOnly({ managed: ORG, locked: true, activePaletteId: id }), true,
      `${id}: and the editor is frozen`);
  }
});

test("isOrgPaletteId: bare and numbered, nothing else", () => {
  assert.equal(isOrgPaletteId("org"), true);
  assert.equal(isOrgPaletteId("org:0"), true);
  assert.equal(isOrgPaletteId("org:12"), true);
  for (const no of ["organisation", "personal", "", null, undefined, 7, {}, "__none__"]) {
    assert.equal(isOrgPaletteId(/** @type {any} */ (no)), false, String(no));
  }
});

// --- kbs: enforcement pushes the org palette when it BECOMES active -------

test("planEnforcementPush: becoming enforced makes the org palette active", () => {
  const plan = planEnforcementPush({ locked: true, managed: ORG, pushed: false });
  assert.equal(plan?.activePaletteId, ORG_PALETTE_ID);
  assert.equal(plan?.pushed, true);
});

test("planEnforcementPush: it is a TRANSITION, so it happens once", () => {
  // Without the memory, every read would re-push and the user could never stay
  // on a palette they switched to. That is the whole reason the marker exists.
  assert.equal(planEnforcementPush({ locked: true, managed: ORG, pushed: true }), null);
});

test("planEnforcementPush: the push OVERRIDES whatever the pointer held", () => {
  // The point of pushing on the transition rather than defaulting at read time.
  // setUserPalette sets activePaletteId to whichever entry it wrote, so anyone
  // who ever saved carries a pointer at their own colours; enforcement cannot
  // tell that from a deliberate choice, so it overwrites instead of guessing.
  const plan = planEnforcementPush({ locked: true, managed: ORG, pushed: false });
  assert.equal(plan?.activePaletteId, ORG_PALETTE_ID, "regardless of any prior pointer");
});

test("planEnforcementPush: enforcement ending forgets the episode, keeping the pointer", () => {
  // Cleared so a LATER re-enforcement pushes again - "becomes active" fires
  // each time it becomes active. The pointer is left alone: the user keeps
  // whatever palette they were on.
  const plan = planEnforcementPush({ locked: false, managed: ORG, pushed: true });
  assert.equal(plan?.pushed, false);
  assert.equal(plan?.activePaletteId, undefined, "the pointer is NOT moved");
});

test("planEnforcementPush: nothing to do when unenforced and never pushed", () => {
  assert.equal(planEnforcementPush({ locked: false, managed: ORG, pushed: false }), null);
  assert.equal(planEnforcementPush(), null);
  assert.equal(planEnforcementPush(/** @type {any} */ (null)), null);
});

test("planEnforcementPush: a lock with no palette to enforce pushes nothing", () => {
  assert.equal(planEnforcementPush({ locked: true, managed: [], pushed: false }), null);
});

test("resolveActiveUserPalette: an ORG selection means the user tier is empty", () => {
  // Same shape as the detach sentinel. Falling through would return whichever
  // palette happens to be first, so a user pushed onto the org palette by
  // enforcement would still look like they were on their own.
  const own = [P("mine", "Mine", ONE)];
  for (const id of [ORG_PALETTE_ID, "org:0", "org:1"]) {
    assert.equal(resolveActiveUserPalette({ palettes: own, activePaletteId: id }), null, id);
  }
  assert.deepEqual(resolveActiveUserPalette({ palettes: own, activePaletteId: "mine" }),
    normalizePalette(ONE), "and their own selection still resolves");
});

// --- kbs: what the switcher offers ----------------------------------------

const ORGL = [{ id: "org:0", name: "Retail", swatches: normalizePalette(ORG) }];
const MINEL = [{ id: "mine", name: "Mine", swatches: normalizePalette(MINE) }];

test("planPaletteSwitcher: hidden by default, so one palette looks like today", () => {
  assert.equal(planPaletteSwitcher({ palettes: MINEL }).visible, false);
  assert.equal(planPaletteSwitcher().visible, false);
  assert.equal(planPaletteSwitcher(/** @type {any} */ (null)).visible, false);
});

test("planPaletteSwitcher: with the opt-in on, it lists BOTH sources under enforcement", () => {
  const plan = planPaletteSwitcher({ orgPalettes: ORGL, palettes: MINEL, locked: true, optIn: true });
  assert.equal(plan.visible, true);
  assert.deepEqual(plan.entries.map((e) => [e.id, e.source]), [["org:0", "org"], ["mine", "user"]]);
});

test("planPaletteSwitcher: an org entry is read-only, the user's own is not", () => {
  // Org palettes are admin-only, controlled from the Workspace admin console.
  // A locked user's OWN palette stays editable, which is what cv2 granted.
  const plan = planPaletteSwitcher({ orgPalettes: ORGL, palettes: MINEL, locked: true });
  assert.equal(plan.entries.find((e) => e.source === "org")?.readOnly, true);
  assert.equal(plan.entries.find((e) => e.source === "user")?.readOnly, false);
});

test("planPaletteSwitcher: the opt-in reveals it without any policy", () => {
  const plan = planPaletteSwitcher({
    palettes: [...MINEL, { id: "other", name: "Other", swatches: normalizePalette(ONE) }],
    optIn: true,
  });
  assert.equal(plan.visible, true);
  assert.deepEqual(plan.entries.map((e) => e.source), ["user", "user"]);
  // The gap this test used to have: it never checked `active`. With no pointer
  // set - the state a freshly opted-in user is in - resolveActiveUserPalette
  // falls back to the FIRST entry, so the switcher must highlight it. Marking
  // nothing left the control blank while that palette was in every picker.
  assert.equal(plan.entries.find((e) => e.active)?.id, "mine");
});

test("planPaletteSwitcher: active-marking mirrors resolveActiveUserPalette", () => {
  // Same inputs through both, so the switcher cannot highlight one palette
  // while the pickers use another.
  const cases = [
    { activePaletteId: undefined, expectId: "mine" },
    { activePaletteId: "other", expectId: "other" },
    { activePaletteId: ORG_PALETTE_ID, expectId: "org:0" },
    { activePaletteId: "org:0", expectId: "org:0" },
    // Detached WITH an org palette published means they are on the org
    // palette - resolveActivePaletteId maps the sentinel to it. That is the
    // round-seventeen fix, and the switcher has to agree with it.
    { activePaletteId: NO_ACTIVE_PALETTE_ID, expectId: "org:0" },
  ];
  const users = [...MINEL, { id: "other", name: "Other", swatches: normalizePalette(ONE) }];
  for (const { activePaletteId, expectId } of cases) {
    const plan = planPaletteSwitcher({ orgPalettes: ORGL, palettes: users, activePaletteId, optIn: true });
    assert.equal(plan.entries.find((e) => e.active)?.id, expectId, String(activePaletteId));

    const user = resolveActiveUserPalette({ palettes: users, activePaletteId });
    const marked = plan.entries.find((e) => e.active);
    if (marked?.source === "user") {
      assert.deepEqual(user, users.find((u) => u.id === marked.id)?.swatches,
        `${activePaletteId}: the highlighted entry is the one that resolves`);
    } else {
      assert.equal(user, null, `${activePaletteId}: no user palette resolves, so none is highlighted`);
    }
  }

  // With NO org palette to fall back to, a detach really does mean nothing of
  // theirs is active, and nothing is highlighted.
  const detached = planPaletteSwitcher({
    palettes: users, activePaletteId: NO_ACTIVE_PALETTE_ID, optIn: true,
  });
  assert.equal(detached.entries.find((e) => e.active), undefined);
  assert.equal(resolveActiveUserPalette({ palettes: users, activePaletteId: NO_ACTIVE_PALETTE_ID }), null);
});

test("planPaletteSwitcher: nothing to choose between stays hidden", () => {
  // A lone entry is not a choice; offering it would be noise.
  assert.equal(planPaletteSwitcher({ palettes: MINEL, optIn: true }).visible, false);
  assert.equal(planPaletteSwitcher({ orgPalettes: ORGL, locked: true }).visible, false);
});

test("planPaletteSwitcher: marks which entry is active, bare org id included", () => {
  // An unset pointer under enforcement resolves to the org palette, and bare
  // "org" means the first org entry rather than matching nothing.
  const enforced = planPaletteSwitcher({ orgPalettes: ORGL, palettes: MINEL, locked: true });
  assert.equal(enforced.entries.find((e) => e.active)?.id, "org:0");

  const chosen = planPaletteSwitcher({
    orgPalettes: ORGL, palettes: MINEL, locked: true, activePaletteId: "mine",
  });
  assert.equal(chosen.entries.find((e) => e.active)?.id, "mine",
    "a locked user who switched to their own is shown on it");
});

test("planPolicyApply: unlocking with CHANGED org colours does not restore the old ones", () => {
  // bd 0ld. An admin edits the colours and lifts the lock in one policy write.
  // For a user with nothing of their own the stash is the PREVIOUS org palette,
  // so restoring it leaves the editor on colours the pickers have already moved
  // off. `wasManaged` is the only way to tell that from a stash they chose.
  const plan = at({
    managed: NEWORG, locked: false, wasReadOnly: true, hasOverride: false,
    showing: ORG, rendered: ORG, preLock: normalizePalette(ORG), wasManaged: ORG,
  });
  assert.deepEqual(plan.palette, NEWORG, "the NEW org colours, not the stale stash");
});

test("planPolicyApply: the same change keeps a stash the user actually chose", () => {
  const mine = normalizePalette(MINE);
  const plan = at({
    managed: NEWORG, locked: false, wasReadOnly: true, hasOverride: true,
    showing: ORG, rendered: ORG, preLock: mine, wasManaged: ORG,
  });
  assert.deepEqual(plan.palette, mine, "theirs, whatever the admin did");
});

test("planPolicyApply: an emptied editor is still not a stale org stash", () => {
  // The case that makes the naive form of the 0ld fix wrong: preLock is []
  // and, with no previous policy, so is wasManaged - matching by accident and
  // pushing colours back at someone who deliberately deleted them.
  const plan = at({
    managed: ORG, locked: false, wasReadOnly: true, hasOverride: false,
    showing: ORG, rendered: ORG, preLock: [], wasManaged: [],
  });
  assert.deepEqual(plan.palette, [], "the empty editor they left");
});

test("planPaletteSwitcher: the OPT-IN is the only gate - an org palette does not force it open", () => {
  // Owner ruling 2026-08-24, retiring the 2026-08-22 "any org palette in play
  // reveals it" rule. The opt-in now defaults ON, so that special case earned
  // nothing, and turning the opt-in OFF has to actually mean something.
  const off = planPaletteSwitcher({ orgPalettes: ORGL, palettes: MINEL, locked: false, optIn: false });
  assert.equal(off.visible, false, "off means the pre-multi-palette experience");
  assert.deepEqual(off.entries.map((e) => e.id), ["org:0", "mine"],
    "but the entries still EXIST: suppressed from the chooser, never deleted");
  const on = planPaletteSwitcher({ orgPalettes: ORGL, palettes: MINEL, locked: false, optIn: true });
  assert.equal(on.visible, true, "and turning it back on restores the list exactly");
  assert.equal(on.entries.find((e) => e.source === "org")?.readOnly, false,
    "unlocked means the org entry is not frozen either");
});

test("planPaletteSwitcher: enforcement does not override the opt-in either", () => {
  // Even locked, off is off. The route back to the organization's colors for
  // someone who opted out is the popup's "Use organization palette" button,
  // not a chooser they asked not to see.
  const plan = planPaletteSwitcher({ orgPalettes: ORGL, palettes: MINEL, locked: true, optIn: false });
  assert.equal(plan.visible, false);
});

test("planPaletteSwitcher: entry labels are decided here, once", () => {
  // The "Organization (organization)" duplication happened because the suffix
  // rule was a ternary pasted into both hosts and had to be fixed twice.
  const plan = planPaletteSwitcher({
    orgPalettes: [
      { id: "org:0", name: ORG_PALETTE_NAME, swatches: normalizePalette(ORG) },
      { id: "org:1", name: "Retail", swatches: normalizePalette(ORG) },
    ],
    palettes: MINEL, optIn: true,
  });
  const labels = Object.fromEntries(plan.entries.map((e) => [e.id, e.label]));
  assert.equal(labels["org:0"], ORG_PALETTE_NAME, "no suffix when the name already says it");
  assert.equal(labels["org:1"], "Retail (organization)", "a distinct name carries the source");
  assert.equal(labels["mine"], "Mine", "user entries are never suffixed");
});


// --- kyy: an unlocked org palette appearing --------------------------------
// Field, 2026-08-24. An org palette was published and the tester stayed on a
// personal "Default" that was byte-identical to the packaged colors and had
// been materialized as a side effect of clicking Multiple palettes. The rule
// the owner chose: land them on the org's, but only when the palette it would
// displace was never actually customized.

const ORG_MANAGED = [{ name: "Org Blue", hex: "#1A73E8", order: 0 }];

test("planOrgDefaultPush: an org palette appearing pushes a user who never customized", () => {
  assert.deepEqual(
    planOrgDefaultPush({ managed: ORG_MANAGED, locked: false, pushed: false, activeIsCustomized: false }),
    { pushed: true, activePaletteId: ORG_PALETTE_ID },
  );
});

test("planOrgDefaultPush: a customized palette is never displaced, but the episode is consumed", () => {
  const plan = planOrgDefaultPush({ managed: ORG_MANAGED, locked: false, pushed: false, activeIsCustomized: true });
  assert.deepEqual(plan, { pushed: true }, "no activePaletteId: nothing they typed is moved");
  // Consuming matters: without it every later read re-asks, so resetting their
  // colors to the packaged defaults months later would yank them onto the org's
  // for no reason they could connect to anything.
  assert.equal(
    planOrgDefaultPush({ managed: ORG_MANAGED, locked: false, pushed: true, activeIsCustomized: false }),
    null,
    "and once consumed it stays consumed, even if they later match the defaults",
  );
});

test("planOrgDefaultPush: does nothing while locked - enforcement owns that case", () => {
  assert.equal(planOrgDefaultPush({ managed: ORG_MANAGED, locked: true, pushed: false, activeIsCustomized: false }), null);
  assert.equal(planOrgDefaultPush({ managed: ORG_MANAGED, locked: true, pushed: false, activeIsCustomized: true }), null);
  // And crucially it does not CONSUME the episode while locked, so a lock
  // lifting later still leaves a fresh unlocked episode to decide.
  assert.deepEqual(
    planOrgDefaultPush({ managed: ORG_MANAGED, locked: false, pushed: false, activeIsCustomized: false }),
    { pushed: true, activePaletteId: ORG_PALETTE_ID },
  );
});

test("planOrgDefaultPush: the org palette going away forgets the episode without moving anyone", () => {
  assert.deepEqual(planOrgDefaultPush({ managed: [], locked: false, pushed: true }), { pushed: false },
    "forgotten, so a later publication is a fresh episode");
  assert.equal(planOrgDefaultPush({ managed: [], locked: false, pushed: false }), null, "nothing to do");
  // A degenerate policy normalizes to no org palette, so it is the same case.
  assert.equal(
    planOrgDefaultPush({ managed: [{ name: "", hex: "#123456" }], locked: false, pushed: false }),
    null,
    "nothing usable published is nothing published",
  );
});

test("planOrgDefaultPush: an already-decided episode never re-fires", () => {
  assert.equal(planOrgDefaultPush({ managed: ORG_MANAGED, locked: false, pushed: true, activeIsCustomized: false }), null);
});


// --- Opting OUT of Multiple palettes under enforcement (owner, 2026-08-26) ---

test("planOptOut: enforcement pulls the user back to the org palette", () => {
  // The hole this closes: opt in, create a palette, switch to it, opt out -
  // and the chooser is gone while you sit on your own colors, which is
  // enforcement defeated by a checkbox rather than by any decision.
  assert.deepEqual(
    planOptOut({ managed: ORG_MANAGED, locked: true, activePaletteId: "p1" }),
    { activePaletteId: ORG_PALETTE_ID },
  );
});

test("planOptOut: an UNLOCKED org palette pulls the user back too", () => {
  // Owner, 2026-08-27, revising the original enforcement-only scope: one
  // palette with an org palette published means the org's, lock or no lock.
  // The lock decides whether it is EDITABLE, not which one you are on.
  assert.deepEqual(
    planOptOut({ managed: ORG_MANAGED, locked: false, activePaletteId: "p1" }),
    { activePaletteId: ORG_PALETTE_ID },
  );
});

test("planOptOut: no org palette at all is nothing to return to", () => {
  // The one case that must stay null in BOTH lock states - with nothing
  // published there is no palette to return to, so a lone user palette stays.
  for (const locked of [true, false]) {
    assert.equal(planOptOut({ managed: [], locked, activePaletteId: "p1" }), null);
    assert.equal(planOptOut({ managed: undefined, locked, activePaletteId: "p1" }), null);
  }
});

test("planOptOut: already on the org palette moves nothing", () => {
  assert.equal(planOptOut({ managed: ORG_MANAGED, locked: true, activePaletteId: ORG_PALETTE_ID }), null);
  // Including via the lock's default for an unset pointer, which already
  // resolves to the organization's.
  assert.equal(planOptOut({ managed: ORG_MANAGED, locked: true, activePaletteId: undefined }), null);
  assert.equal(planOptOut({ managed: ORG_MANAGED, locked: false, activePaletteId: ORG_PALETTE_ID }), null);
});
