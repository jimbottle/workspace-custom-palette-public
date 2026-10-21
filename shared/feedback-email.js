/**
 * Pure compose layer for the feedback / bug-report flow. No DOM, no chrome.*.
 * Implements the Raylytics Chrome-extension feedback standard
 * (templates/feedback-and-bug-reports/chrome-extension.md). The DOM-wiring layer
 * (feedback/feedback.js) reads env values, calls these, and assigns the URLs to
 * anchor hrefs. Unit-tested in Node.
 *
 * Privacy: the only diagnostics are the version/browser/OS footer plus, for
 * bug reports, the browser UI language and the (optional, user-picked) app —
 * rendered below the footer per the feedback standard's "domain-specific
 * extras" clause. No email, tab URL, page content, identifiers, or
 * chrome.storage values — ever.
 *
 * @typedef {"bug" | "feature" | "feedback"} FeedbackType
 * @typedef {{ version: string, browser: string, browserVersion: string, os: string, language?: string }} Env
 */

/** Single source of truth — the Chrome Web Store listing name (CWS renames happen). */
export const PRODUCT = "Custom Color Palette for Google Workspace Docs, Sheets & Slides";

/** One inbox for everything; triage is by subject prefix, not address. */
export const INBOX = "dev@raylytics.io";

/** @type {Record<FeedbackType, string>} subject-prefix label per type */
export const TYPE_LABEL = { bug: "Bug", feature: "Feature", feedback: "Feedback" };

/**
 * Short, editable, type-specific intro. Seeded INTO the description textarea by
 * the DOM layer (feedback/feedback.js) so the user writes into the template —
 * NOT prepended to the body at compose time. The 0.1.4 field reports arrived as
 * this scaffold untouched with the real description dumped after it, because
 * the old buildBody prepended it no matter what the user wrote.
 */
export const INTRO = {
  // The editor-language line is not idle curiosity: every field bug so far has
  // been a locale bug (0.1.4 tooltips, 0.1.6 apply), and the ONLY language the
  // diagnostics footer can capture on its own is the BROWSER's. The 2026-08-16
  // reporter wrote in English with a Danish Docs UI, so the footer alone
  // pointed at the wrong locale and cost a release cycle to work out.
  bug: "Steps to reproduce:\n\nExpected:\n\nActual:\n\nLanguage your Google editor is set to:",
  feature: "What problem are you trying to solve?\n\nHow would you like it to work?",
  feedback: "What's on your mind?",
};

/**
 * The value the description textarea should hold after selecting `type`. Pure
 * decision behind the DOM layer's template seeding: seed the type's intro
 * template only into an empty box or over another type's UNTOUCHED template —
 * any edited/user text comes back unchanged, including text that merely
 * contains a template. This anti-clobber rule is the fix for the 0.1.4
 * field-report failure mode (untouched scaffold shipping above the real text),
 * so it lives here where Tier 1 can hold it still.
 * @param {string} current  the textarea's current value
 * @param {FeedbackType | string} type
 * @returns {string}
 */
export function seedValue(current, type) {
  const trimmed = current.trim();
  const templates = Object.values(INTRO).map((t) => t.trim());
  if (trimmed === "" || templates.includes(trimmed)) return INTRO[normalizeType(type)];
  return current;
}

/**
 * Coerce arbitrary input (e.g. a URL ?type= param) to a valid type. Defaults to
 * "feedback" unless explicitly "bug" or "feature".
 * @param {unknown} t
 * @returns {FeedbackType}
 */
export function normalizeType(t) {
  return t === "bug" || t === "feature" ? t : "feedback";
}

/**
 * @param {FeedbackType | string} type  normalized internally, so any input is safe
 * @param {string} [product]
 * @returns {string} e.g. "[Bug] Custom Color Palette for Google Workspace Docs, Sheets & Slides"
 */
export function buildSubject(type, product = PRODUCT) {
  return `[${TYPE_LABEL[normalizeType(type)]}] ${product}`;
}

/**
 * Bug-only extra diagnostic lines, rendered BELOW the footer (the feedback
 * standard's sanctioned spot for domain-specific extras). The 2026-08-15 field
 * reports proved the UI language is the variable we most often need
 * ("sort" = Danish black) and that "which app?" goes unstated in prose.
 *
 * Labelled "Browser language" deliberately. It comes from `navigator.language`,
 * which is the BROWSER's UI language, and that is NOT the language that breaks
 * the apply path — the Google editor's is. The two differ often: the 2026-08-16
 * reporter wrote in English with a Danish Docs UI, and a line labelled merely
 * "UI language" invited us to read the browser's value as the editor's and look
 * in the wrong place. The editor's language is asked for in the bug template
 * (INTRO.bug) because nothing here can observe it: this page is not a content
 * script and never touches docs.google.com.
 * @param {FeedbackType | string} type
 * @param {Env} env
 * @param {string[]} [apps]  user-picked app names, e.g. ["Docs", "Slides"]
 * @returns {string[]} one string per line; [] for non-bug types
 */
export function buildExtras(type, env, apps = []) {
  if (normalizeType(type) !== "bug") return [];
  const lines = [];
  if (env.language) lines.push(`Browser language: ${env.language}`);
  if (apps.length > 0) lines.push(`App: ${apps.join(", ")}`);
  return lines;
}

/**
 * The user's description (which the DOM layer seeds with the editable intro
 * template), then the always-present `---` separator + the single-line
 * diagnostics footer, then any extra lines (bug-only; see buildExtras).
 * @param {FeedbackType} type
 * @param {Env} env
 * @param {string} [description]
 * @param {string[]} [extras]
 * @returns {string}
 */
export function buildBody(type, env, description = "", extras = []) {
  const footer = `Extension: ${env.version} · Browser: ${env.browser} ${env.browserVersion} · OS: ${env.os}`;
  const tail = extras.length > 0 ? `\n${extras.join("\n")}` : "";
  return `${description}\n\n---\n${footer}${tail}`;
}

/**
 * Build the three transport URLs from one place. URL-encode subject/body exactly
 * once here — callers must not re-encode.
 * @param {{ type: FeedbackType, product?: string, env: Env, description?: string, extras?: string[] }} opts
 * @returns {{ gmail: string, outlook: string, mailto: string }}
 */
export function buildComposeUrls({ type, product = PRODUCT, env, description = "", extras = [] }) {
  const su = encodeURIComponent(buildSubject(type, product));
  const body = encodeURIComponent(buildBody(type, env, description, extras));
  const to = encodeURIComponent(INBOX);
  return {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${to}&su=${su}&body=${body}`,
    // .live.com personal compose endpoint, NOT .office.com (per the standard).
    outlook: `https://outlook.live.com/owa/?path=/mail/action/compose&to=${to}&subject=${su}&body=${body}`,
    mailto: `mailto:${INBOX}?subject=${su}&body=${body}`,
  };
}

// ---- Environment detection (pure: take strings, return strings) ------------

/** @param {string} ua @returns {string} */
export function detectBrowser(ua) {
  if (/Edg\//.test(ua)) return "Edge"; // Edge UAs contain "Chrome" too — check Edge first
  if (/Chrome\//.test(ua)) return "Chrome";
  return "Browser";
}

/** @param {string} ua @returns {string} */
export function detectBrowserVersion(ua) {
  const m = /(?:Edg|Chrome)\/(\d+)/.exec(ua);
  return m?.[1] ?? "";
}

/** @param {string} ua @param {string} [platform]  navigator.userAgentData.platform when available @returns {string} */
export function detectOS(ua, platform = "") {
  if (/mac/i.test(platform) || /Macintosh|Mac OS X/.test(ua)) return "macOS";
  if (/win/i.test(platform) || /Windows/.test(ua)) return "Windows";
  if (/CrOS/.test(ua)) return "ChromeOS";
  if (/linux/i.test(platform) || /Linux|X11/.test(ua)) return "Linux";
  return "Unknown";
}

/**
 * @param {{ version: string, ua: string, platform?: string, language?: string }} raw
 * @returns {Env}
 */
export function buildEnv({ version, ua, platform = "", language = "" }) {
  return {
    version,
    browser: detectBrowser(ua),
    browserVersion: detectBrowserVersion(ua),
    os: detectOS(ua, platform),
    language,
  };
}
