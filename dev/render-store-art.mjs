/**
 * Render the designed store art from store-assets/templates/ at the exact
 * Chrome Web Store sizes: both promo tiles and all five screenshots. The
 * screenshots frame the raw captures in store-assets/screenshots/_raw/:
 * dev/capture-shots.mjs writes 02-05's, 01's (the live Sheets picker) is
 * captured by hand. `npm run shots` runs the capture, then this.
 *
 * Output is flattened to opaque RGB: the store rejects an alpha channel on
 * promo tiles even when every pixel is opaque.
 *
 * Reuses the Playwright + Chromium already installed under monitor/. Run:
 *   node dev/render-store-art.mjs
 */
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(ROOT, "monitor/node_modules/playwright"));

// page.evaluate bodies run in the browser, where `document` is the page's.
/* global document */

const TEMPLATES = path.join(ROOT, "store-assets/templates");
const JOBS = [
  { template: "marquee.html", width: 1400, height: 560, out: "store-assets/promo/marquee-1400x560.png" },
  { template: "small.html", width: 440, height: 280, out: "store-assets/promo/small-440x280.png" },
  { template: "shot-apply.html", width: 1280, height: 800, out: "store-assets/screenshots/01-brand-row-sheets.png" },
  { template: "shot-editor.html", width: 1280, height: 800, out: "store-assets/screenshots/02-options-editor.png" },
  { template: "shot-popup.html", width: 1280, height: 800, out: "store-assets/screenshots/03-popup-editor.png" },
  { template: "shot-managed.html", width: 1280, height: 800, out: "store-assets/screenshots/04-managed-palette.png" },
  { template: "shot-builder.html", width: 1280, height: 800, out: "store-assets/screenshots/05-policy-builder.png" },
];

const browser = await chromium.launch();
try {
  for (const j of JOBS) {
    const ctx = await browser.newContext({ viewport: { width: j.width, height: j.height }, deviceScaleFactor: 1 });
    const page = await ctx.newPage();
    await page.goto(pathToFileURL(path.join(TEMPLATES, j.template)).href, { waitUntil: "networkidle" });
    // The templates ask for Inter; offline they fall back to the system face,
    // which still renders, so a missing font is reported rather than fatal.
    const inter = await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check("800 40px Inter"); });
    if (!inter) console.warn(`${j.template}: Inter did not load, rendered with the fallback font`);
    const out = path.join(ROOT, j.out);
    await page.screenshot({ path: out });
    // Flatten to 24-bit RGB (no alpha channel at all, not just an opaque one).
    execFileSync("magick", [out, "-background", "#16211d", "-alpha", "remove", "-alpha", "off", `PNG24:${out}`]);
    console.log(`rendered ${j.template} -> ${j.out} (${j.width}x${j.height})`);
    await ctx.close();
  }
} finally {
  await browser.close();
}
