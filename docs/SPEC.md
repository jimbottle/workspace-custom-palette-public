# SPEC — Custom Color Palette for Google Workspace Docs, Sheets & Slides

The contract. `dom-contract` consumes the selectors recorded here; `apply-color`
executes the apply sequences recorded here. **This file is filled by the Phase 0
feasibility spike** — until the live-DOM capture is done, every selector below is
a `TODO(capture)` placeholder and MUST NOT be trusted by shipping code.

Status legend: `❓ unverified` · `🔎 captured (raw DOM saved)` · `✅ verified
(injection + apply confirmed in the live app)`.

## 1. Picker matrix

The full surface the extension must support. One contract entry per row. Phase 0
must enumerate every row that actually exists (some may merge, some may split).

| App | Picker | Opened by (`[role=button]` aria-label) | Status |
| --- | --- | --- | --- |
| Sheets | Fill color | `Fill color` | ✅ full loop proven (A1 → #1A73E8) |
| Sheets | Text color | `Text color` | 🔎 toolbar button confirmed; shared palette |
| Sheets | Border color | `#t-border` (Borders palette) → `#t-border-color` pencil | ✅ captured + apply verified live 2026-08-30 (read-back `Custom Color #fe5917`). The Borders palette CLOSES when the custom-colour dialog's OK fires (bd 9qg, 2026-09-01; seen again 2026-10-01), so a read-back must reopen it from `#t-border` first; the apply itself lands regardless |
| Docs | Text color | `Text color` (`.docs-textcolormenubutton`) | 🔎 palette + custom button identical to Sheets |
| Docs | Highlight color | `Highlight color` (`.docs-textcolormenubutton`) | 🔎 toolbar button confirmed |
| Docs | Table cell background | table toolset `#cellColorMenuButton` (mounts while a cell is selected; may sit behind `#moreButton`) | ✅ captured + inject + apply verified live 2026-08-30 |
| Docs | Table border color | table toolset `#borderColorMenuButton` (same strip) | ✅ captured + inject + apply verified live 2026-08-30 (read-back `Custom Color #fe5917`) |
| Slides | Shape fill | `Fill color: …` (`.sketchy-toolbar-color-menu-button`) | 🔎 palette + custom button confirmed |
| Slides | Text color | `Text color` (`.docs-textcolormenubutton`) | 🔎 toolbar button confirmed |
| Slides | Border / line color | `Border color: …` (`.sketchy-toolbar-color-menu-button`) | 🔎 toolbar button confirmed |
| Slides | Table cell background | the SAME `#fillColorMenuButton` / `#lineColorMenuButton` as a shape (label reads `Fill color: transparent` with a cell selected) | ✅ inject verified live 2026-08-30; covered by the Slides fill/border rows, no separate entry |
| Sheets | Data validation dropdown-chip colour | the chip's own `.docs-flatcolormenubutton` in the Data validation side panel (Data → Data validation → Dropdown → an option's colour chip) — **no toolbar button** | ✅ captured + inject + apply verified live 2026-09-01; a DIFFERENT widget, see §2b |

> Sheets fill was the **spike target** — the full inject + apply loop is proven
> here (see §3). Docs and Slides reuse the same `docs-material-colorpalette`
> swatch grid and the same `docs-customcolorpalette-add-custom-color-button`,
> which opens the same shared custom-color dialog the Sheets loop drove — so the
> apply mechanism is confirmed feasible across all three. The border/table
> rows were captured on 2026-08-30 (bd `workspace-custom-palette-7f3`), with a
> finding worth keeping: **every one of them was already receiving the Brand row
> before it had a contract entry**, because each popup carries the same classes
> as its app's fill/text picker and `closestPopupRoot` matches by class. The
> `sheets.border`, `docs.border` and `docs.tableFill` entries therefore exist
> for the MONITOR, which needs a toolbar button to click; a test pins them to
> the same `popupRoot` as their siblings so they never become a second
> injection path.
>
> The **data-validation dropdown-chip** row (added 2026-09-01, bd
> `workspace-custom-palette-gb3`) is the first that is genuinely different, and
> it breaks two assumptions the rows above share. It has **no toolbar button**,
> so the synthetic monitor cannot drive it — it is the one picker with no Tier 3
> coverage, which is why it carries Node-level apply tests
> (`content/__tests__/apply-color-chip.test.js`) that no other picker needs. And
> its custom-colour flow is a different Closure widget, declared as an
> `overrides` block on the picker entry rather than as new `shared` values.

## 1b. VERIFIED cross-app contract (captured 2026-05-29, live, dedicated monitor test account)

These are shared across Docs/Sheets/Slides and are the load-bearing resolvers.
**Detect the picker by the swatch grid / custom button — NOT the outer menu
wrapper class, which varies per app.**

| Element | Selector | Notes |
| --- | --- | --- |
| popup wrapper (Sheets) | `.goog-menu.docs-colormenuitems` | varies per app — do not key on this |
| popup wrapper (Docs) | `.goog-menu.docs-material[role="menu"]` | varies |
| **swatch cell (clickable)** | `td.docs-material-colorpalette-cell[role="gridcell"]` | `aria-label` = color name (Slides prefixes `"Theme Color "`) |
| swatch inner (color source) | `div.docs-material-colorpalette-colorswatch` | `style="background-color: rgb(...)"`, `title="<name>"` |
| section label (clone for "Brand") | `.goog-menuheader, .docs-colormenuitems-custom-header` | OPTIONAL: a section header ("Standard"/"Custom"); cloned (text → "Brand") so the injected label matches Google's style. **Docs has NO `.goog-menuheader`** — its only heading is the "CUSTOM" `div.docs-colormenuitems-custom-header` (verified live 2026-08-15; the 0.1.4 field reports were the unlabeled row blending into the grid). That class carries context-specific negative margin / fixed width, so the injector neutralizes `margin`/`width` inline on the clone. Skipped gracefully if absent — but the monitor now FAILS the run when the label isn't visible. |
| **custom-color button** | `.docs-customcolorpalette-add-custom-color-button[role="button"]` | `aria-label="Add a custom color"` — stable across all three |
| eyedropper (ignore) | `.docs-customcolorpalette-eyedropper-button` | `"Pick a custom color"` |
| **custom dialog** | `.docs-material-gm-dialog.color-dialog` | the WRAPPER (verified 2026-05-29): hex/RGB inputs live in its `.docs-material-gm-dialog-content` child and OK lives in its `.docs-material-gm-dialog-buttons` footer — both are siblings, so resolvers must scope to the wrapper, not the content div |
| **hex input** | `input.docs-material-hex-input` | the class is unique inside the dialog (verified live 2026-08-15) and locale-independent; the old `[aria-label="Hex color"]` qualifier broke non-English UIs |
| RGBA inputs | `input.docs-material-rgba-{red,green,blue}-input` | verified live 2026-08-15. **Replaced the `[aria-label="R"/"G"/"B"]` form**, which only matched an English UI (bug `workspace-custom-palette-7as`). `apply-color` still caps the RGB-readback poll at 600ms so a miss can't stall apply. |
| **OK / confirm** | `div[role="button"].docs-material-gm-dialog-call-to-action-button` | green button |
| Cancel | `div[role="button"].docs-material-button-hairline-primary` | |

**CRITICAL interaction note:** plain `element.click()` does NOT open Google's
toolbar menus or commit its Material buttons. A full pointer/mouse event
sequence is required: `pointerover → pointerdown → mousedown → pointerup →
mouseup → click` dispatched at the element center. The injector and apply-color
modules must use this, not `.click()`.

**EVERY selector in the contract must be locale-independent.** Ids and class
names are identical in every UI language; visible text and `aria-label` are not.
Keying on an English `aria-label` silently breaks the apply path for non-English
users (bug `workspace-custom-palette-7as`, prompted by a Danish reporter), and
the failure is invisible to us because injection is class-based and still works.
A unit test (`content/__tests__/dom-contract.test.js`) now fails the build if any
contract selector contains an `aria-label` match.

Per-app toolbar buttons (open the picker) — **all id-based, verified live
2026-08-15**: Docs `#textColorButton` / `#bgColorButton`; Slides
`#fillColorMenuButton` / `#lineColorMenuButton` / `#textColorButton`; Sheets
`#t-cell-color` / `#t-text-color`. **Border and table pickers, verified live
2026-08-30**: Sheets `#t-border-color` (inside the `#t-border` palette); Docs
`#cellColorMenuButton` / `#borderColorMenuButton` (the table toolset, present
only while a table cell is selected, in `.docs-toolbar-more-toolbar`, behind
`#moreButton` when the toolbar is too narrow); Slides table cells reuse
`#fillColorMenuButton` / `#lineColorMenuButton`.

- Sheets: `#t-cell-color` (Fill), `#t-text-color` (Text). **Match by the stable id
  ALONE — not aria-label, not role.** Sheets STRIPS `aria-label`/`data-tooltip`
  off the color button while its picker is open (verified live 2026-05-29: the
  expanded `#t-cell-color` carries only `aria-expanded="true"`, no label). The id
  is unique and present open + closed, so it's the one reliable hook; keying on
  any attribute that could also be stripped on open (we don't assume `role`
  survives) risks the same recurrence. An `[aria-label="Fill color"]` selector
  matches only the *closed* button and
  `findExpandedColorButton` would return null, breaking the reopen step that the
  Sheets apply relies on (bug `workspace-custom-palette-fov`). The id is present
  in both states.
- Docs: `#textColorButton` (Text) / `#bgColorButton` (Highlight) — both carry
  `.docs-textcolormenubutton`, so the id is what distinguishes them.
- Slides: `#fillColorMenuButton` (Fill) / `#lineColorMenuButton` (Border) /
  `#textColorButton` (Text). Slides' fill label also carries state
  (`aria-label="Fill color: transparent"`), another reason the id wins.
  **Slides color buttons are hidden until a shape/text object is selected**
  (Tab from the canvas selects the first object).

## 2. Selector contract (per picker)

For each matrix row, capture these. Prefer stable, semantic hooks — **element
`id` first, then a semantic class, then `data-*`/jsname** — over generated class
names, which churn. **Never `aria-label` or any other translated text**: it
reads as the most semantic hook available and is the trap this project already
fell into (§1b). Google's editors ship an `id` on every color toolbar button and
a class on every dialog input, so a locale-independent hook has always existed.

```jsonc
// selectors.json shape (per app → per picker-type)
{
  "<app>": {
    "<picker-type>": {
      "popupRoot":        "TODO(capture)", // the picker popup container that mounts on open
      "popupOpenSignal":  "TODO(capture)", // how we know THIS picker (not another popup) opened
      "swatchGrid":       "TODO(capture)", // the container holding the built-in color swatches
      "swatchCell":       "TODO(capture)", // a single built-in swatch (clone this for Brand swatches)
      "swatchValueAttr":  "TODO(capture)", // where a swatch's color lives (style bg? data-attr? aria?)
      "customColorButton":"TODO(capture)", // the "custom" / "+" entry that opens the hex dialog
      "customDialogRoot": "TODO(capture)", // the custom-color dialog container
      "hexInput":         "TODO(capture)", // the hex text input inside the custom dialog
      "hexConfirm":       "TODO(capture)"  // the OK/apply button that commits the custom color
    }
  }
}
```

### Sheets · Fill color  — ✅ verified (full loop)
> **HISTORICAL CAPTURE (2026-05-29), superseded by §1b.** Kept for the shape of
> a capture, not as selectors to copy: the `aria-label` forms below were
> replaced on 2026-08-15 because they only match an English UI (bug
> `workspace-custom-palette-7as`). Take live selectors from §1b or
> `config/selectors.default.json`, never from this block.

> **popupRoot is app-specific — do NOT bind detection to it.** The per-app
> wrapper class below differs across apps (Docs/Slides use other wrappers). The
> authoritative cross-app detection signal is the swatch grid / custom-color
> button per §1b; `dom-contract.isPickerPopup` keys on those, never on
> `docs-colormenuitems`. `popupRoot` is recorded here only for reference.
- popupRoot: `.goog-menu.docs-colormenuitems` (`role="menu"`, ~243×427px, 41 swatches)
- popupOpenSignal: presence of `.docs-customcolorpalette-add-custom-color-button` inside a freshly-visible menu
- swatchGrid: the `docs-material-colorpalette` table (cells are `td.docs-material-colorpalette-cell`)
- swatchCell: `td.docs-material-colorpalette-cell[role="gridcell"]` (clickable; `aria-label`=color name)
- swatchValueAttr: inner `div.docs-material-colorpalette-colorswatch` → `style.backgroundColor` (and `title`)
- customColorButton: `.docs-customcolorpalette-add-custom-color-button[role="button"]`
  (the `aria-label="Add a custom color"` qualifier this capture recorded is
  English-only and was dropped from the contract)
- customDialogRoot: `.docs-material-gm-dialog-content`
- hexInput: `input.docs-material-hex-input` (was `[aria-label="Hex color"]`)
- hexConfirm: `div[role="button"].docs-material-gm-dialog-call-to-action-button`

See §1b for the cross-app contract these generalize to. The border and table
rows were captured the same way on 2026-08-30 (see the matrix in §1).

## 2b. Picker-specific widget overrides (`overrides`)

Almost every picker uses one custom-colour widget: **"add a custom color" → a
`docs-material-gm-dialog` with hex/RGB fields → a call-to-action OK**. Those
selectors live once, in `shared`.

The Sheets data-validation dropdown-chip picker does not. It reuses the
`docs-material-colorpalette` swatch markup — which is why *injection* needed no
change and the Brand row was already rendering there before this was fixed —
but its custom-colour flow is its own widget end to end. So a picker entry may
carry an `overrides` block naming the parts that differ; anything it omits
falls back to `shared`.

| contract key | shared widget | dropdown-chip widget |
| --- | --- | --- |
| `popupRoot` | `.goog-menu.docs-colormenuitems` | `.goog-menu.previewableColorMenu` (`role="dialog"`) |
| `customColorButton` | `.docs-customcolorpalette-add-custom-color-button` | `.previewableColorMenuCustomizeButton` ("Customize") |
| `customDialog` | `.docs-material-gm-dialog.color-dialog` | `.goog-menu.previewableCustomColorMenu` |
| `okButton` | `…-gm-dialog-call-to-action-button` | `.previewableCustomColorMenuOkayButton` |
| `sectionLabel` | `.goog-menuheader`, `.docs-colormenuitems-custom-header` | `.previewableColorMenuHeader` (added to the shared comma-list) |
| `hexInput`, R/G/B, `swatchCell`, `swatchInner` | — | **identical**, which is why only the flow around them differs |

`dom-contract.customColorVariants()` turns `shared` plus every `overrides` block
into a list of widget specs, and `findCustomColorEntry(doc)` picks the one whose
entry-point button is **visible right now**. The rest of the flow is scoped to
that resolved variant, so no caller has to know which picker is open. Overrides
are matched before the shared default, so a specific widget always wins.

Three properties of this widget are load-bearing, and each one applies the
**wrong colour silently** rather than failing loudly if ignored:

1. **`appliesOnOk: true`.** Its OK is *not* `isTrusted`-gated: a synthetic click
   applies the colour directly (verified live). This is not an optimization —
   the register-then-reopen path used everywhere else is *impossible* here,
   because its CUSTOM COLORS swatches carry no `aria-label` (so `findSwatchByHex`
   can never match one) and there is no toolbar button to reopen the picker with.
2. **The dialog is tabbed (Text / Background) and remembers the last tab across
   opens.** A brand swatch means *background* — that is what the picker's own
   grid swatches set — so the flow selects the Background tab before writing the
   hex. The tab is identified by **position** (`tabIndex: 1`), because the two
   tabs differ only in generated Closure ids (`i1sfa:17e`) and their visible
   text, and keying on text is the locale trap of §1b. A positional miss is
   treated as "leave the tab alone", never as an apply failure.
3. **Document order does not track the selected tab.** The dialog holds one
   hex/RGB trio per tab and only the active tab's is laid out — and the panels
   are in the *opposite* order to the tabs. `findHexInput` and `readDialogRgb`
   are therefore visible-filtered; an unfiltered `querySelector` writes into an
   invisible field and OK commits the stale colour with nothing throwing.

Both grids in this picker render 16 cells, so `findMainSwatchCells` resolves the
tie by document order (COLORS first, CUSTOM COLORS second). A test pins that.

## 3. Custom-color apply sequence

The architecture commitment: we drive Google's own "add custom color → set hex →
confirm" flow rather than reimplementing the apply handler. Record the exact
ordered, observable steps per app — confirm the steps are identical across
picker-types within an app, or note where they diverge.

```
Sheets fill — ✅ VERIFIED 2026-05-29 (A1 filled #1A73E8)
1. (precondition) a cell/range is selected (A1 was selected)
2. open fill picker:  dispatch pointer-event sequence on #t-cell-color
                      (captured as [aria-label="Fill color"]; id per §1b)
                      → .docs-colormenuitems menu present
3. open custom dialog: dispatch pointer-event sequence on
                      .docs-customcolorpalette-add-custom-color-button
                      → .docs-material-gm-dialog-content present
4. set hex:           hexInput.focus();
                      nativeValueSetter.call(hexInput, '#34A853');
                      hexInput.dispatchEvent(new Event('input',{bubbles:true}));
                      hexInput.dispatchEvent(keydown Enter); + keyup Enter;
                      → CONFIRMED: R/G/B fields update (e.g. → 52/168/83) only
                        after the Enter KEYDOWN. The `input` event ALONE does
                        NOT recompute the color (corrected from first capture).
                        The dialog STAYS OPEN after keydown/keyup Enter.
5. confirm:           dispatch pointer-event sequence on
                      .docs-material-gm-dialog-call-to-action-button (OK)
                      → dialog closes, the cell visibly fills the color
                      (screenshot proof: A1 → #1A73E8, then → #34A853).
6. (verify)           visual confirm; for the monitor, read-back method is TBD
                      in Phase 5 (canvas grid — likely re-open picker + read the
                      native "Custom" row, or read the toolbar indicator).
```

Resolved de-risking questions:
- **Does setting `hexInput.value` programmatically commit?** The `input` event
  alone does **not** — the hex field only recomputes RGB on an Enter **keydown**
  (keydown+keyup). **Do NOT send `keypress` Enter** — that closes the dialog
  WITHOUT applying (acts like Cancel). Sequence that works: native value setter
  → `input` → keydown/keyup Enter → (settle) → synthetic-click OK.
- **Plain `.click()` on menu/buttons?** ✗ does NOT work — Google needs the full
  `pointerover/pointerdown/mousedown/pointerup/mouseup/click` sequence. This is
  the single biggest gotcha; both injector and apply-color must use it.
- **Hidden cached dialog.** After first use Google keeps a hidden
  `.docs-material-gm-dialog-content` in the DOM; resolvers must select the
  VISIBLE one (`offsetParent !== null`) or the apply targets the wrong input.

### Sheets apply — `isTrusted` gate (resolved Phase 5, verified live)

Sheets gates the custom-color **dialog OK → apply-to-cell** on `event.isTrusted`.
An extension can't produce trusted events, so a synthetic OK only **registers**
the color (it lands in the picker's CUSTOM row) without applying it. Docs/Slides
apply on OK; Sheets does not. **But** synthetic clicks on swatches (built-in AND
custom-row) are NOT `isTrusted`-gated and apply fine. So `apply-color` uses a
uniform flow: fast-path click if the hex is already a custom swatch; else
dialog-register → reopen the picker (toolbar button captured at inject time via
`findExpandedColorButton`) → click the now-registered custom swatch. apply-color
resolves the custom button + swatches at the **visible document level**, because
the observed picker popup can be a sub-container that excludes the custom button
(Sheets). Confirmed by the synthetic monitor: 4/4 green across all apps.

Still open (NOT feasibility blockers — Phase 1/5 work):
- **Apply-with-no-selection** behavior per app (plan risk — confirm no surprise).
- **Read-back** method for the synthetic monitor (Phase 5).
- **Slides/Docs literal apply** (only Sheets was applied end-to-end; Docs/Slides
  confirmed via shared components — verify literal apply in Phase 1).

### Step 3 is a confirmation, not the apply (2026-09-01)

The apply sequence above was built when the Sheets custom-colour dialog's OK
only REGISTERED a colour — its apply was `isTrusted`-gated — so the reopen and
swatch re-click WERE the apply, and failing them meant failing to apply.

That is no longer true on any Sheets picker that can be tested. Measured live
2026-09-01: the conditional-formatting panel picker, the border picker and the
toolbar fill picker each applied the colour on runs where step 3 could not run
at all. So step 3 now confirms rather than applies, and reports failure only on
POSITIVE EVIDENCE — the picker reopened and the colour is not in it. Three
"cannot confirm" shapes return quietly instead: no reopener, a reopen click that
`syntheticClick` refused (a zero-sized opener whose enclosing menu closed), and
a click that landed without the picker coming back.

If Google ever restores the gating, the monitor is the signal that catches it:
it reads back the applied colour, which no client-side heuristic here can do.

## 4. Config / palette schema (forward reference)

> Enterprise POLICY schema is a different thing and lives elsewhere:
> `config/managed-schema.json` is the contract Chrome reads (it is what makes
> the Admin console's "Policy for extensions" field appear at all), and
> `docs/DEPLOY.md` documents the payloads. This section covers the remote
> config service's palette/selector documents only.

```jsonc
// palette.json
[ { "name": "Brand Primary", "hex": "#1A73E8", "order": 0 }, ... ]

// selectors.json — versioned; clients & monitor report which version they run
{ "version": "<iso-date or semver>", "apps": { /* §2 shape */ } }
```

## 5. How to capture (Phase 0 runbook)

The `spike/` directory is a throwaway capture tool, not shipping code.

1. Load `spike/` as an unpacked extension in a Chrome that is **signed into the
   target Google account** (`chrome://extensions` → Developer mode → Load
   unpacked → select `spike/`).
2. Open a Sheet, select a cell, open the fill-color picker.
3. The spike logs the picker popup's `outerHTML` and a set of candidate
   selectors to the console, and copies the `outerHTML` to the clipboard.
4. Paste the captured DOM into the matching §2 block; fill in the real
   selectors; flip the row status to 🔎.
5. Re-run with the spike's injection enabled to confirm the Brand swatch mounts
   and the apply sequence applies the hex; flip the row to ✅.
6. Repeat for the remaining matrix rows (lighter — just confirm same shape).
