/**
 * settings-plan — what a storage settings change requires of the Brand row.
 *
 * Pure on purpose. This decision used to live inline in bootstrap's
 * `onSettingsChanged` handler, inside `main()`, where nothing could import it —
 * so the link between "the user edited a hex" and "the open picker updates" was
 * the one step in that chain with no test. Every other link has one:
 * `setUserPalette` writes the mirror, `onSettingsChanged` delivers the change,
 * `refreshBrandRows` re-renders a cached menu. Only the assembly was unproven,
 * which is exactly where a silent no-refresh bug would live.
 *
 * The caller keeps the side effects (re-reading the user tier, assigning
 * `enabled`, refreshing rows); this only says which of them the change calls
 * for.
 */

/**
 * @typedef {{
 *   palette?: unknown, activePaletteId?: unknown,
 *   enabled?: boolean, theme?: "system" | "light" | "dark"
 * }} SettingsChange
 * @typedef {{
 *   rereadUserTier: boolean,
 *   enabled: boolean | null,
 *   refreshRowsNow: boolean
 * }} SettingsPlan
 */

/**
 * @param {SettingsChange | null | undefined} change  as delivered by onSettingsChanged
 * @returns {SettingsPlan}
 *   `rereadUserTier` — re-resolve the palette from storage, which refreshes the
 *     rows itself once its read lands.
 *   `enabled` — the new master flag, or null when this change did not carry one.
 *   `refreshRowsNow` — rebuild the rows synchronously, without waiting for a
 *     re-read.
 */
export function planSettingsChange(change) {
  const paletteChanged = !!change && ("palette" in change || "activePaletteId" in change);
  const enabledChanged = typeof change?.enabled === "boolean";
  return {
    rereadUserTier: paletteChanged,
    enabled: enabledChanged ? /** @type {boolean} */ (change?.enabled) : null,
    // An `enabled` flip changes what getPalette() returns but triggers no
    // re-read, so it has to refresh here or nothing would. A palette change
    // refreshes via the re-read instead — but when BOTH changed we still
    // refresh now, so turning the colours off is immediate rather than waiting
    // on a storage round trip. That makes this simply "did enabled change",
    // which the two-branch form it replaced obscured.
    refreshRowsNow: enabledChanged,
    // Deliberately absent: `theme`. It reaches the extension's own pages, never
    // the injected row, so a theme write must not trigger a teardown/rebuild —
    // needless work that widens the surface for apply bugs.
  };
}
