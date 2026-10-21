/**
 * Dependency-free mock of the config service (Node http only). Stand-in for the
 * FastAPI service in tests/E2E so we can exercise the client's fetch/cache/
 * fallback path without Python. Per the testing standard it exposes a
 * test-control endpoint so a driver can force a scenario.
 *
 *   GET  /config/selectors        -> current selectors doc
 *   GET  /config/palette          -> current palette doc
 *   GET  /healthz                 -> { ok: true }
 *   POST /__set/selectors         -> replace the served selectors (test control)
 *   POST /__set/palette           -> replace the served palette (test control)
 *   POST /__fail  { which, on }   -> force an endpoint to 500 (simulate breakage)
 *
 * Run: node tools/mock-service/server.js [port]   (default port 8787)
 * Base URL is logged on start; point CONFIG_BASE at it to demo propagation.
 */
import http from "node:http";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const PORT = Number(process.argv[2] || process.env.MOCK_PORT || 8787);
const seed = (rel) =>
  JSON.parse(readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8"));

// Seed from the extension's packaged defaults so the mock serves realistic data.
const state = {
  selectors: seed("../../config/selectors.default.json"),
  palette: seed("../../config/palette.default.json"),
  fail: { selectors: false, palette: false },
};

const json = (res, code, body, headers = {}) => {
  const payload = JSON.stringify(body);
  res.writeHead(code, {
    "content-type": "application/json",
    "access-control-allow-origin": "*",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "*",
    ...headers,
  });
  res.end(payload);
};

const readBody = (req) =>
  new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });

const server = http.createServer(async (req, res) => {
  const { method, url } = req;
  if (method === "OPTIONS") return json(res, 204, {});

  if (method === "GET" && url === "/healthz") return json(res, 200, { ok: true });

  if (method === "GET" && url === "/config/selectors") {
    if (state.fail.selectors) return json(res, 500, { error: "forced failure" });
    return json(res, 200, state.selectors, { "cache-control": "public, max-age=300" });
  }
  if (method === "GET" && url === "/config/palette") {
    if (state.fail.palette) return json(res, 500, { error: "forced failure" });
    return json(res, 200, state.palette, { "cache-control": "public, max-age=300" });
  }

  // ---- test-control endpoints ----
  if (method === "POST" && url === "/__set/selectors") {
    state.selectors = await readBody(req);
    return json(res, 200, { ok: true });
  }
  if (method === "POST" && url === "/__set/palette") {
    state.palette = await readBody(req);
    return json(res, 200, { ok: true });
  }
  if (method === "POST" && url === "/__fail") {
    const { which, on } = await readBody(req);
    if (which === "selectors" || which === "palette") state.fail[which] = !!on;
    return json(res, 200, { ok: true, fail: state.fail });
  }

  return json(res, 404, { error: "not found" });
});

server.listen(PORT, () => {
  console.log(`[mock-service] listening on http://localhost:${PORT}`);
});
