# service/ — config + remediation service (FastAPI)

Serves the live selector contract and team palette that the extension fetches on
a schedule. A selector fix is a file edit in `data/` (or a Phase 7 remediation
publish), not a Web Store release.

## Run

```bash
cd service
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
uvicorn app:app --port 8080            # GET /config/selectors, /config/palette, /healthz
```

## Data

- `data/selectors.json` — the live DOM contract (same shape as the extension's
  packaged `selectors.default.json`; this copy is authoritative once a client
  points `CONFIG_BASE` here).
- `data/palette.json` — the central team palette (same shape as
  `palette.default.json`).

Seed these from the extension's packaged defaults; Phase 7 remediation updates
`selectors.json` automatically when the monitor catches a break.

## Wiring a client to this service

1. Set `CONFIG_BASE` in `config/endpoints.js` to this server's URL.
2. Add that origin to `host_permissions` in `manifest.json`.
3. The service worker refreshes the client cache every
   `REFRESH_PERIOD_MINUTES`; a fix propagates on the client's next picker open.

### `POST /monitor-result` auth

The synthetic monitor POSTs run results here. Set `MONITOR_TOKEN` in this
service's env and the same value as `SERVICE_TOKEN` in the monitor's env; the
endpoint requires `Authorization: Bearer <token>`, caps the body size, and only
persists valid JSON. If `MONITOR_TOKEN` is unset the endpoint is disabled
(fail-closed) so a public deploy can't be spammed.

No user data is stored or received here (architecture commitment: no telemetry).

## Failure-to-update loop (Phase 7)

When the monitor POSTs a failing run to `/monitor-result`, the service opens (or
updates) a GitHub issue with the diagnostic bundle and optionally pings Slack.
Issues are deduped by the failure signature (failed check ids) so repeat
failures update one issue instead of spamming.

**Closing is manual today.** The code has a recovery branch that closes every
tracked issue on a green run, but no caller reaches it: the monitor POSTs only
on a failure, or advisorily with `kind: "warnings"` (which returns early by
design, so a locale warning cannot close someone's issue), and `remediate.ts`
posts only `/config/selectors`. Whether a green run *should* drive recovery is
an open decision about outbound GitHub/Slack writes — bd
`workspace-custom-palette-ykj`.

Two consequences worth knowing while that is open:

- Close the issue yourself once the monitor is green again.
- `state["open"]` is only ever cleared by that same unreachable branch, so a
  failure signature stays tracked after you close its issue by hand. The next
  occurrence of the *same* signature will comment "Still failing" on the closed
  issue rather than opening a fresh one; Slack's red-circle message is then the
  live signal. Delete the key from `monitor-results/alerts-state.json` (the file
  `alerts._state_path` writes) if you want the next occurrence to open a fresh
  issue.

### `POST /monitor-result` body

```jsonc
{
  "kind": "failure" | "warnings",  // see below; absent is treated as a failure report
  "summary": { "ok": false, "total": 6, "passed": 5, "failed": [...], "warnings": [...], "at": "..." },
  "bundles": [ ... ]
}
```

`kind` is a **wire contract between two independently deployed components**, so
mind the ordering: a monitor that sends `kind: "warnings"` to a service too old
to understand it will have its advisory green reports treated as real ones,
which re-opens the bug the field exists to prevent (a locale warning closing
every tracked issue). **Deploy the service before the monitor.** A missing
`kind` is treated as a failure report, which keeps older monitors working
unchanged.

Fixing a break is a **data publish, not a release** — for clients whose build
points `CONFIG_BASE` at this server. Web Store installs ship it empty and need
a release instead (`docs/REMOTE_CONFIG_DECISION.md`):

```bash
# Publish a corrected selector contract (token-gated, shape-validated).
curl -X POST "$SERVICE/config/selectors" \
  -H "Authorization: Bearer $MONITOR_TOKEN" -H 'content-type: application/json' \
  --data @data/selectors.json
```

Clients fetch the new contract on their next refresh — no repackage, no Web
Store review. Close the issue by hand once the monitor is green (see above).

### Env (all optional; alerting is skipped if unset)

| Var | Purpose |
|---|---|
| `GITHUB_TOKEN` + `GITHUB_REPO` | open/comment on the alert issue (`owner/repo`); closing is manual |
| `SLACK_WEBHOOK_URL` | post a red-circle message on failure. Dormant by decision (2026-09-01): neither Slack nor GitHub issues has ever been used in this project, so the green/recovery branch in `_handle_alerts` is unreachable on purpose and stays inert without this variable |
| `MONITOR_TOKEN` | bearer for `/monitor-result` AND `/config/selectors` (publish) |

### Optional: automated remediation

The diagnostic bundle (picker `outerHTML`, suspect resolver) + the publish
endpoint are the building blocks for a headless agent that proposes a corrected
`selectors.json`, reruns the monitor against the candidate, and publishes on
green. That agent is a deliberate future step (tracked in beads); the manual
loop above works today.

## Tests

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements-dev.txt
pytest            # pure alert logic + endpoint wiring (no network)
```

For the extension's own tests, it points at the dependency-free mock in
`../tools/mock-service/` (no Python needed) — see its README.
