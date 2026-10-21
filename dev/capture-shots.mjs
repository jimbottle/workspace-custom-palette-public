/**
 * Automated store-screenshot capture for the extension's OWN pages (options,
 * popup). Renders the REAL pages (real HTML/CSS/JS) with a minimal chrome.*
 * stub, so the editor mounts the packaged default palette exactly as shipped,
 * then screenshots into store-assets/screenshots/_raw/. dev/render-store-art.mjs
 * then frames those raws in the store-assets/templates/ designs. The Sheets
 * hero shot (Brand row inside Google's live picker) needs the extension
 * installed in a signed-in browser and is captured by hand.
 *
 * Reuses the Playwright + Chromium already installed under monitor/. Run:
 *   node dev/capture-shots.mjs            # dark theme (matches the store finals)
 *   node dev/capture-shots.mjs --light    # light theme variant
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, "monitor/node_modules/playwright"));

const theme = process.argv.includes("--light") ? "light" : "dark";
const OUT = path.join(ROOT, "store-assets/screenshots/_raw");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png",
};

// Static file server rooted at the repo, with correct MIME for ES modules.
function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const rel = decodeURIComponent(new URL(req.url, "http://x").pathname).replace(/^\/+/, "");
      const file = path.join(ROOT, rel);
      // Reject anything that resolves outside ROOT (a bare prefix check would let
      // sibling dirs like ROOT-secret/ through; compare on the relative path).
      const relToRoot = path.relative(ROOT, file);
      const outside = relToRoot === ".." || relToRoot.startsWith(".." + path.sep) || path.isAbsolute(relToRoot);
      if (outside || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404); res.end("not found"); return;
      }
      res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
      fs.createReadStream(file).pipe(res);
    });
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// Runs before page scripts: enough chrome.* for storage.js / theme.js / the
// editor to mount the packaged default palette (sync.get returns {} -> the page
// falls back to config/palette.default.json via getURL + fetch).
//
// This function body is serialized and evaluated in the BROWSER, not here, so
// `window` is the page's. Declared for the linter rather than giving the whole
// file browser globals, which would hide a genuine typo in the Node half.
/* global window */
function chromeStub({ managed, manifest }) {
  const empty = async () => ({});
  const noop = async () => {};
  // A target may pass a managed policy so the page renders as a Workspace
  // force-installed copy would (the org palette, locked). Absent, the managed
  // area rejects exactly as it does on an unmanaged machine.
  const managedGet = managed ? async () => managed : async () => { throw new Error("no policy"); };
  window.chrome = {
    runtime: { getManifest: () => manifest, getURL: (p) => "/" + String(p).replace(/^\/+/, ""), openOptionsPage() {}, id: "stub" },
    tabs: { create() {} },
    action: { setBadgeText: noop, setIcon: noop },
    storage: {
      // introSeen: the popup's first-run card would otherwise cover the editor.
      sync: { get: async () => ({ introSeen: true }), set: noop, remove: noop },
      local: { get: empty, set: noop, remove: noop },
      managed: { get: managedGet },
      onChanged: { addListener() {}, removeListener() {} },
    },
  };
}

const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, "manifest.json"), "utf8"));

// The packaged default colors, published as an organization palette and locked.
const ORG_POLICY = {
  palette: JSON.parse(fs.readFileSync(path.join(ROOT, "config/palette.default.json"), "utf8"))
    .swatches.map(({ name, hex }) => ({ name, hex })),
  paletteLocked: true,
};

const TARGETS = [
  // Options page is long; clip to the editor (through the status line) so the
  // store shot fills the frame instead of shrinking the whole tall page.
  { name: "options-editor", url: "/options/options.html", width: 700, clipTo: "#status", hide: ["body > p.sub"] },
  { name: "popup-editor", url: "/popup/popup.html", width: 360 },
  // The admin story, for the "For organizations" shots: Settings as a managed
  // user sees it (org colors, locked), and the policy builder an admin uses to
  // write the Admin console JSON.
  { name: "managed-palette", url: "/options/options.html", width: 700, clipTo: "#status", managed: ORG_POLICY },
  { name: "policy-builder", url: "/options/policy-builder.html", width: 820, ready: "#out", clipTo: "#out",
    // Store crop only: drop the long explanatory notes so the colors and the
    // generated policy both fit the frame. The controls themselves are untouched.
    hide: ["#lock-note", "#import", ".preview-note"] },
];

const server = await startServer();
const port = server.address().port;
const base = `http://127.0.0.1:${port}`;
const browser = await chromium.launch();
try {
  fs.mkdirSync(OUT, { recursive: true });
  for (const t of TARGETS) {
    const ctx = await browser.newContext({
      viewport: { width: t.width, height: 900 },
      colorScheme: theme,
      deviceScaleFactor: 2,
    });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => console.error(`[${t.name}] pageerror:`, e.message));
    page.on("console", (m) => { if (m.type() === "error") console.error(`[${t.name}] console:`, m.text()); });
    await page.addInitScript(chromeStub, { managed: t.managed, manifest: MANIFEST });
    await page.goto(base + t.url, { waitUntil: "networkidle" });
    await page.waitForSelector(t.ready ?? ".bpi-row", { timeout: 5000 }); // editor mounted
    if (t.hide) await page.addStyleTag({ content: `${t.hide.join(", ")} { display: none !important; }` });
    await page.waitForTimeout(150); // settle fonts/layout
    const out = path.join(OUT, `raw-${t.name}.png`);
    if (t.clipTo) {
      // Clip from the top through the named element's bottom (+ a little) so the
      // shot focuses on the editor, not the full-length page.
      const box = await page.locator(t.clipTo).boundingBox();
      if (!box) throw new Error(`clip target ${t.clipTo} not found or not visible`);
      await page.screenshot({ path: out, clip: { x: 0, y: 0, width: t.width, height: Math.ceil(box.y + box.height + 20) } });
    } else {
      // Capture the body's content box (not the viewport) so there's no trailing
      // empty space to shrink the shot inside its template frame.
      await page.locator("body").screenshot({ path: out });
    }
    console.log(`captured ${t.name} (${theme}) -> ${path.relative(ROOT, out)}`);
    await ctx.close();
  }
} finally {
  await browser.close();
  server.close();
}
