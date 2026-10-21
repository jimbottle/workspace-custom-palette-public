/**
 * Enterprise-policy read semantics.
 *
 * The bug these pin down: the managed read used to be capped inside the shared
 * accessor and resolved `undefined` on timeout — the SAME value that means
 * "this machine has no policy". Every caller then read a slow managed device as
 * an unmanaged one. In the popup and options page that flipped the org palette
 * off and let the next write store a personal override, permanently detaching
 * the user from admin updates (it lands in chrome.storage.sync and follows them
 * to every machine); in the content script it dropped the org palette for the
 * life of the page, because onManagedChanged only fires on a later policy edit.
 *
 * So the load-bearing property is not "there is a timeout" but "a deadline miss
 * is DISTINGUISHABLE from an absent policy".
 */
import { test } from "node:test";
import assert from "node:assert/strict";

/**
 * Install a fake `chrome.storage.managed` and import a fresh copy of storage.js.
 * The cache-busting query is what lets each test define its own chrome global;
 * the module reads `chrome` lazily per call, but a fresh import keeps tests
 * independent if that ever changes.
 * @param {(keys?: any) => Promise<any>} getImpl  stands in for chrome.storage.managed.get
 *   (the real API takes a key or array of keys; getManagedPolicy passes both
 *   policy keys at once, and one test asserts exactly that)
 */
async function withManagedGet(getImpl) {
  globalThis.chrome = /** @type {any} */ ({ storage: { managed: { get: getImpl } } });
  return import(`../storage.js?case=${Math.random().toString(36).slice(2)}`);
}

test("getManagedPalette: returns the policy value when there is one", async () => {
  const { getManagedPalette } = await withManagedGet(async () => ({ palette: [{ name: "Org", hex: "#123456" }] }));
  assert.deepEqual(await getManagedPalette(), [{ name: "Org", hex: "#123456" }]);
});

test("getManagedPalette: an absent policy or unavailable area is undefined, never a rejection", async () => {
  const absent = await withManagedGet(async () => ({}));
  assert.equal(await absent.getManagedPalette(), undefined);

  const unavailable = await withManagedGet(async () => { throw new Error("managed storage unavailable"); });
  assert.equal(await unavailable.getManagedPalette(), undefined);
});

test("getManagedPalette is UNTIMED: a slow read still yields the policy", async () => {
  // The regression: with a cap inside this accessor, a managed device slower
  // than the cap looked unmanaged forever. 30ms stands in for "slower than any
  // deadline a caller would pick".
  const { getManagedPalette } = await withManagedGet(
    () => new Promise((resolve) => setTimeout(() => resolve({ palette: [{ name: "Late", hex: "#abcdef" }] }), 30)),
  );
  assert.deepEqual(await getManagedPalette(), [{ name: "Late", hex: "#abcdef" }]);
});

test("getManagedPaletteWithin: a deadline miss is reported as timedOut, NOT as an absent policy", async () => {
  // A read that never settles at all — the case the cap existed for.
  const { getManagedPaletteWithin } = await withManagedGet(() => new Promise(() => {}));
  const { prompt } = getManagedPaletteWithin(10);
  const first = await prompt;
  assert.equal(first.timedOut, true, "a hung read must announce itself");
  assert.equal(first.value, undefined);
  // The distinction is the whole point: a caller must be able to tell this
  // apart from a real "no policy here" answer.
  const absent = await withManagedGet(async () => ({}));
  const known = await absent.getManagedPaletteWithin(10).prompt;
  assert.equal(known.timedOut, false, "an absent policy is a KNOWN answer, not a timeout");
  assert.equal(known.value, undefined);
  assert.notDeepEqual(first, known, "timed-out and absent must not be the same value");
});

test("getManagedPaletteWithin: the untimed read keeps running and still lands", async () => {
  // This is what lets popup/options render promptly yet refuse to write a
  // personal override until the real answer arrives.
  const { getManagedPaletteWithin } = await withManagedGet(
    () => new Promise((resolve) => setTimeout(() => resolve({ palette: [{ name: "Late", hex: "#abcdef" }] }), 30)),
  );
  const { prompt, settled } = getManagedPaletteWithin(5);
  assert.equal((await prompt).timedOut, true, "5ms deadline must be missed by a 30ms read");
  assert.deepEqual(await settled, [{ name: "Late", hex: "#abcdef" }], "the real answer must still arrive");
});

test("getManagedPaletteWithin: a fast read reports the value with no timeout", async () => {
  const { getManagedPaletteWithin } = await withManagedGet(async () => ({ palette: [{ name: "Org", hex: "#123456" }] }));
  const { prompt, settled } = getManagedPaletteWithin(1000);
  assert.deepEqual(await prompt, { timedOut: false, value: [{ name: "Org", hex: "#123456" }] });
  assert.deepEqual(await settled, [{ name: "Org", hex: "#123456" }]);
});

test("getManagedPolicy: reads EVERY policy key in one call, and unwraps the Admin console shape", async () => {
  // The {"Value": ...} form is what docs/DEPLOY.md tells admins to paste, and
  // it was the branch nothing reached: the jsdom harness stores a raw boolean,
  // so every locked UI test exercised only `typeof raw === "boolean"`. If the
  // unwrap regressed, every Admin-console lock would fail OPEN silently —
  // enforcement quietly not applied, the org palette still a mere default.
  /** @type {string[][]} */
  const calls = [];
  const mod = await withManagedGet(async (/** @type {string[]} */ keys) => {
    calls.push(keys);
    return { palette: [{ name: "Org", hex: "#123456" }], paletteLocked: { Value: true } };
  });
  const policy = await mod.getManagedPolicy();
  assert.deepEqual(policy.palette, [{ name: "Org", hex: "#123456" }]);
  assert.equal(policy.locked, true, "{Value: true} unwraps to true");
  // One round trip, both keys: reading them separately would let a caller see
  // half a policy — the lock without the palette it locks, or the reverse.
  assert.equal(calls.length, 1);
  // All three: the legacy single palette, the named collection an admin may
  // publish instead, and the lock. Reading any of them separately would let a
  // caller see half a policy — the lock without the palette it locks, or a
  // multi-palette publish without the lock that enforces it.
  assert.deepEqual(calls[0], ["palette", "palettes", "paletteLocked"]);
});

test("getManagedPolicy: every not-true shape reads as unlocked", async () => {
  const cases = [
    ["raw true", true, true],
    ["raw false", false, false],
    ["{Value:false}", { Value: false }, false],
    ["absent", undefined, false],
    // Junk must never read as enforced: locking someone out on a malformed
    // policy is far worse than failing to lock them.
    ["string 'true'", "true", false],
    ["{Value:'true'}", { Value: "true" }, false],
    ["number 1", 1, false],
  ];
  for (const [label, raw, want] of cases) {
    const mod = await withManagedGet(async () => (raw === undefined ? { palette: [] } : { palette: [], paletteLocked: raw }));
    assert.equal((await mod.getManagedPolicy()).locked, want, `${label} -> locked=${want}`);
  }
});

test("getManagedPolicy: an unavailable managed area is unlocked, never a rejection", async () => {
  const mod = await withManagedGet(async () => { throw new Error("managed storage unavailable"); });
  assert.deepEqual(await mod.getManagedPolicy(), { palette: undefined, palettes: undefined, locked: false });
});

// --- multi-palette storage shape ------------------------------------------
//
// The contract worth pinning: reads resolve BOTH shapes and never write, and
// a write keeps the legacy mirror correct so a machine on an older build sees
// the same colors rather than stale ones.

/**
 * Fake `chrome.storage.sync` over a plain object, recording writes so a test
 * can assert that a read path performed none.
 * @param {Record<string, any>} initial
 */
async function withSync(initial, { keepInterimShape = false } = {}) {
  const data = { ...initial };
  // Seeds stay written as a readable {palettes:[...]} literal, but the STORED
  // shape is per-key, which is what the code actually reads. Pass
  // keepInterimShape to seed the old single-key collection on purpose, which
  // is how the read-tolerance for it gets exercised.
  if (Array.isArray(data.palettes) && !keepInterimShape) {
    for (const entry of data.palettes) {
      const { id, ...rest } = /** @type {any} */ (entry);
      data[`pal:${id}`] = rest;
    }
    data.paletteOrder = data.palettes.map((/** @type {any} */ e) => e.id);
    delete data.palettes;
  }
  const writes = /** @type {any[]} */ ([]);
  const calls = /** @type {string[]} */ ([]);
  const listeners = /** @type {any[]} */ ([]);
  /** Deliver a sync change to every listener, as Chrome does. @param {any} changes */
  function emitChange(changes) { for (const fn of listeners) fn(changes, "sync"); }
  /**
   * Deliver a change the way a real WRITE does: LATER, not inline.
   * chrome.storage.onChanged is an IPC message, so it lands after the set()
   * promise resolves and after the caller's continuation has run. Emitting it
   * synchronously inside set() put it BEFORE setUserPalette refilled its
   * cache, which hid a self-invalidation bug completely - the cache was busted
   * and then immediately rewritten, so no test could see it.
   * @param {any} changes
   */
  function emitLater(changes) { setTimeout(() => emitChange(changes), 0); }
  globalThis.chrome = /** @type {any} */ ({
    storage: {
      onChanged: { addListener: (/** @type {any} */ fn) => { listeners.push(fn); } },
      sync: {
        async get(/** @type {any} */ keys) {
          calls.push("get");
          const list = keys == null ? Object.keys(data) : (Array.isArray(keys) ? keys : [keys]);
          /** @type {Record<string, any>} */
          const out = {};
          for (const k of list) if (k in data) out[k] = data[k];
          return out;
        },
        async set(/** @type {Record<string, any>} */ items) {
          calls.push("set");
          writes.push(items);
          /** @type {any} */
          const changes = {};
          for (const [k, v] of Object.entries(items)) {
            changes[k] = { oldValue: data[k], newValue: v };
          }
          Object.assign(data, items);
          // Real Chrome fires onChanged for the extension's OWN writes. Not
          // doing so here hid a HIGH bug where every save busted the cache it
          // had just filled, because no test could observe a self-write event.
          emitLater(changes);
        },
        async remove(/** @type {any} */ keys) {
          calls.push("remove");
          writes.push({ removed: keys });
          /** @type {any} */
          const changes = {};
          for (const k of (Array.isArray(keys) ? keys : [keys])) {
            if (k in data) changes[k] = { oldValue: data[k], newValue: undefined };
            delete data[k];
          }
          if (Object.keys(changes).length) emitLater(changes);
        },
      },
    },
  });
  const mod = await import(`../storage.js?case=${Math.random().toString(36).slice(2)}`);
  return { mod, data, writes, calls, emitChange };
}

/**
 * The stored collection, rebuilt from the per-key items the way lib/storage.js
 * does. Assertions read through this so they pin the CONTENT rather than the
 * key layout.
 * @param {Record<string, any>} data
 */
function collection(data) {
  const order = Array.isArray(data.paletteOrder) ? data.paletteOrder : [];
  const seen = new Set(order);
  const extra = Object.keys(data).filter((k) => k.startsWith("pal:") && !seen.has(k.slice(4)));
  return [...order, ...extra.map((k) => k.slice(4))]
    .filter((id) => data[`pal:${id}`])
    .map((id) => ({ id, ...data[`pal:${id}`] }));
}

const SW_A = [{ name: "A", hex: "#111111", order: 0 }];
const SW_B = [{ name: "B", hex: "#222222", order: 0 }];

test("getUserPalette: resolves the ACTIVE entry out of the collection", async () => {
  const { mod } = await withSync({
    palettes: [
      { id: "p1", name: "One", swatches: SW_A },
      { id: "p2", name: "Two", swatches: SW_B },
    ],
    activePaletteId: "p2",
  });
  assert.deepEqual(await mod.getUserPalette(), SW_B);
});

test("getUserPalette: falls back to the legacy single key when there is no collection", async () => {
  const { mod } = await withSync({ palette: SW_A });
  assert.deepEqual(await mod.getUserPalette(), SW_A);
});

test("getUserPalette: nothing stored stays undefined, distinct from an empty palette", async () => {
  // Callers read `undefined` as "no override at all", which is what decides
  // whether admin updates still reach this user. An empty array would say the
  // opposite.
  const { mod } = await withSync({});
  assert.equal(await mod.getUserPalette(), undefined);
});

test("getUserPalette: the collection outranks a legacy key from an older machine", async () => {
  const { mod } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
    palette: SW_B,
  });
  assert.deepEqual(await mod.getUserPalette(), SW_A);
});

test("reads NEVER write: the popup and options pages read during init", async () => {
  // A surprise write on a read path would interleave with the policy machinery
  // that ten review rounds went into. Migration is the worker's job.
  const { mod, writes } = await withSync({ palette: SW_A });
  await mod.getUserPalette();
  await mod.getPaletteState();
  assert.deepEqual(writes, [], "no write may escape a read");
});

test("setUserPalette: writes the active entry AND keeps the legacy mirror correct", async () => {
  const { mod, data } = await withSync({
    palettes: [
      { id: "p1", name: "One", swatches: SW_A },
      { id: "p2", name: "Two", swatches: SW_A },
    ],
    activePaletteId: "p2",
  });
  await mod.setUserPalette(SW_B);
  assert.deepEqual(collection(data)[1]?.swatches, SW_B, "the active entry moved");
  assert.deepEqual(collection(data)[0]?.swatches, SW_A, "the other one did not");
  assert.deepEqual(data.palette, SW_B, "and an older build sees the same colors");
});

test("setUserPalette: a first write on a pre-multi account creates the collection", async () => {
  const { mod, data } = await withSync({});
  await mod.setUserPalette(SW_A);
  assert.equal(collection(data).length, 1);
  assert.equal(data.activePaletteId, collection(data)[0]?.id);
  assert.deepEqual(data.palette, SW_A);
});

test("clearUserPalette: DETACHES, and deletes nothing", async () => {
  // "Use organization palette" means stop using my colors here. An earlier
  // version removed the active entry, which was wrong twice: it destroyed a
  // named palette, and it did not detach at all, because resolution fell
  // through to the next entry and the user carried on overriding.
  const { mod, data } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
    palette: SW_A,
    enabled: true,
  });
  await mod.clearUserPalette();
  assert.deepEqual(collection(data), [{ id: "p1", name: "One", swatches: SW_A }], "nothing is deleted");
  assert.equal(await mod.getUserPalette(), undefined, "and yet there is no override");
  assert.equal(data.enabled, true, "nothing else is touched");
});

test("clearUserPalette: with nothing stored, every key goes", async () => {
  // There is nothing to detach from, so "nothing stored" stays literally true
  // and no leftover key can resolve behind it.
  const { mod, data } = await withSync({ palette: SW_A, enabled: true });
  await mod.clearUserPalette();
  assert.equal("palette" in data, false);
  assert.equal("palettes" in data, false);
  assert.equal("activePaletteId" in data, false);
  assert.equal(data.enabled, true);
});

test("clearUserPalette: the detach is ONE write, so it cannot half-land", async () => {
  // A set plus a remove is not atomic: a failure landing the second and
  // refusing the first leaves the mirror gone while this client is still
  // attached. The mirror goes to an EMPTY palette instead, which is how an
  // older build spells "no override" too.
  const { mod, writes } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
    palette: SW_A,
  });
  await mod.clearUserPalette();
  assert.equal(writes.length, 1, "one operation, so there is no half-landed state");
  assert.deepEqual(writes[0].palette, [], "an older build reads this as no override");
});

test("clearUserPalette: with SEVERAL palettes, every one survives and none is active", async () => {
  const { mod, data } = await withSync({
    palettes: [
      { id: "p1", name: "One", swatches: SW_A },
      { id: "p2", name: "Two", swatches: SW_B },
    ],
    activePaletteId: "p2",
    palette: SW_B,
  });
  await mod.clearUserPalette();
  assert.deepEqual(collection(data).map((p) => p.id), ["p1", "p2"], "nothing deleted");
  assert.equal(await mod.getUserPalette(), undefined,
    "and detaching must not fall through to the OTHER palette");
});

test("clearUserPalette: is SINGLE-HOP once the state is known (the teardown flush)", async () => {
  // Reachable from the popup's dismissal flush, when the edited colors match
  // the managed palette. A read there loses the clear the same way it lost the
  // set: the get is dispatched, the frame dies, the write never issues.
  const { mod, calls } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
  });
  await mod.getUserPalette();
  calls.length = 0;
  await mod.clearUserPalette();
  assert.deepEqual(calls.filter((c) => c === "get"), [], "no read may precede the write");
});

test("setUserPalette: a save preserves entries and fields this build cannot parse", async () => {
  // Same "rewrite the collection to whatever this build understands" loss the
  // migration path was fixed for, reached by an ordinary swatch edit instead.
  const { mod, data } = await withSync({
    palettes: [
      { id: "p1", name: "One", swatches: SW_A, futureField: "from a newer build" },
      { id: "p2", name: "Two", swatches: SW_B, futureField: "also kept" },
    ],
    activePaletteId: "p1",
  });
  await mod.setUserPalette(SW_B);
  assert.deepEqual(collection(data)[0]?.swatches, SW_B, "the active entry took the edit");
  assert.equal(collection(data)[0]?.futureField, "from a newer build", "its unknown fields survived");
  assert.equal(collection(data)[1]?.futureField, "also kept", "and so did the other entry's");
});

test("the write cache is invalidated when someone else changes the collection", async () => {
  // A page can stay open for hours. Writing a stale cache back would
  // resurrect deleted entries and clobber edits made to OTHER palettes.
  const { mod, data, emitChange } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
  });
  await mod.getUserPalette(); // cache is now warm
  // Another context (or another synced machine) adds a palette: its own item
  // plus the index entry, which is exactly what setUserPalette writes.
  data["pal:p2"] = { name: "Two", swatches: SW_B };
  data.paletteOrder = ["p1", "p2"];
  emitChange({ "pal:p2": { newValue: data["pal:p2"] }, paletteOrder: { newValue: data.paletteOrder } });
  await mod.setUserPalette(SW_B);
  // Assert the INDEX, not the reconstruction. collectionFromKeys deliberately
  // recovers items the order forgot, so a clobbered index still reads back
  // every palette — it just loses their order. That recovery would mask a
  // stale cache here, which is precisely what this test exists to catch.
  assert.deepEqual(data.paletteOrder, ["p1", "p2"],
    "a stale cache would rewrite the index without the palette added elsewhere");
  assert.deepEqual(collection(data)[0]?.swatches, SW_B, "and the active one still took the edit");
});

test("setUserPalette: is SINGLE-HOP once the state is known (the teardown flush)", async () => {
  // The popup's dismissal flush runs while the context is being destroyed. A
  // read-modify-write there loses the edit: the get is dispatched, the frame
  // dies, and the set waiting on its response is never issued.
  const { mod, calls } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
  });
  await mod.getUserPalette(); // the read every host already does at init
  calls.length = 0;
  await mod.setUserPalette(SW_B);
  assert.deepEqual(calls.filter((c) => c === "get"), [], "no read may precede the write");
  assert.deepEqual(calls, ["set"]);
});

test("setUserPalette: a quota rejection says what to do about it", async () => {
  const { mod } = await withSync({});
  globalThis.chrome.storage.sync.set = async () => {
    throw new Error("QUOTA_BYTES_PER_ITEM quota exceeded");
  };
  await assert.rejects(() => mod.setUserPalette(SW_A), /no room left in your synced storage/);
});

test("migratePaletteStorage: a pointer repair writes ONLY the pointer, plus its mirror", async () => {
  // Writing the normalized collection back would delete anything this build
  // cannot parse, unattended, on every install and browser start. The mirror
  // ("palette") is the one companion key allowed along: it is the open tabs'
  // live-update channel, so it must follow the repaired pointer - but no
  // per-key entry or index may be rewritten.
  const stored = [
    { id: "p1", name: "One", swatches: SW_A },
    { id: "p2", name: "Two", swatches: SW_B, futureField: "kept by a newer build" },
  ];
  const { mod, data, writes } = await withSync({ palettes: stored, activePaletteId: "gone" });
  assert.equal(await mod.migratePaletteStorage(), true);
  assert.equal(data.activePaletteId, "p1");
  assert.deepEqual(writes, [{ activePaletteId: "p1", palette: SW_A }],
    "pointer + mirror only; every per-key entry stays out of the write");
  assert.equal(collection(data)[1]?.futureField, "kept by a newer build", "untouched");
});

test("migratePaletteStorage: moves a legacy account forward, then is a no-op", async () => {
  const { mod, data } = await withSync({ palette: SW_A });
  assert.equal(await mod.migratePaletteStorage(), true);
  assert.equal(collection(data).length, 1);
  assert.deepEqual(collection(data)[0]?.swatches, SW_A);
  assert.equal(data.activePaletteId, collection(data)[0]?.id);
  assert.equal(await mod.migratePaletteStorage(), false, "running twice writes nothing");
});

test("migratePaletteStorage: an account with nothing stored is left alone", async () => {
  // Inventing a palette here would create an override the user never chose.
  const { mod, data, writes } = await withSync({});
  assert.equal(await mod.migratePaletteStorage(), false);
  assert.deepEqual(writes, []);
  assert.equal("palettes" in data, false);
});

test("a detached machine still sees an edit made on an OLDER build", async () => {
  // clearUserPalette writes `palette: []` in the same atomic write as the
  // sentinel, so a NON-EMPTY legacy key beside the sentinel can only mean a
  // machine on a pre-multi build wrote after the detach. That is the user's
  // most recent edit. Ignoring it left the two machines showing different
  // colors indefinitely, which is the divergence the mirror exists to prevent.
  const { mod, data, writes } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "__none__",
    palette: SW_B, // written by the older build, after the detach
  });
  assert.deepEqual(await mod.getUserPalette(), SW_B);

  // And the worker must not "tidy" it: pointing at an entry that does not hold
  // that edit would hide it, and rewriting the collection would be the lossy
  // write the pointer-only rule exists to prevent.
  assert.equal(await mod.migratePaletteStorage(), false);
  assert.deepEqual(writes, []);
  assert.deepEqual(collection(data), [{ id: "p1", name: "One", swatches: SW_A }]);
});

test("a detach with no later edit still resolves to no override", async () => {
  const { mod } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "__none__",
    palette: [],
  });
  assert.equal(await mod.getUserPalette(), undefined);
});

test("setUserPalette: a collection this build cannot parse AT ALL is appended to, not replaced", async () => {
  // Every entry is in a shape this build drops, so the normalized view is
  // empty and the splice finds no target. Replacing meant one swatch edit
  // deleted every palette a newer build had stored, on every machine.
  const raw = [
    { id: "p1", label: "renamed by a newer build", swatches: SW_A },
    { id: "p2", label: "also unparseable here", swatches: SW_B },
  ];
  const { mod, data } = await withSync({ palettes: raw, activePaletteId: "p1" });
  await mod.setUserPalette(SW_B);
  assert.equal(collection(data).length, 3, "the two unparseable entries survive");
  assert.deepEqual(collection(data).slice(0, 2), raw);
  assert.deepEqual(collection(data)[2]?.swatches, SW_B, "and the edit is appended");
});

test("migratePaletteStorage: writes NOTHING when the stored collection is unreadable here", async () => {
  // The unattended path, and the more dangerous one: this runs from the
  // service worker on every install and browser start, with nobody watching.
  const unreadable = [
    { id: "p1", label: "renamed by a newer build", swatches: SW_A },
    { id: "p2", label: "also unreadable here", swatches: SW_B },
  ];
  const { mod, data, writes } = await withSync({ palettes: unreadable, palette: SW_A });
  assert.equal(await mod.migratePaletteStorage(), false);
  assert.deepEqual(writes, []);
  assert.deepEqual(collection(data), unreadable, "a newer build's collection survives");
});

test("clearUserPalette: an unreadable collection is DETACHED from, never deleted", async () => {
  // Same root cause as the save path, reached by the detach control: the empty
  // guard read the normalized view, so one click on "Use organization palette"
  // removed a collection this build simply could not parse.
  const unreadable = [{ id: "p1", label: "renamed by a newer build", swatches: SW_A }];
  const { mod, data } = await withSync({ palettes: unreadable, activePaletteId: "p1", palette: SW_A });
  await mod.clearUserPalette();
  assert.deepEqual(collection(data), unreadable, "nothing deleted");
  assert.equal(data.activePaletteId, "__none__", "detached instead");
  assert.equal(await mod.getUserPalette(), undefined);
});

test("migratePaletteStorage: never re-points away from an entry a newer build wrote", async () => {
  // The unattended path. Nobody sees this run, and its effect syncs everywhere.
  const mixed = [
    { id: "mine", name: "Mine", swatches: SW_A },
    { id: "theirs", label: "written by a newer build", swatches: SW_B },
  ];
  const { mod, data, writes } = await withSync({ palettes: mixed, activePaletteId: "theirs" });
  assert.equal(await mod.migratePaletteStorage(), false);
  assert.deepEqual(writes, []);
  assert.equal(data.activePaletteId, "theirs", "the user stays on the palette they chose");
});

test("an unreadable ACTIVE entry: what is shown and what is written are the same palette", async () => {
  // The two fallbacks (resolveActiveUserPalette and setUserPalette) must agree.
  // If they drift, an edit lands in a palette the user was not looking at.
  const mixed = [
    { id: "mine", name: "Mine", swatches: SW_A },
    { id: "theirs", label: "unreadable here", swatches: SW_B },
  ];
  const { mod, data } = await withSync({ palettes: mixed, activePaletteId: "theirs" });
  assert.deepEqual(await mod.getUserPalette(), SW_A, "shows the first entry it can read");
  await mod.setUserPalette(SW_B);
  assert.deepEqual(collection(data)[0]?.swatches, SW_B, "and writes to that same entry");
  assert.deepEqual(collection(data)[1], mixed[1], "the unreadable entry is untouched");
});

// --- 7i3: one sync item per palette ---------------------------------------

test("MAX_PALETTES full-size palettes fit, which the single-key shape could not", async () => {
  // The whole point of the per-key shape. chrome.storage.sync enforces
  // QUOTA_BYTES_PER_ITEM = 8192; a full palette serializes to roughly 1.6 KB,
  // so a shared key held five while MAX_PALETTES advertises twelve. Per item
  // the ceiling scales with ONE palette.
  const full = (/** @type {number} */ n) => ({
    id: `p${n}`,
    name: `Palette number ${n} with a long-ish name`,
    swatches: Array.from({ length: 24 }, (_, i) => ({ name: `Colour name ${i}`, hex: "#FE5917", order: i })),
  });
  const seeded = Array.from({ length: 12 }, (_, i) => full(i));
  const { mod, data } = await withSync({ palettes: seeded, activePaletteId: "p0" });

  const QUOTA_BYTES_PER_ITEM = 8192;
  for (const [k, v] of Object.entries(data)) {
    if (!k.startsWith("pal:")) continue;
    const size = new TextEncoder().encode(k + JSON.stringify(v)).length;
    assert.ok(size < QUOTA_BYTES_PER_ITEM, `${k} is ${size} bytes, over the per-item ceiling`);
  }
  // And all twelve are readable back, which the shared key could not manage.
  const state = await mod.getPaletteState();
  assert.equal(state.palettes.length, 12);
  assert.deepEqual(state.palettes.map((/** @type {any} */ e) => e.id),
    seeded.map((e) => e.id), "and in order");
});

test("a save touches only its OWN palette's item", async () => {
  // The other half of the point: an edit costs one small item rather than
  // rewriting a collection that cannot fit under the ceiling.
  const { mod, writes } = await withSync({
    palettes: [
      { id: "p1", name: "One", swatches: SW_A },
      { id: "p2", name: "Two", swatches: SW_B },
    ],
    activePaletteId: "p2",
  });
  await mod.getUserPalette();
  writes.length = 0;
  await mod.setUserPalette(SW_A);
  const keys = Object.keys(writes[0] ?? {});
  assert.ok(keys.includes("pal:p2"), "the active palette's own item");
  assert.ok(!keys.includes("pal:p1"), "and NOT the one that did not change");
});

test("migratePaletteStorage: the interim single-key collection moves to per-key", async () => {
  // Only a dev profile can hold this shape - 0.2.0 never shipped - but this
  // build wrote it, so this build clears it up rather than leaving it under
  // the item ceiling it exists to escape.
  const { mod, data } = await withSync({
    palettes: [
      { id: "p1", name: "One", swatches: SW_A, futureField: "kept" },
      { id: "p2", name: "Two", swatches: SW_B },
    ],
    activePaletteId: "p1",
  }, { keepInterimShape: true });

  assert.ok(Array.isArray(data.palettes), "seeded in the interim shape");
  assert.equal(await mod.migratePaletteStorage(), true);
  assert.equal("palettes" in data, false, "the shared key is gone");
  assert.deepEqual(collection(data).map((p) => p.id), ["p1", "p2"]);
  assert.equal(collection(data)[0]?.futureField, "kept", "unknown fields survive the move");
  assert.deepEqual(await mod.getUserPalette(), SW_A, "and the active palette still resolves");
});

test("reads still tolerate the interim single-key collection before migration runs", async () => {
  // Migration is the worker's job and may not have run yet; a read must not
  // depend on it.
  const { mod } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
  }, { keepInterimShape: true });
  assert.deepEqual(await mod.getUserPalette(), SW_A);
});

test("a save does NOT bust its own cache, so the next write stays single-hop", async () => {
  // Chrome fires onChanged for the extension's own writes. Treating that as
  // "someone else changed it" made every save invalidate the cache it had just
  // filled, so the NEXT write fell back to a read - and on the popup's
  // teardown flush a read-before-write is the dropped-edit bug the cache
  // exists to prevent. The fake now fires on its own writes too, which is what
  // lets this be observed at all.
  const { mod, calls } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
  });
  await mod.getUserPalette();          // cache warm
  await mod.setUserPalette(SW_B);      // fires onChanged for its own write
  await new Promise((r) => setTimeout(r, 0)); // let that delivery land
  calls.length = 0;
  await mod.setUserPalette(SW_A);      // the write the flush would make
  assert.deepEqual(calls.filter((c) => c === "get"), [],
    "the self-write must not have invalidated the cache");
  assert.deepEqual(calls, ["set"]);
});

test("a save still yields the cache to a genuine outside change", async () => {
  // The other side of it: agreeing with the cache must not mean ignoring
  // everything. A value that differs from the model still invalidates.
  const { mod, data, calls, emitChange } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
  });
  await mod.getUserPalette();
  data["pal:p1"] = { name: "Renamed elsewhere", swatches: SW_B };
  emitChange({ "pal:p1": { newValue: data["pal:p1"] } });
  calls.length = 0;
  await mod.setUserPalette(SW_A);
  assert.ok(calls.includes("get"), "a real outside change must force a re-read");
});

// --- kbs: the enforcement push, end to end through storage ----------------

test("applyEnforcementPush: makes the org palette active, once", async () => {
  // The user had saved before, so activePaletteId points at their OWN palette
  // - a save artefact, not a choice. Enforcement overwrites it.
  const { mod, data, writes } = await withSync({
    palettes: [{ id: "personal", name: "Mine", swatches: SW_A }],
    activePaletteId: "personal",
  });
  assert.equal(await mod.applyEnforcementPush({ locked: true, managed: SW_B }), true);
  assert.equal(data.activePaletteId, "org", "the organization's palette is now active");
  assert.equal(data.enforcementPushed, true);
  assert.deepEqual(await mod.getUserPalette(), undefined,
    "so no personal override applies while they are on the org palette");

  // Running again writes nothing: the user may have switched since, and a
  // second push would yank them back.
  writes.length = 0;
  assert.equal(await mod.applyEnforcementPush({ locked: true, managed: SW_B }), false);
  assert.deepEqual(writes, []);
});

test("applyEnforcementPush: a user who switches away STAYS away", async () => {
  // The half of the rule that matters to the user: pushed once, then free.
  const { mod, data } = await withSync({
    palettes: [{ id: "personal", name: "Mine", swatches: SW_A }],
    activePaletteId: "personal",
  });
  await mod.applyEnforcementPush({ locked: true, managed: SW_B });
  await mod.setUserPalette(SW_A);            // the user switches back to their own
  assert.equal(data.activePaletteId, "personal");
  await mod.applyEnforcementPush({ locked: true, managed: SW_B });
  assert.equal(data.activePaletteId, "personal", "still enforced, but not re-pushed");
});

test("applyEnforcementPush: enforcement ending clears the marker but not the pointer", async () => {
  const { mod, data } = await withSync({
    palettes: [{ id: "personal", name: "Mine", swatches: SW_A }],
    activePaletteId: "personal",
    enforcementPushed: true,
  });
  assert.equal(await mod.applyEnforcementPush({ locked: false, managed: SW_B }), true);
  assert.equal(data.enforcementPushed, false);
  assert.equal(data.activePaletteId, "personal", "the user keeps the palette they were on");

  // And a LATER re-enforcement pushes again.
  assert.equal(await mod.applyEnforcementPush({ locked: true, managed: SW_B }), true);
  assert.equal(data.activePaletteId, "org");
});

// --- t12: deletion, and the org-implies-personal default -------------------

test("deletePalette: removes the entry, moves the pointer to the first survivor", async () => {
  const { mod, data } = await withSync({
    palettes: [
      { id: "a", name: "One", swatches: SW_A },
      { id: "b", name: "Two", swatches: SW_B },
    ],
    activePaletteId: "b",
  });
  await mod.deletePalette("b");
  assert.equal("pal:b" in data, false);
  assert.deepEqual(data.paletteOrder, ["a"]);
  assert.equal(data.activePaletteId, "a", "no dangling pointer to rely on recovery");
});

test("deletePalette: the LAST one clears every shape", async () => {
  const { mod, data } = await withSync({
    palettes: [{ id: "a", name: "One", swatches: SW_A }],
    activePaletteId: "a", palette: SW_A,
  });
  await mod.deletePalette("a");
  for (const k of ["pal:a", "paletteOrder", "activePaletteId", "palette"]) {
    assert.equal(k in data, false, k);
  }
});

test("deletePalette: refuses org ids", async () => {
  const { mod } = await withSync({});
  await assert.rejects(() => mod.deletePalette("org:0"), /managed by your administrator/);
});

test("ensureDefaultPersonalPalette: creates one only when the user has none", async () => {
  const { mod, data } = await withSync({});
  assert.equal(await mod.ensureDefaultPersonalPalette(SW_A), true);
  const key = Object.keys(data).find((k) => k.startsWith("pal:"));
  assert.ok(key, "a personal entry exists");
  assert.deepEqual(data[key].swatches, SW_A, "seeded with the packaged defaults, not empty");
  assert.equal("activePaletteId" in data, false,
    "does NOT select it - what is active belongs to the push and the user");
  assert.equal(await mod.ensureDefaultPersonalPalette(SW_A), false, "idempotent");
});

test("ensureDefaultPersonalPalette: a legacy single palette already counts", async () => {
  const { mod, writes } = await withSync({ palette: SW_A });
  assert.equal(await mod.ensureDefaultPersonalPalette(SW_B), false);
  assert.deepEqual(writes, [], "migration owns that entry; nothing to create");
});

test("renamePalette: renames in place, preserves unknown fields, refuses org ids", async () => {
  const { mod, data } = await withSync({
    palettes: [{ id: "a", name: "Alpha", swatches: SW_A, futureField: "kept" }],
    activePaletteId: "a",
  });
  await mod.renamePalette("a", "  Client work  ");
  assert.equal(data["pal:a"].name, "Client work", "trimmed and stored");
  assert.equal(data["pal:a"].futureField, "kept", "a newer build's fields survive");
  await assert.rejects(() => mod.renamePalette("org:0", "X"), /cannot be renamed/);
  await assert.rejects(() => mod.renamePalette("a", "   "), /needs a name/);
});

// --- bd 3ij / TESTING-0.2.0 field bug: the mirror follows every pointer move
//
// The legacy `palette` key is the live-update channel: the content script and
// the toolbar icon hear a switch through it, because they subscribe to storage
// changes, not to each other's function calls. A writer that moved the pointer
// without rewriting the mirror left every open Doc on the previous palette
// until the next save (field, 2026-08-23). The invariant these tests pin:
// after ANY pointer-moving write, `data.palette` holds exactly what
// mirrorForActivePalette says it must - in the SAME atomic write.

const TWO = [
  { id: "p1", name: "One", swatches: SW_A },
  { id: "p2", name: "Two", swatches: SW_B },
];

test("mirror invariant: setActivePalette to a personal entry rewrites the mirror in one write", async () => {
  const { mod, data, writes } = await withSync({ palettes: TWO, activePaletteId: "p1", palette: SW_A });
  await mod.setActivePalette("p2");
  assert.deepEqual(data.palette, SW_B, "the open tabs' channel now carries Two's colors");
  // One set, not a pointer set plus a mirror set: two operations are not
  // atomic, and a failure between them is exactly the stale-picker state again.
  const last = writes.at(-1);
  assert.ok(last && "activePaletteId" in last && "palette" in last,
    `pointer and mirror land together: ${JSON.stringify(last)}`);
});

test("mirror invariant: setActivePalette to the ORG empties the mirror", async () => {
  const { mod, data } = await withSync({ palettes: TWO, activePaletteId: "p1", palette: SW_A });
  await mod.setActivePalette("org");
  assert.deepEqual(data.palette, [],
    "an org pointer means no personal override applies; [] is how that broadcasts");
  assert.equal(await mod.getUserPalette(), undefined,
    "and resolution falls through to the managed tier, not to a stale entry");
});

test("mirror invariant: createPalette switches AND mirrors in one write", async () => {
  const { mod, data, writes } = await withSync({ palettes: [{ id: "p1", name: "One", swatches: SW_A }], activePaletteId: "p1" });
  const { id } = await mod.createPalette("Fresh");
  const last = writes.at(-1);
  assert.equal(data.activePaletteId, id);
  assert.deepEqual(data.palette, last?.[`pal:${id}`]?.swatches,
    "the mirror equals the new entry's starter colors, same write");
});

test("createPalette seeds from the swatches it is given, in one write (import)", async () => {
  // Import is create + seed + switch as a SINGLE write (bd
  // workspace-custom-palette-m5g). A create-then-save pair would leave the
  // starter color visible in between and give a failed second write a palette
  // holding colors nobody asked for.
  const { mod, data, writes } = await withSync({ palettes: [{ id: "p1", name: "One", swatches: SW_A }], activePaletteId: "p1" });
  const imported = [{ name: "Poppy", hex: "#FE5917", order: 0 }, { name: "Grass", hex: "#385834", order: 1 }];
  const { id } = await mod.createPalette("Imported", imported);
  const last = writes.at(-1);
  assert.deepEqual(last?.[`pal:${id}`]?.swatches.map((/** @type {any} */ s) => s.hex), ["#FE5917", "#385834"],
    "the seeded colors ARE the new palette, with no starter step");
  assert.equal(data.activePaletteId, id, "and it is the one now in effect");
  assert.deepEqual(data.palette, last?.[`pal:${id}`]?.swatches, "mirror moves with the pointer, same write");
  assert.deepEqual(data["pal:p1"].swatches, SW_A, "the palette that was active is untouched");
});

test("createPalette normalizes and caps what it is seeded with", async () => {
  const { mod, writes } = await withSync({ palettes: [{ id: "p1", name: "One", swatches: SW_A }], activePaletteId: "p1" });
  const junk = [
    { name: "Good", hex: "#123456", order: 0 },
    { name: "Bad", hex: "notacolor", order: 1 },
    ...Array.from({ length: 30 }, (_v, i) => ({ name: `N${i}`, hex: "#00FF00", order: i + 2 })),
  ];
  const { id } = await mod.createPalette("Imported", junk);
  const stored = writes.at(-1)?.[`pal:${id}`]?.swatches;
  assert.equal(stored.length, 24, "capped at MAX_SWATCHES");
  assert.equal(stored.some((/** @type {any} */ sw) => sw.hex === "notacolor"), false, "invalid entries dropped");
});

test("createPalette with an empty seed still gets the starter color", async () => {
  const { mod, writes } = await withSync({ palettes: [{ id: "p1", name: "One", swatches: SW_A }], activePaletteId: "p1" });
  const { id } = await mod.createPalette("Fresh", []);
  const stored = writes.at(-1)?.[`pal:${id}`]?.swatches;
  assert.equal(stored.length, 1, "an empty palette blanks the Brand row, which reads as breakage");
});

test("mirror invariant: deleting the ACTIVE palette mirrors the first survivor", async () => {
  const { mod, data } = await withSync({ palettes: TWO, activePaletteId: "p2", palette: SW_B });
  await mod.deletePalette("p2");
  assert.equal(data.activePaletteId, "p1");
  assert.deepEqual(data.palette, SW_A,
    "open tabs follow the pointer to One, not to the deleted palette");
});

test("mirror invariant: the enforcement push empties the mirror as it moves the pointer", async () => {
  const { mod, data, writes } = await withSync({
    palettes: [{ id: "personal", name: "Mine", swatches: SW_A }],
    activePaletteId: "personal",
    palette: SW_A,
  });
  await mod.applyEnforcementPush({ locked: true, managed: SW_B });
  assert.equal(data.activePaletteId, "org");
  assert.deepEqual(data.palette, []);
  const last = writes.at(-1);
  assert.ok(last && "activePaletteId" in last && "palette" in last,
    "push writes pointer and mirror atomically");
});

test("mirror invariant: a legacy migration seeds the mirror with the migrated colors", async () => {
  const { mod, data } = await withSync({ palette: SW_A });
  await mod.migratePaletteStorage();
  assert.equal(data.activePaletteId, "personal");
  assert.deepEqual(data.palette, SW_A,
    "an open tab on a just-migrated machine hears the collection, not silence");
});

test("mirror invariant: a pointer-only repair does NOT blank the mirror", async () => {
  // The repair case carries no collection in its plan - the entries are already
  // stored under their own keys. Mirroring from the plan's absent collection
  // wrote an empty palette over an active entry's colors: the stale-picker bug
  // in reverse, this time erasing instead of freezing.
  const { mod, data } = await withSync({
    palettes: [
      { id: "p1", name: "One", swatches: SW_A },
      { id: "p2", name: "Two", swatches: SW_B },
    ],
    activePaletteId: "gone",
    palette: SW_B,
  });
  await mod.migratePaletteStorage();
  assert.equal(data.activePaletteId, "p1", "the dangling pointer is repaired to the first entry");
  assert.deepEqual(data.palette, SW_A, "and the mirror names THAT entry, not empty");
});


// --- kyy: applyOrgDefaultPush, the writer side -----------------------------

const PACKAGED = [
  { name: "Cloud", hex: "#F9F4EB", order: 0 },
  { name: "Poppy", hex: "#FE5917", order: 1 },
];
const ORG_SW = [{ name: "Org Blue", hex: "#1A73E8", order: 0 }];

test("applyOrgDefaultPush: a never-customized palette is moved onto the org's, mirror and all", async () => {
  // The field case exactly: a stored "Default" identical to the packaged
  // colors, active, shadowing a freshly published org palette.
  const { mod, data, writes } = await withSync({
    palettes: [{ id: "d1", name: "Default", swatches: PACKAGED }],
    activePaletteId: "d1",
    palette: PACKAGED,
  });
  assert.equal(await mod.applyOrgDefaultPush({ locked: false, managed: ORG_SW }, PACKAGED), true);
  assert.equal(data.activePaletteId, "org", "the pointer now names the organization's palette");
  assert.deepEqual(data.palette, [], "and the mirror empties, so open tabs fall through to the managed tier");
  assert.equal(data.orgDefaultPushed, true);
  const last = writes.at(-1);
  assert.ok(last && "activePaletteId" in last && "palette" in last,
    "pointer and mirror move in ONE write, or a failure between them is the stale-picker bug again");
  assert.deepEqual(data["pal:d1"].swatches, PACKAGED, "their palette is not deleted, just no longer active");
});

test("applyOrgDefaultPush: a customized palette keeps the pointer, and the episode is still consumed", async () => {
  const mine = [{ name: "Mine", hex: "#ABCDEF", order: 0 }];
  const { mod, data } = await withSync({
    palettes: [{ id: "d1", name: "Default", swatches: mine }],
    activePaletteId: "d1",
    palette: mine,
  });
  assert.equal(await mod.applyOrgDefaultPush({ locked: false, managed: ORG_SW }, PACKAGED), true);
  assert.equal(data.activePaletteId, "d1", "nothing they typed is displaced");
  assert.deepEqual(data.palette, mine, "and the mirror still carries their colors");
  assert.equal(data.orgDefaultPushed, true, "but the episode is decided, so it will not re-ask");
});

test("applyOrgDefaultPush: does nothing at all while the policy is locked", async () => {
  const { mod, data } = await withSync({
    palettes: [{ id: "d1", name: "Default", swatches: PACKAGED }],
    activePaletteId: "d1",
  });
  assert.equal(await mod.applyOrgDefaultPush({ locked: true, managed: ORG_SW }, PACKAGED), false);
  assert.equal(data.activePaletteId, "d1");
  assert.equal("orgDefaultPushed" in data, false, "the episode is left undecided for when the lock lifts");
});

test("applyOrgDefaultPush: a second call is a no-op, so a user who switches back stays put", async () => {
  const { mod, data } = await withSync({
    palettes: [{ id: "d1", name: "Default", swatches: PACKAGED }],
    activePaletteId: "d1",
  });
  await mod.applyOrgDefaultPush({ locked: false, managed: ORG_SW }, PACKAGED);
  assert.equal(data.activePaletteId, "org");
  // The user deliberately goes back to their own.
  await mod.setActivePalette("d1");
  assert.equal(await mod.applyOrgDefaultPush({ locked: false, managed: ORG_SW }, PACKAGED), false,
    "the push must not re-fire, or their choice could never stick");
  assert.equal(data.activePaletteId, "d1");
});


// --- The Multiple palettes opt-in now defaults ON (owner, 2026-08-24) -------

test("getMultiPalette: absent means ON, and only an explicit false turns it off", async () => {
  // Absent = "never expressed a preference", which now reads as on. That is
  // what makes the default flip safe with no migration: someone who
  // deliberately opted out has a stored false and keeps it, while everyone
  // else gains a control they can still turn off.
  const fresh = await withSync({});
  assert.equal(await fresh.mod.getMultiPalette(), true, "a fresh install");
  const optedOut = await withSync({ multiPalette: false });
  assert.equal(await optedOut.mod.getMultiPalette(), false, "an explicit opt-out survives the flip");
  const optedIn = await withSync({ multiPalette: true });
  assert.equal(await optedIn.mod.getMultiPalette(), true);
});

test("an org push suppresses the user's palette from view without touching it", async () => {
  // The owner's constraint, 2026-08-24: "I don't want to delete anyone's
  // work." A palette that loses the pointer to an org push, and one hidden by
  // opting out, must both still be in storage byte for byte.
  const mine = [{ name: "Mine", hex: "#ABCDEF", order: 0 }];
  const { mod, data } = await withSync({
    palettes: [{ id: "d1", name: "Default", swatches: mine }],
    activePaletteId: "d1",
    multiPalette: false,
  });
  await mod.applyOrgDefaultPush({ locked: false, managed: [{ name: "Org", hex: "#1A73E8" }] }, []);
  assert.deepEqual(data["pal:d1"], { name: "Default", swatches: mine },
    "still stored, name and colors intact");
  assert.deepEqual(data.paletteOrder, ["d1"], "still in the collection");
  // And turning the opt-in back on is all it takes to see it again.
  await mod.setMultiPalette(true);
  const state = await mod.getPaletteState();
  assert.equal(state.palettes.find((/** @type {any} */ p) => p.id === "d1")?.name, "Default");
});


test("setUserPalette: a palette CREATED by a save is not called Default", async () => {
  // Field, 2026-08-25 (D4/F1). Saving an edit to the org palette detaches a
  // copy. Naming that copy "Default" claimed it was the extension's default
  // palette while it held the ORGANIZATION's colors - the tester reported "a
  // Default that didn't even have the actual Default palette".
  const orgish = [{ name: "Org Blue", hex: "#00AA11", order: 0 }, { name: "Org Green", hex: "#34A853", order: 1 }];
  const { mod, data } = await withSync({});
  await mod.setUserPalette(orgish);
  const key = /** @type {string} */ (Object.keys(data).find((k) => k.startsWith("pal:")));
  assert.equal(data[key].name, "My colors");
  assert.deepEqual(data[key].swatches.map((/** @type {any} */ s) => s.hex), ["#00AA11", "#34A853"]);
});

test("setUserPalette: an EXISTING palette keeps its own name when saved into", async () => {
  // The rename above must not leak into ordinary edits: only creation names.
  const { mod, data } = await withSync({
    palettes: [{ id: "p1", name: "Client work", swatches: SW_A }],
    activePaletteId: "p1",
  });
  await mod.setUserPalette([{ name: "New", hex: "#123456", order: 0 }]);
  assert.equal(data["pal:p1"].name, "Client work");
});

test("the migration and the materialized default are still called Default", async () => {
  // Those two genuinely ARE the default palette; only the save path was lying.
  const { mod, data } = await withSync({});
  await mod.ensureDefaultPersonalPalette([{ name: "Cloud", hex: "#F9F4EB", order: 0 }]);
  const key = /** @type {string} */ (Object.keys(data).find((k) => k.startsWith("pal:")));
  assert.equal(data[key].name, "Default");
});

// --- 3ij: the live-update channel must outlive the legacy mirror -----------
// onSettingsChanged used to watch ONLY the `palette` mirror. Every writer
// rewrites the mirror today, so the channel works by coincidence of the write
// paths, and the pointer-only half of that coincidence already broke once in
// the field (agi). These pin the channel to the collection itself, so retiring
// the mirror cannot silently stop open tabs from refreshing.

const tick = () => new Promise((r) => setTimeout(r, 0));

test("onSettingsChanged: a collection write WITHOUT the mirror delivers the resolved active swatches", async () => {
  const { mod, data, emitChange } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
  });
  /** @type {any[]} */
  const seen = [];
  mod.onSettingsChanged((/** @type {any} */ c) => seen.push(c));
  // A second palette lands and becomes active, the way a build with no mirror
  // would write it: the item, the order, the pointer - and no `palette` key.
  data["pal:p2"] = { name: "Two", swatches: SW_B };
  data.paletteOrder = ["p1", "p2"];
  data.activePaletteId = "p2";
  emitChange({
    "pal:p2": { newValue: data["pal:p2"] },
    paletteOrder: { newValue: data.paletteOrder },
    activePaletteId: { oldValue: "p1", newValue: "p2" },
  });
  await tick();
  assert.equal(seen.length, 1, "exactly one delivery for one write");
  assert.deepEqual(seen[0].palette, SW_B, "the consumer gets the user tier's swatches, not a raw key value");
  assert.equal(seen[0].activePaletteId, "p2");
});

test("onSettingsChanged: a switch that moves ONLY the pointer resolves the newly active palette", async () => {
  // Watching the items alone is not enough: the switcher touches nothing but
  // activePaletteId, and every palette item stays exactly as it was.
  const { mod, data, emitChange } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }, { id: "p2", name: "Two", swatches: SW_B }],
    activePaletteId: "p1",
  });
  /** @type {any[]} */
  const seen = [];
  mod.onSettingsChanged((/** @type {any} */ c) => seen.push(c));
  data.activePaletteId = "p2";
  emitChange({ activePaletteId: { oldValue: "p1", newValue: "p2" } });
  await tick();
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].palette, SW_B);

  // And back onto the organization's palette: the user tier is EMPTY, the same
  // answer the mirror gives (mirrorForActivePalette), so consumers see one shape.
  data.activePaletteId = "org";
  emitChange({ activePaletteId: { oldValue: "p2", newValue: "org" } });
  await tick();
  assert.equal(seen.length, 2);
  assert.deepEqual(seen[1].palette, []);
  assert.equal(seen[1].activePaletteId, "org");
});

test("onSettingsChanged: deliveries stay in write order when a resolve is in flight", async () => {
  // A collection-only change needs a read before it can be delivered; a
  // mirrored change that lands right behind it needs none. Without
  // serialization the second would overtake the first and the tab would end
  // on the OLDER palette.
  const { mod, data, emitChange } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }, { id: "p2", name: "Two", swatches: SW_B }],
    activePaletteId: "p1",
  });
  /** @type {any[]} */
  const seen = [];
  mod.onSettingsChanged((/** @type {any} */ c) => seen.push(c.palette));
  data.activePaletteId = "p2";
  emitChange({ activePaletteId: { oldValue: "p1", newValue: "p2" } });           // resolves async -> SW_B
  emitChange({ palette: { newValue: SW_A }, activePaletteId: { newValue: "p1" } }); // carries its value -> SW_A
  await tick();
  assert.deepEqual(seen, [SW_B, SW_A]);
});

test("onSettingsChanged: today's mirrored write is delivered once, with the mirror's value", async () => {
  // The write path every writer uses now. One set() carrying items + pointer +
  // mirror must produce ONE callback, not a mirrored one plus a resolved one.
  const { mod, emitChange: _unused } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }, { id: "p2", name: "Two", swatches: SW_B }],
    activePaletteId: "p1",
  });
  /** @type {any[]} */
  const seen = [];
  mod.onSettingsChanged((/** @type {any} */ c) => seen.push(c));
  await mod.setActivePalette("p2");
  await tick();
  await tick();
  assert.equal(seen.length, 1);
  assert.deepEqual(seen[0].palette, SW_B);
  assert.equal(seen[0].activePaletteId, "p2");
});

test("onSettingsChanged: an unrelated write does not fire", async () => {
  const { mod, emitChange } = await withSync({
    palettes: [{ id: "p1", name: "One", swatches: SW_A }],
    activePaletteId: "p1",
  });
  /** @type {any[]} */
  const seen = [];
  mod.onSettingsChanged((/** @type {any} */ c) => seen.push(c));
  emitChange({ introSeen: { newValue: true } });
  await tick();
  assert.deepEqual(seen, []);
});

/**
 * Install a fake `chrome.storage.sync` and import a fresh copy of storage.js.
 * `throwOnSet` makes the palette migration's write fail the way a real quota
 * error or transient storage fault would.
 * @param {Record<string, unknown>} initial
 * @param {{ throwOnSet?: boolean }} [opts]
 */
async function withSyncStore(initial, { throwOnSet = false } = {}) {
  const store = { ...initial };
  /** @type {string[]} */
  const setCalls = [];
  globalThis.chrome = /** @type {any} */ ({
    storage: {
      sync: {
        async get(/** @type {any} */ keys) {
          if (keys == null) return { ...store };
          const list = Array.isArray(keys) ? keys : [keys];
          /** @type {Record<string, unknown>} */
          const out = {};
          for (const k of list) if (k in store) out[k] = store[k];
          return out;
        },
        async set(/** @type {any} */ items) {
          setCalls.push(Object.keys(items).join(","));
          // Only the palette migration's write should be able to fail here; the
          // enabled repair writes exactly {enabled: true} and must still land.
          if (throwOnSet && !("enabled" in items)) throw new Error("QUOTA_BYTES quota exceeded");
          Object.assign(store, items);
        },
        async remove(/** @type {any} */ keys) {
          for (const k of Array.isArray(keys) ? keys : [keys]) delete store[k];
        },
      },
    },
  });
  const mod = await import(`../storage.js?case=${Math.random().toString(36).slice(2)}`);
  return { mod, store, setCalls };
}

test("runStartupMigrations: the enabled repair survives a THROWING palette migration", async () => {
  // bd workspace-custom-palette-7se. These two migrations used to share one try
  // block in the service worker, with the enabled repair second — so any
  // failure in the palette migration silently skipped it, on every install and
  // every startup.
  //
  // Why that is worse than a normal swallowed error: retireEnabledToggle is the
  // ONLY thing that can rescue a profile stored as `enabled: false`. The toggle
  // was retired from the UI in 0.2.0 and the content script still honours the
  // key, so such a profile injects nothing, banners nothing (an empty palette
  // is not a failed injection), and has no control anywhere to turn it back on
  // — while looking perfectly healthy in chrome://extensions.
  const legacy = { name: "Old", swatches: [{ name: "Poppy", hex: "#FE5917", order: 0 }] };
  const { mod, store } = await withSyncStore(
    { enabled: false, palette: legacy.swatches },
    { throwOnSet: true },
  );

  const result = await mod.runStartupMigrations();

  assert.equal(store.enabled, true, "the stranded profile did NOT get its colors back");
  assert.equal(result.enabledRepaired, true, "the repair must report that it ran");
  assert.equal(result.palettesMigrated, false, "the failing migration reports failure rather than throwing");
});

test("runStartupMigrations: never rejects, whichever half fails", async () => {
  // It is called un-awaited from onInstalled/onStartup, so a rejection would
  // surface as an unhandled promise rejection in the worker rather than as a
  // caught, ignorable migration failure.
  const { mod } = await withSyncStore({ enabled: false }, { throwOnSet: true });
  await assert.doesNotReject(() => mod.runStartupMigrations());

  // And with storage entirely unavailable — both halves throw.
  globalThis.chrome = /** @type {any} */ ({ storage: { sync: {
    get: async () => { throw new Error("storage unavailable"); },
    set: async () => { throw new Error("storage unavailable"); },
    remove: async () => {},
  } } });
  const broken = await import(`../storage.js?case=${Math.random().toString(36).slice(2)}`);
  assert.deepEqual(
    await broken.runStartupMigrations(),
    { enabledRepaired: false, palettesMigrated: false },
    "a total storage failure is reported, not thrown",
  );
});

test("runStartupMigrations: repairs enabled BEFORE touching palettes", async () => {
  // Order matters for the same reason the isolation does: the enabled repair is
  // the cheaper write and the one a stranded user is waiting on, so it must not
  // sit behind a migration that can be slow or fail.
  const { mod, setCalls } = await withSyncStore({ enabled: false, palette: [{ name: "P", hex: "#FE5917", order: 0 }] });
  await mod.runStartupMigrations();
  assert.ok(setCalls.length >= 1, "nothing was written at all");
  assert.equal(setCalls[0], "enabled", `the enabled repair was not the first write (got ${setCalls[0]})`);
});
