"""Endpoint integration tests (FastAPI TestClient, in-process — no server, no
network). Covers token gating, the publish path + validation, config serving,
and the monitor-result failure/recovery flow with GitHub disabled (no token, so
the senders are skipped but the loop logic runs). Run: `pytest` from service/."""
import importlib
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


def _client(tmp_path, monkeypatch, token="secret"):
    """Fresh app with MONITOR_TOKEN set and data/ copied into a temp dir so the
    publish test doesn't mutate the repo's selectors.json."""
    import alerts, app as appmod  # noqa: E402

    data = tmp_path / "data"
    data.mkdir()
    src = Path(__file__).resolve().parent.parent / "data"
    (data / "selectors.json").write_text((src / "selectors.json").read_text())
    (data / "palette.json").write_text((src / "palette.json").read_text())
    monkeypatch.setattr(appmod, "DATA_DIR", data)
    monkeypatch.setattr(appmod, "RESULTS_DIR", tmp_path / "results")
    monkeypatch.setattr(appmod, "MONITOR_TOKEN", token)
    monkeypatch.setattr(appmod, "GITHUB_TOKEN", "")  # GitHub disabled -> senders skipped
    from fastapi.testclient import TestClient
    return TestClient(appmod.app), data


AUTH = {"Authorization": "Bearer secret"}


def test_get_config_serves_seeded_contract(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    r = client.get("/config/selectors")
    assert r.status_code == 200 and "shared" in r.json()
    assert client.get("/healthz").json() == {"ok": True}


def test_publish_requires_token_and_valid_contract(tmp_path, monkeypatch):
    client, data = _client(tmp_path, monkeypatch)
    good = json.loads((data / "selectors.json").read_text())
    good["version"] = "2099-01-01"

    assert client.post("/config/selectors", json=good).status_code == 401  # no token
    assert client.post("/config/selectors", headers=AUTH, json={"bad": 1}).status_code == 422  # invalid shape
    ok = client.post("/config/selectors", headers=AUTH, json=good)
    assert ok.status_code == 200 and ok.json()["version"] == "2099-01-01"
    # published contract is now served
    assert client.get("/config/selectors").json()["version"] == "2099-01-01"


def test_monitor_result_failure_then_recovery(tmp_path, monkeypatch):
    """Endpoint-level only: this POSTs a green summary directly, which no real
    caller does. The monitor posts on failure, or advisorily with
    kind="warnings", so the recovery branch is unreachable in production and
    issues are closed by hand (bd workspace-custom-palette-ykj). Do not read
    this test as evidence that auto-close works."""
    client, _ = _client(tmp_path, monkeypatch)
    failing = {"summary": {"ok": False, "total": 4, "passed": 3, "at": "t",
                            "failed": [{"id": "sheets.fill", "label": "Sheets · Fill", "stage": "readback", "error": "x"}]},
               "bundles": [{"id": "sheets.fill", "suspectResolver": "shared.swatchInner", "contractVersion": "v"}]}
    r = client.post("/monitor-result", headers=AUTH, json=failing)
    assert r.status_code == 200 and r.json()["ok"] is True

    green = {"summary": {"ok": True, "total": 4, "passed": 4, "at": "t2", "failed": []}, "bundles": []}
    assert client.post("/monitor-result", headers=AUTH, json=green).status_code == 200


def test_warnings_only_report_is_stored_but_drives_no_outbound_writes(tmp_path, monkeypatch):
    """A GREEN run carrying advisory warnings must not touch GitHub or Slack.

    Without the kind gate, such a report falls into _handle_alerts' recovery
    branch, which closes every tracked issue and announces recovery in Slack. A
    green run WITHOUT a warning does none of that, so issue auto-close would end
    up gated on an unrelated locale observation - closing a maintainer's open
    issue mid-remediation because one leg could not read <html lang>.
    """
    import alerts  # noqa: E402  (path is set up by _client's import)

    client, _ = _client(tmp_path, monkeypatch)
    results_dir = tmp_path / "results"

    # Seed a tracked open issue DIRECTLY. Posting a failing run would not do it
    # here: GITHUB_TOKEN is "" in these tests, so no issue number is ever
    # recorded, `open_issues` stays empty, and the recovery branch is falsy for
    # the wrong reason - the test would then pass with or without the gate.
    alerts.save_state(results_dir, {"open": {"docs.text": 42}})
    state_after_failure = alerts.load_state(results_dir)
    assert state_after_failure["open"] == {"docs.text": 42}

    warned = {"kind": "warnings",
              "summary": {"ok": True, "total": 2, "passed": 2, "at": "t2", "failed": [],
                          "warnings": [{"id": "docs.text", "label": "Docs", "message": "no <html lang>"}]},
              "bundles": []}
    r = client.post("/monitor-result", headers=AUTH, json=warned)
    # Still ingested and stored: the report is not discarded, only inert.
    assert r.status_code == 200 and r.json()["ok"] is True
    assert any(p.suffix == ".json" for p in results_dir.iterdir())
    # Alert state untouched - no recovery was performed off the back of a warning.
    assert alerts.load_state(results_dir) == state_after_failure


def test_failure_report_still_alerts_through_the_kind_gate(tmp_path, monkeypatch):
    """The mirror of the warnings test: prove the gate does not OVER-block.

    The gate sits in front of the entire alerting loop, so tightening it in a
    plausible-looking way (`!= "failure"`, a typo'd literal, a bare truthiness
    check) would silently disable the project's whole failure-detection loop for
    every real monitor run. Nothing else in the suite would notice: the other
    failure test runs with GITHUB_TOKEN unset, so it produces nothing
    observable and passes whether or not _handle_alerts did any work.
    """
    import alerts  # noqa: E402

    client, _ = _client(tmp_path, monkeypatch)
    results_dir = tmp_path / "results"

    import app as appmod  # noqa: E402
    monkeypatch.setattr(appmod, "GITHUB_TOKEN", "tok")
    monkeypatch.setattr(appmod, "GITHUB_REPO", "owner/repo")

    created, slacked = [], []

    async def fake_create(token, repo, issue):
        created.append(issue)
        return 7

    async def fake_slack(webhook, text):
        slacked.append(text)

    monkeypatch.setattr(alerts, "github_create_issue", fake_create)
    monkeypatch.setattr(alerts, "slack_notify", fake_slack)

    def failing(**extra):
        return {**extra,
                "summary": {"ok": False, "total": 2, "passed": 1, "at": "t", "warnings": [],
                            "failed": [{"id": "docs.text", "label": "Docs", "stage": "inject", "error": "x"}]},
                "bundles": [{"id": "docs.text", "suspectResolver": "shared.swatchCell", "contractVersion": "v"}]}

    # BOTH shapes must alert:
    #  - what the monitor sends today, and
    #  - the legacy payload with no `kind` at all, which README promises is
    #    still treated as a failure report so an older monitor keeps working.
    # The legacy row is what catches an over-tightened gate such as
    # `!= "failure"`: the explicit-kind row sails through that one unharmed.
    for label, payload in (("explicit kind", failing(kind="failure")), ("legacy no kind", failing())):
        created.clear()
        slacked.clear()
        alerts.save_state(results_dir, {})
        assert client.post("/monitor-result", headers=AUTH, json=payload).status_code == 200

        assert len(created) == 1, f"{label}: a failure report must still open an issue"
        assert "docs.text" in created[0]["title"] or "Docs" in created[0]["body"]
        assert slacked and slacked[0].startswith(":red_circle:"), f"{label}: Slack not notified"
        # And the signature is tracked, so a repeat updates rather than duplicates.
        assert alerts.load_state(results_dir).get("open") == {"docs.text": 7}, f"{label}: state not recorded"


def test_monitor_result_rejects_unauthed_and_nonjson(tmp_path, monkeypatch):
    client, _ = _client(tmp_path, monkeypatch)
    assert client.post("/monitor-result", json={"summary": {}}).status_code == 401
    assert client.post("/monitor-result", headers=AUTH, content=b"not json").status_code == 422
