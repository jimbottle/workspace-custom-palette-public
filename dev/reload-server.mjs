/*
 * Hot-reload server for `npm run dev`. Watches the extension's runtime sources
 * and broadcasts "reload" over a WebSocket; the extension's dev-reload.js client
 * (active only for unpacked installs) then calls chrome.runtime.reload().
 *
 * Load the unpacked extension once (the repo root), run this, and subsequent
 * edits reload it automatically. Reload the Google editor tab to pick up
 * content-script changes.
 */
import { WebSocketServer } from "ws";
import chokidar from "chokidar";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
// The extension lives at the repo root; watch only its runtime dirs + manifest,
// not the sibling monitor/service/docs/node_modules trees.
const watched = ["manifest.json", "icons", "background", "content", "config", "feedback", "lib", "options", "popup", "shared"]
  .map((p) => path.join(root, p));
const PORT = 8765;

const wss = new WebSocketServer({ port: PORT });
console.log(`[dev] reload server on ws://localhost:${PORT}; watching the extension at ${root}`);
console.log("[dev] reload the unpacked extension once so dev-reload.js connects.");

wss.on("connection", (ws) => {
  console.log("[dev] extension connected");
  ws.on("close", () => console.log("[dev] extension disconnected"));
});

const ignored = (p) =>
  p.includes("node_modules") || p.includes("/.git") || p.includes("/__tests__/");

const watcher = chokidar.watch(watched, { ignored, ignoreInitial: true });
let timer;
watcher.on("all", (event, filePath) => {
  clearTimeout(timer);
  timer = setTimeout(() => {
    console.log(`[dev] ${event} ${path.relative(root, filePath)} — broadcasting reload`);
    for (const client of wss.clients) if (client.readyState === 1) client.send("reload");
  }, 100);
});
