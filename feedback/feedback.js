/**
 * Feedback page DOM wiring. Reads env (manifest version + navigator), calls the
 * pure compose layer in shared/feedback-email.js, keeps the preview and the
 * three transport links in sync as the user edits. No diagnostics beyond
 * version/browser/OS — plus, for bug reports, the browser UI language and the
 * optional user-picked app — are collected (privacy commitment; everything is
 * visible in the preview and the composed mail before sending).
 */

import {
  INBOX, buildEnv, buildSubject, buildBody, buildComposeUrls, buildExtras, normalizeType, seedValue,
} from "../shared/feedback-email.js";
import { initTheme } from "../shared/theme.js";
import { installPageErrorListener } from "../shared/page-errors.js";

initTheme().catch(() => {}); // apply the saved light/dark/system theme
installPageErrorListener(window); // surface this page's own errors locally

/** @returns {import("../shared/feedback-email.js").Env} */
function readEnv() {
  const version = chrome.runtime.getManifest().version;
  const ua = navigator.userAgent;
  // userAgentData.platform is the modern hint; fall back to UA parsing.
  const platform = /** @type {any} */ (navigator).userAgentData?.platform ?? navigator.platform ?? "";
  const language = navigator.language ?? "";
  return buildEnv({ version, ua, platform, language });
}

const env = readEnv();

const $ = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));
const descEl = /** @type {HTMLTextAreaElement} */ ($("description"));
const subjectEl = $("subject");
const previewEl = $("preview");
const gmailEl = /** @type {HTMLAnchorElement} */ ($("gmail"));
const outlookEl = /** @type {HTMLAnchorElement} */ ($("outlook"));
const mailtoEl = /** @type {HTMLAnchorElement} */ ($("mailto"));

/** @returns {import("../shared/feedback-email.js").FeedbackType} */
function selectedType() {
  const checked = /** @type {HTMLInputElement | null} */ (document.querySelector('input[name="type"]:checked'));
  return normalizeType(checked?.value);
}

/** @returns {string[]} the checked app names (bug reports only show the row) */
function selectedApps() {
  return Array.from(document.querySelectorAll('input[name="app"]:checked'))
    .map((el) => /** @type {HTMLInputElement} */ (el).value);
}

/**
 * Seed the description textarea with the type's intro template. The
 * anti-clobber decision (never overwrite user text) is the pure, unit-tested
 * seedValue in shared/feedback-email.js — this is just the assignment.
 */
function seedTemplate(/** @type {import("../shared/feedback-email.js").FeedbackType} */ type) {
  descEl.value = seedValue(descEl.value, type);
}

function refresh() {
  const type = selectedType();
  const description = descEl.value;
  const appsWrap = $("appsWrap");
  if (appsWrap) appsWrap.hidden = type !== "bug";
  const extras = buildExtras(type, env, selectedApps());
  subjectEl.textContent = buildSubject(type);
  previewEl.textContent = buildBody(type, env, description, extras);
  const urls = buildComposeUrls({ type, env, description, extras });
  gmailEl.href = urls.gmail;
  outlookEl.href = urls.outlook;
  mailtoEl.href = urls.mailto;
}

function init() {
  // Default to the ?type= param (bug/feature) else feedback.
  const param = new URLSearchParams(location.search).get("type");
  const initialType = normalizeType(param);
  const radio = /** @type {HTMLInputElement | null} */ (document.querySelector(`input[name="type"][value="${initialType}"]`));
  if (radio) radio.checked = true;
  // If the page was deep-linked as a bug report, open the preview so the user
  // sees exactly what's attached.
  if (param === "bug" || param === "feature") {
    /** @type {HTMLDetailsElement} */ ($("previewWrap")).open = true;
  }

  seedTemplate(initialType);

  document.getElementById("types")?.addEventListener("change", () => { seedTemplate(selectedType()); refresh(); });
  document.getElementById("appsWrap")?.addEventListener("change", refresh);
  descEl.addEventListener("input", refresh);

  document.getElementById("copy")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(INBOX);
      $("copied").textContent = `Copied ${INBOX}`;
    } catch {
      $("copied").textContent = INBOX; // clipboard blocked — show it so they can copy manually
    }
  });

  refresh();
}

init();
