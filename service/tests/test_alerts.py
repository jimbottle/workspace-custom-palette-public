"""Unit tests for the pure failure-to-update logic (Phase 7). Run: `pytest`
from service/. No network — the GitHub/Slack senders are thin I/O, not tested
here (they'd need a live token; covered by the documented manual run)."""
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # import alerts.py

import alerts  # noqa: E402

FAILING = {
    "ok": False, "total": 4, "passed": 2, "at": "2026-05-29T00:00:00Z",
    "failed": [
        {"id": "sheets.fill", "label": "Sheets · Fill", "stage": "readback", "error": "x"},
        {"id": "docs.text", "label": "Docs · Text", "stage": "apply", "error": "y"},
    ],
}
GREEN = {"ok": True, "total": 4, "passed": 4, "at": "2026-05-29T01:00:00Z", "failed": []}
BUNDLES = [{"id": "sheets.fill", "suspectResolver": "shared.swatchInner", "contractVersion": "2026-05-29", "url": "u"}]


def test_should_alert_only_on_real_failures():
    assert alerts.should_alert(FAILING) is True
    assert alerts.should_alert(GREEN) is False
    assert alerts.should_alert({}) is False
    assert alerts.should_alert({"ok": False, "failed": []}) is False  # failed-but-empty


def test_dedup_key_order_independent_and_version_free():
    k1 = alerts.dedup_key(FAILING)
    # same failures in a different order produce the same key
    reordered = {**FAILING, "failed": list(reversed(FAILING["failed"]))}
    assert alerts.dedup_key(reordered) == k1
    assert "sheets.fill" in k1 and "docs.text" in k1
    # a DIFFERENT set of failed checks is a different signature
    assert alerts.dedup_key({**FAILING, "failed": FAILING["failed"][:1]}) != k1


def test_build_issue_names_each_failure_and_the_suspect_resolver():
    issue = alerts.build_issue(FAILING, BUNDLES)
    assert "Sheets · Fill" in issue["title"]
    assert "shared.swatchInner" in issue["body"]  # from the bundle
    assert "readback" in issue["body"] and "apply" in issue["body"]
    assert "POST /config/selectors" in issue["body"]  # the fix path is documented


def test_state_roundtrip(tmp_path):
    alerts.save_state(tmp_path, {"open": {"k": 7}})
    assert alerts.load_state(tmp_path) == {"open": {"k": 7}}
    assert alerts.load_state(tmp_path / "missing") == {}  # absent -> {}


def test_is_valid_contract():
    good = json.loads((Path(__file__).resolve().parent.parent / "data" / "selectors.json").read_text())
    assert alerts.is_valid_contract(good) is True
    assert alerts.is_valid_contract({}) is False
    assert alerts.is_valid_contract({"version": "x", "shared": {}, "apps": {}}) is False
    assert alerts.is_valid_contract({"version": 1, "shared": good["shared"], "apps": good["apps"]}) is False
    assert alerts.is_valid_contract({"version": "x", "shared": good["shared"], "apps": {"s": {"pickers": {}}}}) is False


def _with_picker(picker: dict) -> dict:
    good = json.loads((Path(__file__).resolve().parent.parent / "data" / "selectors.json").read_text())
    good["apps"]["sheets"]["pickers"] = {"probe": picker}
    return good


def test_publish_gate_checks_picker_shape():
    """Mirrors isValidPicker in lib/config.js. A publish that reaches here goes
    live on every client's next refresh, so a picker that cannot be resolved has
    to be rejected rather than served."""
    # popupRoot is what injection finds the picker BY: without it the entry is inert.
    assert alerts.is_valid_contract(_with_picker({"toolbarButton": "#b", "popupRoot": ".m"})) is True
    assert alerts.is_valid_contract(_with_picker({"toolbarButton": "#b"})) is False
    assert alerts.is_valid_contract(_with_picker({})) is False

    # toolbarButton is optional ONLY for a picker that declares its own
    # custom-colour widget (the Sheets data-validation dropdown chip, which is
    # opened from a side panel). Neither one is a truncated publish.
    assert alerts.is_valid_contract(_with_picker({"popupRoot": ".m"})) is False
    assert alerts.is_valid_contract(
        _with_picker({"popupRoot": ".m", "overrides": {"customColorButton": ".c", "tabIndex": 1}})
    ) is True

    # A non-string selector inside overrides reaches querySelectorAll as
    # `undefined` and throws mid-apply, which the user sees as a failed apply.
    assert alerts.is_valid_contract(_with_picker({"popupRoot": ".m", "overrides": {"customColorButton": 7}})) is False
    assert alerts.is_valid_contract(_with_picker({"popupRoot": ".m", "overrides": {"tabIndex": "1"}})) is False
    assert alerts.is_valid_contract(_with_picker({"popupRoot": ".m", "overrides": "nope"})) is False


def test_locale_gate_recurses_into_a_picker_overrides_block():
    """The overrides block is a NESTED dict of selectors. A one-level scan walks
    straight past it, so an English aria-label published there would break
    non-English users on that picker with the gate still green — bug
    workspace-custom-palette-7as in a place nobody is looking."""
    bad = _with_picker({
        "popupRoot": ".m",
        "overrides": {"customColorButton": ".c", "okButton": 'div[aria-label="OK"]'},
    })
    assert alerts.locale_dependent_selectors(bad) == [
        'sheets.probe.overrides.okButton: div[aria-label="OK"]'
    ]
    assert alerts.is_valid_contract(bad) is False


def _good_contract() -> dict:
    """The contract the service actually serves — also the publish-gate fixture."""
    return json.loads((Path(__file__).resolve().parent.parent / "data" / "selectors.json").read_text())


def test_publish_gate_rejects_locale_dependent_selectors():
    """POST /config/selectors is the ONLY gate on the remediation path: whatever
    passes here reaches every client on their next refresh. A contract keyed on
    English aria-label text is shape-valid but breaks apply for every
    non-English user, and stays invisible because injection is class-based and
    the monitor's test account is English (bug workspace-custom-palette-7as)."""
    good = _good_contract()
    assert alerts.is_valid_contract(good) is True
    assert alerts.locale_dependent_selectors(good) == []

    hex_label = json.loads(json.dumps(good))
    hex_label["shared"]["hexInput"] = 'input.docs-material-hex-input[aria-label="Hex color"]'
    assert alerts.is_valid_contract(hex_label) is False
    assert alerts.locale_dependent_selectors(hex_label) == [
        'shared.hexInput: input.docs-material-hex-input[aria-label="Hex color"]'
    ]

    # Also caught inside a per-app picker, not just the shared block, and for
    # the prefix/substring match forms.
    btn = json.loads(json.dumps(good))
    app = next(iter(btn["apps"]))
    ptype = next(iter(btn["apps"][app]["pickers"]))
    btn["apps"][app]["pickers"][ptype]["toolbarButton"] = '.x[aria-label^="Fill color"]'
    assert alerts.is_valid_contract(btn) is False
    assert alerts.locale_dependent_selectors(btn) == [f'{app}.{ptype}.toolbarButton: .x[aria-label^="Fill color"]']

    # `title` is translated too: the swatch's inner div carries the localized
    # color name, which is what made every Brand swatch read "sort" in Danish.
    titled = json.loads(json.dumps(good))
    titled["shared"]["swatchInner"] = 'div.docs-material-colorpalette-colorswatch[title="Black"]'
    assert alerts.is_valid_contract(titled) is False

    # HTML attribute names are case-insensitive, so a case-sensitive gate would
    # reject the lowercase form while the browser still matched the uppercase one.
    shouty = json.loads(json.dumps(good))
    shouty["shared"]["hexInput"] = 'input[ARIA-LABEL="Hex color"]'
    assert alerts.is_valid_contract(shouty) is False

    # A per-picker key the scanner was never told about must not slip through:
    # the walk is generic so it cannot fall behind the contract shape.
    novel = json.loads(json.dumps(good))
    novel["apps"][app]["pickers"][ptype]["swatchCell"] = 'td[aria-label="Black"]'
    assert alerts.is_valid_contract(novel) is False
    assert alerts.locale_dependent_selectors(novel) == [f'{app}.{ptype}.swatchCell: td[aria-label="Black"]']

    # aria-label is not the only translated attribute Google puts on these
    # nodes: the swatch cells carry data-tooltip and the inner swatch carries
    # title, both of which are localized. Keep this list in step with
    # TRANSLATED_ATTR in content/__tests__/dom-contract.test.js.
    for sel in ('td[data-tooltip="Black"]', 'div[title="Black"]', 'input[placeholder="Hex"]', 'img[alt="Swatch"]'):
        other = json.loads(json.dumps(good))
        other["shared"]["swatchCell"] = sel
        assert alerts.is_valid_contract(other) is False, sel


def test_publish_gate_rejects_a_swatchSelected_the_resolver_cannot_consume():
    """Presence is not usability. clearSwatchSelection removes the class by
    taking the bare token out of the selector, so a gate-passing but
    unconsumable value (`td.x-selected`, a descendant combinator) strips nothing
    and every Brand swatch renders Google's checkmark again for every client on
    the next refresh, with nothing failing anywhere."""
    good = _good_contract()
    assert alerts.is_valid_contract(good) is True

    for bad in (
        "td.docs-material-colorpalette-cell-selected",  # tag-qualified
        ".a .b-selected",                                # descendant combinator
        ".cell-selected[aria-selected='true']",         # attribute suffix
        "docs-material-colorpalette-cell-selected",     # bare class NAME, no dot
        " ",
    ):
        c = json.loads(json.dumps(good))
        c["shared"]["swatchSelected"] = bad
        assert alerts.is_valid_contract(c) is False, bad

    # A comma-list of bare class selectors is the shape the resolver handles.
    for ok in (".x-selected", ".x-selected, .y-selected", ".a,.b"):
        c = json.loads(json.dumps(good))
        c["shared"]["swatchSelected"] = ok
        assert alerts.is_valid_contract(c) is True, ok


def test_publish_gate_requires_every_shared_resolver():
    """Dropping a resolver is shape-valid but breaks a feature silently: losing
    `sectionLabel` is exactly what shipped the Brand row unlabeled in Docs in
    0.1.4, and an English tester sees nothing wrong."""
    for key in alerts.REQUIRED_SHARED:
        missing = _good_contract()
        del missing["shared"][key]
        assert alerts.is_valid_contract(missing) is False, f"publish gate accepted a contract missing {key}"
