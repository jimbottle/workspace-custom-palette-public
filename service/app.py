"""
Config + remediation service for Custom Color Palette for Google Workspace Docs, Sheets & Slides.

Phase 3 surface: serves the live selector contract and team palette that clients
fetch on a schedule. Because selectors are remote DATA, a selector fix is a file
edit here (or a remediation publish in Phase 7) — not a Web Store release.

Endpoints:
  GET /config/selectors  -> the current DOM contract (data/selectors.json)
  GET /config/palette    -> the central team palette  (data/palette.json)
  GET /healthz           -> liveness

POST /monitor-result and the alerting/remediation loop arrive in Phases 5/7.

This service stores NO user data and receives no telemetry (architecture
commitment). Run: `uvicorn app:app --port 8080` from this directory.
"""
from __future__ import annotations

import hmac
import json
import os
import tempfile
from datetime import datetime, timezone
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import alerts

DATA_DIR = Path(__file__).parent / "data"
RESULTS_DIR = Path(__file__).parent / "monitor-results"

# Shared secret for POST /monitor-result AND POST /config/selectors. Set
# MONITOR_TOKEN in the service env and SERVICE_TOKEN in the monitor env to the
# same value. If unset, those write endpoints fail closed so a misconfigured
# public deploy can't be spammed.
MONITOR_TOKEN = os.environ.get("MONITOR_TOKEN", "")
MAX_RESULT_BYTES = 5 * 1024 * 1024  # cap stored bundles so a flood can't fill disk

# Failure-to-update loop (Phase 7) — all optional; alerting is skipped if unset.
GITHUB_TOKEN = os.environ.get("GITHUB_TOKEN", "")
GITHUB_REPO = os.environ.get("GITHUB_REPO", "")  # e.g. "jimbottle/workspace-custom-palette"
SLACK_WEBHOOK_URL = os.environ.get("SLACK_WEBHOOK_URL", "")


def _require_token(request: Request) -> None:
    """Fail-closed bearer-token gate (constant-time) for write endpoints."""
    if not MONITOR_TOKEN:
        raise HTTPException(503, "write endpoints disabled: set MONITOR_TOKEN")
    if not hmac.compare_digest(request.headers.get("authorization", ""), f"Bearer {MONITOR_TOKEN}"):
        raise HTTPException(401, "bad or missing bearer token")


async def _read_capped_body(request: Request) -> bytes:
    """Read the request body with a hard size cap. Rejects early on a declared
    oversize Content-Length, then streams so a missing/lying length can't force a
    multi-GB buffer into memory. Used by every authed write endpoint."""
    declared = request.headers.get("content-length")
    if declared and declared.isdigit() and int(declared) > MAX_RESULT_BYTES:
        raise HTTPException(413, "request body too large")
    chunks: list[bytes] = []
    total = 0
    async for chunk in request.stream():
        total += len(chunk)
        if total > MAX_RESULT_BYTES:
            raise HTTPException(413, "request body too large")
        chunks.append(chunk)
    return b"".join(chunks)



app = FastAPI(title="Custom Color Palette for Google Workspace Docs, Sheets & Slides — config service", version="0.1.0")

# The extension fetches from a chrome-extension:// origin. host_permissions in
# the manifest let MV3 bypass CORS, but allow it explicitly so the mock and any
# browser-based tooling also work.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def _load(name: str) -> dict:
    """Read a JSON config file from data/. Raises if missing — a deploy must
    seed these (see README)."""
    return json.loads((DATA_DIR / name).read_text())


@app.get("/config/selectors")
def get_selectors() -> JSONResponse:
    # Short cache: clients also cache locally; this keeps a fix propagating fast
    # while not hammering the origin.
    return JSONResponse(_load("selectors.json"), headers={"Cache-Control": "public, max-age=300"})


@app.get("/config/palette")
def get_palette() -> JSONResponse:
    return JSONResponse(_load("palette.json"), headers={"Cache-Control": "public, max-age=300"})


@app.post("/monitor-result")
async def monitor_result(request: Request) -> dict:
    """Receive a synthetic-monitor run result + diagnostic bundles. Stored as a
    timestamped JSON file for the Phase 7 remediation loop to consume (open a
    GitHub issue, propose a selectors.json fix, rerun). This is monitor data from
    the dedicated TEST account — not end-user telemetry.

    Hardened: requires a bearer token (fail-closed if unset), caps body size, and
    only persists well-formed JSON, so a public deploy can't be spammed or fed
    garbage that the Phase 7 consumer would choke on."""
    _require_token(request)
    try:
        data = json.loads(await _read_capped_body(request))
    except json.JSONDecodeError:
        raise HTTPException(422, "body is not valid JSON")
    RESULTS_DIR.mkdir(exist_ok=True)
    ts = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S%fZ")
    (RESULTS_DIR / f"{ts}.json").write_text(json.dumps(data))

    # Failure-to-update loop: open/update a GitHub issue on failure. Closing is
    # MANUAL today — the recovery branch exists but no caller reaches it (see
    # _handle_alerts and service/README.md). Best-effort: never let an alerting
    # hiccup fail ingestion.
    try:
        await _handle_alerts(data)
    except Exception as e:  # noqa: BLE001 - alerting must not break ingestion
        print("alerting failed:", e)
    return {"ok": True, "stored": ts}


async def _handle_alerts(data: dict) -> None:
    summary = data.get("summary") or {}
    bundles = data.get("bundles") or []

    # An advisory report (a GREEN run that carried warnings, e.g. a locale the
    # monitor could not verify) is ingested and stored but must drive no
    # outbound writes. Without this gate the recovery branch below would fire on
    # it: a green-but-warned run would close every tracked GitHub issue and
    # announce recovery in Slack, while an identical green run WITHOUT a warning
    # would not. That would make closing a maintainer's open issue depend on an
    # unrelated <html lang> read. See monitor/src/diagnostics.ts reportPlan.
    if data.get("kind") == "warnings":
        return
    state = alerts.load_state(RESULTS_DIR)
    open_issues = state.get("open") or {}

    if alerts.should_alert(summary):
        key = alerts.dedup_key(summary)
        issue = alerts.build_issue(summary, bundles)
        if GITHUB_TOKEN and GITHUB_REPO:
            if key in open_issues:
                await alerts.github_comment(GITHUB_TOKEN, GITHUB_REPO, open_issues[key], "Still failing:\n\n" + issue["body"])
            else:
                number = await alerts.github_create_issue(GITHUB_TOKEN, GITHUB_REPO, issue)
                if number is not None:
                    open_issues[key] = number
        await alerts.slack_notify(SLACK_WEBHOOK_URL, ":red_circle: " + issue["title"])
    elif summary.get("ok") is True and open_issues:
        # Recovery: a fully-green run closes every tracked open issue.
        for number in open_issues.values():
            if GITHUB_TOKEN and GITHUB_REPO:
                await alerts.github_comment(GITHUB_TOKEN, GITHUB_REPO, number, alerts.recovery_comment(summary))
                await alerts.github_close_issue(GITHUB_TOKEN, GITHUB_REPO, number)
        await alerts.slack_notify(SLACK_WEBHOOK_URL, ":green_circle: Brand palette monitor recovered.")
        open_issues = {}

    state["open"] = open_issues
    alerts.save_state(RESULTS_DIR, state)


@app.post("/config/selectors")
async def publish_selectors(request: Request) -> dict:
    """Publish an updated selector contract (the remediation publish path).
    Token-gated + shape-validated so a bad publish can't replace a working
    contract. Writing data/selectors.json reaches every client on next refresh —
    no repackage, no Web Store review."""
    _require_token(request)
    try:
        contract = json.loads(await _read_capped_body(request))
    except json.JSONDecodeError:
        raise HTTPException(422, "body is not valid JSON")
    if not alerts.is_valid_contract(contract):
        raise HTTPException(422, "not a valid selector contract")
    # Atomic write: serialize to a UNIQUE temp sibling, then os.replace (atomic
    # rename on the same filesystem) so a concurrent GET reader always sees the
    # old or new file (never torn) AND concurrent publishers can't clobber each
    # other's intermediate file before the rename.
    target = DATA_DIR / "selectors.json"
    fd, tmp_name = tempfile.mkstemp(dir=DATA_DIR, suffix=".json.tmp")
    try:
        with os.fdopen(fd, "w") as f:
            f.write(json.dumps(contract, indent=2))
        os.replace(tmp_name, target)
    except BaseException:
        if os.path.exists(tmp_name):
            os.unlink(tmp_name)
        raise
    return {"ok": True, "version": contract.get("version")}


@app.get("/healthz")
def healthz() -> dict:
    return {"ok": True}
