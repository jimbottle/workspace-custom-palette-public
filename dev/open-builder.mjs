/**
 * Open the admin policy builder in the default browser.
 *
 * Exists because "open options/policy-builder.html in a browser" is not
 * an instruction a browser can follow — a repo-relative path resolves to
 * nothing in an address bar, which is exactly how a tester hit it (field,
 * 2026-08-26). This resolves the absolute path, prints the file:// URL so it
 * can be copied or pasted anywhere, and then tries to open it.
 *
 *   npm run policy:builder
 */
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const page = path.join(ROOT, "options/policy-builder.html");

if (!fs.existsSync(page)) {
  console.error(`Not found: ${page}`);
  process.exit(1);
}

const url = pathToFileURL(page).href;
console.log(url);

// Printing the URL is the part that always works; opening is best-effort, so a
// platform without the opener still leaves the tester something to paste.
const opener = process.platform === "darwin" ? "open"
  : process.platform === "win32" ? "start"
  : "xdg-open";
const child = spawn(opener, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" });
child.on("error", () => {
  console.error(`Could not launch "${opener}". Copy the URL above into a browser.`);
});
child.unref();
