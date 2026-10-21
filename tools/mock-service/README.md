# tools/mock-service — dependency-free config-service mock

Stand-in for `service/` (FastAPI) used in tests/E2E so the client's
fetch → cache → fallback path can be exercised without Python. Node `http` only.

```bash
npm run mock-service:start            # http://localhost:8787 (override: node server.js 9000)
```

Endpoints: `GET /config/selectors`, `GET /config/palette`, `GET /healthz`, plus
test-control `POST /__set/selectors`, `POST /__set/palette`, and
`POST /__fail {which,on}` to force an endpoint to 500 (simulate a breakage).

Seeds its served data from the extension's packaged defaults. To demo remote
propagation: set `CONFIG_BASE = "http://localhost:8787"` in
`config/endpoints.js`, add `http://localhost:8787/*` to manifest
`host_permissions`, load the extension, then `POST /__set/palette` and reload a
Google editor tab — the new palette appears on next picker open.
