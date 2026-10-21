/**
 * Pure error-buffer logic for the feedback standard's background-error
 * surfacing: the service worker records its own runtime errors into an
 * `errorBuffer` in chrome.storage.session; the popup and options pages drain
 * it into a local notice with a "Report this" link on next open. No DOM, no
 * chrome.* — storage I/O lives in lib/storage.js, notice rendering in
 * shared/page-errors.js. Unit-tested in Node.
 *
 * Privacy: entries hold only an error message string and a timestamp — never
 * URLs, identifiers, or storage contents — and nothing is ever auto-sent; the
 * buffer only feeds the local notice.
 *
 * @typedef {{ message: string, at: number }} BufferedError
 */

/** Max entries kept — enough to say "several things went wrong," no more. */
export const MAX_BUFFERED_ERRORS = 5;

/** Max message length stored per entry, so a pathological error can't bloat storage. */
export const MAX_MESSAGE_LENGTH = 300;

/**
 * Coerce arbitrary stored data into a valid buffer (defensive on read).
 * Non-arrays and malformed entries are dropped, never thrown on.
 * @param {unknown} raw
 * @returns {BufferedError[]}
 */
export function normalizeErrorBuffer(raw) {
  if (!Array.isArray(raw)) return [];
  /** @type {BufferedError[]} */
  const out = [];
  for (const e of raw) {
    if (!e || typeof e !== "object") continue;
    const message = typeof (/** @type {any} */ (e).message) === "string" ? (/** @type {any} */ (e).message) : "";
    const at = Number((/** @type {any} */ (e).at));
    if (!message || !Number.isFinite(at)) continue;
    out.push({ message: message.slice(0, MAX_MESSAGE_LENGTH), at });
  }
  return out.slice(-MAX_BUFFERED_ERRORS);
}

/**
 * Append an error to the buffer. A repeat of the newest message updates its
 * timestamp instead of growing the buffer (a tight error loop in the worker
 * shouldn't scroll earlier, distinct errors out). Caps to the last `max`.
 * Pure — returns a new array.
 * @param {BufferedError[]} buffer
 * @param {{ message?: unknown, at: number }} entry
 * @param {number} [max]
 * @returns {BufferedError[]}
 */
export function appendError(buffer, entry, max = MAX_BUFFERED_ERRORS) {
  const message = String(entry.message ?? "Unknown error").slice(0, MAX_MESSAGE_LENGTH) || "Unknown error";
  const at = entry.at;
  const prior = Array.isArray(buffer) ? buffer : [];
  const last = prior[prior.length - 1];
  if (last && last.message === message) {
    return [...prior.slice(0, -1), { message, at }];
  }
  return [...prior, { message, at }].slice(-max);
}

/**
 * The user-facing one-liner for the drain notice. Counts only — the error text
 * itself is developer-facing noise the user can't act on (and per the standard,
 * everything that would be sent must be visible in the feedback preview; the
 * notice itself sends nothing).
 * @param {number} count
 * @returns {string}
 */
export function errorNoticeMessage(count) {
  return count === 1
    ? "The extension hit an error in the background."
    : `The extension hit ${count} errors in the background.`;
}
