"""
Failure-to-update loop (Phase 7). When the synthetic monitor POSTs a failing run
to /monitor-result, open (or update) a GitHub issue with the diagnostic bundle
so a maintainer — or the optional remediation job — can publish a selector fix.
Because selectors are remote DATA, publishing a fix (POST /config/selectors)
reaches every client on its next refresh — no repackage, no Web Store review.

Closing an issue is MANUAL today. A recovery branch exists (see
`recovery_comment` and `app._handle_alerts`) but no caller reaches it: the
monitor POSTs only on failure, or advisorily with `kind="warnings"`, which the
endpoint returns early on. Whether a green run should drive recovery is an open
decision — bd `workspace-custom-palette-ykj`. Do not describe auto-close as
current behavior anywhere; a maintainer waiting for it waits forever.

Split so the decision/formatting logic is PURE and unit-tested (test_alerts.py);
the GitHub/Slack senders and the dedup-state file are thin I/O.
"""
from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import httpx

# ---- pure logic (unit-tested) ----------------------------------------------


def should_alert(summary: dict) -> bool:
    """Alert only on a run that actually failed at least one check."""
    return bool(summary) and summary.get("ok") is False and len(summary.get("failed") or []) > 0


def dedup_key(summary: dict) -> str:
    """Stable failure signature: the sorted set of failed check ids. Deliberately
    EXCLUDES the contract version — during remediation the version changes on
    each publish, and a still-failing run of the SAME checks must update the
    existing issue, not open a fresh one per fix attempt (the spam the dedup is
    meant to prevent)."""
    ids = sorted((f.get("id", "?") for f in (summary.get("failed") or [])))
    return ",".join(ids)


def build_issue(summary: dict, bundles: list[dict]) -> dict:
    """Build the GitHub issue {title, body} from a failing run + diagnostic
    bundles. Body names each failed check, the stage, the suspect resolver, the
    contract version, and the URL — what a fixer needs to start."""
    failed = summary.get("failed") or []
    labels = ", ".join(f.get("label", f.get("id", "?")) for f in failed) or "unknown checks"
    title = f"[monitor] Brand palette injection failing: {labels}"

    lines = [
        f"Synthetic monitor run at **{summary.get('at', '?')}** — "
        f"{summary.get('passed', 0)}/{summary.get('total', 0)} checks passed.",
        "",
        "## Failures",
    ]
    by_id = {b.get("id"): b for b in bundles}
    for f in failed:
        b = by_id.get(f.get("id"), {})
        lines += [
            f"### {f.get('label', f.get('id'))}",
            f"- stage: `{f.get('stage', '?')}`",
            f"- error: {f.get('error', '?')}",
            f"- suspect resolver: `{b.get('suspectResolver', '?')}`",
            f"- contract version: `{b.get('contractVersion', '?')}`",
            f"- url: {b.get('url', '?')}",
            "",
        ]
    lines += [
        "## To fix",
        "Update the affected selector(s) in `service/data/selectors.json` (or "
        "`POST /config/selectors` with the corrected contract). Clients pick up "
        "the new contract on their next refresh — no repackage. Close this issue "
        "by hand once the monitor is green: auto-close is not wired up today "
        "(see bd `workspace-custom-palette-ykj`).",
    ]
    return {"title": title, "body": "\n".join(lines)}


def recovery_comment(summary: dict) -> str:
    """Comment posted when a green run closes a tracked issue.

    Reachable only if a caller POSTs a green summary. No current caller does
    (the monitor posts on failure, or advisorily with kind="warnings", which the
    service returns early on) — kept because the branch it belongs to is a
    deliberate open decision, not dead weight. See bd
    `workspace-custom-palette-ykj`.
    """
    return f"Monitor is green again ({summary.get('passed')}/{summary.get('total')}) at {summary.get('at')}. Auto-closing."


# Resolvers the extension needs present in every published contract. Shape
# checks alone let a publish DROP one silently: omitting `sectionLabel` is what
# left the Brand row unlabeled in Docs in 0.1.4, and the picker looked fine to
# an English tester because injection still worked.
REQUIRED_SHARED = (
    "swatchCell",
    "swatchInner",
    "swatchSelected",
    "sectionLabel",
    "customColorButton",
    "customDialog",
    "hexInput",
    "redInput",
    "greenInput",
    "blueInput",
    "okButton",
)

# Selectors that match on translated text are English-only. Google's UI is
# translated; ids and class names are not. A published contract keyed on such an
# attribute breaks the apply path for every non-English user while injection
# keeps working, so the monitor's English test account stays green and nobody
# finds out (bug workspace-custom-palette-7as, reported from a Danish UI).
#
# `title` belongs here alongside the aria-* attributes: the swatch's inner div
# carries title=<localized color name> (docs/SPEC.md §2), which is what made
# every Brand swatch read "sort" in that same Danish report. Case-insensitive
# because HTML attribute names are, so [ARIA-LABEL=...] would still match in the
# browser while slipping past a case-sensitive gate.
_LOCALE_DEPENDENT = re.compile(
    r"(?:aria-label|aria-description|aria-placeholder|aria-roledescription|aria-valuetext"
    r"|title|data-tooltip|placeholder|alt|label)"
    r"\s*[\^$*|~]?=",
    re.IGNORECASE,
)

# `swatchSelected` must be a comma-list of BARE class selectors, because that is
# the only shape content/dom-contract.js clearSwatchSelection can turn back into
# a class token to remove. Keep the two in step: loosening one without the other
# reintroduces a silent no-op.
_CONSUMABLE_SWATCH_SELECTED = re.compile(r"\.[\w-]+(?:\s*,\s*\.[\w-]+)*")


def _selector_strings(c: dict):
    """Yield (label, selector) for every selector string in a contract.

    Walks per-picker entries generically rather than checking a fixed key list:
    a picker-specific override added later (its own swatchCell, say) must not
    slip past the gate unscanned just because this function predates it."""
    for key, value in (c.get("shared") or {}).items():
        if isinstance(value, str):
            yield f"shared.{key}", value
    for app, entry in (c.get("apps") or {}).items():
        pickers = (entry or {}).get("pickers") or {} if isinstance(entry, dict) else {}
        for ptype, picker in pickers.items():
            if not isinstance(picker, dict):
                continue
            yield from _nested_selectors(f"{app}.{ptype}", picker)


def _nested_selectors(prefix: str, obj: dict):
    """Yield (label, selector) for every string in `obj`, recursing into nested
    dicts.

    Recursion is the point: a picker's `overrides` block (the Sheets
    dropdown-chip widget) is a NESTED dict of selectors, and a flat scan would
    walk straight past it — publishing an English aria-label there would break
    non-English users on that picker with the gate still green, which is bug
    workspace-custom-palette-7as all over again in a place nobody is looking."""
    for key, value in obj.items():
        if isinstance(value, str):
            yield f"{prefix}.{key}", value
        elif isinstance(value, dict):
            yield from _nested_selectors(f"{prefix}.{key}", value)


def locale_dependent_selectors(c: object) -> list[str]:
    """Every selector in `c` that matches on translated UI text, as
    "label: selector" strings. Empty list means the contract is safe to publish
    to non-English users. Exposed separately so the API can tell a remediator
    exactly which entries to fix."""
    if not isinstance(c, dict):
        return []
    return [f"{label}: {sel}" for label, sel in _selector_strings(c) if _LOCALE_DEPENDENT.search(sel)]


def is_valid_contract(c: object) -> bool:
    """Publish gate for POST /config/selectors (mirrors the extension's
    isValidContract, plus the checks that only matter at publish time).

    This is the ONLY gate on the remediation path: a fixer publishes a contract
    here and it reaches every client on their next refresh. Shape alone is not
    enough — the two field-reported regressions of 2026-08-15 were both
    shape-valid contracts (a dropped `sectionLabel`, and English `aria-label`
    selectors), so both are rejected here rather than discovered by users."""
    if not isinstance(c, dict):
        return False
    shared = c.get("shared")
    apps = c.get("apps")
    if not isinstance(c.get("version"), str) or not isinstance(shared, dict) or not isinstance(apps, dict):
        return False
    if not all(shared.get(k) for k in REQUIRED_SHARED):
        return False
    if not _CONSUMABLE_SWATCH_SELECTED.fullmatch(str(shared.get("swatchSelected", ""))):
        # Presence is not usability. clearSwatchSelection has to REMOVE this
        # class from a cloned cell, which it can only do by taking the bare
        # token out of the selector — so anything that is not a comma-list of
        # plain class selectors (e.g. `td.foo-selected`, `.a .b`) silently
        # strips nothing, and every Brand swatch renders Google's checkmark
        # again for every client on the next refresh, with nothing failing.
        return False
    if locale_dependent_selectors(c):
        return False
    return len(apps) > 0 and all(
        isinstance(a, dict) and isinstance(a.get("pickers"), dict) and len(a["pickers"]) > 0
        and all(_is_valid_picker(p) for p in a["pickers"].values())
        for a in apps.values()
    )


def _is_valid_picker(p: object) -> bool:
    """Mirrors isValidPicker in lib/config.js — keep the two in step.

    `toolbarButton` is optional (a side-panel picker has none) but a picker with
    neither a toolbar button nor an `overrides` block is a truncated publish.
    `overrides` values are type-checked because a non-string selector reaches
    querySelectorAll as `undefined` and throws mid-apply, which the extension
    surfaces to the user as a failed apply rather than falling back."""
    if not isinstance(p, dict) or not p.get("popupRoot") or not isinstance(p["popupRoot"], str):
        return False
    toolbar = p.get("toolbarButton")
    if toolbar is not None and not isinstance(toolbar, str):
        return False
    overrides = p.get("overrides")
    if overrides is None:
        return bool(toolbar)
    if not isinstance(overrides, dict):
        return False
    for key, value in overrides.items():
        if key == "tabIndex":
            if not isinstance(value, int) or isinstance(value, bool):
                return False
        elif not isinstance(value, str) or not value:
            return False
    return True


# ---- dedup state (thin I/O) -------------------------------------------------


def _state_path(results_dir: Path) -> Path:
    return results_dir / "alerts-state.json"


def load_state(results_dir: Path) -> dict:
    p = _state_path(results_dir)
    if not p.exists():
        return {}
    try:
        return json.loads(p.read_text())
    except json.JSONDecodeError:
        return {}


def save_state(results_dir: Path, state: dict) -> None:
    results_dir.mkdir(exist_ok=True)
    _state_path(results_dir).write_text(json.dumps(state))


# ---- senders (thin I/O) -----------------------------------------------------


async def github_create_issue(token: str, repo: str, issue: dict) -> int | None:
    """Create a GitHub issue; return its number, or None on failure."""
    async with httpx.AsyncClient(timeout=15) as client:
        r = await client.post(
            f"https://api.github.com/repos/{repo}/issues",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            json={"title": issue["title"], "body": issue["body"]},
        )
        return r.json().get("number") if r.status_code in (200, 201) else None


async def github_comment(token: str, repo: str, number: int, body: str) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        await client.post(
            f"https://api.github.com/repos/{repo}/issues/{number}/comments",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            json={"body": body},
        )


async def github_close_issue(token: str, repo: str, number: int) -> None:
    async with httpx.AsyncClient(timeout=15) as client:
        await client.patch(
            f"https://api.github.com/repos/{repo}/issues/{number}",
            headers={"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"},
            json={"state": "closed"},
        )


async def slack_notify(webhook: str, text: str) -> None:
    if not webhook:
        return
    async with httpx.AsyncClient(timeout=15) as client:
        await client.post(webhook, json={"text": text})
