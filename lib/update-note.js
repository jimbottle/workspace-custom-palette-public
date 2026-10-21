/**
 * update-note — pure decision layer for the one-time "what changed" notice
 * shown in the popup after an extension update. The service worker stores the
 * updated-to version on `onInstalled` (reason "update"); the popup maps that
 * version back to a message here. Versions without an entry show nothing, so
 * routine releases stay silent and only user-relevant fixes speak up.
 *
 * No DOM, no chrome.* — unit-tested in Node.
 */

/**
 * Version-keyed notice copy. Add an entry ONLY when an update fixes or changes
 * something a user may have personally hit; leave routine releases out.
 * @type {Record<string, string>}
 */
export const UPDATE_NOTES = {
  "0.1.6":
    "Google Docs support is restored. Brand colors were effectively missing in Docs and are now fully working: the row shows its \"Brand\" label again, and hovering any brand color shows that color's name.",
  // 0.1.7 carries the non-English apply fix. The code change was written during
  // the 0.1.6 cycle but landed after that zip was cut, so 0.1.7 is the first
  // build in which any user actually receives it — which is exactly why it
  // needs a notice rather than being treated as already-announced.
  // The ask for the editor language is not redundant with the bug form's
  // diagnostics: that footer reports navigator.language, which is the BROWSER
  // UI language. The language that actually breaks apply is the one Google
  // Docs/Sheets/Slides is set to, and the two differ often - this bug was
  // reported in English by a user whose Docs was Danish. "Report a bug" matches
  // the popup's own link label, since this renders as plain text and cannot
  // carry a link of its own.
  "0.1.7":
    "Brand colors now work in every language. If your Docs, Sheets, or Slides was set to a language other than English, clicking a brand color could leave your text or shape unchanged. That is fixed. If you still run into trouble, please use Report a bug below and tell us which language your Google editor is set to.",
  // 0.2.0 is the first entry here that announces a FEATURE rather than
  // reassuring someone about a bug they hit, so it is deliberately short: an
  // existing user opened this popup to pick a color, not to read a release
  // note. It names the two things that change what they see - the switcher
  // right above it, and colors that may start arriving from their admin - and
  // closes on the promise that matters most to someone whose colors are
  // suddenly not the only ones in the list.
  "0.2.0":
    "Two new things. You can keep several palettes and switch between them here. And if your workplace publishes brand colors, they now arrive automatically, without replacing colors you set up yourself.",
  // 0.2.1 answers a field report: the Data validation dropdown-chip picker in
  // Sheets is a different widget from the toolbar pickers, and brand colors
  // silently failed to apply there. Announced as the surface it unlocks rather
  // than the bug it fixes (owner's choice, 2026-09-01), and kept to two
  // sentences: the first says where, the second says how to find it, and
  // "right there" is the promise. The same release also stops Sheets showing a
  // false "couldn't be applied" banner on borders and conditional formatting;
  // deliberately not mentioned, since a user who never saw the banner gains
  // nothing from hearing about it.
  "0.2.1":
    "Brand colors now work in the Data validation color picker in Google Sheets. Set up a dropdown, click the color chip next to any option, and your brand colors are right there.",
};

/**
 * The notice to store at install time, or null to store nothing.
 * @param {string | undefined} reason  chrome.runtime.OnInstalledReason
 * @param {string} version  the version just updated TO (manifest version)
 * @returns {string | null} the version to store, or null when no notice applies
 */
export function versionToNote(reason, version) {
  if (reason !== "update") return null; // fresh installs get the intro, not this
  // Object.hasOwn: a bare [version] lookup would surface Object.prototype
  // members (e.g. "constructor") for pathological inputs.
  return typeof version === "string" && Object.hasOwn(UPDATE_NOTES, version) ? version : null;
}

/**
 * The message for a stored notice version, or null (unknown/junk versions show
 * nothing — the popup then clears the stale flag).
 * @param {unknown} storedVersion
 * @returns {string | null}
 */
export function noteMessage(storedVersion) {
  return typeof storedVersion === "string" && Object.hasOwn(UPDATE_NOTES, storedVersion)
    ? UPDATE_NOTES[storedVersion] ?? null
    : null;
}
