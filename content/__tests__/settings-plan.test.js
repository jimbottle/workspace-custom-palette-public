/**
 * What a settings change requires of the Brand row — bd notes 2026-09-01.
 *
 * WHY THIS FILE EXISTS. Every link between "the user edits a hex in the popup"
 * and "the open picker shows the new colour" had a test EXCEPT the assembly:
 * `setUserPalette` writes the mirror, `onSettingsChanged` delivers the change,
 * `refreshBrandRows` re-renders a cached menu — but the handler deciding which
 * of those to run lived inline inside bootstrap's `main()`, where nothing could
 * import it. That is precisely where a silent no-refresh bug would live, and it
 * is the gap that made a false alarm expensive to rule out by hand.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { planSettingsChange } from "../settings-plan.js";

test("a palette edit re-reads the user tier, which refreshes the rows itself", () => {
  // The reported-symptom case: the popup writes a changed hex, and the open
  // picker must pick it up with no page reload.
  const plan = planSettingsChange({ palette: [{ name: "Poppy", hex: "#00FF00", order: 0 }] });
  assert.equal(plan.rereadUserTier, true, "a palette change must re-resolve from storage");
  assert.equal(plan.enabled, null, "no enabled flag in this change");
  assert.equal(plan.refreshRowsNow, false, "the re-read refreshes; refreshing here too is a double rebuild");
});

test("a switch that moves ONLY the pointer still re-reads", () => {
  // Switching palettes writes activePaletteId without necessarily writing the
  // mirror, so watching the swatches alone would miss it entirely.
  const plan = planSettingsChange({ activePaletteId: "pal-2" });
  assert.equal(plan.rereadUserTier, true);
});

test("an enabled flip refreshes NOW, because nothing else will", () => {
  // `enabled` changes what getPalette() returns but triggers no re-read, so if
  // this did not refresh synchronously, turning the colours off would do
  // nothing until the next picker mounted.
  const off = planSettingsChange({ enabled: false });
  assert.equal(off.enabled, false);
  assert.equal(off.refreshRowsNow, true);
  assert.equal(off.rereadUserTier, false);

  const on = planSettingsChange({ enabled: true });
  assert.equal(on.enabled, true);
  assert.equal(on.refreshRowsNow, true);
});

test("palette AND enabled together: re-read, and still refresh now", () => {
  // Both effects are wanted. The re-read brings the new colours; the immediate
  // refresh means switching OFF is instant rather than waiting on a storage
  // round trip. The two-branch form this replaced computed exactly this and
  // read as though it did something subtler.
  const plan = planSettingsChange({ palette: [], enabled: false });
  assert.deepEqual(plan, { rereadUserTier: true, enabled: false, refreshRowsNow: true });
});

test("a theme write touches nothing: no re-read, no rebuild", () => {
  // Theme reaches the extension's own pages, never the injected row. A
  // teardown/rebuild here would be pure waste on every theme toggle.
  assert.deepEqual(
    planSettingsChange({ theme: "dark" }),
    { rereadUserTier: false, enabled: null, refreshRowsNow: false },
  );
});

test("an empty, null or undefined change is inert rather than throwing", () => {
  // onSettingsChanged only delivers when something matched, but this runs in a
  // content script on a third-party page: it must not throw on a shape it did
  // not expect.
  const inert = { rereadUserTier: false, enabled: null, refreshRowsNow: false };
  assert.deepEqual(planSettingsChange({}), inert);
  assert.deepEqual(planSettingsChange(null), inert);
  assert.deepEqual(planSettingsChange(undefined), inert);
});

test("a CLEARED palette is still a palette change", () => {
  // `palette: undefined` is what a clear delivers. `in` is the right test and
  // a truthiness check would be the bug: clearing an override must re-resolve
  // down to the org or packaged tier, not be ignored.
  const plan = planSettingsChange({ palette: undefined });
  assert.equal(plan.rereadUserTier, true, "a cleared palette must still re-resolve");
});

test("enabled is read as a BOOLEAN, not for truthiness", () => {
  // `false` is the value that matters most and is the one a truthy check drops.
  assert.equal(planSettingsChange({ enabled: false }).enabled, false);
  // A non-boolean is not an enabled change at all.
  assert.equal(planSettingsChange(/** @type {any} */ ({ enabled: "yes" })).enabled, null);
  assert.equal(planSettingsChange(/** @type {any} */ ({ enabled: "yes" })).refreshRowsNow, false);
});
