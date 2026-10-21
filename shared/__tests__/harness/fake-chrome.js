/**
 * A controllable fake of the `chrome.*` surface the popup and options pages
 * touch. Test-only: never packaged (dev/package.sh excludes `__tests__`).
 *
 * The point of this file is the WRITE GATE. Every bug this harness exists to
 * catch (reviews 3762-3766) is a two-actor interleaving: a storage write that
 * is still in flight while a second actor — a user click, a late policy answer
 * — reads or plans against state the write is about to change. Nothing in the
 * repo could express "hold this write open, do something else, then let it
 * land", so those bugs were only ever found by review. `area.hold()` is that
 * missing control: it parks the NEXT write to an area until the test releases
 * or fails it.
 *
 * The managed area gets its own modes for the same reason: "slow" and "absent"
 * are different answers that the production code must not confuse, so the fake
 * has to be able to produce a read that genuinely never settles.
 */

/**
 * Deep-copy through JSON, preserving `undefined` (which JSON cannot carry).
 * @param {any} value
 * @returns {any}
 */
function clone(value) {
  return value === undefined ? undefined : JSON.parse(JSON.stringify(value));
}

/**
 * Normalize chrome.storage's key argument (string | string[] | null).
 * @param {string | string[] | null | undefined} keys
 * @param {string[]} all
 * @returns {string[]}
 */
function keyList(keys, all) {
  if (keys === null || keys === undefined) return all;
  return Array.isArray(keys) ? keys : [keys];
}

/** @typedef {Record<string, {oldValue?: unknown, newValue?: unknown}>} StorageChanges */
/** @typedef {{ promise: Promise<void>, release: () => void, fail: (e?: Error) => void }} WriteGate */

/**
 * One storage area (sync / local / session) backed by a plain object.
 * @param {string} areaName
 * @param {Record<string, unknown>} initial
 * @param {(changes: StorageChanges, area: string) => void} emit
 */
function createArea(areaName, initial, emit) {
  /** @type {Record<string, unknown>} */
  const data = clone(initial) ?? {};
  /** @type {WriteGate[]} */
  const gates = [];

  /** Park here if the test has queued a gate for this area. */
  async function passGate() {
    const gate = gates.shift();
    if (gate) await gate.promise;
  }

  return {
    /** @param {string | string[] | null} [keys] @returns {Promise<Record<string, any>>} */
    async get(keys) {
      /** @type {Record<string, any>} */
      const out = {};
      for (const k of keyList(keys, Object.keys(data))) {
        if (k in data) out[k] = clone(data[k]);
      }
      return out;
    },

    /** @param {Record<string, unknown>} items @returns {Promise<void>} */
    async set(items) {
      await passGate();
      /** @type {StorageChanges} */
      const changes = {};
      for (const [k, v] of Object.entries(items)) {
        changes[k] = { oldValue: clone(data[k]), newValue: clone(v) };
        data[k] = clone(v);
      }
      emit(changes, areaName);
    },

    /** @param {string | string[]} keys @returns {Promise<void>} */
    async remove(keys) {
      await passGate();
      /** @type {StorageChanges} */
      const changes = {};
      for (const k of keyList(keys, [])) {
        if (!(k in data)) continue;
        changes[k] = { oldValue: clone(data[k]), newValue: undefined };
        delete data[k];
      }
      if (Object.keys(changes).length) emit(changes, areaName);
    },

    /**
     * Park the NEXT set()/remove() on this area until the returned handle is
     * released (write succeeds) or failed (write rejects). Queue several to
     * park several writes in order.
     * @returns {WriteGate}
     */
    hold() {
      /** @type {() => void} */
      let release = () => {};
      /** @type {(e?: Error) => void} */
      let fail = () => {};
      /** @type {Promise<void>} */
      const promise = new Promise((resolve, reject) => {
        release = () => resolve();
        fail = (e) => reject(e ?? new Error("storage write failed"));
      });
      // A gate that is failed but never awaited (the code under test bailed out
      // earlier) must not crash the process as an unhandled rejection.
      promise.catch(() => {});
      const gate = { promise, release, fail };
      gates.push(gate);
      return gate;
    },

    /** Everything currently stored, for assertions. */
    snapshot: () => clone(data),
  };
}

/**
 * The read-only managed (enterprise policy) area.
 *
 * `mode` is the axis the production code must never collapse:
 *  - "value"  a policy exists and answers immediately
 *  - "absent" no policy — answers immediately with {}
 *  - "late"   a policy exists but answers after `delayMs` (past the render
 *             deadline, so the caller sees timedOut and must re-seed)
 *  - "never"  the read never settles at all
 *  - "throw"  the area is unavailable on this platform
 * `palettes` publishes the multi-palette policy shape; `value` publishes the
 * legacy single one. Both exist here because both exist in the field, and a
 * harness that could only express one would leave the other untested.
 * @param {{ mode?: string, value?: unknown, locked?: boolean, palettes?: unknown, delayMs?: number }} spec
 * @param {(changes: StorageChanges, area: string) => void} emit
 */
function createManagedArea(spec, emit) {
  const { value, locked, palettes, delayMs = 2000 } = spec;
  // Mutable: setPolicy promotes an "absent" (or "late") area to a readable
  // one, so a policy can genuinely APPEAR mid-session. Without that, an
  // "absent" area kept answering {} after setPolicy and any test of that
  // scenario passed no matter what the code did.
  let mode = spec.mode ?? "absent";
  // The whole policy this fake represents. `locked` is only included when the
  // test sets it, so an unset lock is genuinely absent rather than an explicit
  // false — that difference is what the production `managedFlag` coerces, and
  // baking a false in here would stop the test exercising it.
  /** @type {Record<string, any>} */
  const policy = { palette: clone(value) };
  if (locked !== undefined) policy.paletteLocked = clone(locked);
  if (palettes !== undefined) policy.palettes = clone(palettes);

  return {
    /**
     * Mirrors chrome.storage.managed.get: a single key or an array of them,
     * returning only the keys that exist. The production read asks for both
     * policy keys at once, so an array is the normal case here.
     * @param {string | string[]} keys @returns {Promise<Record<string, any>>}
     */
    get(keys) {
      if (mode === "never") return new Promise(() => {});
      if (mode === "throw") return Promise.reject(new Error("managed storage unavailable"));
      if (mode === "absent") return Promise.resolve({});
      const wanted = Array.isArray(keys) ? keys : [keys];
      /** @type {Record<string, any>} */
      const payload = {};
      for (const k of wanted) if (k in policy) payload[k] = clone(policy[k]);
      if (mode === "late") {
        return new Promise((resolve) => {
          const t = setTimeout(() => resolve(payload), delayMs);
          // Never hold the process open for a policy answer nobody awaits.
          t.unref?.();
        });
      }
      return Promise.resolve(payload);
    },

    /**
     * Simulate an admin editing the policy while a page is open — the live path
     * behind docs/DEPLOY.md's "it applies live" claim. Rewrites the policy and
     * fires the managed-area change, exactly as Chrome does.
     * @param {{ value?: unknown, locked?: boolean, palettes?: unknown }} next
     */
    setPolicy(next) {
      // Apply FIRST, decide the mode from the result. Deciding it from the
      // pre-update policy got one transition wrong, and it was the transition
      // the `palettes` key exists to express: an admin migrating off the legacy
      // key with `{ value: undefined, palettes: MULTI }`. The clear was seen,
      // the publish was not yet, so the area flipped to "absent" and then
      // stored the collection anyway — emitting a change carrying a policy that
      // `get()` would deny forever. A test of that migration would have looked
      // like a production bug in getManagedPolicy rather than a harness defect.
      /** @type {Record<string, {oldValue?: unknown, newValue?: unknown}>} */
      const changes = {};
      if ("value" in next) {
        changes.palette = { oldValue: clone(policy.palette), newValue: clone(next.value) };
        policy.palette = clone(next.value);
      }
      if ("palettes" in next) {
        changes.palettes = { oldValue: clone(policy.palettes), newValue: clone(next.palettes) };
        policy.palettes = clone(next.palettes);
      }
      if ("locked" in next) {
        changes.paletteLocked = { oldValue: clone(policy.paletteLocked), newValue: clone(next.locked) };
        policy.paletteLocked = clone(next.locked);
      }
      // Removing the policy is a real admin action (docs/DEPLOY.md tells them
      // to delete the plist after a trial), so a cleared policy has to read as
      // "gone" rather than "unchanged" — otherwise no test could reach it.
      // Gone means NEITHER palette shape is published any more.
      mode = policy.palette === undefined && policy.palettes === undefined ? "absent" : "value";
      if (Object.keys(changes).length) emit(changes, "managed");
    },
  };
}

/**
 * Build the fake. Pass initial contents per area and a managed spec.
 * @param {{
 *   sync?: Record<string, unknown>,
 *   local?: Record<string, unknown>,
 *   session?: Record<string, unknown>,
 *   managed?: { mode?: string, value?: unknown, locked?: boolean, palettes?: unknown, delayMs?: number },
 *   getURL?: (path: string) => string,
 *   version?: string,
 * }} [opts]
 */
export function createFakeChrome(opts = {}) {
  /** @type {((changes: StorageChanges, area: string) => void)[]} */
  const listeners = [];
  /** @param {StorageChanges} changes @param {string} area */
  const emit = (changes, area) => {
    // Copy first: a listener that unsubscribes mid-emit must not reindex the
    // array we are iterating.
    for (const fn of [...listeners]) fn(changes, area);
  };

  const sync = createArea("sync", opts.sync ?? {}, emit);
  const local = createArea("local", opts.local ?? {}, emit);
  const session = createArea("session", opts.session ?? {}, emit);
  const managed = createManagedArea(opts.managed ?? { mode: "absent" }, emit);

  /**
   * Calls the test may assert on.
   * @type {{ tabsCreated: any[], optionsOpened: number, badgeText: (string | undefined)[] }}
   */
  const calls = { tabsCreated: [], optionsOpened: 0, badgeText: [] };

  const chrome = {
    storage: {
      sync,
      local,
      session,
      managed,
      onChanged: {
        /** @param {(changes: StorageChanges, area: string) => void} fn */
        addListener: (fn) => { listeners.push(fn); },
        /** @param {(changes: StorageChanges, area: string) => void} fn */
        removeListener: (fn) => {
          const i = listeners.indexOf(fn);
          if (i >= 0) listeners.splice(i, 1);
        },
      },
    },
    runtime: {
      getURL: opts.getURL ?? (/** @param {string} p */ (p) => `chrome-extension://test/${p}`),
      openOptionsPage: () => { calls.optionsOpened += 1; },
      // Deliberately NOT the real manifest version: a test that asserts this
      // string reached the page proves the page reads the manifest, where one
      // asserting the real version would also pass against a hard-coded string.
      getManifest: () => ({ version: opts.version ?? "9.9.9-test" }),
    },
    tabs: {
      /** @param {any} info */
      create: async (info) => { calls.tabsCreated.push(info); return { id: 1 }; },
    },
    action: {
      /** @param {{ text?: string }} [details] */
      setBadgeText: async (details) => { calls.badgeText.push(details?.text); },
    },
  };

  return { chrome, sync, local, session, managed, calls, listenerCount: () => listeners.length };
}
