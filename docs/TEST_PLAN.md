# Test plan

Tier mapping for Custom Color Palette for Google Workspace Docs, Sheets & Slides, what automates which scenarios, and the
release-gate manual checks.

## Tiers

| Tier | Runs | When | Command |
| --- | --- | --- | --- |
| 1 — fast | unit tests (pure modules, fixture-driven DOM, jsdom pages) + `tsc --checkJs` | every commit (pre-commit hook) | `npm run typecheck && npm test` |
| 2 — lint + typecheck + service + monitor | ESLint, the monitor's own `tsc`, Python pure-logic + FastAPI endpoint tests, monitor unit tests | before a PR / on service change | `npm run tier2` (once: `npm run tier2:setup`) |
| 3 — extension pages, real browser | the extension's OWN pages in a real Chromium with the extension loaded (real CSS, real `chrome.storage`, real service worker) | before a release cut, and after any options/popup change | `npm run smoke:pages` |
| 3 — synthetic E2E | Playwright matrix vs live Google | scheduled + before release | `cd monitor && npm run monitor` |
| 3 — manual | the checklist below | before each release cut | human |

Tier 1 is the floor and gates every commit. Tier 2 is deliberately out of the
pre-commit hook: it spans three toolchains (Node, Python, the monitor's
TypeScript) and `.py` changes don't trigger the JS hook anyway. `npm run tier2`
chains them; the pieces are also available individually as `npm run lint`,
`npm run typecheck:monitor`, `npm run test:service` and `npm run test:monitor`.

**Tier 2 needs a one-time bootstrap** that the root `npm install` does NOT
cover, because `monitor/` and `service/` are separate toolchains and the root
`package.json` declares no workspaces: `monitor/` needs its own `npm install`
(its tests reach `@playwright/test` through `remediate.ts` → `browser.ts`), and
`service/` needs its Python deps (`fastapi`/`httpx` for the `TestClient` tests,
not just `pytest`). `npm run tier2:setup` does both, creating `service/.venv` as
`service/README.md` and `docs/DEPLOY.md` prescribe. `test:service` prefers that
venv when it exists and falls back to the ambient `python3`, so following the
documented setup and ignoring it both work.

Note the monitor's typecheck is its own command: the ROOT `npm run typecheck`
excludes `monitor/` (see `tsconfig.json`), and `npm run test:monitor` runs node
with `--experimental-strip-types`, which strips types WITHOUT checking them. So
until `typecheck:monitor` was chained here, nothing in any tier type-checked the
monitor at all - including `matrix.ts`, which carries the selector contract the
release gate depends on.

`npm run smoke:pages` exists for one reason: jsdom cannot see CSS. The
`[hidden]` failure that shipped three times running - an author `display` rule
beating the browser's `[hidden]` rule, so `hidden` did nothing on screen - was
invisible to 400+ green tests and visible instantly to a real engine. The
script loads the unpacked extension into a real Chromium (Playwright's
`launchPersistentContext`, reusing the browser already installed under
`monitor/`) and walks the settings and popup pages: the opt-in, creating,
renaming, switching, importing, the two-click Reset and Delete confirms, and
the settle-before-save rule. It **does not** open Docs, Sheets or Slides, and
it **does not** replace the mandatory manual gate below; injection into
Google's real pickers needs a signed-in account, and enterprise policy needs
the Admin console. Treat a green run as "the pages are not broken", never as
"the release is smoke-tested".

There is no separate "integration" tier. Everything fixture-driven — the
captured picker markup and the jsdom popup/options pages — runs inside Tier 1
under plain `node --test`.

## What's automated

- **Pure core** (Tier 1, `node --test`): `dom-contract` accessors +
  `findSwatchByHex`/`findExpandedColorButton`/`findCustomDialog`/`readDialogRgb`,
  `lib/config` (`isValidContract`/`pickContract`/`remoteSwatches`),
  `lib/palette` (normalize/resolve/reorder), `lib/hex`, `shared/feedback-email`
  (incl. no-PII + no-double-encode), `health-probe` predicates, `apply-color`
  invalid-hex rejection.
- **Popup / options page glue** (Tier 1, `popup/__tests__/`,
  `options/__tests__/`): the real pages mounted under jsdom against a
  controllable fake `chrome.*` (`shared/__tests__/harness/`). These cover the
  write/click/late-policy interleavings that reviews 3762-3766 found by reading
  and that nothing else in the repo could express: the harness can HOLD a
  storage write open while a second actor runs, and can make the managed read
  answer late or never — so "the policy has not arrived yet" stays testably
  distinct from "there is no policy". Each test was verified to fail against
  the pre-fix ordering before being kept.

  These are the slowest tests in Tier 1 (about 7 of its ~9s), because the
  policy cases must run against the real deadlines (`MANAGED_READ_TIMEOUT_MS`
  1500ms; the 3000ms save deadline). They are split into their own files so
  node's per-file parallelism absorbs most of the cost.
- **Locale / non-English UIs** (Tier 1,
  `content/__tests__/locale-fixture.test.js`): the fixture captured from the
  live Docs picker is **pseudo-localized** — every text node and text-bearing
  attribute rewritten by a total letter shift — and every contract resolver
  must still resolve against it, plus `injectBrandRow` must still mount a
  correctly-tooltipped Brand row. `#rrggbb` tokens are preserved on purpose
  (`findSwatchByHex` may depend on them; Google does not translate them). A
  companion test pins 0.1.6's shipped selectors and asserts they DO fail there,
  so the guard cannot rot into a no-op. The static scan in
  `dom-contract.test.js` additionally rejects any translated-attribute selector
  in either contract file **and in `monitor/src/matrix.ts`**.
  Why Tier 1 rather than a non-English monitor account: it needs no Google
  account, runs in the pre-commit hook, and fails for *every* language rather
  than the one language a test account happens to be set to.

  **Getting a real Danish UI (verified 2026-08-16).** Append BOTH parameters:
  `?hl=da&forcehl=1`. `hl` alone does NOT work - the account language wins, which
  is why an earlier attempt concluded a non-English UI was unreachable without
  changing account settings. With `forcehl=1` the editor is genuinely Danish
  (`documentElement.lang="da"`, menus "Fil/Rediger/Visning"). This is the
  reporter's exact environment and needs no second Google account, so the Tier 3
  monitor can run a non-English pass with the credentials it already has.
- **Service** (Tier 2, `pytest`): `alerts` (should_alert / dedup_key /
  build_issue / is_valid_contract) + endpoints (publish validation + gating,
  config serving, monitor-result failure→recovery).
- **End-to-end** (Tier 3, monitor): for each app × picker in the matrix — open a
  fresh doc, open the picker, assert the Brand row injected, **the "Brand"
  label visible** (an unlabeled row blends into Google's grid — the 2026-08-15
  field reports), **and the swatch's effective tooltip attributes (innermost
  `title`, plus `data-tooltip` when present) carrying the brand name** (the
  cloned-native-title bug from the same reports), click a Brand swatch, read back the applied color from the
  picker's selected swatch. 9/9 green = Sheets fill, Sheets text, Sheets
  border, Docs text, Docs table border, Docs table cell background, Slides
  shape fill, **Docs text (da)** and **Sheets fill (da)**. The three border and
  table rows were added 2026-08-30 with inject + apply verified by hand in a
  real browser; like every row they await a scheduled run with the monitor
  credentials, and their openers (`sheets-border`, `docs-table` in
  `monitor/src/check.ts`) are the first thing to read if one goes red.

  The two `(da)` legs run the same checks against a genuinely Danish UI, reached
  with `?hl=da&forcehl=1` on the document-create URL (see above; both parameters
  are required). They need no second Google account. They exist because the
  monitor is the only end-to-end signal and, English-only, it could not have
  caught 0.1.6 — an apply path broken in every language but English, which every
  tier called green. `checkId` includes the locale so a Danish leg cannot
  overwrite its English twin's result or diagnostic bundle.

  A live Danish run has been done by hand (2026-08-16, Docs and Sheets) but not
  yet through the scheduled monitor, which needs `MONITOR_GOOGLE_USER` /
  `MONITOR_GOOGLE_PASS`.

  **Locale verification fails closed on evidence, not on absence.** `runCheck`
  reads `document.documentElement.lang` and fails a run on POSITIVE evidence:
  a real language tag that disagrees with the leg's expected language (on the
  Danish legs, meaning hl/forcehl did not take; on the English legs, meaning the
  shared profile's account language changed and every English result is
  suspect), and a BLANK `lang`. The one advisory case is an unreadable page,
  because an `evaluate` that throws is a navigation race, not evidence about
  language (`monitor/src/check.ts` `localeVerdict`; the table is pinned in
  `monitor/src/__tests__/matrix.test.ts`).

  Until 2026-08-30 the English-leg and blank branches were advisory, because
  the attribute had only been observed on Docs and Sheets in Danish, and a gate
  that fails closed on an unverified attribute would turn the project's only
  authoritative breakage signal into a permanent false RED. The six values now
  exist, all read live from a real signed-in editor (bd
  `workspace-custom-palette-afb`):

  | app    | account language (English) | `?hl=da&forcehl=1` |
  | ------ | -------------------------- | ------------------ |
  | Docs   | `en` (2026-08-25)          | `da` (2026-08-16)  |
  | Sheets | `en` (2026-08-25)          | `da` (2026-08-16)  |
  | Slides | `en` (2026-08-25)          | `da` (2026-08-30)  |

  The attribute was present on every read. Two operational notes from the
  Slides capture: the parameters survive a direct navigation to
  `/d/<id>/edit?hl=da&forcehl=1` (the matrix's `localizedUrl` shape) but NOT a
  click-through from the app's home list, which strips them and reopens the
  file in the account language; and an earlier note claiming "the hl=da URL
  parameter does not work on Slides" had only tried `hl` without `forcehl=1`.
  If a future run reports a blank or mismatched `lang` on a leg that opened
  fine, re-check this table before loosening the gate.

## Enterprise policy and multiple palettes: the assertion reference (0.2.0)

> **Running the 0.2.0 release test? Do not use this section.** The executable
> script is `docs/TESTING-0.2.0.md` — sequential DO / EXPECT / IF NOT, driven
> entirely through the Google Admin console UI, because a release test has to
> exercise the production delivery path. This section is the reference for
> WHAT must be true; that one is the reference for HOW to make it happen.

This used to carry its own step-by-step walkthrough, driven by
`sudo dev/test-policy.sh`. It was removed on 2026-08-24 rather than corrected,
for two reasons that are worth keeping:

- **A human never runs a script to test this** (owner ruling, 2026-08-22). The
  local plist mechanism simulates what Google's servers deliver; real policy
  arrives from the Admin console to a managed account, and a green local run
  proves nothing about the path users are on. `dev/test-policy.sh` and the
  macOS recipe in `docs/DEPLOY.md` are developer automation only.
- **Two walkthroughs is how they drift.** This one had gone stale against four
  behavior changes at once while still reading as authoritative. One executable
  script, one assertion reference.

Automated coverage is deliberately deep here — jsdom cases across the popup and
options pages, on top of the pure decision tables — but **none of it proves
Chrome accepts the schema or delivers the policy**, because
`chrome.storage.managed` has no test double Chrome itself honours. That is the
gap the console walkthrough closes, and the same gap that let 0.1.7 ship a
managed palette nobody had ever seen a real policy drive.

### What must be true

**Delivery.** The schema loads (a malformed `config/managed-schema.json`
prevents the extension from loading at all, so check this before anything
else). `chrome://policy` lists the extension's section, and after a console
Save shows the keys with `Source: Cloud` and `Status: OK`. Policy is delivered
**per extension ID**: the ID on the `chrome://extensions` card and the ID on
the console entry must match, or nothing arrives and nothing says why.

**Install source cannot matter.** Force install and Allow install deliver the
same payload; the extension has no way to tell them apart, pinned by a static
scan over every packaged file. Allow install is confirmed in the field
(2026-08-24). Force install end to end is still unverified — bd
`workspace-custom-palette-ddw` has the reason and the two ways to close it.

**Unlocked policy = the colors you start FROM.**
- An org palette that first appears BECOMES the active palette, but only when
  the palette it would displace was never customized (identical to the
  packaged defaults). Anything the user edited is never displaced. Decided
  2026-08-24, bd `workspace-custom-palette-kyy`.
- The push fires ONCE per episode. A user who switches away afterwards stays
  where they put themselves; a customized user consumes the episode without
  being moved, so a later reset cannot yank them.
- Editing the org palette keeps a personal copy and detaches from admin
  updates. Editing a personal palette back to exactly the org's colors
  re-attaches instead of storing a redundant copy — including after arriving
  via the switcher.

**Locked policy (`paletteLocked`) = uneditable, not exclusive.** The org
palette is what a user starts on and cannot edit, in both hosts, with the
mutating controls hidden. It does NOT forbid personal colors: a user may
create and switch to their own and edit those freely (bd
`workspace-custom-palette-cv2`). Enforcement is reversible and
non-destructive — a palette saved before the lock survives it untouched and
applies again when it lifts. A lock with no palette to enforce is ignored.
Toggling the policy applies live, with no restart, reaching surfaces already
on screen.

**Several org palettes.** `palettes` (plural) publishes named ones; staff start
on the first. The ACTIVE POINTER decides which is in force, everywhere — the
pickers, both hosts, and the toolbar icon. A cached org tier is only correct
for the pointer it was computed with; re-derive it whenever the pointer moves
(this regressed once, bd `workspace-custom-palette-5j1`).

**The switcher.** The **Multiple palettes** opt-in defaults ON and is the ONLY
thing that shows the chooser — an org palette does not force it open, locked or
not (owner ruling, 2026-08-24, retiring the 2026-08-22 rule). Turning it off
SUPPRESSES palettes from the chooser and never deletes them; turning it back on
restores the list exactly. Never visible with fewer than two entries.

**Degenerate policies must not brick anyone.** An entry with a blank name or an
unusable hex is skipped, not fatal; a policy with nothing usable in it means
the organization published nothing, so the user's own colors apply, editable,
with no org wording. These states look identical to "the policy never arrived",
so judge them by the Policy value column on `chrome://policy`, not by the
screen.

**Nothing is machine-wide.** Policy is scoped to the managed account; a
personal profile on the same machine is unaffected. The key → area → scope
table is in `docs/DEPLOY.md`.

**Teardown.** Clearing the console field returns `chrome://policy` to "No
policies set" for the extension, the org entries leave the selector, and the
user's own colors come back editable.


## Manual release-gate checklist (MANDATORY — enforced by `npm run package`)

**No package for distribution may be built before this passes in all THREE
apps.** This is not advisory: `dev/package.sh` refuses to build the zip unless
the check is confirmed (`SMOKE_CHECKED=1` or the interactive prompt). Added
after 0.1.4 shipped with the Brand row unlabeled in Docs — unit tests and the
monitor were green while the user-visible feature was effectively invisible.
"Present" below means present **as a user sees it**: the "Brand" label is
visible above the row (an unlabeled row blends into Google's grid and counts as
a FAIL), and hovering a brand swatch shows the brand color's name, not a cloned
native name ("Black"/"Sort"/...).

Also check the Brand row carries **no check marks**. A brand swatch is never the
"currently applied" colour, so any check mark on one is cloned state, not truth
(bd `workspace-custom-palette-auq`). Check this in the **Sheets text picker
specifically**: it only appears when the clone source is the active colour, so
Docs and Slides can look perfectly clean while Sheets is wrong.

**Close every side panel first, and check the toolbar is not collapsed.** Google
collapses toolbar buttons into an overflow (`⋮` / `#moreButton`) when the
viewport is narrow, and an open Gemini or Docs side panel is enough to do it:
measured 2026-09-01, an open Gemini panel took a 1800px window down to a 1245px
viewport and left `#t-cell-color` and `#t-border` in the overflow with ZERO
client rects. A collapsed button still reports `aria-expanded="true"`, so a
picker opened from it looks healthy while `findExpandedColorButton` (which
requires a laid-out element) returns null, `reopen` is null, and every cold
Sheets apply false-banners. That is an artifact of the window, not a defect —
but it is indistinguishable from one in the results, and it cost a full
diagnosis session. Docs' table toolset legitimately lives behind `#moreButton`
(open it first); the Sheets fill/text/border buttons should NOT be there.

**After reloading the extension, reload every open editor tab before testing
it, and do not infer "the content script is not running" from anything but the
Brand row itself.** Reloading or re-unpacking the extension orphans the content
script in every open Docs/Sheets/Slides tab: the Brand row stays in the DOM as
inert markup, `chrome.storage.onChanged` listeners are gone, nothing new
injects, and a page load is the only cure. Measured 2026-09-01 this produced two
separate false "no refresh" / "no injection" alarms in one session. And do not
reach for `performance.getEntriesByType("resource")` to detect the content
script: it never surfaces content-script module loads to the page, so it
answers "not running" whether or not the script ran — it cost several turns of
"cannot test" against a build that was injecting fine. The ground truth is
`[data-brand-palette-row]` with a picker open, nothing else.

**Test each colour COLD.** `applyColor`'s step-1 fast path clicks an existing
custom swatch, so the second use of any colour in a document never exercises
registration, the reopen, or the swatch re-click. A document that has
accumulated custom colours will pass a matrix that a fresh one fails — which is
exactly how the Sheets border false-banner (bd `workspace-custom-palette-9qg`)
hid. Use a brand-new document per app, and a colour not yet used in it.

Load the packed/unpacked extension in a real Chrome signed into a normal Google
account, then:

- [ ] **Docs**: select text → Text color → Brand label + row present → tooltips
      show brand names → click a brand color → text takes that color.
- [ ] **Sheets**: select a cell → Fill color → Brand label + row present →
      tooltips show brand names → click a brand color → the cell fills that
      color. Repeat for Text color.
- [ ] **Slides**: select a shape → Fill color → Brand label + row present →
      tooltips show brand names → click a brand color → the shape fills that
      color.
- [ ] **A swatch named by its hex, and one of Google's own colours** (0.2.3,
      bd `workspace-custom-palette-ox4`). Use a palette holding a swatch whose
      NAME is its hex (import a bare `#1A73E8` line) and one that equals a
      colour in Google's main grid (`#FF0000` or `#000000`). In each app, each
      applies, no "couldn't be applied" message appears, and the picker closes.
      The default palette has neither kind, and the monitor clicks the default
      palette, so this is the only tier that covers them. On 0.2.2 the first
      applied nothing, silently, and the second applied and then bannered on
      every click.
- [ ] **Options**: edit the palette (add/rename/reorder/remove + hex validation),
      Save → reopen a picker → the change shows with no reload. **Import** with
      Multiple palettes on asks for a name (Enter accepts the suggestion,
      Cancel creates nothing), then creates a NEW palette and switches to it,
      leaving the one you were on untouched. The button is there with an
      enforced organization palette on screen too. Opening **Import / export** shows the palette
      on screen in the box; **Copy current palette** puts it on the clipboard
      (paste it somewhere to check: no automated tier exercises the real
      clipboard); **Import as new palette** on that untouched text is refused with
      "Nothing new to import".
- [ ] **Multiple palettes** (0.2.0): the opt-in is already checked on a fresh
      profile. Create a second palette, rename it, switch between them — an
      already-open Doc tab and the toolbar icon both follow on the next picker
      open, with no reload. Delete it (two clicks — the first arms). Uncheck the
      opt-in: the chooser goes away and every palette is still there when you
      re-check it.
- [ ] **Saving is on settle, not per keystroke** (0.2.0): typing a hex in the
      popup writes nothing mid-value; pressing Enter, or leaving the field, or
      dismissing the popup, saves what you typed. A half-typed hex must never
      reach storage or the undo history.
- [ ] **Enterprise policy** (0.2.0), if this release touches it: the console
      walkthrough in `docs/TESTING-0.2.0.md` sections C–F, in a managed profile.
      Not optional for a release that changes policy handling, and not
      substitutable by `npm run smoke:pages`, which never opens a Google surface
      or touches policy.
- [ ] **Popup**: there is **no on/off toggle** on any surface any more (the
      `enabled` mechanism is still honored by the content script and the worker
      un-hides a stored `false` once — see `FUTURE_IMPROVEMENTS.md`); "Edit palette"
      opens options; "Send feedback" opens the feedback page. If the release
      has an `UPDATE_NOTES` entry (`lib/update-note.js`): reload the unpacked
      extension (fires `onInstalled` with reason `update`) → the toolbar badge
      shows NEW → opening the popup clears the badge and shows the notice →
      "Got it" dismisses it for good.
- [ ] **Feedback page**: all four transports (Gmail / Outlook / Default mail /
      Copy address) open a correctly pre-filled compose; the footer shows only
      version/browser/OS, with bug reports adding a "Browser language" line and
      an "App" line (only when apps are ticked) below it. The bug template is
      seeded inside the message box (editable), never prepended untouched
      above the user's text, and ends with a prompt for the Google editor's
      language (that prompt is the only place the EDITOR's language can come
      from - the footer line above it is the browser's).
- [ ] **No network**: with no `CONFIG_BASE`, confirm via DevTools Network that
      the extension makes no requests off the page.

## Manual-only cases (can't be synthetic-automated)

- Google sign-in MFA friction for the monitor's test account (one-time `npm run
  auth`).
- A brand-new picker variant or a Google DOM change the contract doesn't cover
  (the monitor catches the break; capturing the new selectors is manual — see
  `spike/` + `docs/SPEC.md`).
- Real Web Store review behavior and the enterprise force-install policy path.
- **Anything CSS can silently defeat, `[hidden]` above all.** jsdom does not
  apply stylesheets to hidden semantics, so `el.hidden = true` reads as hidden
  in every jsdom test even when an author `display` rule beats the UA's
  `[hidden] { display: none }` on screen — which is exactly what shipped an
  always-visible "your organization provides these colors" note and an
  unhideable palette switcher past 400+ green tests and three field reports.
  Tier 1 now pins the `[hidden] { display: none !important; }` guard on every
  page statically (`options/__tests__/options-glue.test.js`), but a static
  check only proves the guard is present; whether the UI actually hides is a
  human-eyes case. Give the no-policy settings and popup screens a deliberate
  look on every release.

## DOM-harness tests

`injectBrandRow` (idempotency, cell count/order, mount position, empty palette)
and the health-probe banner (`assertInjected` decision + Shadow-DOM banner,
`showBanner` idempotency) are covered by jsdom fixture tests in
`content/__tests__/dom-harness.test.js` (Tier 1). They exercise
the injection/assertion/banner paths that don't need layout; the visible-filter
resolvers stay shim-tested + monitor-covered.
