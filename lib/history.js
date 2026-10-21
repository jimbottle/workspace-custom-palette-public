/**
 * Pure undo/redo history for the popup's auto-saved palette edits. No DOM, no
 * chrome.* — the popup persists this stack (chrome.storage.local) so recent
 * changes can be undone even after the popup is reopened. Snapshots are palette
 * arrays; the stack is bounded so it can't grow without limit.
 *
 * @typedef {{ name: string, hex: string, order: number }} Swatch
 * @typedef {{ undo: Swatch[][], redo: Swatch[][] }} History
 */

/** Max snapshots kept on the undo stack. */
export const MAX_HISTORY = 25;

/** @returns {History} */
export function emptyHistory() {
  return { undo: [], redo: [] };
}

/** Coerce arbitrary stored data into a valid History (defensive on read). */
export function normalizeHistory(/** @type {unknown} */ h) {
  const obj = /** @type {any} */ (h);
  return obj && Array.isArray(obj.undo) && Array.isArray(obj.redo) ? { undo: obj.undo, redo: obj.redo } : emptyHistory();
}

/** @param {History} history */
export function canUndo(history) {
  return (history?.undo?.length ?? 0) > 0;
}
/** @param {History} history */
export function canRedo(history) {
  return (history?.redo?.length ?? 0) > 0;
}

/**
 * Record a committed change: push `previous` onto the undo stack, clear redo
 * (a new edit invalidates the redo branch), and cap to `max`.
 * @param {History} history @param {Swatch[]} previous @param {number} [max]
 * @returns {History}
 */
export function record(history, previous, max = MAX_HISTORY) {
  const undo = [...(history?.undo ?? []), previous].slice(-max);
  return { undo, redo: [] };
}

/**
 * Undo: the last undo snapshot becomes the restored state; `current` moves onto
 * the redo stack. Returns the new history + restored palette, or null if there's
 * nothing to undo.
 * @param {History} history @param {Swatch[]} current
 * @returns {{ history: History, restored: Swatch[] } | null}
 */
export function undo(history, current) {
  const u = history?.undo ?? [];
  if (u.length === 0) return null;
  const restored = /** @type {Swatch[]} */ (u[u.length - 1]);
  return { history: { undo: u.slice(0, -1), redo: [...(history.redo ?? []), current] }, restored };
}

/**
 * Redo: the last redo snapshot becomes the restored state; `current` moves back
 * onto the undo stack. Returns the new history + restored palette, or null.
 * @param {History} history @param {Swatch[]} current
 * @returns {{ history: History, restored: Swatch[] } | null}
 */
export function redo(history, current) {
  const r = history?.redo ?? [];
  if (r.length === 0) return null;
  const restored = /** @type {Swatch[]} */ (r[r.length - 1]);
  return { history: { undo: [...(history.undo ?? []), current], redo: r.slice(0, -1) }, restored };
}
