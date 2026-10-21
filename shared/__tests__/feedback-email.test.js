import { test } from "node:test";
import assert from "node:assert/strict";
import {
  PRODUCT, INBOX, INTRO,
  normalizeType, buildSubject, buildBody, buildComposeUrls, buildExtras, seedValue,
  detectBrowser, detectBrowserVersion, detectOS, buildEnv,
} from "../feedback-email.js";

/** @type {{version:string,browser:string,browserVersion:string,os:string,language:string}} */
const ENV = { version: "0.1.0", browser: "Chrome", browserVersion: "131", os: "macOS", language: "da-DK" };

test("normalizeType: only bug/feature pass through; everything else => feedback", () => {
  assert.equal(normalizeType("bug"), "bug");
  assert.equal(normalizeType("feature"), "feature");
  assert.equal(normalizeType("feedback"), "feedback");
  assert.equal(normalizeType("nonsense"), "feedback");
  assert.equal(normalizeType(undefined), "feedback");
});

test("buildSubject: [Type] Product", () => {
  assert.equal(buildSubject("bug"), `[Bug] ${PRODUCT}`);
  assert.equal(buildSubject("feature"), `[Feature] ${PRODUCT}`);
  assert.equal(buildSubject("whatever"), `[Feedback] ${PRODUCT}`);
});

test("buildBody: description + --- + single-line diagnostics footer (no prepended intro)", () => {
  const body = buildBody("bug", ENV, "it broke");
  // The intro template is seeded into the textarea by the DOM layer, so the
  // body starts with whatever the user actually wrote — no untouched scaffold
  // shipping above the real text (the 0.1.4 field-report failure mode).
  assert.match(body, /^it broke\n/);
  assert.ok(body.includes("\n---\n"));
  assert.ok(body.includes("Extension: 0.1.0 · Browser: Chrome 131 · OS: macOS"));
  // footer is a single line (the diagnostics)
  const footer = body.split("\n---\n")[1] ?? "";
  assert.equal(footer.split("\n").length, 1);
});

test("buildBody: extras render below the footer, one per line", () => {
  const body = buildBody("bug", ENV, "it broke", ["Browser language: da-DK", "App: Docs, Slides"]);
  const afterSep = body.split("\n---\n")[1] ?? "";
  const lines = afterSep.split("\n");
  assert.equal(lines.length, 3);
  assert.match(lines[0] ?? "", /^Extension: /); // footer format unchanged
  assert.equal(lines[1], "Browser language: da-DK");
  assert.equal(lines[2], "App: Docs, Slides");
});

test("seedValue: empty box gets the type's template", () => {
  assert.equal(seedValue("", "bug"), INTRO.bug);
  assert.equal(seedValue("   \n ", "feature"), INTRO.feature);
});

test("seedValue: another type's UNTOUCHED template is replaced (whitespace-tolerant)", () => {
  assert.equal(seedValue(INTRO.feedback, "bug"), INTRO.bug);
  assert.equal(seedValue(`\n${INTRO.bug}  `, "feature"), INTRO.feature);
  // re-selecting the same type is stable
  assert.equal(seedValue(INTRO.bug, "bug"), INTRO.bug);
});

test("seedValue: user text is NEVER clobbered — even text containing a template", () => {
  assert.equal(seedValue("my own draft", "bug"), "my own draft");
  const edited = `${INTRO.bug}\n1. open Docs`; // template the user typed into
  assert.equal(seedValue(edited, "feature"), edited);
  assert.equal(seedValue("x" + INTRO.feedback, "bug"), "x" + INTRO.feedback);
});

test("buildExtras: bug-only; language + picked apps; omits empties", () => {
  assert.deepEqual(buildExtras("bug", ENV, ["Docs"]), ["Browser language: da-DK", "App: Docs"]);
  assert.deepEqual(buildExtras("bug", ENV), ["Browser language: da-DK"]);
  assert.deepEqual(buildExtras("bug", { ...ENV, language: "" }, []), []);
  assert.deepEqual(buildExtras("feature", ENV, ["Docs"]), []);
  assert.deepEqual(buildExtras("feedback", ENV, ["Docs"]), []);
});

test("buildExtras: the language line names the BROWSER, so it is not read as the editor's", () => {
  // navigator.language is the browser's UI language. The language that breaks
  // the apply path is the Google editor's, and the two differ often - the
  // 2026-08-16 reporter wrote in English with a Danish Docs UI. A line labelled
  // just "UI language" invited exactly that misreading.
  const [languageLine] = buildExtras("bug", ENV);
  assert.match(languageLine ?? "", /^Browser language:/);
  assert.ok(!/^UI language:/.test(languageLine ?? ""), "must not claim to be the UI's language");
});

test("the bug template asks for the Google editor language, which nothing can auto-detect", () => {
  // The feedback page is not a content script and never touches
  // docs.google.com, so the editor's language can only be asked for.
  assert.match(INTRO.bug, /Google editor/i);
  // House rules for shipped copy.
  assert.ok(!/[—–]/.test(INTRO.bug), "no em-dashes in shipped user copy");
  assert.ok(
    !/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(INTRO.bug),
    "no emoji in shipped user copy",
  );
});

test("buildBody: NO PII — never contains an email, URL, or storage data", () => {
  const body = buildBody("feedback", ENV, "hi");
  assert.ok(!body.includes("@"), "no email address in body");
  assert.ok(!/https?:\/\//.test(body), "no URLs in body");
});

test("buildComposeUrls: three transports, encoded once, correct endpoints", () => {
  const urls = buildComposeUrls({ type: "bug", env: ENV, description: "a & b" });
  assert.ok(urls.gmail.startsWith("https://mail.google.com/mail/?view=cm&fs=1"));
  assert.ok(urls.outlook.startsWith("https://outlook.live.com/owa/")); // .live.com, not .office.com
  assert.ok(urls.mailto.startsWith(`mailto:${INBOX}?subject=`));
  // subject is encoded once: "[Bug]" -> %5BBug%5D, exactly one layer (no %255B)
  assert.ok(urls.gmail.includes("%5BBug%5D"));
  assert.ok(!urls.gmail.includes("%255B"), "must not double-encode");
  // the ' & ' in the description is encoded so it doesn't break the query string
  assert.ok(urls.mailto.includes("a%20%26%20b"));
});

test("detectBrowser: Edge wins over Chrome (Edge UA contains both)", () => {
  const edgeUa = "Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36 Edg/131.0.0.0";
  const chromeUa = "Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36";
  assert.equal(detectBrowser(edgeUa), "Edge");
  assert.equal(detectBrowser(chromeUa), "Chrome");
  assert.equal(detectBrowserVersion(edgeUa), "131");
  assert.equal(detectBrowser("Mozilla/5.0 weird"), "Browser");
});

test("detectOS: platform hint preferred, UA fallback", () => {
  assert.equal(detectOS("", "macOS"), "macOS");
  assert.equal(detectOS("... Windows NT 10.0 ...", ""), "Windows");
  assert.equal(detectOS("... CrOS x86_64 ...", ""), "ChromeOS");
  assert.equal(detectOS("... X11; Linux x86_64 ...", ""), "Linux");
  assert.equal(detectOS("opaque", ""), "Unknown");
});

test("buildEnv: assembles from raw version/ua/platform/language", () => {
  const env = buildEnv({ version: "1.2.3", ua: "Chrome/120.0.0.0", platform: "Windows", language: "da-DK" });
  assert.deepEqual(env, { version: "1.2.3", browser: "Chrome", browserVersion: "120", os: "Windows", language: "da-DK" });
  assert.equal(buildEnv({ version: "1.2.3", ua: "Chrome/120.0.0.0" }).language, "");
});
