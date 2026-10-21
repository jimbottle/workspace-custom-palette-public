/**
 * Mount a real extension page (popup / options) under jsdom against a fake
 * `chrome.*`, so the DOM glue around the pure decision functions can be tested.
 * Test-only: never packaged (dev/package.sh excludes `__tests__`).
 *
 * Both pages run their work at import time (options.js even reads
 * `getElementById` at module top level), so the order here is load-bearing:
 * build the DOM and install the globals FIRST, then import the module. The
 * import specifier carries a unique query string because ES modules are cached
 * by URL — without it, the second mount in a file would silently reuse the
 * first page's already-executed module and test nothing.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { JSDOM } from "jsdom";

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

let mountSeq = 0;

/** Globals we install for the page and must remove afterwards. */
const INSTALLED = [
  "window", "document", "chrome", "fetch", "navigator",
  "Event", "CustomEvent", "HTMLElement", "Node", "getComputedStyle",
];

/**
 * @param {string} pageHtml  repo-relative, e.g. "popup/popup.html"
 * @param {string} pageScript  repo-relative, e.g. "popup/popup.js"
 * @param {{ chrome: any, fetch?: (url: string) => Promise<any> }} opts
 */
export async function mountPage(pageHtml, pageScript, opts) {
  const { chrome } = opts;
  const html = readFileSync(path.join(REPO_ROOT, pageHtml), "utf8");
  const dom = new JSDOM(html, { url: "https://localhost/", pretendToBeVisual: true });
  const { window } = dom;

  /** Saved so unmount() can restore whatever was there before. */
  const saved = new Map(INSTALLED.map((k) => [k, Reflect.get(globalThis, k)]));

  // The pages call fetch(chrome.runtime.getURL(...)) for the packaged palette.
  // Serve it from the real file on disk so tests run against the real defaults
  // rather than a fixture that can drift away from what ships.
  // A test may override it to exercise a load failure — the failure path is
  // where some UI (the footer version) matters most.
  /** @param {string} url */
  const fetchImpl = opts.fetch ?? (async (url) => {
    const rel = String(url).replace(/^chrome-extension:\/\/test\//, "");
    const body = readFileSync(path.join(REPO_ROOT, rel), "utf8");
    return { ok: true, async json() { return JSON.parse(body); }, async text() { return body; } };
  });

  Reflect.set(globalThis, "window", window);
  Reflect.set(globalThis, "document", window.document);
  Reflect.set(globalThis, "chrome", chrome);
  Reflect.set(globalThis, "fetch", fetchImpl);
  Reflect.set(globalThis, "navigator", window.navigator);
  Reflect.set(globalThis, "Event", window.Event);
  Reflect.set(globalThis, "CustomEvent", window.CustomEvent);
  Reflect.set(globalThis, "HTMLElement", window.HTMLElement);
  Reflect.set(globalThis, "Node", window.Node);
  Reflect.set(globalThis, "getComputedStyle", window.getComputedStyle.bind(window));

  const href = pathToFileURL(path.join(REPO_ROOT, pageScript)).href + `?mount=${++mountSeq}`;
  await import(href);

  const doc = window.document;

  return {
    dom,
    window,
    doc,
    /**
     * Strict by design: a missing id is a broken test, never an expected
     * outcome, and returning null here would push a null-check into every
     * caller for a case that should just fail loudly.
     * @param {string} id @returns {HTMLElement}
     */
    byId: (id) => {
      const el = doc.getElementById(id);
      if (!el) throw new Error(`no element with id "${id}" in the mounted page`);
      return el;
    },
    /** Palette editor rows currently on screen. */
    rows: () => [...doc.querySelectorAll("#rows [data-bpi-row]")],
    /** The hexes currently shown in the editor, in row order. */
    shownHexes: () => [...doc.querySelectorAll("#rows [data-bpi-hex]")]
      .map((el) => /** @type {HTMLInputElement} */ (el).value),
    status: () => doc.getElementById("status")?.textContent ?? "",
    /**
     * An element's text as a plain string. `Node.textContent` is `string | null`
     * in lib.dom, so reading it straight into an assertion that wants a string
     * is a type error waiting on a lib or @types bump. Every older test in this
     * repo guards it the same way.
     * @param {string} id @returns {string}
     */
    text: (id) => {
      const el = doc.getElementById(id);
      if (!el) throw new Error(`no element with id "${id}" in the mounted page`);
      return el.textContent ?? "";
    },
    /** Dispatch a bubbling event the way a real interaction would.
     * @param {Element} el @param {string} type */
    fire: (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true })),
    /**
     * Type a value into an editor input AND settle it — `input` then `change`,
     * which is what a browser sends when someone types and then blurs or
     * presses Enter. Settling matters: the popup deliberately persists only
     * settled edits, so a helper that fired `input` alone would model a
     * half-typed field and nothing would ever save (see the SETTLED vs INTERIM
     * note in shared/palette-editor.js).
     * @param {Element | null} el @param {string} value
     */
    typeInto(el, value) {
      const input = /** @type {HTMLInputElement} */ (el);
      input.value = value;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
      input.dispatchEvent(new window.Event("change", { bubbles: true }));
    },
    /**
     * Type WITHOUT settling — keystrokes only, the field still focused. Models
     * a value someone is in the middle of typing, which an auto-saving host
     * must not persist.
     * @param {Element | null} el @param {string} value
     */
    typeInterim(el, value) {
      const input = /** @type {HTMLInputElement} */ (el);
      input.value = value;
      input.dispatchEvent(new window.Event("input", { bubbles: true }));
    },
    /** @param {Element | null} el */
    click: (el) => /** @type {Element} */ (el).dispatchEvent(
      new window.MouseEvent("click", { bubbles: true }),
    ),
    unmount() {
      for (const [k, v] of saved) {
        if (v === undefined) Reflect.deleteProperty(globalThis, k);
        else Reflect.set(globalThis, k, v);
      }
      window.close();
    },
  };
}

/**
 * Resolve after `ms` (real time — these pages debounce on real timers).
 * @param {number} ms @returns {Promise<void>}
 */
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Poll until `predicate()` is truthy. Pages start their work in a promise chain
 * nobody exposes, so tests wait on an observable effect instead of a handle.
 * @param {() => unknown} predicate
 * @param {{ timeoutMs?: number, label?: string }} [opts]
 */
export async function waitFor(predicate, { timeoutMs = 5000, label = "condition" } = {}) {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const got = predicate();
    if (got) return got;
    if (Date.now() > deadline) throw new Error(`timed out waiting for ${label}`);
    await sleep(10);
  }
}
