# Changelog

All notable changes to Custom Color Palette for Google Workspace Docs, Sheets & Slides. Format: [Keep a Changelog];
this project follows [Semantic Versioning]. Audience: maintainers.

## [0.2.6] — 2026-11-19

### Added

- **A setup-help line under the Administrators row on Settings** (owner
  request, 2026-11-19). `options/options.html` gains `p#admin-help` after the
  Administrators section: a link to the published administrator guide
  (`#admin-guide`, https://raylytics.io/custom-color-palette/admin, the URL
  already in `STORE_LISTING.md`) and a `mailto:` to the feedback inbox
  (`#admin-contact`), with an offer of free help setting up an organization
  palette. It is a sibling of the row, not a flex child, so it spans the page
  under the row. Both are plain links: no script, no request until the admin
  clicks. Tests: `options/__tests__/options-glue.test.js` pins the guide URL
  and holds the address equal to `INBOX` in `shared/feedback-email.js`;
  `dev/pages-smoke.mjs` checks the line is laid out under the row.
- **The policy builder opens with a link to the same guide.**
  `options/policy-builder.html` gains `p#guide-line` (`a#guide`) above the
  intro paragraph, so an administrator who lands on the builder cold meets
  the walkthrough before the form. It works when the builder is opened as a
  file too, being a plain link. `options/__tests__/policy-builder.test.js`
  holds its address equal to `#admin-guide` on Settings; `dev/pages-smoke.mjs`
  checks it is visible above the form.

### Changed

- **`docs/ADMIN_GUIDE.md` offers setup help in general, not the builder as
  files** (owner, 2026-11-19). Step 1 dropped the parenthetical about being
  sent `policy-builder.html` and gained a line inviting administrators to
  email for help, free, matching the new Settings line and the wording asked
  of the site's admin page (bd `raylytics-site-nm9`).

## [0.2.5] — 2026-11-12

### Fixed

- **A palette with more than ten colors no longer overflows the Slides fill
  picker** (bd `workspace-custom-palette-8j9`; found 2026-11-12 with a
  12-color field palette). `injectBrandRow` in `content/injector.js` put
  every swatch in one `<tr>`, which made the palette table wider than
  Google's ten-cell rows. Sheets and Docs let the menu grow, but the Slides
  fill menu has a fixed width (table 265px in a 241px `goog-menu`,
  `overflow-x: auto`), so the last swatches were clipped behind a horizontal
  scrollbar. The Brand swatches now wrap at the sample row's cell count:
  eleven to twenty colors make two rows, more make three, each `<tr>`
  carrying `MARK`, mounted consecutively under the one "Brand" label. A
  palette of ten or fewer is unchanged, as is a div palette (no table row to
  measure). This also changes Sheets and Docs for palettes over ten, from
  one wide row to wrapped rows. Nothing else assumed a single row:
  idempotency, removal (`refreshBrandRows`) and `isOwnCell` all match on
  `MARK`. Test: one new case in `content/__tests__/dom-harness.test.js`.
  `manifest.json` and `package.json` move to 0.2.5.

### Changed

- **0.2.3 is marked as never published.** It was tagged and built on
  2026-11-12 but not uploaded to the Chrome Web Store; its fixes reached
  users in 0.2.4. Noted under its heading here and in `RELEASE_NOTES.md`,
  and on the `v0.2.3` GitHub Release. The tag stays: tags are not rewritten.

## [0.2.4] — 2026-11-12

### Changed

- **Import asks for the new palette's name, and stays available while an
  organization palette is on screen** (owner, 2026-11-12). With Multiple
  palettes on, `importText` in `options/options.js` no longer creates a
  palette named "Imported" on the click: it validates the box
  (`readImportable`), then reveals an inline name step (`#import-name-row`
  in `options/options.html`; `openImportName`, `createImportedPalette`).
  The field is prefilled with `importedPaletteName()` and selected; Enter or
  "Create palette" creates and switches, Escape or Cancel creates nothing, a
  blank name falls back to the suggestion. Inline rather than a dialog, like
  rename. The button reads "Import as new palette" with the opt-in on and
  "Import from box" with it off (`renderImportControls`), and a full list
  (`MAX_PALETTES`) is refused before the name is asked for.
  `applyLockAffordances` used to hide Import whenever the palette on screen
  was enforced, which left a locked user with an Import / export section
  that could not import and did not say why. An import-as-new never writes
  the organization's palette, so Import is now hidden only when the opt-in
  is off AND the palette on screen is enforced; this reverses the earlier
  "switch to a palette of your own first" rule recorded in `importText`.
  With the opt-in off the behavior is unchanged. A confirmed name step
  creates once: `createImportedPalette` ignores a second confirm while the
  first is in flight (`importing`) and a held Enter (`ev.repeat`), which
  otherwise left a stored palette that no list pointed at (roborev 7244).
  Tests: eight new or
  changed cases in `options/__tests__/options-glue.test.js` and
  `options-locked.test.js`; `dev/pages-smoke.mjs` B6e drives the name step
  in a real Chromium. `manifest.json` and `package.json` move to 0.2.4.

## [0.2.3] — 2026-11-12

Tagged and built, never uploaded to the Chrome Web Store. Store users received
these changes in 0.2.4.

### Fixed

- **"Copy current palette" copies to the clipboard, and the import/export box
  shows the palette on screen** (owner, 2026-11-11; bd `workspace-custom-palette-8jc`).
  `exportText` in `options/options.js` only filled the textarea while the
  button said Copy and the status said Copied; it now also calls
  `navigator.clipboard.writeText` (a click is a user gesture, so no new
  permission) and, if the clipboard refuses, selects the text and says so
  instead of claiming a copy. The box used to sit empty behind a placeholder
  of two example colors; opening the section (`details#io`, new id) now
  fills it from `editor.getWorking()` through `showPaletteInBox`, which
  leaves alone any text the user typed or pasted (`boxAutoText` tracks what
  the page put there). Because the box is no longer empty by default,
  `importText` refuses text the page itself wrote (`box.value ===
  boxAutoText`) as well as a list identical to the palette on screen; either
  would otherwise create a duplicate palette named "Imported", and a preview
  gone stale after a row edit would also discard that edit. An open preview
  is refreshed by `refreshOpenPreview` when `presentPalette` or `applyPolicy`
  puts a different palette on screen (roborev 7186). Tests: six
  cases in `options/__tests__/options-glue.test.js`. The clipboard write
  itself is not exercised in a real browser by any tier.

- **A Brand click no longer fails or false-banners for two kinds of healthy
  swatch** (field report 2026-11-11, 0.2.2, Sheets; bd
  `workspace-custom-palette-ox4`). Both come from a Brand cell being a clone
  of a palette cell, so it matches the contract's `swatchCell`.
  - *A swatch named by its hex.* `parsePaletteText` names a bare `#1A73E8`
    line `#1A73E8`, so the cell's label is `Brand: #1A73E8` and
    `findSwatchByHex` (`content/dom-contract.js`) took it for a registered
    custom swatch. `applyColor`'s fast path then clicked the cell the user had
    just clicked, re-entering itself until the stack overflowed: no colour,
    and no banner either, because the `RangeError` is thrown inside an event
    listener and never rejects `applyColor` (seen live on the store 0.2.2
    build, 2026-11-11). `findSwatchByHex` now skips cells inside our own row. The
    row markers `MARK`/`LABEL_MARK` moved to a leaf module, `content/marks.js`,
    so `dom-contract.js` can read them; `injector.js` re-exports them.
  - *A hex equal to one of Google's own colours.* Google adds no CUSTOM swatch
    for a colour its main grid already has (verified live in Sheets, Chrome
    157, with `#000000` and `#ff0000`) and labels that grid by name, so the
    dialog applied the colour and step 3's confirmation then threw "missing
    from the reopened picker" on every click, leaving the picker open
    (reproduced live on the store 0.2.2 build with a `#FF0000` swatch: cell
    filled, banner shown; this is the case that matches the report). New
    `findBuiltinSwatchByColor` matches a visible main-grid cell on the painted
    colour of `swatchInner` (locale-independent) and `applyColor` step 1b
    clicks it without opening the dialog. Shared widget only
    (`variantIsShared`): the dropdown-chip picker's cells are colour pairs.
    `cssColorToHex` in `lib/hex.js` reads the computed colour and treats a
    transparent one as no colour, not black.
  Tests: `content/__tests__/apply-color-builtin.test.js`,
  `lib/__tests__/hex.test.js`, and a case in
  `content/__tests__/apply-color-chip.test.js` pinning that the chip picker
  never takes the built-in shortcut. Not yet covered by the monitor, whose palette
  has no built-in hex. `docs/SPEC.md` records both lookups.

### Added

- **`docs/TESTING-0.2.3.md`, the release-test script for this version.** It
  adds ten rows for the two swatch kinds the apply fix covers (named by its
  hex; equal to a colour in Google's main grid) across Sheets, Docs and
  Slides, including the dropdown-chip picker where the built-in shortcut
  must not be taken, reuses the twelve-row matrix of
  `docs/TESTING-0.2.2.md` on the default palette, and lists the Settings
  clipboard check only a person can do. Run 1 records the ten new rows
  10/10 and the standing matrix 12/12 on 588ba09.

- **`scripts/release.sh` rolls the early version bump instead of refusing
  it.** The version is bumped in the first commit after a release and the
  changelog heading reads `[x.y.z] — Unreleased` until the cut (owner ruling
  2026-11-05: the bump persists, even for the smallest patch). The script used
  to refuse any existing `## [x.y.z]` heading; it now dates that heading (or a
  bare `## [Unreleased]`) and drops an Unreleased marker from the matching
  `RELEASE_NOTES.md` heading, and refuses only a heading that is already
  dated, or an open Unreleased heading for a different version (a typo or a
  reclassified release would otherwise strand the hand-written entries
  under a git-cliff section). git-cliff still runs when neither heading
  exists.
- **The public snapshot leaves out `.github/` and the agent workflow files**
  (`PRIVATE_PATHS` in `dev/publish-public.sh`: `.claude/`, `CLAUDE.md`,
  `AGENTS.md`, `docs/HANDOFF.md`). Owner, 2026-11-05: keep repo plumbing and
  the agent workflow private; `release.yml` would also create a GitHub
  Release on the public repo per tag. `README.md` no longer links
  `CLAUDE.md`, and the docs a reader follows (`docs/DEPLOY.md`,
  `monitor/README.md`, `LAUNCH_CHECKLIST.md`) state the rule or point at a
  public file instead. Code comments and decision records still cite
  `CLAUDE.md` as provenance.

- **Public mirror is refreshed from release tags only**
  (`dev/publish-public.sh`, `LAUNCH_CHECKLIST.md` section 9). Decision
  2026-11-05 (bd `workspace-custom-palette-0mg`): the public repo
  `jimbottle/workspace-custom-palette-public` is a production snapshot that
  moves once per released version, not a second place to work. The private
  history keeps a real organization's domain and the old `.beads/` export
  (roborev 6449), so it is never pushed there. The script snapshots a
  `v<version>` tag with `git archive`, refuses a tag whose version has no
  released heading (a dated `## [x.y.z]` in `CHANGELOG.md`, or a
  `RELEASE_NOTES.md` heading; an Unreleased marker in either file refuses
  it, and a file missing at the tag is reported, not a silent exit) or that
  the public repo
  already has, fails on any hit from a scrub denylist kept outside the repo
  (`~/.config/raylytics/wcp-public-scrub.txt`; a missing list, or a grep
  that cannot read a file, fails rather than skips; binary files are
  scanned too), on `.beads/`/`.env`/Dolt data, and on any gitleaks finding
  other than `manifest.json`'s `key`, then commits as the GitHub noreply
  author with a signed annotated tag. It pushes only with `--push`.
  Exercised against a local copy of the public repo: identical snapshot
  refused, a changed one committed, tagged and pushed, a repeat refused, a
  planted denylist string blocked.

### Changed

- **Store listing links the admin setup page**
  (`STORE_LISTING.md`, FOR ORGANIZATIONS). The 2026-10-08 listing review found
  administrators had no link to setup steps. The page,
  `https://raylytics.io/custom-color-palette/admin`, is a short version of
  `docs/ADMIN_GUIDE.md` hosted by the site repo; the line goes into the
  listing on the next upload (bd `workspace-custom-palette-aqi`).

## [0.2.2] — 2026-10-08

### Changed

- **Store listing speaks to the Workspace admin, and every image says
  "Custom Color Palette"** (`STORE_LISTING.md`, `store-assets/`). A review
  of the listing found the core pitch strong but the organization story
  hard to find: the summary only said "a whole team", the section came
  third, and it never said how distribution works. The summary now names
  the org-wide push; "For organizations and IT admins" moves up to second
  and opens with force-install from the Google Admin console plus the
  managed policy; the first paragraph names table pickers too. All seven
  store images were hand-made and still read "Brand Palette", the name
  retired 2026-08-26. They are now rendered from HTML in
  `store-assets/templates/` by the new `dev/render-store-art.mjs`, framing
  fresh captures of the 0.2.2 pages; a fifth screenshot
  (`05-policy-builder.png`) shows the admin's policy builder. `npm run
  shots` is now capture then render; `store-assets/scripts/
  caption-screenshots.sh` is removed, since its plain captioned style had
  been superseded by the hand-made art and would have overwritten it. Every
  store PNG is 24-bit RGB, which clears the alpha-channel item open since
  2026-08-26. The listing also gains the 0.2.2 "What's new" entry, and its
  submission checklist now describes the 0.2.1 to 0.2.2 update.

### Fixed

- **`npm run shots` could not capture the settings or toolbar pages**
  (`dev/capture-shots.mjs`). Its `chrome.*` stub predated
  `chrome.runtime.getManifest` (the settings page shows the version) and
  `chrome.action` (the toolbar panel paints the badge), so both pages threw
  before the editor mounted and the capture timed out. The stub now
  provides both, plus an optional `chrome.storage.managed` policy so a
  target can render as a force-installed copy; page errors are logged
  instead of surfacing only as a selector timeout.

- **The monitor's read-back restores the picker's container when the
  toolbar button has lost its layout** (`monitor/src/check.ts`
  `reopenForReadback`). The Sheets Borders palette closes when the
  custom-colour dialog's OK fires (bd 9qg), which left `#t-border-color`
  un-clickable for the read-back; the swallowed click then surfaced as
  "picker did not re-open for read-back", a false RED on a row that applies
  fine. The recovery is per opener, not a re-run of `runOpener`: it reopens
  the Borders palette for `sheets-border` and the toolbar overflow for
  `docs-table`, and refuses for openers that would change the document
  (`docs-table` would insert a second table and move the caret into an
  uncoloured cell, `docs-text` would retype over the selection,
  `slides-shape` would Tab to another placeholder). Whatever the reopen hit
  is carried into the readback error instead of being swallowed. The
  `sheets-border` opener comment and the `docs/SPEC.md` row said the palette
  stays open; both now say it closes. Surfaced by the 2026-10-01 manual run
  (roborev 5227, 5228).

### Added

- **A copy button inside each hex field of the palette editor**
  (`shared/palette-editor.js` `.bpi-copy` in a new `.bpi-hex-wrap`; glyphs
  `copyIcon`/`checkIcon` in `shared/icons.js`). It writes the bare uppercase
  six digits with no `#` (`copyText()`, owner's call), swaps to a tick for
  `COPIED_MS` on success, claims nothing if the clipboard refuses, and is
  disabled while the field holds an invalid hex. It stays on read-only
  (`paletteLocked`) rows, where copying is the one useful thing left to do.
  The field keeps its 92px box: the monospace hex is a fixed seven characters,
  so the icon fits in the right padding, and `dev/pages-smoke.mjs` now checks
  in real Chromium that the button lands inside the field, clear of the text,
  without overflowing the row, on the popup, the options page and the policy
  builder. The field's padding and monospace font are scoped as
  `.bpi-hex-wrap .bpi-hex`, because the builder's own
  `input[type="text"] { padding; font: inherit }` outranked a bare `.bpi-hex`
  and ran the text under the button in a proportional font (roborev 5489). No
  new permission: an extension page may write the clipboard from a click
  without `clipboardWrite`.

- **A refresh control beside the Palette selector** on the options page
  (`options/options.html` `#refresh-palettes`, glyph from `refreshIcon` in
  `shared/icons.js`). The page read the palette collection once at mount and
  never subscribed to storage for it, so a palette renamed, recoloured or
  created in the popup, in a second Settings tab or on another signed-in
  device stayed stale until a reload. `refreshPalettes()` re-reads everything
  `init()` read (collection, pointer, opt-in, legacy single palette) and shows
  it through the new `presentPalette()`, which is the render half split out of
  `switchPalette()` so both paths re-derive baseline, read-only state, remount,
  switcher, mark and note the same way. With unsaved edits on screen it arms on
  the first click and refreshes on the second, mirroring Reset. The button
  sits in a new always-visible `.palette-row` beside `#switcher` rather than
  inside it: the chooser only renders with two or more entries, and a single
  stored palette goes stale the same way (roborev 4634). `#switcher-note`
  moved out with it and now follows the chooser's visibility explicitly.
  Tests in `options/__tests__/options-refresh.test.js`, including the
  one-palette case. (bd workspace-custom-palette-46x)

- **`docs/TESTING-0.2.2.md`, the executable release-test script for this
  version**, written for an agent driving Chrome through browser control.
  It records what was already run on 63dd8bf (Tier 1 569/569, Tier 2, pages
  smoke 52/52, a live cold apply in Sheets read back through the picker), the
  twelve-picker matrix with one cold colour per row, the settings checks that
  only eyes in the real profile can do (the agent's browser tools refuse
  `chrome://` and `chrome-extension://` URLs, so the extension's own pages
  are smoke-covered or [YOU]), and the two traps that produced false failures
  on the 0.2.1 run. (bd workspace-custom-palette-8w6)
  Run 1 (2026-10-01, e08ba4a) is recorded in the script: 12/12 pickers pass
  with read-back. It also records two agent-side traps the run found, an
  occluded Chrome window (`document.hidden` true) stalling injection until a
  paint, and the automation tab group dropping when a tab is closed.

## [0.2.1] — 2026-09-02

### Added

- **A 0.2.1 update notice** in `lib/update-note.js` announcing the Data
  validation dropdown-chip picker as a new surface (owner's wording,
  2026-09-01). Fires once on `onInstalled` reason `"update"` for anyone moving
  up from 0.2.0; fresh installs get the intro instead. Pinned by a test that
  names the surface and how to reach it.

### Changed

- **The settings-change decision moved out of `bootstrap.main()` into
  `content/settings-plan.js`, so it can be tested.** Behaviour is identical.
  Every link between "the user edits a hex in the popup" and "the open picker
  shows the new colour" already had a test — `setUserPalette` writes the mirror,
  `onSettingsChanged` delivers the change, `refreshBrandRows` re-renders a
  cached menu — except the handler deciding which of those to run, which lived
  inline inside `main()` where nothing could import it. That is exactly where a
  silent no-refresh bug would live, and its absence is what made a suspected
  no-refresh report (2026-09-01, ultimately a dev artifact: a content script
  orphaned by an extension reload) expensive to rule out by hand.

  The extraction also collapsed a redundant branch. `if (paletteChanged &&
  enabledChanged) refresh(); else if (enabledChanged && !paletteChanged)
  refresh();` computes exactly "did enabled change" — the two-branch form read
  as though it did something subtler. `refreshUserTier` was deliberately NOT
  touched: the org-palette tier resolves inside it, and moving that would put
  the enterprise-policy walkthrough back in scope.

  Eight tests in `content/__tests__/settings-plan.test.js`, five mutations each
  verified to fail — including "a palette edit never re-reads", the exact
  reported symptom, and "a cleared palette is ignored", where a truthiness check
  instead of `in` would silently drop a user clearing their override.

### Fixed

- **The observer's failures now say our name, and no longer kill the observer.**
  `isPickerPopup`, `closestPopupRoot` and `assertInjected` were called from the
  MutationObserver callback OUTSIDE any try/catch. All three reach
  `dom-contract`, which throws when no contract is loaded — so an early throw
  killed the callback for the life of the page AND logged a message with no
  `[brand-palette]` prefix, invisible to anyone filtering the console for this
  extension. That is how a full day of diagnosis went sideways on 2026-09-01,
  chasing a stored `enabled` flag, an org policy and a phantom palette wipe,
  none of which were the cause.

  `refreshBrandRows` got the same treatment and one ordering change: the palette
  is now read BEFORE the existing rows are torn down. It is a pure closure read
  that cannot depend on the DOM, so moving it costs nothing — and it means a
  throw there can no longer strand the user with the old rows removed and no new
  ones. That path runs from `onManagedChanged`, so the stranding would have
  landed on an admin pushing a policy update.

  `content/__tests__/observer-resilience.test.js` pins the two properties that
  matter — nothing escapes, and every failure carries the prefix — while saying
  nothing about wording, so the messages stay free to improve. Three mutations
  (uncaught detection throw, prefix removed, palette read moved back after the
  teardown) were each verified to fail.

- **Sheets no longer banners "couldn't be applied" for colours it did apply**
  (bd `workspace-custom-palette-9qg`, `workspace-custom-palette-577`).
  `applyColor`'s step 3 — reopen the picker, click the registered custom swatch
  — rested on "in Sheets the dialog OK only REGISTERS, it does not apply", and
  threw whenever it could not run. Verified live 2026-09-01, that premise no
  longer holds on any Sheets picker we can test. Three of them applied the
  colour on runs where step 3 could not even start: the conditional-formatting
  panel picker (its opener `#waffle-conditionalformat-background-color` is not
  in the contract, so `reopen` is null), the border picker (its pencil lives
  inside the `#t-border` palette that the dialog's OK closes, so the captured
  opener is no longer laid out and `syntheticClick` correctly refuses it), and
  the toolbar fill picker whenever a side panel collapses the toolbar. In every
  case the user got the right colour and a banner saying it had failed.

  Step 3 is now a CONFIRMATION pass that follows the monitor's rule: fail on
  evidence, never on absence. It returns quietly when there is no reopener, when
  the reopen click is refused (`syntheticClick`'s return value is no longer
  discarded — that is what made the border case a silent no-op followed by a
  baffling four-second timeout), and when the picker does not come back. It
  throws only on positive evidence: the picker reopened and our colour is not in
  it. This does not weaken the genuine-breakage signal — every way Google can
  actually break the contract (custom-colour button, dialog, hex input, OK
  button) already throws inside `registerViaDialog`, before step 3 runs.

  `content/__tests__/apply-color-confirm.test.js` pins all four branches plus the
  still-throws case; each was verified to fail against the old behaviour.
  Re-verified live afterwards: Sheets border and conditional formatting both
  apply a cold colour with no banner.

- **A failing palette migration no longer suppresses the `enabled` un-hide**
  (bd `workspace-custom-palette-7se`). `migratePalettes()` in
  `background/service-worker.js` ran `migratePaletteStorage()` and
  `retireEnabledToggle()` in ONE try block, enabled-repair second, so any
  failure in the first — a quota error, a malformed stored palette, a transient
  storage fault — silently skipped the second on every install and every
  startup. `retireEnabledToggle` is the only thing that can rescue a profile
  stored as `enabled: false`: the toggle was retired from the UI in 0.2.0 and
  the content script still honours the key, so such a profile injects nothing,
  banners nothing (an empty palette is not a failed injection), and offers no
  control to turn it back on, while looking healthy in `chrome://extensions`.
  `enabled` lives in sync storage, so a `false` written by an older build on
  another device reaches machines that never had the toggle.

  The composition moved to `runStartupMigrations()` in `lib/storage.js` — the
  worker's private function could not be imported, which is why the ordering had
  no test. Each migration now has its own catch, the enabled repair runs first,
  and the function never rejects (it is called un-awaited from
  `onInstalled`/`onStartup`, where a rejection would surface as an unhandled
  rejection). Three tests in `lib/__tests__/storage.test.js` pin the isolation,
  the ordering and the no-reject contract; all three were verified to fail
  against the old shared-try composition.

- **Sheets: a brand colour now applies in the Data validation dropdown-chip
  picker** (bd `workspace-custom-palette-gb3`; field report 2026-09-01, 0.2.0,
  English UI). Clicking a Brand swatch on a dropdown option's colour chip
  failed with `apply-color: custom-color button not found` and surfaced the
  local "That brand color couldn't be applied" banner. Root-caused live: that
  picker is a different Closure widget (`previewableColorMenu` /
  `previewableColorMenuCustomizeButton` / `previewableCustomColorMenu` /
  `previewableCustomColorMenuOkayButton`). It reuses the
  `docs-material-colorpalette` markup, so injection always worked and only the
  custom-colour flow was unmapped.

### Added

- **`overrides`: per-picker custom-colour widget declarations in the selector
  contract.** A picker entry may now carry an `overrides` block naming the
  parts of the custom-colour flow that differ from `shared`
  (`customColorButton`, `customDialog`, `okButton`, plus `tab`/`tabSelected`/
  `tabIndex` for a tabbed dialog), and an `appliesOnOk` flag saying its OK is
  not `isTrusted`-gated. `dom-contract.customColorVariants()` folds `shared`
  plus every override into a list of widget specs; `findCustomColorEntry(doc)`
  resolves whichever entry-point button is visible and returns an opaque
  variant handle that `findCustomDialogFor` / `findOkButtonFor` /
  `findVariantTab` / `variantAppliesOnOk` are scoped to — so no raw selector
  leaves `dom-contract`, and no caller has to know which picker is open.
  `toolbarButton` became optional for a picker opened from a side panel.
  Contract rolled to `2026-09-01`; `sheets.dataValidationChip` added. See
  `docs/SPEC.md` §2b.

- **`content/__tests__/fixtures/sheets-datavalidation-picker.html`**, captured
  live 2026-09-01, plus `datavalidation-picker.test.js` (resolvers, injection,
  and a pseudo-localized pass) and `apply-color-chip.test.js` (the whole
  `applyColor` flow in jsdom). The apply flow is normally left to the synthetic
  monitor, but this picker has no toolbar button for the monitor to click, so
  Tier 1 is its only automated coverage. Every guard was mutation-tested.

### Changed

- **`findHexInput`, `findOkButton` and `readDialogRgb` are visible-filtered**
  (`getClientRects`), matching `findCustomDialog`. The tabbed dropdown-chip
  dialog holds one hex/RGB trio per tab and only the active tab's is laid out —
  and the panels sit in the *opposite* order to the tabs, so an unfiltered
  `querySelector` returned the hidden tab's field. Writing there left OK
  committing the stale colour with nothing throwing.

- **`sectionLabel` gained `.previewableColorMenuHeader`**, so the Brand row is
  labelled in the dropdown-chip picker like everywhere else.

- **`isPickerPopup` detects every variant's entry point**, not just the shared
  `customColorButton`.

- **Both publish gates validate picker shape and recurse into `overrides`.**
  `isValidContract` (`lib/config.js`) and `is_valid_contract`
  (`service/alerts.py`) now require a `popupRoot`, accept a missing
  `toolbarButton` only when the picker declares `overrides`, and type-check
  override values. The locale scans in `dom-contract.test.js` and
  `alerts._selector_strings` recurse into nested blocks — a one-level scan
  walked straight past `overrides`, which would have let an English
  `aria-label` published there break non-English users with the gate green
  (the shape of bd `workspace-custom-palette-7as`).

- **`docs/ADMIN_GUIDE.md`: a standalone guide for Workspace administrators**
  (bd `workspace-custom-palette-gtx`). Written from the ten console facts a
  real admin hit on 2026-08-24 (empty app list in a new org, Add-by-ID is a
  dead end, the ID check, install policy independent of the palette policy,
  SAVE in the upper right, yellow means set not unsaved, delivery lag and when
  to stop reloading), plus the builder flow including Start from my palettes.
  Needs no checkout; no repo paths or function names. Carries the ordered
  screenshot list as placeholders, to be captured in the clean-org walkthrough
  (i46). Linked from `README.md` and `docs/DEPLOY.md` Admin steps.

- **The policy builder can start from the admin's own palettes, and its rows
  are the shared editor** (`options/policy-builder.html`,
  `options/policy-builder.js`; owner request 2026-08-28, bd
  `workspace-custom-palette-uh4`). Opened from Settings, a "Start from my
  palettes" control reads EVERY palette in `chrome.storage.sync` through
  `lib/storage.js` `getPaletteState`, switches to the several-palettes payload
  when there is more than one, feeds the colours through the same validation
  as typed ones, clamps to `MAX_PALETTES` / `MAX_SWATCHES` and says so, and
  repaints the preview chip. Reads only; nothing writes back. The rows are
  `shared/palette-editor.js` `mountPaletteEditor`, so reorder, delete, the
  colour chip and the eyedropper come from the same code Settings and the popup
  run. Mechanism: the page stays a CLASSIC script that `import()`s the shared
  modules at runtime, because Chrome refuses ES modules on a `file://` page
  and a mailed copy (TESTING-0.2.0 NEW-3) is opened exactly that way; the
  self-contained rows render first and upgrade in place when the import lands,
  and from a file the import control is absent rather than broken. Tests in
  `options/__tests__/policy-builder.test.js` cover the no-chrome copy, the
  shared-editor path, all-palettes import, the single-palette case, the caps
  message and the empty-store message via the `__policyBuilderDeps` seam;
  `dev/pages-smoke.mjs` proves the runtime import on a real extension page.

### Changed

- **The live picker-update channel no longer depends on the legacy palette
  mirror** (`lib/storage.js` `onSettingsChanged`; bd
  `workspace-custom-palette-3ij`). It watched only the `palette` key, so open
  Docs/Sheets/Slides tabs refreshed by coincidence of every writer rewriting
  the mirror, and the pointer-only half of that coincidence already broke once
  (agi). It now also reacts to `pal:<id>`, `paletteOrder`, the interim
  `palettes` key and a pointer-only `activePaletteId` move; when a change
  carries no mirror value it resolves the active user palette from a fresh read
  and hands consumers the swatches, an empty tier for an organization
  selection, exactly the shape the mirror gives. Deliveries are serialized so a
  read in flight cannot be overtaken by a later synchronous change. Retiring
  the mirror is now safe for this channel; five tests in
  `lib/__tests__/storage.test.js` drive a collection write, a pointer-only
  switch, the org selection, ordering, and the single delivery of today's
  mirrored write.

- **The border and table pickers are captured, in the contract, and in the
  monitor matrix** (`config/selectors.default.json` + `service/data/selectors.json`
  version `2026-08-30`; `monitor/src/matrix.ts`, `monitor/src/check.ts`; bd
  `workspace-custom-palette-7f3`). Captured live in a real browser: Sheets
  `#t-border-color` (inside the `#t-border` palette), Docs `#cellColorMenuButton`
  and `#borderColorMenuButton` (the table toolset, mounted while a cell is
  selected, behind `#moreButton` on a narrow toolbar); Slides table cells reuse
  the shape `#fillColorMenuButton` / `#lineColorMenuButton`. Inject was confirmed
  on all of them and apply on Docs table border and Sheets border, with the
  registered custom swatch read back as `Custom Color #fe5917`. The finding that
  shaped the change: every one of these pickers was ALREADY getting the Brand
  row, because each popup shares its app's fill/text popup classes and
  `closestPopupRoot` matches by class, so the new `sheets.border`, `docs.border`
  and `docs.tableFill` entries exist for the monitor (it needs a button to
  click), not for injection. A test in `dom-contract.test.js` pins each to the
  same `popupRoot` as its sibling so they cannot become a second injection path;
  `locale-fixture.test.js` resolves the two Docs buttons under
  pseudo-localization from modeled toolbar nodes in the fixture. Two new
  openers: `sheets-border` (open the palette first) and `docs-table` (keyboard
  table insert, the only locale-independent route since menu items carry no
  ids). The three matrix rows have not been through a scheduled run; no row
  has, pending the monitor credentials. `docs/SPEC.md` matrix rows are no longer
  unverified; `docs/TEST_PLAN.md` Tier 3 count is 9/9.

- **The monitor's locale check now fails closed on the English legs and on a
  blank `<html lang>`** (`monitor/src/check.ts` `localeVerdict`; bd
  `workspace-custom-palette-afb`). Both branches were advisory because the
  attribute had only been observed on Docs and Sheets in Danish. The missing
  values were read live: Slides reports `lang="da"` under `?hl=da&forcehl=1`
  (2026-08-30) and all three apps report `en` on the account language
  (2026-08-25), with the attribute present on every read, so an English leg
  reading another language and a blank tag are now positive evidence rather
  than unknowns. The unreadable-page branch stays advisory since an `evaluate`
  that throws is a navigation race. Table of all six values in
  `docs/TEST_PLAN.md`; the verdict table in `matrix.test.ts` pins the policy.


- **"Organization colors" is now "Organization palette" everywhere it is shown**
  (owner, 2026-08-28). `ORG_PALETTE_NAME` in `lib/palette.js`, the popup's
  **Use organization palette** button, the Settings **Build organization
  palette** link, the builder's title and heading, and the options note that
  points at the selector. The label now matches the thing it names: a palette is
  what the selector lists and what an admin publishes.
  - **No migration needed.** `ORG_PALETTE_NAME` is derived at read time for a
    legacy policy that carries no name of its own; it is never written to
    storage, so no stored data holds the old string.
  - **The "(organization)" suffix rule still suppresses correctly.**
    `planPaletteSwitcher` appends that suffix only when a name does not already
    start with "organization", and the new name still does. Confirmed by
    mutation: renaming the constant to something unrelated fails exactly the two
    tests that cover the suffix rule.
  - Tests that asserted the literal now assert `ORG_PALETTE_NAME` itself
    (`lib/__tests__/config.test.js`, `palette.test.js`,
    `options/__tests__/options-locked.test.js`), so the next rename needs no
    test edits.
  - **Docs deliberately NOT renamed yet.** `docs/TESTING-0.2.0.md`,
    `docs/DEPLOY.md` and `STORE_LISTING.md` still say "Organization colors"
    because they describe the build that is in Web Store review and is what the
    clean-org walkthrough (bd `i46`) will be run against. They get updated as
    part of the next release cut, when the new label is actually what a tester
    sees.

## [0.2.0] — 2026-08-27

### Added

- **Tests for the builder's admin instructions** (`options/__tests__/policy-builder.test.js`;
  roborev 4224). The "Where it goes" steps are the only instructions a Workspace
  admin gets, and getting them wrong costs a support round trip rather than a
  crash, so nothing louder than a passing build would report the damage. Two
  tests now pin the readability work: the four Web Store actions stay their own
  bullets with the Add-by-ID warning as a sibling rather than a trailing clause,
  and the paste step still names the generated text. Both mutation-checked by
  flattening the list and by reverting the wording.

- **Popup coverage for the update banner itself** (`popup/__tests__/popup-glue.test.js`).
  The banner shipped in 0.1.6 and 0.1.7 with its RENDER path untested in the
  popup host: only the pure version-to-copy mapping was covered, so an empty or
  placeholder banner would have passed every tier. Two tests now assert the
  notice for the running version is revealed with the shipped copy verbatim
  (and that the first-run intro does not fight it for the slot), and that a
  version with no notice stays silent and clears its stale flag.
  Mutation-checked by blanking the assignment in `popup.js`.

- **A 0.2.0 entry in `UPDATE_NOTES`** (`lib/update-note.js`), shown once in the
  popup to users updating from 0.1.7. The first entry that announces a feature
  rather than reassuring someone about a bug they hit, so it is deliberately
  short: it names the switcher sitting right above it and the fact that colors
  may now start arriving from an admin, then closes on the promise that matters
  to someone whose colors are suddenly not the only ones in the list. Two tests
  pin it: one asserts both halves are named so a later trim cannot silently drop
  a feature, and one asserts no em-dash or emoji across EVERY entry, since that
  house rule is remembered when copy is written and forgotten when it is edited.
  Both mutation-checked.

### Changed


- **The store listing's `alarms` justification no longer claims the alarm never
  fires** (`STORE_LISTING.md`; roborev 4213). `chrome.alarms.create` runs
  unconditionally in `onInstalled` (`background/service-worker.js:171`); what
  `CONFIG_BASE` gates is the body of `refreshConfig`, which clears the cache and
  returns when it is empty. A Web Store reviewer inspecting the service worker
  would have watched the alarm fire while the listing said it could not, which
  is the opposite of what that line is for.

- **The policy builder's footer no longer cites a repo path** (owner,
  2026-08-26). "Full admin runbook: docs/DEPLOY.md in the extension's
  repository" meant nothing to the administrator the page is for, who has no
  checkout.

- **Opting out of Multiple palettes returns to the organization's colors**
  (`lib/palette.js` `planOptOut`, `options/options.js`; owner, 2026-08-26,
  widened 2026-08-27). The opt-in is the only thing that shows the chooser, so
  switching it off leaves one palette in play, and when an organization
  publishes one that is the one it should be. Before, a user could opt in,
  create a palette, switch to it and opt out, ending up on their own colors with
  no control to leave them. Originally scoped to enforcement on the reasoning
  that an unlocked org palette is a starting point rather than a rule; the owner
  tested that and decided the other way, so `planOptOut` no longer consults
  `locked` for the decision — the lock governs whether the org palette is
  editable, not which palette a single-palette user is on. The one case that
  stays put in both lock states is having no org palette published at all, since
  there is nothing to return to. The pointer moves and nothing else: every
  palette stays in storage and re-checking the box restores the list. Covered by
  a pure resolution table over both lock states and by end-to-end tests for
  each, mutation-checked.

- **The product names itself consistently: "Custom Color Palette"**
  (`options/options.html`, `popup/popup.html`, `feedback/feedback.html`,
  `content/health-probe.js`; owner ruling, 2026-08-26). Every surface said
  "Brand Palette" while the Web Store listing, the manifest and the page titles
  said "Custom Color Palette for Google Workspace Docs, Sheets & Slides" — users
  installed one name and opened another. The wordmark, the rating prompt and the
  content-script error banner now all say Custom Color Palette. Deliberately
  UNCHANGED: the **Brand** row inside Google's pickers, and the brand-and-
  organization language throughout the listing — the pivot is what the product
  calls ITSELF, not what it calls the colors. Header fit checked in a real
  browser at popup width (143px of 400).

- **The policy builder's mark previews the colors being set up, and is bigger**
  (`options/policy-builder.html`; owner, 2026-08-26: "I really like that as a
  quick view of what the brand colors look like together"). It repaints from the
  live payload on every edit, and shows **every** usable color rather than the
  leading few the toolbar icon shows — at 16px an icon has to summarise, and
  here seeing the set is the whole point. 68x34 rather than 18x18 for the same
  reason: a wide chip keeps eight or ten stripes readable where a square would
  not. An unusable entry leaves the chip exactly as it leaves the payload, and
  with nothing usable it falls back to the packaged gradient rather than going
  blank. In several-palettes mode it previews the FIRST palette and names it —
  "Preview of X, the palette staff start on" — since an admin editing palette
  two would otherwise read the chip as theirs.

- **The policy builder ships inside the extension, reachable from Settings**
  (`options/policy-builder.html`, `options/options.html`; owner, 2026-08-26:
  "I want that optimally worked into a page accessible from the settings").
  Moved out of `tools/`, which was never packaged, into `options/`, which is —
  so an administrator who has the extension needs nothing else. Settings gained
  an **Administrators** section at the bottom with a **Build organization
  colors** button that opens it in a new tab, deliberately last and low-key
  (publishing colors for a domain is a once-per-organization act, not something
  the people using the palette do) and deliberately always visible (an admin
  setting this up for the first time has no policy yet, so there is nothing to
  reveal it). Restyled to the extension's own tokens and given its brand mark so
  it reads as part of the product, but still **zero external references** — no
  linked stylesheet, no `chrome.*` — because it must remain a single file that
  can be sent to an admin who does not have the extension, which is exactly what
  `docs/DEPLOY.md` tells you to do. Moving it into a typechecked directory also
  brought its tests under `tsc`, which they now pass.

- **Saving a palette now counts as selecting it** (`options/options.js`,
  `popup/popup.js`; owner ruling, 2026-08-26: "saving should count as selecting
  a palette as the palette would have to be selected to be saved"). Both hosts
  adopt the stored pointer after a write, where before they kept whatever they
  read at mount. This decides what a LOCK then does: an explicit pointer at a
  personal palette keeps it editable under enforcement (the `cv2` rule), so a
  user who saved their own colors stays on them. In production the transition
  onto an enforced org palette is `applyEnforcementPush` in the service worker,
  which is unchanged.

- **The policy builder's paste heading names the field it means**
  (`options/policy-builder.html`; owner, 2026-08-26): "Paste this into
  “Policy for extensions” based on the directions below."

- **The policy builder recommends enforcement, and ships with it ticked**
  (`options/policy-builder.html`, `docs/DEPLOY.md`; owner, 2026-08-25:
  "we want to push the admins to using the paletteLocked version as the default
  though as that is the most likely expected behavior"). Enforcement is what an
  administrator normally means by "these are our brand colors"; the unlocked
  form publishes colors any user can quietly edit away from, so a fleet can
  drift off-brand invisibly. Unticking it removes the key entirely rather than
  publishing `false`, so an admin who opts out ships a payload with nothing to
  enforce — pinned by a test.

- **One brand mark instead of three** (`shared/brandmark.js`, `shared/theme.css`,
  `popup/popup.js`, `options/options.js`; field, 2026-08-25). The identity
  appeared in three places that disagreed: a CSS gradient of seven HARDCODED
  packaged colors in the page headers, running horizontally (`180deg`); a
  packaged PNG favicon, running vertically; and the genuinely adaptive toolbar
  icon the worker paints from the resolved palette. Only the last told the truth
  about what a picker would show. `applyBrandmark` now paints the header mark
  and the favicon from the palette in effect, using the same leading colors, the
  same `ICON_STRIPES` count and the same even tiling as `lib/icon.js` — so the
  three read as one object at three sizes. The header gradient turned
  `90deg` to match. The packaged fallback is preserved by construction: the CSS
  gradient stays, `--brandmark-image` only overrides it once a palette resolves,
  and the favicon is replaced only when there is something to replace it with,
  so a page that cannot resolve a palette looks exactly as it did before.

- **Multiple palettes defaults ON, and it is now the only thing that shows the
  switcher** (`lib/storage.js` `getMultiPalette`, `lib/palette.js`
  `planPaletteSwitcher`; owner ruling, 2026-08-24: "the multiple palette
  behavior is working so well that we want to change the default to having it
  on"). `getMultiPalette` reads an ABSENT value as on, so an existing explicit
  opt-out (a stored `false`) survives untouched and no migration is needed.
  With the flag on for nearly everyone, the 2026-08-22 rule that any org
  palette in play forced the switcher open earned nothing and made opting out
  meaningless, so it is retired: off is now genuinely the pre-multi-palette
  experience, including under enforcement. Nothing is lost by hiding it — every
  palette stays in storage, suppressed rather than deleted, and re-checking the
  box restores the list exactly (pinned by a storage test asserting the entry,
  its name and its colors survive both an org push and an opt-out). A user who
  opted out and is on their own colors still reaches the org's through the
  popup's "Use organization colors".

- **`npm run smoke:pages`: the extension's own pages, in a real browser**
  (`dev/pages-smoke.mjs`). Loads the unpacked extension into a real Chromium
  (Playwright `launchPersistentContext`, reusing the browser already installed
  under `monitor/`) and walks the settings and popup pages: the opt-in,
  create/rename/switch/delete, import-as-new, the two-click Reset and Delete
  confirms, and the settle-before-save rule. It exists because jsdom does not
  compute CSS, which is why the `[hidden]` failure shipped three times against
  400+ green tests; this tier asserts real VISIBILITY, not the attribute. It
  deliberately does NOT open Docs/Sheets/Slides and does NOT touch enterprise
  policy, so it does not and cannot replace the mandatory pre-package smoke -
  stated in the script header, in its own output, and in the tier tables in
  `CLAUDE.md` and `docs/TEST_PLAN.md`. 28 checks green on this tree. Among them
  both settle gestures driven as REAL events (roborev 4106): Enter, and moving
  focus away. That pair can only be pinned here - Tier 1 dispatches a synthetic
  `change`, which assumes the browser behavior in question, and jsdom cannot
  produce it. Chromium fires `change` on Enter in a bare text input outside a
  `<form>`, keeping focus, which is what makes the popup's documented "blur,
  Enter" contract true. Two follow-ups from roborev 4110: the version
  assertion reads `manifest.json` rather than hardcoding a literal (a literal
  would turn the next routine PATCH bump into a fake regression, in the one
  script whose value is being trustworthy - and comparing the file on disk
  against the footer's `chrome.runtime.getManifest()` is still the real
  stale-build check), and the whole body runs inside `try/catch/finally` so a
  throw mid-run still closes the browser and removes the temp profile. That
  mattered: the failing runs are the ones this script exists to produce, and a
  leaked profile from a pre-fix failure was found on disk.

- **The Admin console UI is now the documented path for organization colors,
  and there is a builder for the JSON** (`docs/DEPLOY.md`,
  `options/policy-builder.html`; bd `workspace-custom-palette-24y`).
  DEPLOY led with plists and scripts, which read as "admins run scripts" — they
  never do: `dev/test-policy.sh` and the macOS plist recipe simulate locally
  what Google's servers deliver, and both are now labelled developer-only, with
  the console path and its access model stated up front. The new builder is a
  single self-contained static page (no server, no permissions, no build step):
  pick colors visually, choose one palette or several, tick enforcement, copy
  the exact `Value`-wrapped payload. It validates as it goes and names what it
  is skipping rather than silently dropping it.
  `options/__tests__/policy-builder.test.js` runs its output
  through the extension's OWN policy reader (`lib/config.js` `orgPalettes` /
  `orgSwatches`), so a payload the extension would quietly ignore fails the
  suite. `tools/` is not in the packaged zip.

- **Storage scoping is documented as a verified table, not a claim**
  (`docs/DEPLOY.md`; bd `workspace-custom-palette-td0`). Every key, its storage
  area, and its scope, with the audit that backs it: every read and write goes
  through `lib/storage.js`, the only other `chrome.storage` reference being the
  service worker's `onChanged` listener. Nothing the extension writes is
  machine-wide; the one machine-wide artifact in the project is
  `dev/test-policy.sh`'s macOS plist, which is test tooling and is now flagged
  as such where it could be mistaken for extension behavior. `docs/PRIVACY.md`
  and `STORE_LISTING.md` were corrected in the same pass: they still described
  the retired on/off toggle and said a managed palette "replaces nothing you
  have chosen", which `paletteLocked` made untrue.

- **Import creates a new palette instead of overwriting the one on screen**
  (`options/options.js` `importText`, `lib/storage.js` `createPalette`; bd
  `workspace-custom-palette-m5g`). Once a switcher exists, replacing whatever
  palette happens to be selected is a destructive answer to "add these
  colors". With **Multiple palettes** on, Import now materializes the packaged
  fallback first when it has to (same rule as the New palette button),
  creates a palette named `Imported` / `Imported N`, and switches to it;
  `createPalette(name, swatches)` gained the seed argument so this is create +
  seed + switch in ONE atomic write rather than a create racing a save, with
  normalization and the `MAX_SWATCHES` cap applied at the write. With the
  opt-in OFF the behavior is deliberately unchanged - no switcher means no
  second palette to make, so Import loads the editor and Save decides. Import
  stays hidden while the active palette is enforced; the in-function guard is
  the backstop for a direct call. Covered in
  `lib/__tests__/storage.test.js` (seed, normalize/cap, empty seed) and
  `options/__tests__/options-glue.test.js` (new-palette path, name collision,
  opt-in-off path).

- **The policy builder's step 4 is now nested sub-bullets** rather than a
  five-sentence paragraph (`options/policy-builder.html`; owner, 2026-08-27).
  The add-from-Web-Store path is four discrete console actions and read as prose;
  it is now four sub-bullets under the "if it is not there" case, with the
  do-not-use-Add-by-ID warning as its own sibling bullet. Sub-lists get tighter
  spacing than the numbered steps so an expanded step does not read as a second
  list of equal weight.
- **Step 5 names what is being pasted** (`options/policy-builder.html`; owner,
  2026-08-27): "paste the above generated text over it" rather than "paste this
  over it", which relied on the reader connecting "this" to a payload generated
  further up the same page.

### Fixed

- **Tier 2 was red and being reported green** (`options/policy-builder.js`,
  `options/__tests__/policy-builder.test.js`). The builder came over from
  `tools/policy-generator/` written in ES5 style, so 45 `no-var` errors plus 4
  in its test had been failing `npm run lint` — and therefore `npm run tier2` —
  since it was moved. It went unnoticed because the checking command was
  `npm run lint | tail -1`, which prints a blank line on failure; the exit code
  is the only reliable signal. `var` is now `let`/`const`, three unused
  destructured bindings are gone, and the unsafe optional chain in the
  remove-rows loop is replaced by a hoisted binding plus an assertion, which is
  what the loop condition already guaranteed. The caps guard's regex no longer
  hardcodes `var`, so it survives the rebinding while still catching real drift
  (mutation-checked against MAX_PALETTES 12 -> 10).

### Added

- **`npm run policy:builder`** (`dev/open-builder.mjs`). Prints a `file://` URL
  for the admin policy builder and opens it. Added because "open
  `options/policy-builder.html` in a browser" is not an instruction a
  browser can follow — a repo-relative path resolves to nothing in an address
  bar, which is exactly how a tester lost the step (field, 2026-08-26). Printing
  the URL is the half that always works; opening is best-effort, so a platform
  without the opener still leaves something to paste.

- **`npm run policy:state`** (`dev/policy-state.mjs`; bd
  `workspace-custom-palette-0dj`). Reads what the extension actually received
  and what it did with it, straight out of a live Chrome profile: the delivered
  policy, the stored pointer / push memories / palettes, and — computed with the
  real `resolveEffectivePalette` over the real stored state — what the pickers
  should therefore be showing. That last part is the point: it turns "does this
  look right?" into a list of hexes, using the shipping decision logic rather
  than a guess. Read-only and works while Chrome is running, because it scrapes
  the on-disk records rather than opening the LevelDB. It is the agent-side half
  of the C–F walkthrough the owner asked for — a human still drives the Admin
  console, since proving real cloud delivery is the whole point of those
  sections.

- **Palette management is now complete enough to live with**
  (`lib/storage.js`, `lib/palette.js`, `options/*`): palettes can be
  **renamed** (inline input, Enter commits, Escape abandons; org palettes
  refuse — they always display "Organization colors") and **deleted**
  (two-step inline confirm; the pointer moves to the first survivor, the last
  one clears every shape). A new palette carries **one starter color** so
  creation visibly did something. And the palette a fresh user is looking at —
  the packaged defaults, which were only a resolution fallback — is
  **materialized as a real "Default" palette** the moment a second one is
  created, closing the field finding where creating a palette orphaned the one
  on screen, unreachable forever. The migrated legacy entry renames from "My
  colors" to "Default" to match.

- **The switcher appears whenever more than one palette is genuinely in play**
  — an org palette beside one of yours, two or more org palettes, or your own
  opt-in with several palettes — the product rule superseding enforcement-only
  visibility. Hidden with no org palette and the opt-in off, and never
  rendered with fewer than two entries (a visible-but-empty control is pinned
  impossible by an invariant test). An org-only user sees no selector at all:
  there is nothing to choose between until they opt in (Changed, 2026-08-23).


- **A New palette button — the switcher is finally reachable for personal use**
  (`lib/storage.js` `createPalette`, `options/options.html`,
  `options/options.js`). Field finding: the Multiple palettes opt-in revealed a
  switcher only when 2+ entries existed, and *nothing user-facing could create
  the second one* — 49 jsdom tests were green around a flow no human could
  reach, because they seeded storage directly. The button shows whenever the
  opt-in is on OR an org palette is enforced — the latter because an enforced
  user's only path to "colors of your own" starts with creating some, and
  without it that promise was false. Creates empty, named "Palette N", becomes
  active, editor remounts editable. Refuses politely at `MAX_PALETTES`. Rename
  and delete remain filed follow-ups.


- **An admin can publish SEVERAL named organization palettes**
  (`config/managed-schema.json`, `lib/config.js`, `lib/palette.js`,
  `lib/storage.js`, and all three consumers). bd
  `workspace-custom-palette-om8`. A new `palettes` policy takes an array of
  `{name, swatches}`; the single `palette` key it joins is unchanged and stays
  supported permanently, because it is the shape already deployed to real orgs
  and breaking it would silently unstyle them. `palettes` wins when both are
  set; a single palette becomes one entry so everything downstream sees one
  shape.

  `normalizeOrgPalettes` assigns ids (`org:0`, `org:1`, ...) and drops entries
  with no name or no usable colors rather than offering an empty choice.
  `orgSwatches` is the single entry point for "what has the admin published",
  so no caller has to know two policy shapes exist — the popup, the options
  page and the content script all went through it, and `applyPolicy` in the
  popup now takes the whole policy rather than just its palette value.
  `getManagedPolicy` reads all three keys in one round trip, and
  `onManagedChanged` fires on the new one, without which a multi-palette
  publish would have been invisible until a browser restart.

  Only the first palette is reachable in the UI until the switcher lands
  (`kbs`), which is what makes this safe to ship on its own: a multi-palette
  policy resolves to its first entry exactly as a single one always has.

  A follow-up review caught that the new `org:<n>` id space was honored
  inconsistently: `isActivePaletteReadOnly` accepted the prefix while
  `resolveEffectivePalette` compared only against the bare `org`, so with
  `org:1` selected the editor would freeze on the organization's colors while
  the document got the USER's palette. That is the same editor-versus-document
  contradiction the detach sentinel was fixed for, reintroduced in a new id
  space. `isOrgPaletteId` is now the one predicate all three call sites read.
  The stale `{ palette, locked }` type contracts in `lib/storage.js` and
  `content/bootstrap.js` gained `palettes` too — typecheck had been asserting
  the opposite of what the new call sites rely on.

  A further round found a defect in the TEST HARNESS itself
  (`shared/__tests__/harness/fake-chrome.js`): `setPolicy` decided whether the
  managed area was "absent" from the pre-update policy but applied that decision
  to the post-update state, so clearing the legacy key while publishing the
  collection in one write — the admin migration the `palettes` key exists to
  express — flipped the area to absent and then stored the collection anyway,
  emitting a change carrying a policy `get()` would deny forever. It now applies
  the update first and decides from the result. The defect was invisible because
  every existing removal path clears one key at a time, and it would have
  presented as a bug in `getManagedPolicy` rather than in the harness. This is
  the second time this harness has hidden a scenario rather than exposed one.

- **Every policy resolver in `lib/palette.js` now tolerates `null`.** A `= {}`
  default only applies to `undefined`, so eight exported functions threw on
  `null` — the likeliest junk a caller passes (an absent policy read, a
  `JSON.parse("null")`, an empty storage key). Found by a new test, not in the
  field.

- **The pure core for multiple named palettes** (`lib/palette.js`):
  `normalizePalettes`, `resolveActivePalette`, `planPaletteMigration`, plus
  `MAX_PALETTES`, `MAX_PALETTE_NAME` and the `LEGACY_PALETTE_*` constants. bd
  `workspace-custom-palette-kn0`, first child of the multi-palette epic
  (`workspace-custom-palette-dfg`). No caller yet, by design: storage shape and
  pure resolution land and get reviewed on their own, before anything touches
  the write guards or the UI.

  The stored shape becomes `palettes` = `[{id, name, swatches}]` plus an
  `activePaletteId` pointer. Three decisions are worth recording:

  `resolveActivePalette` tolerates BOTH shapes permanently, not just at upgrade
  time. `chrome.storage.sync` means a machine still on an older build can write
  the single `palette` key back at any moment, long after this device migrated,
  so a once-on-install migration would leave that user's colors invisible.

  A dangling pointer falls back to the first entry, never to nothing. The
  pointer and the collection genuinely can disagree: the user deleted the
  active palette, or an admin withdrew the org palette they were on.

  An empty palette is KEPT rather than dropped, and an empty *active* palette
  resolves to empty rather than to the packaged defaults. Deleting every row is
  how a user turns the Brand row off; dropping the entry on the next read would
  delete something they meant to have.

  `planPaletteMigration` treats "nothing stored" as not a migration. Writing a
  palette there would invent a personal override the user never chose and
  detach them from an org palette they should still be receiving.

  `lib/storage.js` now stores that shape: `getPaletteState`, a shape-tolerant
  `getUserPalette`, a `setUserPalette` that writes the active entry, a
  `clearUserPalette` that removes every shape, and `migratePaletteStorage`.
  `background/service-worker.js` runs the migration on install and startup.

  Two properties are load-bearing and pinned by tests. Reads NEVER write: the
  popup and options pages read during init, and a surprise write there would
  interleave with the policy machinery that ten review rounds went into, so
  migration is the worker's job and reads simply resolve both shapes. And
  writes keep the legacy `palette` key as a MIRROR of the active palette, so a
  machine still on an older build sees the same colors rather than stale ones.

  The mirror is for one release. Removing it is not free: dropping it makes 15
  jsdom host cases fail, because they assert against `snapshot().palette`.
  Those assertions move to the collection when the mirror is retired.

- **The options page explains the organization-colors capability**
  (`options/options.html`). A disclosure section covering where an admin sets it
  (Chrome extension policy in the Google Admin console), the default
  starting-point semantics, what enforcement changes, and that enforcement is
  reversible and non-destructive. The managed note only appears once a policy
  already exists, so the capability was invisible to exactly the people who
  would ask for it. bd `workspace-custom-palette-z2z`.

- **The options page footer shows the extension version**, inline with Send
  feedback and Report a bug (`options/options.html`, `options/options.js`). Read
  from `chrome.runtime.getManifest()` rather than written into the markup, so it
  cannot drift on a version bump. bd `workspace-custom-palette-vc4`. The jsdom
  fake gained `runtime.getManifest` (`shared/__tests__/harness/fake-chrome.js`),
  reporting a version the real manifest does not have so the test proves the
  page reads the manifest instead of matching a hard-coded string.

- **`paletteLocked`: an admin can now ENFORCE the org palette, not just default
  it** (`config/managed-schema.json`, `lib/palette.js`, `lib/storage.js`,
  `shared/palette-editor.js`, `popup/popup.js`, `options/options.js`,
  `content/bootstrap.js`). The 0.2.0 headline. bd
  `workspace-custom-palette-8iv`.

  0.1.7 shipped managed colors with deliberate org-DEFAULT semantics: the admin
  palette is a starting point, and any personal edit detaches that user from
  future admin updates. Enforcement was deferred at the time with the mechanism
  already named — `sfx`'s design notes say "optionally a paletteLocked:true
  policy later to enforce managed > user". This is that follow-up.

  **Precedence.** `resolveEffectivePalette` gains `locked`, and it changes
  exactly one relationship: managed now outranks the user's palette.
  `remote` deliberately still wins, because the recorded intent was
  managed-over-USER and widening it is a separate decision nobody has taken; in
  practice it cannot affect a Web Store user, since `CONFIG_BASE` ships empty.
  A lock with no managed palette is ignored outright — there is nothing to
  enforce, and it must not strand someone on the packaged defaults with no way
  to edit them.

  **The guarantee is that nothing is written.** `isPaletteLocked` is the single
  predicate every locked behavior hangs off, so the popup and options page
  cannot drift into different ideas of "locked". The editor gains a `readOnly`
  mount option; the popup's `scheduleSave` refuses at call time (not by swapping
  the handler, since the lock can arrive late and that is the one funnel every
  edit path passes through); and options' Save, Reset and Import each refuse in
  the handler, not merely by hiding the button. Structural controls are removed
  rather than disabled: a greyed-out trash can reads as broken, an absent one
  reads as not-yours.

  **Locking is reversible, which is what makes it safe to trial.** A palette
  saved before the lock stays in the user's account untouched, and comes back
  exactly as it was when the lock lifts. Getting that right needed a real fix:
  the popup's "heal a redundant override" path compares the shown palette
  against the org's, and since a locked popup shows the org palette by
  definition, that comparison was true for *every* locked user — it would have
  silently deleted the personal palette of anyone whose admin turned enforcement
  on, irreversibly. Caught by a test written for exactly that invariant.

  **It applies live.** `onManagedChanged` now fires on either policy key, so a
  lock toggled on its own is picked up instead of waiting for a restart, and it
  hands back the whole current policy because a lock-only change carries no
  palette in the change record. A lock arriving after the popup has rendered
  re-mounts the editor read-only.

  Tests: the resolution table and `isPaletteLocked` as pure units, plus thirty-four
  jsdom cases across `popup/__tests__/popup-locked.test.js` and
  `options/__tests__/options-locked.test.js`, and `getManagedPolicy` cases in
  `lib/__tests__/storage.test.js`. Every fix was verified to bite by breaking it
  in isolation. Tier 1 goes from 212 to 251.

  **Five defects in the first cut of this feature were caught in review and
  fixed before it went anywhere**, which is worth recording because three of
  them were the same mistake in different clothes — guarding the popup and
  forgetting the options page, or claiming behavior no listener implemented:

  - The options page rendered `resolvePalette(userPalette, baseline)` with no
    lock branch, so a locked user with a stored override saw *their own* colors
    read-only beneath a note saying their organization sets them, while every
    picker rendered the org palette — and Export copied the wrong one out.
    Neither locked options test seeded `sync.palette`, which is exactly why
    nothing caught it.
  - `persistPalette` re-checked the lock only in `scheduleSave`, not after the
    `await` that is precisely where a late lock becomes known. The dismissal
    flush bypasses `scheduleSave` entirely, so it could write under a lock,
    desync `lastSaved` from the read-only editor, and then take the clear branch
    on the next flush — deleting the personal palette by another route.
  - The options page never remounted its editor when a late lock arrived
    (`readOnly` is fixed at mount), leaving a page locked in every respect
    except that its inputs still worked.
  - `docs/DEPLOY.md` and the test plan both claimed an already-open popup or
    settings page adopts a policy toggle live, when **neither page subscribed to
    `onManagedChanged`**. Wired both rather than narrowing the claim, since the
    runbook encourages admins to trial the lock. Writing that test found one
    more: unlocking stranded the popup on the org palette, because locking
    overwrites `lastSaved`.
  - `managedFlag`'s `{"Value": true}` branch — the shape the runbook tells
    admins to paste — had no test at all, so a regression there would have
    failed every Admin-console lock *open*, silently.

  A second review round then caught three more, two of them created by the
  first round's own fixes:

  - The options page's new `onManagedChanged` registration landed **inside**
    `applyPolicy`'s transition branch rather than in `init()` — a scripted edit
    matched the wrong `mountPaletteEditor` call. So on a fast policy read
    nothing subscribed at all, making the "both subscribe to policy changes"
    line false for the settings page immediately after it was written; and when
    it did register, every transition added another listener. The test now
    asserts `listenerCount()` stays flat across toggles.
  - The popup's live handler only called `applyLock`, which returns early when
    the lock state is unchanged — so an admin editing the org *colors* without
    touching the lock changed nothing on screen. Locked, the popup disagreed
    with the picker beside it beneath a note asserting these are the
    organization's colors; unlocked with no override, the next tweak would have
    auto-saved an override derived from a palette that was no longer the policy.
  - The options unlock path restored `userPaletteAtLoad`, a load-time snapshot,
    so a palette saved during the session was silently reverted on unlock and
    then written back over by the next Save.

  And a third round found the same class of staleness underneath all of it:
  **both hosts kept a load-time snapshot of the user's stored palette that
  writes never advanced.** In the popup, `userPalette` was a const while
  `hasOverride` moved with each write, so after an auto-save the live re-seed
  still saw "no override", replaced the just-saved colors with the org's, and
  left `lastSaved === managed` — which is exactly the condition the heal branch
  treats as a redundant override and **clears**, deleting the palette
  irreversibly. Both snapshots are now kept current at every write.

  That round also corrected a fix from the round before: `rendered` had been
  made to track the live editor so the lock stash could read it, but `rendered`
  is the *seed* marker `planLatePolicyReseed`'s mid-edit guard compares against.
  Overloading it made an imported-but-unsaved palette indistinguishable from an
  untouched one, so a live policy change discarded typing the user had not saved
  — the precise case the guard exists for. The stash now reads
  `editor.getWorking()` directly.

  A fourth round then found the two places that correction landed wrong, in
  opposite directions. In the popup, the stored-palette mirror was advanced in
  `persistPalette` only, while **three** paths clear an override and move
  `hasOverride` — so after the heal branch or the reset handler cleared one, the
  re-seed still planned against "they have an override" and left a superseded
  org palette on screen for the next edit to save as a personal copy. A mirror
  is something to forget at every future clear site, so it is gone: the tier is
  now derived from the one flag every write path already maintains.

  A ninth round found the most serious instance of the pattern: options
  `save()` and `resetToDefault()` checked the lock BEFORE
  `await ensureManagedKnown()` and never after — while `applyPolicy` runs inside
  that await. A lock landing mid-Save made the code read the org palette out of
  the freshly-remounted read-only editor, match it against the baseline, and
  call `clearUserPalette()`: **permanently deleting a synced personal palette**,
  for a Save issued against the user's own colors on a page that was not locked
  when they clicked, under the message "You will keep getting their updates."
  The popup had guarded that same await since the fifth round.

  That round also stopped fixing these one at a time and audited the two hosts
  against each other. The post-await write re-check was the last genuine
  asymmetry; the remaining differences are deliberate (options has no auto-save
  and no heal-on-open). The audit removes today's instances but not the
  mechanism that generates them, which is what bd
  `workspace-custom-palette-k74` exists to do.

  An eighth round found that seventh round's own fix had landed in the popup
  only: the options page's late `settled.then` could still apply a payload
  captured before an admin deleted the policy, re-locking the page read-only on
  colors that no longer exist. It needs the guard more than the popup does,
  since its late read sits behind no write path and fires unconditionally. Both
  hosts now share the ordering rule: a completed live policy beats a read that
  started earlier.

  A seventh round found the `managedUnknown` flag only guarded
  `ensureManagedKnown` on **entry**, so a call already parked on its await
  resumed with the payload it started fetching — which predates a deletion — and
  walked the policy back. Locked, that re-mounted the editor read-only on a
  palette that no longer existed and refused every save for the popup's life.
  The same round found the options page had never received the removal fallback
  at all: `planLatePolicyReseed` returns null on an empty org, so it kept the
  deleted colors on screen with the note already hidden, and Save stored them.

  Nine rounds is the story worth recording. Every individual fix was correct;
  the recurring shape was structural — the same fix landing in one host and not
  the other, stale snapshots of "has an override", and state established by one
  path overwritten by another that had already started. bd
  `workspace-custom-palette-k74` proposes the answer: extract "a policy changed,
  what should be on screen and what may be written" into one pure decision
  function with a per-transition table, the way `planManagedReset`,
  `localeVerdict` and `reportPlan` already are, so the two hosts cannot diverge
  again.

  A sixth round caught the removal branch itself resolving against that same
  load-time snapshot — the identical mistake, reintroduced in the branch whose
  comment claims to close it. Inside that branch `hasOverride` is already known
  false, so there is no user tier to resolve; resolving anyway put colors the
  admin had just deleted back on screen, on the two paths that clear an override
  in-session (the heal, and "Use organization colors"). Both of the previous
  round's tests mounted with an empty `sync`, which is exactly why neither could
  see it. The same round also found the handler never cleared `managedUnknown`
  despite being handed a *completed* read, so a popup whose own read hung
  refused every save for its lifetime — even after the handler had established
  there was no policy — and a stale in-flight read could walk `managed` back to
  a deleted palette.

  A fifth round found the live handler still ignored the *third* policy edit an
  admin can make: **removing the policy**, which `docs/DEPLOY.md` instructs at
  the end of a trial. The baseline only ever advanced toward a palette, so a
  deleted one stayed the baseline; `reseedFromManaged` and `refreshManagedNote`
  both no-op on an empty policy; and the org note was only ever *unhidden*. The
  result was a popup showing colors the admin had just deleted, beneath a note
  asserting the organization sets them, beside a picker that had already fallen
  back to the packaged defaults — with the next edit saving the deleted palette
  as a permanent override. The root cause was folding visibility into
  `wireManagedUi`, which runs once by design; it is now its own
  `refreshManagedVisibility`, called on every policy change.

  And reverting `rendered` went one step too far. It must hold still when the
  editor holds the USER's content — that is what makes `showing !== rendered`
  mean "they are typing" — but **Reset and the org-identical clear are
  code-driven re-seeds**, and genuinely are the new seed. Left stale, the guard
  reported mid-edit forever, so a later org-colors change could never reach the
  page and one click of Save would write the superseded palette as a permanent
  override. The rule is now stated beside both.

- **The synthetic monitor now runs a non-English leg** (`monitor/src/matrix.ts`,
  `monitor/src/__tests__/matrix.test.ts`). Closes bd
  `workspace-custom-palette-n60`.

  `MATRIX` gains Docs text and Sheets fill against a genuinely Danish UI, and
  `CheckItem` gains an optional `locale`. Those are the two surfaces the
  2026-08-16 reporter hit.

  This closes the gap behind every field bug this project has had. 0.1.4's
  tooltips and 0.1.6's apply failure were both locale bugs, and both were
  reported green by every automated tier, because every tier ran in English.
  Tier 1 has pseudo-localized fixture coverage now, but the monitor is the only
  END-TO-END signal, and English-only it could not have caught 0.1.6 either. The
  recipe was already known and written in a comment in this very file; it had
  just never been turned into a row.

  `localizedUrl` applies BOTH `hl` and `forcehl=1`. That is not belt-and-braces:
  `hl` alone is silently ignored because the account language wins, so a leg
  missing `forcehl=1` would run in English while reporting itself as Danish — a
  green result proving nothing, which is worse than no leg. A test pins both
  parameters on every localized leg for that reason.

  `checkId` now includes the locale. Without it the Danish `sheets.fill` and the
  English `sheets.fill` collide, and the second silently overwrites the first's
  result and diagnostic bundle — losing a failure in precisely the leg added to
  catch these. Monitor unit tests go from 11 to 17.

  `dismissPromos` in `check.ts` needed no change: it already presses Escape
  first (which works in any language) and treats its English button labels as a
  fallback, with the reasoning recorded there.

  Not yet verified: a live Danish run through the scheduled monitor, which needs
  `MONITOR_GOOGLE_USER` / `MONITOR_GOOGLE_PASS` (absent here). The path itself
  was verified by hand on 2026-08-16 in both apps.

### Changed

- **Organization colors replace the default palette until the user opts in**
  (`lib/storage.js`, `options/options.js`, `popup/popup.js`; owner ruling,
  2026-08-23). While org colors are all a user has, there is no Palette
  selector and no **New palette** button, and the worker no longer materializes
  a personal "Default" beside a delivered org palette - which had also let the
  packaged defaults shadow the org's on unlocked installs (latent C2). The
  Multiple palettes opt-in reveals creation; under an org palette the first
  created entry is simply "Palette 1" beside Organization colors, with nothing
  copied. Both hosts' managed notes now split on whether anything of the
  user's exists: pointing at the selector when it does, at the opt-in that
  creates it when it does not - including the UNLOCKED note, which used to
  promise a selector an org-only user does not have.

- **Reset asks before acting** (`options/options.js`; field ask, 2026-08-23):
  the first click arms - "Really reset?" plus a status advisory that unsaved
  changes will be lost; clicking away disarms without resetting; a second
  click restores. Under a lock it still refuses outright, now from the handler
  too (arming would read as "a click did nothing"). Same inline pattern as
  Delete palette, for the same reason: silent destruction of work reads as a
  bug.

- **Reset restores the last SAVED state instead of the packaged defaults**
  (`options/options.js` `resetToDefault`). The defaults only ever mattered
  before the first save, where they ARE the effective saved state, so
  re-resolving from storage covers every case: an override user gets their last
  save, a managed no-override user re-seeds to the org baseline, a fresh user
  re-seeds to the defaults. It now writes NOTHING - which retired the bounded
  `ensureManagedKnown` wait, the post-await lock re-check, and the
  `writeOverride(null)` clear, along with the whole class of races those
  guarded (the mid-await-lock test is replaced by one asserting sync storage is
  byte-identical after a lock lands mid-Reset). The button is now just "Reset";
  the unlocked-managed note no longer promises Reset brings the org colors back
  and points at the Palette selector, which does.


- **The on/off switch moved from the popup to settings** ("Show brand colors",
  `popup/popup.html`, `popup/popup.js`, `options/options.html`,
  `options/options.js`). Product owner's call: it is a set-and-forget
  preference nobody toggles in anger — popup real estate belongs to the
  palette. Same optimistic toggle-with-revert-on-failed-write the popup used,
  now with a jsdom test; the popup has no `#enabled` control at all.


- **Each palette now gets its own `chrome.storage.sync` item**
  (`lib/storage.js`). bd `workspace-custom-palette-7i3`. The collection shared
  one key, and `QUOTA_BYTES_PER_ITEM` is 8192: a full palette (24 swatches,
  long names) serializes to about 1.6 KB, so the shared key held **five** while
  `MAX_PALETTES` advertised twelve. Per item the ceiling scales with a single
  palette instead of the collection.

  Palettes live at `pal:<id>` with `paletteOrder` holding the ids in order. The
  id lives in the KEY, not the value — storing it in both invites the two to
  disagree with no honest way to resolve it, so reads take the key as
  authoritative. Reconstruction appends items the order forgot rather than
  orphaning them, so a write that landed without its index update is recovered.

  Reads take ONE round trip (`get(null)`): the ids are not known until the
  index is read, and an index-then-fetch would be two hops on the path the
  popup's teardown flush cannot afford. A save writes only the touched
  palette's own item plus the index and pointer, so an edit no longer rewrites
  a collection that could not fit.

  Three shapes resolve on read, in precedence order: per-key, the interim
  single-key collection this build briefly wrote, and the shipped legacy
  `palette`. The migration moves the interim shape to per-key and removes the
  shared key only after its contents are safely stored under their own.

- **`paletteLocked` is now two rules, not one** (`lib/palette.js`,
  `popup/popup.js`, `options/options.js`). bd `workspace-custom-palette-v2l`,
  implementing the `cv2` decision. Enforcement used to mean a single thing: the
  org palette wins outright and the page is frozen. It now means:

  *Default selection* — a user under enforcement who has never chosen STARTS on
  the organization's palette. `resolveEffectivePalette` no longer consults
  `locked` to reorder its tiers; it consults it only to decide what an unset
  pointer defaults to, so an explicit choice always wins.

  *Read-only, per entry* — enforcement freezes the ORGANIZATION's palette, not
  the whole editor. A locked user sitting on a palette of their own may still
  edit it. `isActivePaletteReadOnly` is that rule, and `planPolicyApply` keys
  its re-mount and its mid-edit guard on read-only rather than on the lock. The
  return value carries both `locked` (is enforcement in force) and `readOnly`
  (may THIS editor be edited); both hosts track them separately so the two
  meanings cannot fuse back together.

  The active pointer now spans two sources — the user's collection in `sync`
  and the admin's policy in `managed` — so the org palette gets a reserved id,
  `ORG_PALETTE_ID`. `normalizePalettes` rejects it (and the `org:` prefix that
  `om8` will use for several org palettes) as a user entry id, so a user
  palette cannot impersonate the organization's.

  No behaviour changes yet: nothing sets `activePaletteId` until the switcher
  lands, so `readOnly` equals `locked` and all 17 existing `planPolicyApply`
  rows plus the 36 policy jsdom cases pass with their assertions untouched. The
  only edit to them was mechanical, renaming the `wasLocked` parameter to
  `wasReadOnly` — the mount-time flag is what a re-mount has to change, and
  keeping the old name would have been actively wrong once the two diverge.

  A follow-up review caught two gaps in the split. The detach sentinel
  (`NO_ACTIVE_PALETTE_ID`, which `clearUserPalette` persists today) resolved as
  "not the org palette", so read-only disagreed with what
  `resolveEffectivePalette` actually returned — a locked, detached user would
  have got an editable editor over enforced org colours. `resolveActivePaletteId`
  now maps it to `ORG_PALETTE_ID` when an org palette exists, at the single
  source, so the two agree by construction rather than by a matching patch on
  each side. And `options/options.js` recomputed its tracked read-only instead of
  adopting `plan.readOnly`; the recompute is pointer-blind, so it collapsed back
  onto the lock and would have fed a wrong `wasReadOnly` into the next plan.

- **Every write guard now reads the per-entry rule, not the lock**
  (`popup/popup.js`, `options/options.js`). bd `workspace-custom-palette-jfe`,
  completing the `cv2` decision in the hosts. The old invariant was "no write to
  `chrome.storage.sync` while a lock is in force"; the new one is **no write may
  change the ORGANIZATION's palette while enforcement is in force**. Eighteen
  guards were re-derived from that sentence across both hosts in one commit,
  including both hosts' write helpers, every pre- and post-await re-check, the
  auto-save scheduler, the on-open heal, the pending-edit drop, the control
  visibility, and which palette each editor is seeded with.

  Neither host now tracks "is enforcement in force" at all: every question they
  ask turned out to be the per-entry one, so the dead flag was removed rather
  than carried. The note copy is the one place that will need it back, and that
  is `cyv`'s to write.

  No behaviour change yet — nothing sets `activePaletteId`, so the per-entry
  rule still evaluates to the lock, and all 340 tests pass untouched.

- **`resolveActivePalette` is now `resolveActiveUserPalette`**
  (`lib/palette.js`), returning `Swatch[] | null` and no longer taking
  `defaults`. It presented itself as a full resolution while knowing nothing
  about the remote, managed and locked tiers, which made it a second entry
  point for a question `resolveEffectivePalette` already answers — the exact
  shape that cost this module six divergences over ten review rounds. `null`
  ("nothing stored") is now distinguishable from `[]` ("an entry exists and is
  empty"). What an empty active palette should MEAN is deferred to the switcher
  issue rather than answered by a function that cannot see the managed tier.

- Swatch names are capped at `MAX_SWATCH_NAME` (48). They were uncapped, which
  let a single palette exhaust the 8 KB `QUOTA_BYTES_PER_ITEM` ceiling that the
  whole collection now shares. `setUserPalette` also translates a quota
  rejection into a message a user can act on. This does not make
  `MAX_PALETTES` (12) reachable — roughly 1.9 KB per full palette means four to
  six per item — so per-key storage is filed as
  `workspace-custom-palette-7i3` and BLOCKS the switcher.

- **The popup and the options page now decide policy changes with one shared
  pure function** (`lib/palette.js` `planPolicyApply`, consumed by
  `popup/popup.js` and `options/options.js`). bd
  `workspace-custom-palette-k74`.

  `paletteLocked` took nine review rounds to stabilize, and the defect pattern
  was structural rather than logical. Five times a fix landed in one host and
  not the other (the locked render branch, the live-listener placement, the
  removal fallback, the stale-read ordering guard, the post-await write
  re-check); three times a host planned against a stale snapshot of "does this
  user have an override"; twice a path that had already started overwrote state
  a later path established. Every individual fix was correct and
  mutation-verified. Nothing stopped the next divergence, because there was no
  single place the two hosts had to agree.

  `planPolicyApply` is that place. It takes the policy, the lock, whether an
  override is stored, what the editor is showing versus what it was seeded
  with, and the pre-lock stash; it returns what to display, whether a re-mount
  is required, the new stash, and whether writes are allowed. Each host now
  does only its own DOM work. `planLatePolicyReseed` is subsumed by it.

  Two concrete reductions came with it. The options page no longer maintains
  `userPaletteAtLoad` at four separate write branches as a palette that had to
  stay in sync — it carries the popup's `hasOverride` boolean instead, and the
  load-time snapshot is now assigned once, read only as the unlock fallback for
  a page that loaded locked (safe because every write path refuses while
  locked). `applyLock` and `reseedFromManaged` are gone from the popup.

  The unification exposed a SIXTH divergence that nine rounds of per-host
  review had not: removing the policy while it is LOCKED. Both hosts treat it
  as an unlock and restore the pre-lock stash, but the options page then
  returned from its re-mount branch and never reached its removal branch — so a
  user with no override was left looking at the DELETED org colors, with the
  note correctly hidden and nothing on screen explaining them, one click of
  Save from storing them as a permanent personal override. The popup ran both
  branches and landed on the packaged defaults. It only reproduces when the
  lock is TAKEN during the session (a page that loads locked has an empty stash
  and re-resolves correctly), which is why it had never been hit. Fixed, and
  pinned on both hosts.

  Seventeen pure rows cover the transition table (lock on/off x
  override/none x untouched/mid-edit x policy present/removed). The 34 existing
  policy jsdom cases pass unchanged — they were the regression net for this
  refactor, and they earned it: one of them caught a behavior change in an
  early draft, where "no override, so show the org palette" would have pushed
  colors back at a user who had deliberately deleted every row and saved.

  One deliberate host difference is now explicit rather than accidental, as
  `keepUnsavedOnLock`: the options page has an explicit Save, so unsaved rows
  are work to preserve across a lock, while the popup auto-saves and drops its
  pending debounced edit. One known gap is recorded rather than silently
  changed — an admin who edits the org colors in the same policy write that
  lifts the lock leaves the previous palette on screen, pre-existing on both
  hosts, bd `workspace-custom-palette-0ld`.

  Tier 1 goes from 251 to 274.

- **Bug reports now distinguish the browser's language from the Google
  editor's** (`shared/feedback-email.js`). Closes bd
  `workspace-custom-palette-5nc`.

  The diagnostics footer emitted `UI language: xx` from `navigator.language`,
  which is the BROWSER's UI language. The language that actually breaks the
  apply path is the one the Google editor is set to, and the two differ often:
  the 2026-08-16 reporter wrote in English with a Danish Docs UI, so the
  auto-captured line pointed at the wrong locale on the one report where the
  locale was the entire bug.

  Two changes, both small: the line is now labelled `Browser language:` so it
  stops being read as the editor's, and `INTRO.bug` (the seeded bug template)
  ends with "Language your Google editor is set to:" so every bug report asks.
  Asking is not a fallback here but the only option — the feedback page is not
  a content script and never touches `docs.google.com`, so it cannot observe
  the editor's language at all. Reading it from the content script and plumbing
  it across surfaces was considered and rejected as disproportionate; it is
  recorded in the issue rather than built.

  This supersedes the 0.1.7 post-update notice's ad-hoc request, which only
  ever reached users who read that notice.

### Removed

- **The "Show brand colors" toggle is gone from the UI** (`options/options.*`;
  it had moved there from the popup the same day). The `enabled` MECHANISM is
  untouched and still honored by the content script, so re-adding it is a
  UI-only change - recorded with its rationale in `FUTURE_IMPROVEMENTS.md`.
  `retireEnabledToggle()` in `lib/storage.js`, called once from the worker's
  migration, flips a stored `false` back to `true`: a 0.1.7 user who had
  toggled off would otherwise be stranded with invisible colors and no control
  left to find them.



- `mayWrite` from `planPolicyApply`'s return (`lib/palette.js`). It was returned
  and consumed by neither host. It could only ever be `!locked`, and a second
  name for one fact is how the two drift — the guard a write needs must read the
  live lock at write time, which is what the guarded write functions above do.

### Fixed

- **The Administrators button wrapped to four lines** (`options/options.html`;
  field, 2026-08-26). The settings rows are flex lines whose trailing
  description is greedy, so a multi-word button shrank to the narrowest column
  that could hold it — "Build / organization / colors" stacked, 88px wide and
  75px tall. The control now keeps its natural width and the description
  absorbs what is left; measured at 167x33 on one line, unchanged from 520px to
  1000px. Pinned by a page-smoke check that computes the rendered line count,
  since this is CSS-only and no jsdom test can see it — mutation-checked, it
  reports 3 lines with the rule removed.

- **The policy builder opened from Settings was inert** (`options/policy-builder.js`;
  roborev 4207/4210, High). Its logic was an inline `<script>`, which works over
  `file://` and is blocked outright by Manifest V3's default `script-src 'self'`
  on a `chrome-extension://` page — so the Settings button shipped in the same
  round rendered the shell and wired nothing. Reproduced in a real browser
  before fixing (`scriptRan: false`, two CSP violations) and confirmed working
  after. The jsdom test could never have caught it: it loads the file with
  `runScripts: "dangerously"`, which has no concept of the extension's CSP, and
  stayed green throughout — so the page smoke now opens the builder as an
  extension page and asserts no CSP violation, that its script ran, that it
  produced a payload, and that the preview painted. Shipping it as two files is
  the cost of the in-extension route; `docs/DEPLOY.md` says so where it tells
  you to send it to an admin.

- **The options-page collection re-read could report a successful save as
  failed** (`options/options.js`; roborev 4204/4205). It ran after the write
  landed but before the success status, with no try/catch — so a transient
  storage error surfaced "Failed: …" for a palette that was persisted. The
  popup's copy had always guarded this; the two disagreeing was the oversight.

- **A policy event hid Save from a user editing their own palette under a lock**
  (`options/options.js` `applyPolicy`). `applyManaged` recomputes `readOnly` and
  then renders the note and the lock affordances FROM ITS OWN ANSWER, but was
  called without the active pointer — so it answered "enforced" for a user whose
  palette is editable, and the `plan.readOnly` adopted immediately afterwards
  fixed the variable while re-rendering nothing. Latent until saves began moving
  the pointer, and found by that change. The pointer is now passed, so the
  recompute matches the plan it is about to be reconciled with.

- **Detaching from the org palette created a second palette the chooser
  refused to show** (`options/options.js`, `popup/popup.js`; field, 2026-08-26,
  C3). Saving an edit to the organization's colors writes a new personal entry,
  so with **Multiple palettes** on there are two palettes and the selector
  should appear. It did not: both hosts kept the collection they read at mount,
  so the switcher went on counting one entry and hid a palette that genuinely
  existed until a reload. Both now re-read the collection after any write that
  can change it — all three of the options page's `writeOverride` exits, and
  the popup's `commit`, which reaches this sooner because it auto-saves. The
  stored POINTER is deliberately not adopted at the same time: `setUserPalette`
  moves it too, and taking it changes what a lock then does (an explicit
  pointer at a personal palette stays editable under enforcement, the `cv2`
  rule) — a real question, but not one to settle as a side effect of fixing the
  chooser. Regression tests in both hosts, each mutation-checked.

- **`policy:state` could never report that a policy was enforced**
  (`dev/policy-state.mjs`; roborev 4185, High). JS regex alternation is
  leftmost-first, not longest-match, and the key list put `palette` before
  `paletteLocked` and `paletteOrder` — so every occurrence of the longer keys
  matched the shorter `palette` and stopped. The tool printed "enforced: no"
  for every policy ever pushed, which is the single fact D1, D5 and F1 exist to
  check: it was least trustworthy exactly where it was most needed, and the
  walkthrough had just started telling testers to believe it. Keys are now
  longest-first in a named `SCAN_KEYS` constant with a test asserting no key
  precedes one it prefixes. Also fixed alongside it: `readdirSync` gives no
  chronological guarantee, and the scrape lets later records win, so an
  unsorted walk could let a stale compacted value overwrite a newer one —
  `orderByWrite` now puts compacted `.ldb` files before the live `.log` and
  orders numerically within each. The pure helpers are exported and the script
  body is guarded so importing it cannot read a profile as a side effect;
  nine tests cover them, mutation-checked against both original bugs (5 fail
  when reverted).

- **A palette created by SAVING was called "Default", and it usually was not**
  (`lib/palette.js` `OWN_PALETTE_NAME`, `lib/storage.js` `setUserPalette`;
  field, 2026-08-25, D4/F1). Saving an edit to the org palette detaches a copy,
  and the entry that appeared was named `Default` while holding the
  ORGANIZATION's colors — reported as "a Default that didn't even have the
  actual Default palette". Save-created entries are now `My colors`; an
  existing palette keeps its own name, and the two paths that genuinely produce
  a default (the pre-multi-palette migration and
  `ensureDefaultPersonalPalette`) still say `Default`.

- **The first palette you created was named "Palette 2"** (`options/options.js`
  `nextPaletteName`; field, 2026-08-25, D2). The name came from counting
  entries and adding one, so any pre-existing entry — under an org policy,
  usually the detached copy above — pushed the first real creation to 2.
  Numbering is now by first UNUSED name, so the first palette you make is
  Palette 1 and a name is never reused while its palette exists.

- **The toolbar icon kept the previous organization's colors after a policy
  change** (`background/service-worker.js`; field, 2026-08-25 — the policy moved
  to Org Blue / Org Green and the icon stayed on Poppy / Sunshine). The storage
  listener that repaints could not catch it: a user sitting ON the org palette
  has pointer `"org"` and an EMPTY mirror, so an admin swapping the published
  colors changes nothing in `sync` or `local` and fires none of the events that
  listener watches. `onManagedChanged` now repaints after the enforcement push
  settles, so the repaint reads post-push state.

- **The enforced-user note told people to turn on an opt-in that was already
  on** (`options/options.js`, `popup/popup.js`). Flipping **Multiple palettes**
  to default ON left this copy behind: an enforced user with no palette of
  their own was told "Turn on Multiple palettes to keep colors of your own",
  while the checkbox was already ticked and the **New palette** button they
  actually needed sat directly below the note. Both hosts now read the opt-in
  and name the control that is genuinely on screen — New palette when they are
  opted in, the opt-in itself when they are not. Both branches are covered by
  tests rather than just the one that used to exist.

  The first pass fixed only the paths that RENDER the note (load, policy push)
  and left the paths that change what it should say (roborev 4133). The text is
  now `refreshManagedNote()`, called from all three: `applyManaged`, the opt-in
  toggle, and `switchPalette`. The toggle left the note naming the state the
  user had just left; the switch was worse and predates this work — a locked
  user who selected a palette of their own was still told they could not edit
  it, while editing it. Every input the note reads (`paletteReadOnly`,
  `multiPalette`, `userList`) can change without a policy event, which is why
  it could not live on the policy path. Three tests now drive the toggle in
  both directions and the switch, each written to fail before the fix.

- **`dev/pages-smoke.mjs` leaked its temp profile when the BROWSER failed to
  start** (roborev 4113). The `try`/`finally` added for the checks began after
  `launchPersistentContext`, but `mkdtempSync` runs before it — so the two
  likeliest throws in the script (headless Chromium failing to start, the
  unpacked extension failing to load) leaked the profile directory they had
  just created, which is the same "the failure path is also the leak path"
  hole the block was added to close. The launch is now guarded separately and
  removes the directory before rethrowing; verified by forcing an invalid
  browser channel and confirming zero leftover profiles.

- **`CHANGELOG.md`'s `[Unreleased]` section had grown eighteen heading blocks**
  (roborev 4116). Successive entries each appended their own `### Fixed` /
  `### Changed` / `### Added`, so the section held repeated headings instead of
  one per category, against the Keep a Changelog structure `CLAUDE.md`
  mandates. Consolidated to seven, in Keep a Changelog order, with all 79
  bullets preserved and asserted by count.

- **With several org palettes published, every re-read showed the FIRST one**
  (`lib/config.js` callers in `popup/popup.js`, `options/options.js`,
  `content/bootstrap.js`, `background/service-worker.js`; field, 2026-08-24,
  section E). `orgSwatches(policy, activePaletteId)` takes the pointer to decide
  which published palette is in force — and **every call site but the switch
  itself omitted it**, so they all resolved to `orgPaletteSwatches(orgList,
  undefined)`, which means "the first". Selecting Wholesale therefore rendered
  Wholesale for exactly as long as the switch handler's own assignment
  survived; reopening the popup, opening a Docs picker, or repainting the
  toolbar icon each re-derived the org tier without the pointer and snapped
  back to Retail's colors under Wholesale's name. Invisible with a single org
  palette, since first and only coincide, which is why C and D passed.
  Two halves to the fix: every site now passes the pointer, and the cached
  `managed`/`baseline` values are re-derived when the pointer MOVES — the
  content script keeps the raw policy (`policyRaw`) so `refreshUserTier` can
  recompute the org tier, and both hosts' `switchPalette` update it. Regression
  tests mount two published palettes and assert both the open-on-the-second
  case and the switch case; the first was mutation-checked against the
  un-fixed line.

- **Field round 5 (2026-08-24): the ID fix needed a re-load, and the console's
  Save is where nobody looks** (`docs/TESTING-0.2.0.md`, `docs/DEPLOY.md`,
  `options/policy-builder.html`). Pinning the ID in `manifest.json` was
  necessary but not sufficient: Chrome registers an unpacked extension's
  identity at load time and a **Reload does not adopt a new ID**, because the
  ID *is* the identity. Read out of the test profile's own registry, the
  extension was still installed as `lcgphmdkenfmepgpenegnbepjkpgmbci`
  (`location=4`, path = this repo) while the console entry configured
  `hchpnnppgakgmobkbldgkohmplkcahjl` — so `chrome://policy` reported "No
  policies set" with nothing on screen to explain why, and reloading policies
  could never have fixed it. C0c is now an explicit ID check with the
  Remove-and-Load-unpacked remedy, and the delivery ritual gained an ordered
  troubleshooting list that puts the ID first. Separately, the Admin console
  puts **SAVE in the upper right of the settings panel**, not next to the field
  being edited, and leaves an edited field highlighted yellow *after* saving
  (meaning "set at this org unit", not "unsaved") — both now stated wherever an
  admin is told to paste a payload. The Allow-install-still-delivers-policy
  claim in C0b is marked as unproven rather than asserted, with the escalation
  to try Force install if the ID check passes and C1 still delivers nothing.

- **The 0.2.0 test script is no longer hard-wrapped** (`docs/TESTING-0.2.0.md`).
  It was wrapped at ~72 columns, which is fine for a diff and bad for the thing
  it actually is: a runbook read on screen, in a wide window, while following
  along. Paragraphs are now one logical line each and the reader's viewer wraps
  them; DO / EXPECT / IF NOT stay on their own lines, and tables, lists and
  fenced payloads are untouched. Word count is identical before and after.

- **Enterprise policy could never reach a dev build, which is why section C of
  the 0.2.0 test failed three times** (`manifest.json`, `docs/TESTING-0.2.0.md`
  C0, `docs/DEPLOY.md`, `options/policy-builder.html`; field, 2026-08-24).
  Two compounding causes, both measured rather than guessed. First, an unpacked
  extension's ID is derived from the FOLDER PATH it is loaded from: the same
  tree staged at two temp paths loaded as `kdnlgdpfoehpadnbcfijlfknjfldcadn`
  and `offoifpapdineoklbbkdgndkpapnpdbh`. The ID the test document told the
  admin to add (`lcgphmdkenfmepgpenegnbepjkpgmbci`) was therefore an artifact
  of one checkout on one machine, was not in the Web Store, and so could not be
  added by ID at all — the console fell through to demanding a custom
  installation URL, which is the wall the tester hit. Second, adding the
  extension the only way that works (Web Store, by name) yields the STORE id
  `hchpnnppgakgmobkbldgkohmplkcahjl`, so any policy set on it was delivered to
  a different extension than the one under test. `manifest.json` now carries
  the store item's own public `key`, which pins the unpacked build to the store
  ID; verified by loading this tree and reading back
  `hchpnnppgakgmobkbldgkohmplkcahjl`. The Web Store injects that identical
  field into what it distributes, so it is not a divergence from the shipped
  artifact. C0 was rewritten around the real console flow (yellow **+** → Add
  from Chrome Web Store → search by name), gained an ID-confirmation step and
  two new steps (C0b: installation policy must be Allow, not Force, or the
  store's 0.1.7 is pulled down on top of the build under test; C0c: exactly one
  copy, since both now claim the same ID), and carries the measured explanation
  so the failure is not re-derived. The same correction landed in DEPLOY's
  admin runbook and in the policy builder's own instructions, both of which had
  repeated the by-ID advice.


- **The policy builder capped palettes below what the extension supports, and
  could publish a palette that silently vanished** (`tools/policy-generator/`;
  roborev 4108). It hardcoded `MAX_PALETTES = 10` under a comment claiming it
  matched `lib/palette.js`, where the real cap is 12 - so the tool that exists
  to spare an admin the JSON sent them back to hand-writing it to reach
  palettes 11 and 12. And in several-palettes mode, one palette emptied beside
  full ones was emitted as `{name, swatches: []}` with no warning, which
  `normalizeOrgPalettes` then drops outright: a published name that never
  appears. `listProblems()` now names each empty palette individually, distinct
  from the louder whole-payload message. The caps are asserted against the real
  exports in `tools/policy-generator/__tests__/`, so the comment can no longer
  be wrong quietly.

- **The popup no longer saves a hex you are still typing** (`shared/palette-editor.js`,
  `popup/popup.js`; field, bd `workspace-custom-palette-iyv`). The editor
  auto-saved on a 250ms per-keystroke debounce, and most prefixes of a hex are
  themselves valid hexes - `#FE5916` is what the field holds while someone
  finishes typing `#FE5917` - so an intermediate value could be persisted to
  `chrome.storage.sync` and recorded in the undo history that outlives the
  popup. That is the shape of the field report where a swatch nobody edited
  read one digit off a color being typed elsewhere. `mountPaletteEditor` now
  tells its host WHICH KIND of change it is: `onChange(working, { settled })`,
  where `input` on any field (and the color chip's drag stream) is interim and
  `change` - blur, Enter, a dismissed picker - is settled, as are the
  structural edits. The popup writes on settled only (`onEditorChange`
  replaces `scheduleSave`; the debounce timer is gone). Nothing is lost by
  waiting: the interim value stays in the DOM inputs, and every path that ends
  an edit - switching palettes, undo/redo, the dismissal flush - already
  commits by reading those inputs. Pinned by the settled/interim contract in
  `shared/__tests__/palette-editor.test.js`, a no-write-then-write pair in
  `popup/__tests__/popup-glue.test.js`, and a mid-switch unsettled-edit case in
  `popup/__tests__/popup-locked.test.js`. The test harness's `typeInto` now
  fires `input` + `change` (type and move on); `typeInterim` models a field
  still being typed in.

- **Rename/Delete no longer strand an org user's existing palette behind the
  opt-in** (`options/options.js` `renderSwitcher`; roborev 4101). The
  2026-08-23 ruling gates CREATING a personal palette on Multiple palettes,
  but managing one they already have followed the same flag - so the state
  the 2026-08-22 rule deliberately surfaces (org palette beside their own, no
  opt-in: migrated 0.1.7 overrides, or post-C3 saves) showed a selectable,
  editable own entry whose rename/delete controls were hidden. They now
  follow the switcher's own visibility (`plan.visible`) and the active
  entry's source; creation stays strictly opt-in-gated.

- **Switching palettes left open tabs and the toolbar icon on the old colors**
  (`lib/storage.js`, `content/bootstrap.js`, `background/service-worker.js`;
  field, 2026-08-23, bd `workspace-custom-palette-3ij`). The legacy `palette`
  key is the live-update channel every open tab and the action icon listen on,
  but only Save rewrote it: `setActivePalette`, `createPalette`,
  `deletePalette` and `applyEnforcementPush` moved the active-palette pointer
  without moving that mirror, so a Doc stayed on the previous palette until
  the user edited something, and the toolbar icon ignored switches entirely.
  Every pointer-moving writer now rewrites the mirror from the pointed-at
  palette in the SAME atomic set (`mirrorForActivePalette`), including the
  migration's pointer-only repair, which used to blank it over a live
  collection. Consumers also stopped assuming the mirror is the whole truth:
  the content script re-resolves on a sequenced refresh, and the icon repaints
  on pointer changes - both reading the pointer via
  `resolveActiveUserPalette`, which additionally un-pins a locked switcher
  user whose stored pointer is absent (the lock rule defaulted them to the org
  entry). Regression-tested at three layers: writer invariants in
  `lib/__tests__/storage.test.js`, jsdom page tests, and a real-Chromium
  harness switching palettes through both UIs.

- **The popup footer centers its links** (`popup/popup.html`): field ask,
  2026-08-23 - they sat hard left under a centered page. Pinned by a static
  stylesheet test like the `[hidden]` guard, because jsdom applies no CSS.

- **A lock landing inside Reset's storage read could repaint the enforced
  editor with personal colors** (`options/options.js` `resetToDefault`, review
  4094). Dropping Reset's write removed the STORAGE half of that race, not the
  race: `applyPolicy` remounts the editor read-only on the org palette while
  the read is outstanding, and resuming re-rendered the user's own palette over
  it - disabled inputs under a note reading "your organization sets these
  colors". Not a bypass, but a page lying about whose colors are on screen. The
  post-await re-check is back (mirroring `save()`), with distinct wording so a
  test can tell which guard fired, and the comment claiming the re-check "went
  away with the write" is corrected. The test now parks the READ itself -
  `fake.sync.hold()` gates writes, and Reset performs none - so the race is
  guaranteed to occur rather than resolving in a microtask.



- **A failed convenience could silently skip the enforcement push**
  (`background/service-worker.js`). Review finding: the default-palette
  materialization (a fetch) was chained bare ahead of `applyEnforcementPush`
  inside one swallowed try/catch, so a fetch failure disabled the
  correctness-critical push for that run. The convenience now fails alone.

- **Switcher entry labels moved into `planPaletteSwitcher`** (`lib/palette.js`,
  both hosts read `entry.label`). The "Organization (organization)" bug existed
  precisely because the label rule was a ternary pasted into two DOM files and
  had to be fixed twice; it is now decided once and unit-tested, including the
  case-variants.

- **`dev/test-policy.sh none` proves its own teardown** scoped to its exact
  plist path; the walkthrough's generic `ls | grep extensions` false-alarmed on
  machines where an MDM legitimately manages other extensions — this very
  machine force-installs one.


- **The org note and the palette switcher ignored `hidden` entirely**
  (`popup/popup.html`, `options/options.html`, `feedback/feedback.html`). The
  cause of three escalating field reports of "my colors say they are
  organization-managed" with no policy anywhere: an author `display` rule
  (`.managed-note { display: flex }`, `.switcher { display: flex }`) beats the
  UA's `[hidden] { display: none }` regardless of specificity, so
  `el.hidden = true` was a silent no-op on those containers. The popup's org
  note has been always-visible since the 0.1.7-era commit that gave it flex
  layout — it SHIPPED — and the switcher was unhideable from the day it was
  created, which also produced the visible-but-empty dropdown sighting.

  The exact bug class had been found once before and patched narrowly
  (`.intro[hidden] { display: none; }`, line 25 of the popup) — then the next
  two styled containers reintroduced it. Replaced with a global
  `[hidden] { display: none !important; }` on every page that uses the
  attribute, pinned by a static test — a static one because jsdom does not
  apply CSS to hidden semantics, which is precisely why 408 passing tests
  could not see what three screenshots showed.


- **The popup's palette selector rendered as a raw, unstyled stub**
  (`popup/popup.html`) — it was the popup's first-ever `<select>` and nothing
  styled the element, so it appeared as a tiny empty grey control. Now styled
  to match the popup's buttons. Both hosts also stop rendering
  "Organization (organization)" for a legacy single-palette policy — the
  source suffix applies only when the palette carries a distinct name
  (`popup/popup.js`, `options/options.js`).


- **Org-enforcement language showed to users with no policy at all**
  (`options/options.html`). Field report: a tester with no managed policy read
  the settings page as saying their colors were organization-managed. The
  managed *note* was correctly hidden — what they saw was the always-visible
  "Organization colors" disclosure section, added earlier at the product
  owner's request and now removed at their reversal: only users actually under
  admin management should ever see organization language, and the capability is
  documented for admins in `docs/DEPLOY.md` instead. Verified nothing
  org-worded now renders without a delivered policy on either host page.


- **The local managed-policy recipe could never have worked** (`docs/DEPLOY.md`,
  now `dev/test-policy.sh`). Found in the field: the tester followed it exactly
  and `chrome://policy` showed the extension's section with "No policies set" —
  schema loaded, no values delivered. The recipe wrote `ExtensionSettings →
  policy` into `com.google.Chrome.plist`, which is a Windows/Linux delivery
  shape; on macOS an extension's managed storage comes from its own
  per-extension plist (`com.google.Chrome.extensions.<ID>.plist`, keys at top
  level), and hand-written XML under `Managed Preferences` is unreliable
  besides. Worse, the old recipe would have OVERWRITTEN
  `com.google.Chrome.plist`, which on the test machine carries unrelated
  machine policy, and its teardown would have deleted that file.

  `dev/test-policy.sh` replaces it: auto-detects the unpacked extension ID from
  Chrome's profile data, writes the correct binary per-extension plist, lints
  before installing, never touches `com.google.Chrome.plist`, and has one mode
  per walkthrough step (`unlocked`/`locked`/`multi`/`lock-only`/`degenerate`/
  `none`). The walkthrough's policy steps are now single commands, and the
  teardown verifies the machine-wide test artifact is actually gone.


- **Unlocking restored the old org colors when the admin changed them in the
  same write** (`lib/palette.js`, both hosts). bd
  `workspace-custom-palette-0ld`. One policy write that both edits the colors
  and lifts the lock leaves a user with nothing of their own looking at the
  PREVIOUS org palette, because the pre-lock stash IS that palette — while the
  pickers have already moved to the new one. `planPolicyApply` now takes
  `wasManaged`, the outgoing policy, which is the only way to tell a stash the
  user chose from one that is merely the old org colors.

  The guard requires the previous org palette to be non-empty. Without that an
  empty stash matched an absent previous policy and pushed colors back at
  someone who had deliberately deleted every row — the case the issue named in
  advance as the reason the naive form of this fix is wrong.

- **The switcher highlighted a different palette than the one in effect**
  (`lib/palette.js` `planPaletteSwitcher`). With no explicit selection — the
  state every freshly opted-in user is in — no entry was marked active, while
  `resolveActiveUserPalette` falls back to the first USER entry. Centralizing
  this decision was meant to stop exactly that disagreement, and the commit
  that centralized it introduced one.

  "Nothing marked active" is not inert in a `<select>`: the browser then
  defaults to the FIRST option, and org entries are listed first. So an
  unlocked user with an org palette published and the opt-in on would have seen
  an ORG palette shown as selected while the editor held, and edited, their own
  first palette. The marking now mirrors the resolver exactly, and a test table
  drives the same inputs through both and asserts the highlighted entry is the
  one that resolves.

- **A stale write could corrupt the new palette's undo after a switch**
  (`popup/popup.js` `commit`). `commit()` reassigned the shared `inflight` to
  its own write before checking whether an earlier one had settled, so
  `await inflight` resolved when the NEWEST write finished rather than the
  oldest. The older write then landed and clobbered `lastSaved`/`history` with
  the palette the user had just left, so the next edit recorded its undo
  snapshot from the wrong colors and Undo restored a palette they were no
  longer on. Storage looked correct throughout, which is why the existing
  assertions could not see it. `commit()` now claims the slot before awaiting
  the previous write, which makes it a queue rather than a race.

- **The palette switcher, in the popup** (`popup/popup.html`,
  `popup/popup.js`). bd `workspace-custom-palette-kbs`, fourth increment. Same
  control as the options page, rendered from the same `planPaletteSwitcher`.

  The popup auto-saves on a debounce, which makes switching a trap the options
  page does not have: at the moment of a switch there may be an edit sitting in
  the DOM inputs belonging to the palette being LEFT. Switching without
  settling it loses that edit silently — `lastSaved` moves to the incoming
  palette, the debounce fires, sees no difference from the new baseline and
  writes nothing. `switchPalette` therefore flushes first, then awaits any
  in-flight write, before moving the pointer.

  Two tests pin it, both through the write gate: an edit typed and then
  abandoned by a switch lands in the palette it was typed in, and a save
  already in flight when the switch is issued still lands there rather than in
  the palette being switched to. The first fails if the flush is removed.

  Lint caught a real gap rather than a style nit while doing this: the popup's
  copy of the org palettes was never reassigned, so an admin publishing or
  withdrawing one while the popup was open would have left the switcher
  offering something that no longer existed. `applyPolicy` now updates it.

- **The enforcement copy now says what enforcement actually does**
  (`popup/popup.js`, `options/options.js`, `options/options.html`,
  `RELEASE_NOTES.md`, `docs/DEPLOY.md`). bd `workspace-custom-palette-cyv`.
  Every surface said some version of "your organization sets these colors for
  everyone, they cannot be changed here", which the `cv2` decision made false:
  the organization's palette is the default and cannot be edited, but the user
  may switch to colors of their own and back.

  Saying only the first half is worse than out of date — it reads as a dead
  end, so a user who could switch would never think to try. Each surface now
  carries both halves, and the two jsdom tests that pinned the old wording
  assert the new promise instead, including the half that was missing.

  `docs/DEPLOY.md` gains the admin-facing version of the same correction, plus
  a note that if an org genuinely needs staff to have no alternative, that is
  not what `paletteLocked` does today and should be a separate policy rather
  than a widening of this one.

- **The palette switcher, on the options page** (`options/options.html`,
  `options/options.js`). bd `workspace-custom-palette-kbs`, third increment. A
  select listing the organization's palettes and the user's own, plus a
  "Multiple palettes" opt-in beside Appearance. Both are rendered from
  `planPaletteSwitcher`, so this page decides nothing about what appears.

  Switching RE-MOUNTS the editor rather than re-seeding it when read-only
  changes, because `readOnly` is fixed at mount — the same reason
  `planPolicyApply` carries a `remount` flag. Re-seeding would leave a disabled
  editor showing colors the user is entitled to change, or an editable one over
  colors they are not. Pinned by a test that fails if the re-mount is replaced
  with a re-seed.

  Options are labelled by source ("Retail (organization)"), because the name
  alone does not say whether the organization set it or you did.

- **The palette switcher's decision layer** (`lib/palette.js`
  `planPaletteSwitcher`, plus `multiPalette` / `setActivePalette` in
  `lib/storage.js`). bd `workspace-custom-palette-kbs`, second increment. One
  function answers what the switcher offers, for both hosts: the popup and the
  options page have diverged on the same policy question six times in this
  feature's history, every time because the decision lived as branches in two
  files. The hosts will render this; they do not decide it.

  Hidden unless the org palette is enforced or the user opted in, so the
  default experience is exactly what ships today — and hidden when there is
  only one entry, because a lone entry is not a choice. Read-only is per entry:
  org palettes are admin-only, and a locked user's own palette stays editable.

  `setActivePalette` is the only writer of the active pointer besides the
  enforcement push and the detach control, which is what keeps that pointer
  meaning "what this person chose" rather than "where the last write landed".

- **Enforcement now makes the organization's palette active when it begins**
  (`lib/palette.js` `planEnforcementPush`, `lib/storage.js`
  `applyEnforcementPush`, `background/service-worker.js`). bd
  `workspace-custom-palette-kbs`, first increment. The rule: when the enforced
  palette becomes active it becomes the active palette, and the user may then
  switch away.

  Enforcement is therefore a TRANSITION that writes once, not a standing
  constraint. That is what makes the stored pointer trustworthy afterwards:
  `setUserPalette` sets `activePaletteId` to whichever entry it wrote, so
  anyone who had ever saved carried a pointer at their own colors and
  enforcement could not tell that from a deliberate choice. Pushing on the
  transition overwrites it, so from then on the pointer really does mean "what
  this person selected".

  A synced `enforcementPushed` marker is what makes it a transition rather than
  a state — without it every read would re-push and nobody could stay on a
  palette they chose. Synced, not per-machine, so a second machine cannot yank
  the user back off a palette they just switched to. It clears when enforcement
  ends (leaving the pointer alone, so the user keeps what they were on) and a
  later re-enforcement pushes again.

  The service worker owns the write. All three contexts observe policy changes,
  so leaving it to the hosts would have them racing on the same write; the
  worker sees the same events and is the one that is not also rendering.

  `resolveActiveUserPalette` gained the matching rule: an org selection means
  the USER tier is empty, the same shape as the detach sentinel. Without it a
  user pushed onto the org palette still looked like they were on their own.

  ASSUMPTION, flagged rather than silently chosen: an admin EDITING the
  enforced palette during an ongoing enforcement does not re-push. The user's
  later selection is the more recent intent.

- **Every save busted the cache it had just filled** (`lib/storage.js`). Moving
  to per-key storage left the `onChanged` self-write detection comparing
  `changes[KEY_PALETTES]`, which a per-key write never sets — so the test
  collapsed to "always different". Chrome fires `onChanged` for the extension's
  own writes, so each save invalidated its own cache and the next write fell
  back to a read. On the popup's teardown flush that is the dropped-edit bug
  the cache exists to prevent, quietly reintroduced.

  The listener now asks whether the incoming values AGREE with the cache
  instead of tracking which keys this instance wrote — bookkeeping that goes
  stale the moment a write path is added, which is how this broke. The cache is
  a model of storage; if the event says what the model says, the model is still
  good, whoever wrote it.

  Two harness infidelities hid it, and the second is the instructive one. The
  `withSync` fake did not fire `onChanged` on its own writes at all. Fixing
  that was **not sufficient**: emitted inline inside `set()`, the invalidation
  ran before `setUserPalette` refilled the cache, so it was busted and
  immediately rewritten and the mutation still passed. Real `onChanged` is an
  IPC message that lands after the write resolves, so the fake now delivers
  asynchronously. A harness can be behaviourally faithful and still hide a
  defect by being temporally wrong.

- **The options footer's two separators did not match** (`options/options.html`,
  `options/options.js` `showVersion`). The markup separator is `&nbsp;·&nbsp;`
  and also picked up whitespace collapsed from the source newlines around it,
  while the version span carried a plain space and no surrounding collapse, so
  its gap rendered visibly narrower. Both now use non-breaking spaces, and the
  footer's inline elements have no whitespace between them, so the separators
  are the only spacing and neither can drift with source formatting. The test
  asserts the exact raw `textContent` rather than a trimmed match — trimming is
  what let the difference through. Caught in a screenshot of the real page
  during the in-browser smoke run, not by the suite.

- **The worker could silently move a user off the palette they chose**
  (`lib/palette.js`). The pointer-repair branch judged "does the pointer name
  an entry that exists?" from the LOSSY normalized view. With a mixed
  collection — some entries this build parses, one written by a newer build
  that it does not — and the pointer on the unreadable entry, the repair fired
  and rewrote the pointer from the service worker on every install and browser
  start, synced everywhere. (`keepId` does not cover this: it rescues the
  pointed-at entry from `MAX_PALETTES` truncation, not from being
  unparseable.) The pointer is now dangling only when no RAW entry carries
  that id, and the id rule is one exported `rawPaletteId` shared with
  `spliceRawPalettes` — "does this entry exist" and "which entry do I write
  to" are the same question and had been implemented twice.

  This was the fourth instance of one conflation, and it slipped through the
  previous round's audit because that audit was syntactic: it grepped for
  length checks, and this is a membership check. Redone semantically over every
  read of the normalized collection in both modules. One further case turned
  up and is deliberate rather than a defect: when the pointer names an
  unreadable entry, both `resolveActiveUserPalette` and `setUserPalette` fall
  back to the first readable entry, so what is shown and what is written are
  the same palette. Nothing said so, which was one careless change away from an
  edit landing in a palette the user was not looking at; both sites now
  document the pairing and a test pins it.

- **Two more paths could destroy a collection this build cannot read**
  (`lib/palette.js`, `lib/storage.js`). The unattended worker migration and
  `clearUserPalette`'s empty guard both answered "is there a collection?" from
  the LOSSY normalized view. `normalizePalettes` drops entries this build
  cannot parse, so an empty normalized list means either "nothing is stored" or
  "a newer build wrote something we do not understand" — and those demand
  opposite actions.

  `planPaletteMigration` therefore wrote a single-entry collection over
  whatever a newer build had stored, from the service worker, on every install
  and browser start, synced everywhere; and one click of "Use organization
  colors" removed the collection outright. A detached user with an unreadable
  collection was also silently re-attached, because the sentinel guard sat
  inside the parsed-entries branch.

  This was the third round on one conflation (a bad save, a bad unattended
  migration, a bad delete), so the question is now a named, exported predicate:
  `hasStoredPalettes(raw)`, a type predicate so callers keep the narrowing. All
  three collection checks read off it, which makes the invariant greppable
  rather than a habit. Every other length check in these two modules was
  audited: the rest concern swatch lists, where the normalized view is the
  correct thing to ask.

- **A detached machine could not see an edit made on an older build**
  (`lib/palette.js`). The detach sentinel short-circuited before the legacy-key
  fallback, breaking this module's promise to tolerate both storage shapes
  forever. Sequence: detach here, then edit colors on a machine still running a
  pre-multi build, which writes only `palette`. Sync delivered both, and
  resolution ignored the legacy key entirely, so the two machines showed
  different colors indefinitely — the divergence the mirror exists to prevent.

  Relaxing it is safe because `clearUserPalette` writes `palette: []` in the
  same atomic write as the sentinel, so a NON-EMPTY legacy key beside the
  sentinel can only be an edit made after the detach.

  `planPaletteMigration` deliberately still leaves a detach alone when a
  collection exists: the legacy migration REPLACES the collection, which would
  delete the user's other named palettes, and re-attaching would have to point
  at an entry that does not hold the older build's edit, hiding it. Resolution
  honors it and the next save re-attaches losslessly. With no collection to
  protect, the legacy migration does run under the sentinel.

- **A save could replace a collection this build cannot parse at all**
  (`lib/storage.js`). The lossless-save guarantee held for entries carrying
  extra fields, but when *every* stored entry was in a shape this build drops,
  the splice found no target and the fallback wrote a fresh single-entry
  collection over it — one ordinary swatch edit deleting every palette a newer
  build had stored, on every machine. A non-empty raw array with no splice
  target is now appended to, never replaced.

- **"Use organization colors" destroyed a palette and did not detach**
  (`lib/palette.js`, `lib/storage.js`). The previous round fixed
  `clearUserPalette` removing the whole collection by making it remove the
  active entry — which was wrong twice over. It still destroyed a named palette
  the user never asked to lose, and it did not detach at all: resolution fell
  through to the next entry, so the user carried on overriding the policy.

  The root cause was that detachment was not representable. A reserved
  `NO_ACTIVE_PALETTE_ID` sentinel now says it explicitly;
  `resolveActiveUserPalette` maps it to `null` before consulting anything else,
  `normalizePalettes` rejects it as an entry id so it can never collide, and
  `planPaletteMigration` treats it as a valid pointer rather than a dangling
  one — without which the worker would have "repaired" a deliberate detach and
  silently re-attached the user on the next browser start. Nothing is deleted.

  The detach is ONE write. A set plus a remove is not atomic, and an existing
  popup test caught a failure landing the second while refusing the first,
  leaving the mirror gone while the client was still attached. The mirror goes
  to an empty palette instead of being removed, which is also how an older
  build spells "no override".

- **An ordinary save rewrote the collection through lossy normalization**
  (`lib/storage.js`). The same failure class fixed for the unattended migration
  path, reached by a swatch edit instead. `getPaletteState` now also returns
  the raw stored collection and `setUserPalette` splices into it, so unknown
  fields and entries this build cannot parse survive a save.

- **The write cache had no invalidation** (`lib/storage.js`). A page can stay
  open for hours; writing a stale cache back would resurrect deleted entries
  and clobber edits made to other palettes elsewhere. It now subscribes to
  `chrome.storage.onChanged` and nulls the cache when the collection or pointer
  changes to anything other than what it holds — comparing against the cache is
  what stops our own write invalidating it, preserving the single hop the
  teardown flush needs.

- **`clearUserPalette` reintroduced the read-before-write teardown loss**, one
  commit after it was fixed for `setUserPalette`. Same cache fast path, same
  "no `get` may precede the write" test.

- **The "data publish, not a release" claim was still unscoped in the runbook**
  (`docs/DEPLOY.md`, `service/README.md`, `FUTURE_IMPROVEMENTS.md`).
  `docs/DEPLOY.md` is the incident-time read, and its "Fixing a broken
  selector" section promised clients pick up a corrected selector with no Web
  Store round trip. Now scoped in place, naming that Web Store installs ship
  `CONFIG_BASE` empty and need a release.

- **A pointer repair could permanently delete synced palettes**
  (`lib/palette.js` `planPaletteMigration`, `lib/storage.js`
  `migratePaletteStorage`). The repair branch returned
  `normalizePalettes(raw)` and the worker persisted it. That function is lossy
  by design, so "fix a dangling pointer" was really "rewrite the collection to
  whatever this build can parse", run unattended on every install and browser
  start. A device syncing more palettes than this build's cap, with the pointer
  naming one past it, would have had the surplus deleted on every machine. The
  repair now carries only the pointer; writing `palettes` is reserved for the
  genuine legacy migration. `normalizePalettes` also takes `keepId` so
  truncation never drops the entry the pointer names.

- **`clearUserPalette` removed the whole collection** (`lib/storage.js`). Its
  callers are "Use organization colors" and emptying the editor, both meaning
  "stop using my colors here" rather than "delete every palette I have" — which
  once the switcher lands would wipe a user's other named palettes off every
  machine on one click, with no undo. It now removes the active entry only, and
  removes every key when that empties the collection. Single-palette behaviour
  is unchanged.

- **The popup's dismissal flush could lose an edit** (`lib/storage.js`).
  `setUserPalette` had become a read-modify-write, and on the teardown path the
  `get` is dispatched, the frame dies, and the `set` waiting on its response is
  never issued. A module-level cache of the last known state, populated by the
  read each host already performs at init, restores the single hop.

- **The options footer version was stranded behind `init()`'s awaits**
  (`options/options.js`, `options/options.html`). It stayed blank when the page
  failed to load, which is exactly when someone is about to quote it in a bug
  report, and left a dangling separator until it filled. `showVersion()` now
  runs before any await and carries its own separator.

- **The popup's "Use organization colors" control could delete a synced palette
  under an active lock** (`popup/popup.js`). Round ten. The handler awaits any
  in-flight write before planning, and a lock landing inside that await sets
  `lastSaved` to the org palette and re-mounts read-only — so `planManagedReset`
  resumed seeing identical colors AND a stored override, planned
  `persist: "clear"`, and called `clearUserPalette()` under enforcement. The
  `restore()` branch would have refused, because its `persistPalette` throws on
  a lock, but the no-record branch bypassed `persistPalette` entirely. Lifting
  the lock afterwards put the palette back on screen but not in storage.

  This was the third path in the popup that clears the override, and the only
  one with no re-check: the other two are correct because someone remembered at
  each call site. So the fix is not only the re-check. Every override write in
  BOTH hosts now goes through one guarded function that reads the live lock —
  `clearOverride()` in the popup, `writeOverride()` in
  `options/options.js` — and a future call site inherits the guard instead of
  having to remember it. The mutation run showed the backstop working: with the
  primary options guard deleted, `writeOverride` still refused the write.

- **The options Reset test could pass with the guard it exists for removed**
  (`options/__tests__/options-locked.test.js`, `options/options.js`). It clicked
  with no assertion that the page was still unlocked, and the pre- and
  post-await refusals emitted a byte-identical string, so nothing could tell
  which guard fired. Under load the click landed on the pre-await guard, which
  predates the fix, and the test went green with the bug live — the exact
  failure mode `CLAUDE.md` calls out. The post-await Reset refusal now reads
  "so nothing was reset", the test matches that wording and asserts the page is
  unlocked before clicking, and the neighbouring Save test matches its own
  distinguishing "nothing was saved" rather than the shared prefix.

- Options' `save()` and `resetToDefault()` rejections became unhandled promise
  rejections off the click handler, so a failed write was silent. They report.

- **The failure loop no longer promises an auto-close it cannot perform**
  (`service/alerts.py`, `service/README.md`, `service/app.py`). Follow-up to
  roborev job 3821.

  With recovery unreachable from every caller, three places still asserted it
  worked — and the worst was inside `alerts.build_issue`, whose text ships into
  every auto-generated GitHub issue telling the maintainer it "auto-closes when
  the monitor next runs all-green". Someone would have fixed a break and waited
  forever. Corrected there, in `service/README.md`, and in the endpoint
  docstring; `recovery_comment` now says in its docstring that it is currently
  unreachable and why, so it does not read as dead weight.

  Also documented a consequence worth knowing: `state["open"]` is only cleared
  by that same branch, so a failure signature stays tracked after a manual
  close, and the next occurrence of the same signature comments "Still failing"
  on the closed issue instead of opening a new one. `service/README.md` and
  `docs/DEPLOY.md` both carry the workaround, and it is recorded against bd
  `workspace-custom-palette-ykj` because it makes the do-nothing option costlier
  than it looks.

  It took three passes to get this sweep complete, which is itself the lesson:
  a claim repeated across a codebase is not fixed until it is grepped for.
  Round two caught `docs/DEPLOY.md`'s remediation runbook — whose closing line
  was the auto-close promise, and which is the document a maintainer reads
  mid-break — plus the `alerts.py` module docstring, which had begun
  contradicting `recovery_comment`'s own docstring 70 lines below it. Round
  three caught the `SLACK_WEBHOOK_URL` rows in both env tables, still promising
  "failure/recovery" and "red/green" notifications when the green ping is
  emitted only from that same unreachable branch; and a wrong path in the
  workaround itself — `docs/DEPLOY.md` is a repo-root document, so the state
  file has to be named `service/monitor-results/alerts-state.json` there, not
  bare as it correctly is in the service-relative README. A workaround that
  sends someone to a nonexistent file leaves the stale key exactly where it was.

  `kind` is now documented as an explicit wire contract with the deployment
  ordering that matters: **deploy the service before the monitor**, since a new
  monitor talking to an old service has its advisory reports treated as real
  ones, reintroducing the bug the field exists to prevent. A missing `kind` is
  treated as a failure report, so older monitors keep working.

  Added the mirror-image test proving the gate does not *over*-block, which is
  the more dangerous direction: a plausible tightening would silently disable
  the entire failure-detection loop. It covers both the current payload and the
  legacy no-`kind` one, and is mutation-tested against three tightenings.

- **A warning can no longer close a GitHub issue** (`monitor/src/runner.ts`,
  `monitor/src/diagnostics.ts`, `service/app.py`). Follow-up to roborev job
  3819.

  Making green-but-warned runs POST had an effect I did not intend and my own
  comment got wrong: `_handle_alerts` acts on green summaries too. Its recovery
  branch closes every tracked GitHub issue, announces recovery in Slack and
  resets the alert state. That branch was previously unreachable from the
  monitor (the runner only POSTed on failure; `remediate.ts` only posts
  `/config/selectors`), so the warnings channel half-woke it — auto-closing a
  maintainer's open issue mid-remediation would have depended on whether some
  unrelated leg happened to fail an `<html lang>` read.

  The POST now carries `kind: "failure" | "warnings"` and `_handle_alerts`
  returns early on the advisory kind: still ingested and stored, but no
  alerting and no recovery. Whether a fully green run *should* drive recovery
  deterministically is a real decision about outbound GitHub and Slack writes,
  so it is filed as bd `workspace-custom-palette-ykj` rather than made as a side
  effect of a logging feature.

  The reporting routing moved into a pure `reportPlan` with a four-row table
  test, because it only ever executes against a live `SERVICE_URL` /
  `HEALTHCHECKS_URL` and could otherwise be broken invisibly. Red-and-warned is
  pinned to report as a failure: calling it advisory would make the service skip
  alerting on a genuinely failing run. The heartbeat now checks `res.ok`, since
  `fetch` does not reject on a non-2xx and a check rejecting the new POST body
  would have silently lost the heartbeat on exactly the warned runs, producing
  the "run never happened" alert the design is meant to avoid.

- **Monitor warnings now reach a human, and the locale policy is pinned by
  tests** (`monitor/src/{check,diagnostics,run-matrix,runner}.ts`). Follow-up to
  roborev job 3817.

  Relaxing the locale gate to warn instead of fail left the warnings with
  nowhere to go: `CheckResult` had no warnings field, and on a green run the
  runner pinged the heartbeat and POSTed nothing, so a run where every Slides
  leg reported no `<html lang>` exited 0 with its only trace in a cron log.
  The non-fatal half was effectively dead weight, and the "silent conversion"
  the check exists to catch stayed silent.

  Warnings now travel: `CheckResult.warnings` → `RunSummary.warnings`
  (collected from passing checks too, which is the whole point) → printed as
  their own block, and POSTed to the service on a green-but-warned run. The
  heartbeat still fires on green, because skipping it would make Healthchecks
  alert as though the run never happened, and the warnings ride in the ping
  body. The exit code is deliberately untouched: a non-zero exit would drive
  cron alerting, which is the false RED this design exists to avoid. Confirmed
  against `service/alerts.py` that a green POST cannot open a spurious issue -
  `should_alert` requires `ok is False` and a non-empty `failed` list.

  The retry's `page.waitForTimeout` was the one unguarded Playwright call in
  `assertLocale`, and an already-closed page - the most likely reason the first
  read failed - makes it reject. That rejection is not a `StageError`, so
  `runCheck` defaulted it to stage `"apply"` and would have reported a browser
  lifecycle failure to the remediation loop as a broken custom-color selector:
  the same misattribution the discriminated read was added to prevent, one line
  further down. Now guarded.

  The fail-vs-warn policy is extracted as a pure exported `localeVerdict` and
  table-tested, since it previously lived inside an unexported async function
  needing a `Page`, where no test could hold it still and a future edit could
  restore the false-RED regression with a green Tier 2. Verified the table bites
  by dropping the `isLocaleLeg` guard and watching it fail. Monitor tests 18 to
  21.

- **The monitor's locale gate no longer risks a permanent false RED**
  (`monitor/src/check.ts`). Follow-up to roborev job 3816.

  The gate added moments earlier failed closed for every leg, on an attribute
  verified on only two of three apps and only in Danish: nothing records what
  `documentElement.lang` is on Slides, or what an English editor reports on the
  monitor's shared persistent profile. If Slides omits it, those legs would go
  RED on every run, firing alerts and driving `remediate.ts` at a contract that
  is fine — a worse failure than the one the gate prevents, and on the project's
  only authoritative breakage signal.

  Now it fails only on **positive evidence of the wrong language**: a real
  language tag that disagrees, on a leg that declares a `locale`. An unreadable
  page, an absent `lang`, or a mismatch on an English leg is logged and passes.
  `readLang` returns a discriminated result instead of collapsing everything to
  `""`, so losing the execution context to Docs' post-load client-side
  navigation is reported as an unreadable page naming the real error rather than
  as a locale mismatch, with one short retry for that case. The asymmetry and
  its reason are recorded in `docs/TEST_PLAN.md` and beside the code; bd
  `workspace-custom-palette-afb` covers recording the six live values needed to
  tighten it.

- **Review findings from roborev jobs 3799-3811** across the Tier 2, monitor,
  dev-tooling and docs work above.

  The two that were real defects rather than gaps:

  - `monitor/src/check.ts` now verifies that a locale leg actually *got* the
    language it asked for, via `document.documentElement.lang`, throwing at the
    `open-doc` stage when it does not. Asserting the URL carried
    `hl=da&forcehl=1` only proved we asked. `forcehl=1` is Google's behavior,
    not ours, so if it stops working (or is dropped across the create redirect,
    or overridden by a Workspace language policy) the two `(da)` rows would
    quietly become duplicates of the English rows and stay green forever -
    reporting locale coverage that does not exist, which is the exact failure
    the legs were added to prevent. Checked in both directions: a leg with no
    locale must get English, since the English legs pass no `hl` and run in
    whatever language the shared persistent profile is in. The comparison is an
    exported pure `localeMatches` (primary subtag; an empty `lang` never
    matches) with unit tests.
  - `background/dev-reload.js` no longer re-runs its whole retry burst on every
    alarm wake. Module state resets when the service worker respawns and an
    alarm wake *is* a respawn, so the previous commit turned the no-server case
    into an unbounded, merely-spaced retry - roughly 540 failed connections an
    hour with the worker never settling, contradicting the comment it kept about
    avoiding exactly that. The alarm's existence is now the flag that survives a
    respawn: one quiet attempt per wake, no repeated logging, cleared on a
    successful connect.

  The rest were gaps in what the previous commits claimed:

  - `monitor/` was type-checked by **nothing**. The root `npm run typecheck`
    excludes it, `--experimental-strip-types` strips without checking, and its
    own `typecheck` script was invoked from nowhere - so the eslint config's
    stated reason for ignoring it was false. Added `typecheck:monitor` and
    chained it into `tier2`.
  - `tier2` had unstated prerequisites (`monitor/` needs its own `npm install`;
    `service/` needs `fastapi`/`httpx`, not just `pytest`), and `test:service`
    invoked the ambient `python3`, bypassing the `service/.venv` the docs tell
    you to create. Added `tier2:setup`, documented the bootstrap in both tier
    tables, and made `test:service` prefer the venv when present. `tier2:setup`
    was run rather than merely written down.
  - `docs/TEST_PLAN.md`'s manual checklist still named the old `UI language`
    footer label, and did not cover the new editor-language prompt.
  - `docs/REMOTE_CONFIG_DECISION.md` overstated Option A's permission cost and
    understated its privacy cost. `service/app.py` already sends
    `Access-Control-Allow-Origin: *`, so an "A-lite" variant with no manifest
    change may exist; meanwhile every install phoning a Raylytics origin every
    6h hands over IP, timestamp and User-Agent, which is an install-count and
    geography signal bearing directly on the no-telemetry commitment. The
    recommendation was re-derived: the load-bearing cost is privacy, not a
    permission string.
  - `FUTURE_IMPROVEMENTS.md` had parked the border/table pickers, which
    `CLAUDE.md`, `docs/plan.md` and `docs/SPEC.md` all still declare in scope
    for v1. Parking them would have narrowed scope silently, which needs an
    explicit ask and an ADR. Entry removed and filed as ordinary bd work.

  One finding did not reproduce: a HIGH claiming two `textContent` assertions
  break `tsc`. `npm run typecheck` passes on that commit and on HEAD with those
  exact lines, and forcing `textContent` into a `string` annotation passes too.
  Hardened regardless with a typed `page.text(id)` harness helper, since the
  assertion would be fragile against a lib or `@types` bump.

- **Dev hot reload no longer dies permanently when the server starts second**
  (`background/dev-reload.js`). Closes bd `workspace-custom-palette-age`.
  Dev-tooling only: this file is excluded from the packaged zip, so no shipped
  behavior changes.

  During the 0.1.7 work the reload loop was silently dead — the server never
  printed `[dev] extension connected`, file edits did nothing, and the
  extension had to be reloaded by hand, which is part of why validating the
  `managed_schema` manifest change dragged.

  The server was fine. Verified by running it and driving a real WebSocket
  client against it: it accepted the connection, logged the connect, saw a
  watched file change and broadcast `reload`. The fault was entirely the
  client's retry lifecycle.

  `dev-reload.js` retried 10 times, 2s apart, then gave up for good. That
  budget lives in a `setTimeout` chain, which dies with the MV3 service worker,
  and nothing ever woke it again. So the ordinary sequence — load the unpacked
  extension, then start `npm run dev` — burned the whole budget before the
  server existed, and hot reload stayed dead for the rest of the session no
  matter what happened afterwards.

  Now a short burst still covers a server restarting mid-session, and when it is
  spent a `chrome.alarms` entry takes over and wakes the worker periodically
  until the server appears. The alarm deliberately does not listen for its own
  event: `connect()` runs at module scope on every worker startup, so being
  woken IS the retry — which matters because this module is imported
  dynamically and a listener registered here can miss the dispatch that woke the
  worker. No new permission (`alarms` is already held for the config refresh),
  and the service worker's own `onAlarm` filters by name.

### Documentation

- **`STORE_LISTING.md` rewritten for 0.2.0** (owner request, 2026-08-26). The
  description had no mention of multiple palettes or organization colors, and
  still advertised the on/off switch that 0.2.0 removed. New sections for
  keeping several palettes and for organizations (publishing, enforcing,
  nothing-is-deleted, the in-Settings builder); the stale switch line is gone;
  the summary, single-purpose statement, permission justifications and asset
  checklist are refreshed; a 0.2.0 "What's new" entry is added. Also corrects a
  stale maintainer note claiming `EXTENSION_ID` was still unfilled — it was
  filled on 2026-08-15 — and records that all six new store assets are RGBA and
  need flattening before upload.

- **The FORCE INSTALL path is documented, and the part that is unverified says
  so** (`docs/DEPLOY.md`, `options/__tests__/options-glue.test.js`; owner,
  2026-08-24: "this will almost definitely primarily be used for force install
  states, so it's important we have that working and tested as well"). What is
  covered by construction: the managed payload is delivered per extension ID,
  and no shipped file reads `chrome.management` or `installType`, so the
  extension has no way to behave differently depending on how it arrived — now
  pinned by a static scan over the shipped files that fails the build if such a
  branch appears. That list is DERIVED from the directories `dev/package.sh`
  packages, with the same exclusions, after a hand-written one covered 12 of
  the 29 shipped modules and missed the real content-script entry point
  (roborev 4129) — a scan that names its own inputs drifts from what ships, and
  a guarantee weaker than its claim is worse than none. It asserts a floor on
  the file count so a glob returning nothing cannot pass by scanning zero
  files, and it is mutation-checked in four previously-unscanned modules. What
  is NOT covered: nobody has watched a
  managed browser force-install this build and receive policy, because the ID
  pinning makes force install pull the STORE version (0.1.7) down over the
  unpacked build under test. DEPLOY now states that plainly and lays out the
  two ways to close it — a domain-restricted Store publish, or a self-hosted
  signed CRX added by ID with an installation URL — with their costs, rather
  than leaving the gap implicit.

- **`TESTING-0.2.0.md` gains step A0** after a day of false failures: exactly
  one installed copy (the Web Store 0.1.7 coexisting with the dev build meant
  the tester graded 0.1.7's popup), and the right profile (the
  `dev@example.org` profile receives real Admin-console cloud
  policy targeting this extension — enforcement results there are contaminated
  until the filed admin task removes it).


- **`docs/TESTING-0.2.0.md`** — a sequential DO / EXPECT / IF NOT release test
  script, written after the tester called the existing plan "a vomit of ideas
  with very little actionable options" and was right. Every policy change is a
  named `dev/test-policy.sh` command; every step has one observable
  expectation and says what an unexpected result means, including which ones
  are stop-ship. States up front who sets org colors in real life (a Workspace
  admin in the Admin console UI — the scripts are the local test rig, not the
  product) and that enforcement changed meaning mid-development.
  `docs/TEST_PLAN.md` stays as the assertion reference and points to it.


- **The manual walkthrough now matches what was built** (`docs/TEST_PLAN.md`).
  It was written for `paletteLocked` alone and had gone materially stale: it
  quoted copy that no longer exists, said the editing controls "are gone" full
  stop, and made no mention of the switcher, the opt-in or the enforcement
  push. A tester following it would have reported false failures.

  It now opens by stating what enforcement means in 0.2.0, since that changed
  during development, and adds steps for the one-time push onto the org
  palette, switching away and having that stick, re-enforcement pushing again,
  and multiple palettes with no policy at all — including the debounce case
  where an edit is abandoned mid-save by a switch.

- **Remote config is now documented as an enterprise / self-hosted facility, not
  a lever store users have** (`CLAUDE.md`, `docs/plan.md`, `README.md`,
  `docs/REMOTE_CONFIG_DECISION.md`). Decision on bd
  `workspace-custom-palette-307`: Option B, keep `CONFIG_BASE = ""` in
  `config/endpoints.js` and keep the privacy stance absolute. No code, manifest,
  `docs/PRIVACY.md` or store copy changed — the point was that the docs claimed
  a capability shipped builds do not have ("a selector fix is a data publish,
  not a code release — no Web Store round-trip"), which is true only where
  `CONFIG_BASE` is set. Every statement of that promise is now scoped to
  configured deployments, and store installs are stated to be fixed by a
  release. Option A was declined because pointing every install at a
  Raylytics-operated origin would hand us an IP + User-Agent from every copy
  every `REFRESH_PERIOD_MINUTES`, which is the "No remote telemetry" commitment
  itself rather than a copy edit. Recorded revisit trigger: the first break
  caused by Google changing their DOM rather than by one of our own selector
  bugs.

- **Google Forms support investigated and parked**
  (`FUTURE_IMPROVEMENTS.md`). Asked whether Forms could be a fourth app. A live
  DOM probe says no: every selector in `config/selectors.default.json` returns 0
  matches there (including `[class*="goog-"]` — Forms is Wiz/Boq, not the
  Closure-based editor stack), its only per-element identity is a translated
  `aria-label` that `content/__tests__/dom-contract.test.js` exists to reject,
  and the custom-hex apply path could not be driven synthetically — the native
  value setter + `input`/Enter sequence that works in Docs and Sheets moves the
  hex field's text but not the component's model, so the confirm commits the
  stale color. Parked under Deferred with the evidence, the cost breakdown and
  the conditions that would re-open it, so it is not re-probed from scratch.

- **Admin runbook for the lock, and a way to test policy without a managed
  fleet** (`docs/DEPLOY.md`). The 0.1.7 managed palette shipped never having
  been exercised against a real policy, because nothing documented how to set
  one outside a managed device — so the runbook now carries a macOS
  `/Library/Managed Preferences` recipe (and the Linux equivalent) that Chrome
  cannot distinguish from an Admin console push, with the teardown command next
  to it. The lock section states the three things worth knowing before turning
  it on: it is reversible, the lock alone does nothing, and it applies live.

- **Tier 2 now describes something that exists** (`CLAUDE.md`,
  `docs/TEST_PLAN.md`, `package.json`). Closes bd
  `workspace-custom-palette-8fd`.

  The tier table promised `npm run lint && npm run test:integration`. Lint was
  broken (fixed above) and `test:integration` was never defined in
  `package.json` at all, so the whole of Tier 2 as documented was unrunnable.

  Rather than invent an integration tier to match the docs, the docs now match
  the code: the fixture-driven tests that table was describing
  (`content/__tests__/dom-harness.test.js`, `locale-fixture.test.js`, and now
  the jsdom page tests) already run inside Tier 1 under plain `node --test`, so
  Tier 2 is what genuinely sits outside the hook — ESLint, the Python service
  tests, and the monitor's own unit tests. New scripts `test:service`,
  `test:monitor` and `tier2` chain them; all three were run green before this
  was written down. A tier that cannot run is worse than one that does not
  exist, because it reports coverage nobody has.

### Build

- **Version bumped to 0.2.0** (`manifest.json`, `package.json`,
  `package-lock.json`). MINOR, not patch: `paletteLocked` is a genuinely new
  core capability, which is the bar CLAUDE.md sets for a non-PATCH bump — admins
  gain enforcement they did not have, and a locked user loses the ability to
  edit. It supersedes the 0.1.8 bump made earlier in this cycle; 0.1.8 was never
  cut, so nothing is burned. The reason for bumping early stands: the tree moved
  past the packaged 0.1.7 zip, per the convention recorded in the 0.1.7 entry below: leaving the
  manifest on a shipped version means any `npm run package` produces a zip
  labeled with a burned version string, and the Web Store rejects re-uploads of
  one.

  Packaged files changed since the 0.1.7 cut: `manifest.json`,
  `shared/feedback-email.js` (the bug form's language handling, below),
  `shared/palette-editor.js`, `lib/palette.js`, `lib/storage.js`,
  `popup/popup.js`, `options/options.js` and `content/bootstrap.js`. The rest of
  this section is dev tooling, tests, the monitor, the service and docs, none of
  which ship inside the zip — `background/dev-reload.js` and `__tests__` are
  excluded by `dev/package.sh`.

  No `lib/update-note.js` entry. The post-update notice is for things a user
  must be told, and neither change qualifies for the people who see it: a
  clearer bug-report form is routine, and the lock is invisible to everyone
  except staff at an org that enables it — who will hear it from their admin,
  not from us. If that judgement turns out wrong, a notice can be added without
  reworking anything.

- **ESLint is now actually runnable** (`eslint.config.js`, `eslint` +
  `@eslint/js` + `globals` as devDependencies). Closes bd
  `workspace-custom-palette-5vs`.

  `npm run lint` had been declared in `package.json` since the repo was set up
  but failed with `eslint: command not found` — eslint was in `scripts` and in
  no dependency list, and there was no config file of any kind, so lint had
  never run once. Half of Tier 2 was therefore fiction (bd `8fd` covers the
  other half).

  Flat config (eslint 9), JavaScript only. `monitor/` is TypeScript and is
  already covered by `npm run typecheck`; adding typescript-eslint would pull a
  large dependency tree for 14 already-type-checked files, so it is ignored
  deliberately and the reason is written in the config next to the ignore, not
  left for the next reader to infer. `service/` (Python) and `spike/` (the
  Phase 0 throwaway) are ignored on the same terms. Rules are deliberately
  thin: types are tsconfig's job (`strict`, `checkJs`), so this layer covers
  what types cannot — dead code, accidental globals, `var`/`==` footguns.

  Per CLAUDE.md it stays a Tier 2 command and is NOT added to the pre-commit
  hook. First run found three real problems: two dead imports in the tests
  added moments earlier, and `window` in `dev/capture-shots.mjs`, which is
  correct (that function is serialized and evaluated in the browser) and is now
  declared for the linter with a `/* global window */` rather than giving the
  whole file browser globals, which would hide a typo in its Node half.

### Tests

- **jsdom + fake-chrome harness for the popup and options pages**
  (`shared/__tests__/harness/fake-chrome.js`, `shared/__tests__/harness/mount.js`;
  suites in `popup/__tests__/` and `options/__tests__/`). Closes bd
  `workspace-custom-palette-ol9`.

  Reviews 3762 through 3766 each found a real ordering bug in `popup/popup.js`
  or `options/options.js` that no test could catch: those files are DOM glue
  over `chrome.*`, and every one of the bugs was a two-actor interleaving — a
  storage write still in flight while a user click or a late policy answer
  planned against `lastSaved` / `hasOverride`, which the write was about to
  change. The pure decisions kept being extracted (`planManagedReset`,
  `planLatePolicyReseed`) and those were tested; the `await` ordering around
  them was not.

  The load-bearing piece is `area.hold()`, which parks the next write to a
  storage area until the test releases or fails it. That is what makes "hold
  this write open, click the button, then let it land" expressible. The managed
  area gets `mode: value | absent | late | never | throw` for the same reason:
  the production code must never collapse "the answer has not arrived" into
  "there is no policy", so the fake has to be able to produce a read that
  genuinely never settles.

  Each regression test was verified to FAIL against the pre-fix ordering by
  reverting that fix in isolation and re-running, then to pass with it
  restored — the in-flight `await inflight` (3766), the pre-reset editor scrub,
  `restore()`'s persist-before-paint (3763), the late-policy re-seed wiring, the
  bounded refusal on an unknown policy, `options.save()` re-reading the editor
  after the policy wait (3763), and validation running ahead of that wait
  (3764). One draft assertion passed against the very bug it targeted because it
  polled until true and went green before the held write landed; it now settles
  first and then asserts. A test that cannot fail is worse than no test, so
  these were checked rather than assumed.

  Tier 1 goes from 184 to 199 tests and from ~1.8s to ~9s. The added time is
  almost entirely the two suites that must run against the real deadlines
  (`MANAGED_READ_TIMEOUT_MS` 1500ms, the 3000ms save deadline); they are split
  into their own files so node's per-file parallelism absorbs most of it.

## [0.1.7] — 2026-08-17

### Added

- **Post-update notice for 0.1.7** (`lib/update-note.js`). Adds an
  `UPDATE_NOTES["0.1.7"]` entry so users who update land on the popup's
  one-time banner telling them brand colors now work in every language. No new
  mechanism: `onInstalled` (reason `update`) already stores the version and
  badges the toolbar, and the popup already renders it through the single-slot
  banner chain.

  Worth recording why this is not a duplicate announcement: the non-English
  apply fix was written during the 0.1.6 cycle and its RELEASE_NOTES entry sits
  under that work, but it landed 26 minutes after the 0.1.6 zip was cut and
  therefore never reached a single user. 0.1.7 is the first build that actually
  delivers it, so it is new to everyone receiving the notice.

  The copy closes by routing anyone still affected to "Report a bug" and asking
  which language their **Google editor** is set to. That is deliberately not
  redundant with the bug form's diagnostics footer: `feedback/feedback.js` reads
  `navigator.language`, which is the BROWSER UI language, while the language
  that actually breaks apply is the editor's. The two differ often — this bug
  was reported in English by a user whose Docs was Danish, so the footer alone
  would have pointed at the wrong locale. Follow-up to capture the editor
  language in the form itself is bd `workspace-custom-palette-5nc`.

  New tests pin the key shape (`x.y.z` exactly, since a typo makes the notice a
  silent no-op that still reviews fine), enforce the house rules on shipped copy
  (no emoji, no em-dashes), and assert the notice names a control that actually
  exists — it renders via `textContent` and cannot carry its own link, so the
  test cross-checks the literal "Report a bug" label against `popup/popup.html`
  and fails if that link is ever renamed. Verified the chain end to end against
  the real manifest: an update to 0.1.7 resolves to the copy, a fresh install
  stays silent and gets the intro instead.

### Fixed

- **"Use organization colors" no longer plans against a write still in flight**
  (`popup/popup.js`). Moving `hasOverride` after its write (below) left the reset
  handler reading pre-write state: a click landing during an auto-save's
  `setUserPalette` saw `hasOverride: false` and the old `lastSaved`, planned
  `persist: "none"`, issued no clear, and reported "Already using your
  organization's colors" while the override was on its way to storage and every
  other machine. `commit()` and `restore()` now run the write and the state it
  settles inside one tracked promise, and the handler awaits it before planning.
  The pre-await scrub is preserved by painting `managed` directly, which is what
  `planManagedReset` returns as `editorTarget` whenever a policy exists.
  Review 3766.

- **The managed-reset write window can no longer be flushed into an override**
  (`popup/popup.js`). Scrubbing the pending edit only on the failure path still
  left it readable in the DOM inputs for the duration of the write itself: a
  dismissal in that window had `commit()` read the stale edit, see it differed
  from the still-unmoved `lastSaved`, and store it as a personal override
  seconds after the user asked to go back to the org colors. The editor is now
  scrubbed before any await. This handler is the deliberate exception to
  persist-before-paint, and says so in place: a concurrent flush then reads the
  org palette, which `persistPalette` resolves to the same `clearUserPalette()`
  already in flight, whereas undo/redo has no such convergence. Review 3765.

- **`hasOverride` no longer moves ahead of the write it describes**
  (`popup/popup.js`). A rejected `clearUserPalette` (sync quota is plausible
  behind a debounced auto-save) left the flag reporting "attached" while the
  override was still stored, so the next "Use organization colors" click planned
  `persist: "none"` and told the user they were already on their organization's
  colors, refusing to retry the clear. Review 3765.

- **A failed write can no longer leave a pending edit alive to become an
  override** (`popup/popup.js`). Persisting before painting (below) regressed
  the `planManagedReset` invariant: that plan always hands the editor a target
  precisely so a pending in-debounce edit is scrubbed from the DOM inputs, and
  deferring the paint meant a failed write left it sitting there for the
  dismissal flush to persist as a fresh personal override, moments after the
  user asked to go back to the org colors. `restore()` now resyncs the editor to
  `lastSaved` on failure before rethrowing, and the reset handler's other branch
  persists-then-paints too, so its two branches no longer disagree about the
  rule. Review 3764.

- **Invalid input is reported immediately again, and no options write waits
  forever** (`options/options.js`). Moving the policy settle above the editor
  read also put *validation* behind it, so a bad hex or empty name produced no
  message until the read landed — and none at all if it never did. Validation is
  pure, so it runs first again; only the palette to persist is read after the
  settle. That wait is now bounded at 3000 ms like the popup's, and `save()` and
  Reset report "your organization's colors haven't loaded yet, so nothing was
  saved" rather than hanging silently. Review 3764.

- **Save no longer acts on a stale editor snapshot** (`options/options.js`).
  `save()` read the editor *before* awaiting the policy, but that await can
  re-seed the editor with the org palette. A Save clicked while a slow read was
  outstanding therefore persisted the captured packaged defaults as a permanent
  personal override, reverted the org colors the re-seed had just put on screen,
  and reported "your organization's updates will no longer change them". The
  policy is settled first now, so validation and the persisted palette both
  reflect what is actually displayed. Review 3763.

- **A refused undo/redo write no longer desynchronizes the popup**
  (`popup/popup.js`). `restore()` updated the editor before persisting, so a
  refused or failed write left the screen showing a palette that was never
  stored and that `lastSaved` disagreed with; the next Undo then recorded the
  unsaved palette as a fresh history entry, and two presses returned the user to
  where they started. It now persists, moves `history`/`lastSaved`, then updates
  the editor — the same order `commit()` uses. Review 3763.

- **A late-arriving org palette now reaches the screen, not just the note**
  (`lib/palette.js`, `popup/popup.js`, `options/options.js`). Follow-up to the
  fix below, which left two holes. The options page's re-seed guard compared the
  editor against the STORED user palette; with no override those differ by
  construction (the editor shows the baseline, the stored palette is empty), so
  the branch could never fire in the only case that mattered — and the page
  still revealed "your organization provides these colors" over the packaged
  defaults, after which Save wrote an override. The popup did not attempt a
  re-seed at all. Both now use one pure, tested decision,
  `planLatePolicyReseed`, comparing against what the editor was *rendered* with,
  and the popup re-seeds before revealing the note. Review 3762.

- **A refused or failed palette write no longer leaves the popup claiming
  "saved"** (`popup/popup.js`). `commit`/`restore` moved `lastSaved` and
  `history` before awaiting the write, so a failure left in-memory state
  disagreeing with storage and undo stepping from a state that was never
  persisted. They now persist first. Both write paths are also bounded (3000 ms
  interactive, 200 ms during dismissal teardown): the dismissal flush previously
  awaited the untimed policy read and could block indefinitely, silently
  dropping an edit made inside the debounce window. On a miss the write is
  refused rather than guessing "unmanaged", and the interactive refusal is
  reported in the status line. Review 3762.

- **A slow enterprise-policy read can no longer detach a managed user from
  their org palette** (`lib/storage.js`, `popup/popup.js`, `options/options.js`,
  `content/bootstrap.js`). The 1500 ms cap lived inside the shared
  `getManagedPalette` and resolved `undefined` — the very same value that means
  "this machine has no policy" — so every caller read a slow managed device as
  an unmanaged one. In the popup and options page that flipped the whole managed
  install off at once and let the next write store a personal override, which is
  permanent, lands in `chrome.storage.sync` and follows the user to every
  machine; in the content script it dropped the org palette for the life of the
  page, since `onManagedChanged` only fires on a later policy edit. The accessor
  is untimed again; callers that must render promptly use the new
  `getManagedPaletteWithin(ms)`, which reports a deadline miss distinctly and
  hands back the still-running read. Every write that chooses between "stay on
  the org palette" and "write a personal copy" now awaits that read first.
  `content/bootstrap.js` also gained a `policyApplied` flag so an admin change
  landing mid-read is no longer overwritten by the older in-flight answer.
  New `lib/__tests__/storage.test.js` stubs a managed read that never settles.
  Reviews 3748, 3749.

- **Brand swatches no longer inherit the source cell's "selected" state**
  (`content/injector.js`, `content/dom-contract.js`, `config/selectors.default.json`,
  `service/data/selectors.json`). `injectBrandRow` clones a real palette cell;
  when that clone source is the colour currently applied, Google has already
  marked it with `docs-material-colorpalette-cell-selected` and
  `aria-selected="true"`. Every Brand swatch inherited both, so all of them
  rendered Google's checkmark (visible on the darker swatches, invisible
  white-on-light) and announced as "selected" to screen readers. New
  `clearSwatchSelection` resolver strips it from the clone only, leaving
  Google's own cell untouched; the class token comes from the new optional
  `shared.swatchSelected` contract key, while `aria-selected`/`aria-checked` are
  reset unconditionally because a wrong value is an accessibility defect
  regardless of the contract. Contract version `2026-08-16`; `swatchSelected` is
  in `REQUIRED_SHARED` so the publish gate cannot drop it. Found by the
  pre-0.1.7 in-browser smoke matrix in the Sheets text picker, which is the
  narrow case where the clone source is the active colour — Docs and Slides
  looked clean. bd `workspace-custom-palette-auq`.

### Testing

- **Review fixes to the locale and clone-state guards** (reviews 3750, 3757,
  3760). The `monitor/src/matrix.ts` scan stripped `//` comments, which cut
  every URL line in that file at `https:` — a new row written with a literal URL
  and a translated selector on the same line (how `CheckItem` is laid out) had
  its selector chopped off unread. It now skips whole comment lines instead, and
  the source scan uses a variant anchored to the `[` of an attribute selector,
  which also stops `const label = x` / `el.title = y` failing the hook. Both
  directions mutation-tested. `dev/package.sh` now also refuses **untracked**
  files under packaged directories (`git diff` sees only tracked ones, while the
  zip packages whole directories, so a half-finished module shipped inside an
  artifact stamped with a commit that did not contain it). The publish gate
  requires `swatchSelected` to be a comma-list of bare class selectors — the only
  shape `clearSwatchSelection` can turn back into a removable token, so a
  gate-passing `td.x-selected` no longer strips nothing in silence — and the
  resolver warns if one ever reaches a client. The monitor mirrors the token and
  asserts the live invariant. Fixture and tests gained `data-tooltip` coverage
  (deleting the injector's `data-tooltip` branch now fails the suite) and a
  check that no `UPDATE_NOTES` key is ahead of the shipped manifest version.

- **Locale coverage is now automated in Tier 1**
  (`content/__tests__/locale-fixture.test.js`,
  `content/__tests__/fixtures/docs-color-picker.html`). Two field bugs in a row
  (0.1.4 tooltips, 0.1.6 apply) were locale bugs that every automated tier
  reported green, because every tier runs in an English UI. The new suite takes
  a fixture captured live from the Docs picker + custom-color dialog
  (2026-08-16) and **pseudo-localizes** it — every text node and every
  text-bearing attribute is rewritten by a total letter shift — then asserts
  every contract resolver still resolves. That is stronger than testing Danish
  specifically: it fails for any language. `#rrggbb` tokens are deliberately
  preserved, since `findSwatchByHex` legitimately depends on them and Google
  does not translate them; that is the only localized-string dependency the
  extension is allowed. A companion test pins the frozen 0.1.6 `shared`
  selectors and asserts they DO fail on the localized DOM, so the guard cannot
  rot into a no-op. A fourth test re-runs `injectBrandRow` against the
  localized picker to cover the 0.1.4 cloned-tooltip regression.

- **The locale scan now covers `data-tooltip` and `label`**
  (`content/__tests__/dom-contract.test.js`, `service/alerts.py`,
  `service/tests/test_alerts.py`), and extends to
  **`monitor/src/matrix.ts`** — a translated selector there is worse than one in
  the contract, since it makes the authoritative break signal go green in
  English while non-English users are broken. That guard scans comment-stripped
  lines rather than regex-matched string literals: a selector's own quotes
  (`'[aria-label="x"]'`) defeat the obvious literal-matching pattern, so the
  first version of it silently skipped exactly the strings it existed to catch
  (caught by reintroducing the 0.1.6 selector and watching it pass).

### Build

- **`dev/package.sh` re-runs Tier 1 and refuses a dirty tree** (`dev/package.sh`).
  0.1.6 was zipped at 19:07 on 2026-08-15; the fix for an already-reported
  non-English apply failure landed at 19:33 the same evening, so the artifact
  shipped 26 minutes behind main and the reporter stayed broken through a whole
  release. The script now runs `npm run typecheck && npm test` at cut time and
  stamps the zip line with the version, the HEAD short commit, and the selector
  contract version, so "what is actually in the shipped zip" is answerable
  without unzipping it.


- **Version bumped to 0.1.7** (`manifest.json`, `package.json`,
  `package-lock.json`). Bumped as soon as the tree moved past the packaged
  0.1.6 zip, not at the release cut: leaving the manifest on a shipped version
  means any `npm run package` produces a zip labeled with a burned version
  string, and the Web Store rejects re-uploads of one.

### Fixed

- **The publish endpoint now rejects the two contracts that broke users**
  (`service/alerts.py`). `POST /config/selectors` is the only gate on the
  remediation path — whatever passes reaches every client on the next refresh —
  and it checked shape only, so both 2026-08-15 field regressions would sail
  through it: a contract keyed on English `aria-label` text, and one silently
  missing `shared.sectionLabel`. `is_valid_contract` now requires the full
  `REQUIRED_SHARED` resolver set and rejects any selector matching
  `aria-label=`, with the offenders reported by the new
  `locale_dependent_selectors` helper. The scan covers every translated
  attribute Google uses — `title` included, since the swatch's inner div
  carries the localized color name that produced the "sort" tooltip bug — is
  case-insensitive (HTML attribute names are, so `[ARIA-LABEL=]` would still
  match in the browser), and walks per-picker entries generically so a key
  added later cannot go unscanned. `content/__tests__/dom-contract.test.js`
  applies the identical rule to the contracts in the repo.

- **Saving colors identical to the org palette no longer detaches the user from
  it** (`options/options.js`, `popup/popup.js`). Both editors persist through
  one rule now: a palette identical to the managed one clears the override
  instead of writing a private copy, so undo, redo, auto-save, and Save cannot
  silently strand a user on a snapshot of colors their admin is still updating.
  The options page's Reset no longer says "Save to keep it" (the clear is
  already persisted, and following that advice re-created the override it had
  just removed), the popup skips a no-op history entry when already on the org
  colors, and the popup note is recomputed after every save rather than read
  once at init — so it can no longer claim the organization provides colors the
  user has since edited. `paletteKey` moved to `lib/palette.js` (shared by both
  editors) and is unit-tested. Whether an override is *stored* is now tracked
  explicitly rather than inferred from palette equality: an override whose
  colors happen to match the policy (an admin publishing colors a user had
  already saved) still shadows it, so equality would have reported "attached"
  while the next admin update silently missed them, and the popup's reset
  would have declined to act. The popup also clears such a redundant override
  on open. The decision itself now lives in the pure `planManagedReset`
  (`lib/palette.js`) rather than inline in the click handler: that handler took
  three consecutive corrections — attachment inferred from colors, history
  recorded for a no-op, and a pending in-debounce edit left in the DOM for the
  dismissal flush to write back as a fresh override — none of which any test
  could have caught while the logic sat behind `chrome.*` calls. Each of those
  three properties is now asserted in `lib/__tests__/palette.test.js`.

- **Locale-independent selectors: the apply path now works in non-English Google
  UIs** (bd workspace-custom-palette-7as). The contract keyed several elements
  on English `aria-label` text, so for a non-English user (the Danish 0.1.4
  reporter) injection worked — detection is class-based — while the apply flow
  silently failed: `findHexInput` matched nothing and `findExpandedColorButton`
  returned null, breaking the reopen step. All replaced with hooks that are
  identical in every language, verified live 2026-08-15:
  `input.docs-material-hex-input` (the class is unique inside the dialog) and
  `input.docs-material-rgba-{red,green,blue}-input` for the RGB readback;
  toolbar buttons by element id — Docs `#textColorButton`/`#bgColorButton`,
  Slides `#fillColorMenuButton`/`#lineColorMenuButton`/`#textColorButton`
  (Sheets was already id-based). Contract version `2026-08-15b`, so this reaches
  existing installs as a data publish. `monitor/src/matrix.ts` moves to the same
  ids, which also lets the matrix run against a non-English test account. A new
  test fails the build if any contract selector matches on `aria-label`, and the
  `readDialogRgb` test now resolves its shim from the contract itself instead of
  hardcoded strings.

### Added

- **Enterprise managed-policy palette** (bd workspace-custom-palette-sfx):
  Workspace admins can push an org-wide default palette from Google Admin
  console instead of emailing colors to staff. `manifest.json` declares
  `storage.managed_schema` → new `config/managed-schema.json` (one `palette`
  policy: an array of `{name, hex}`), which is what makes the "Policy for
  extensions" field appear in Admin console. `lib/storage.js` gains
  `getManagedPalette` (read-only `chrome.storage.managed`, absent policy →
  `undefined`) and `onManagedChanged` so an admin edit applies live like a user
  edit; `lib/config.js` gains `managedSwatches`, which accepts both a bare array
  and Admin console's `{"Value": [...]}` wrapper. `resolveEffectivePalette`
  priority is now remote → user → **managed** → packaged defaults: the org
  palette is the default staff start from, and a user's own palette still wins.
  The popup and options editors seed from that same baseline, options shows a
  note plus org-aware Reset/empty copy, and `docs/DEPLOY.md` carries the
  paste-ready admin runbook (click path, JSON snippet, `chrome://policy`
  verification). No new permissions (`storage` was already held) and no
  telemetry — policy flows in only. Tests: managed tiering + junk-policy
  filtering (`lib/__tests__/palette.test.js`), the `{Value}` unwrap
  (`config.test.js`), and a new `managed-schema.test.js` guarding Chrome's
  schema-loading rules (an invalid schema prevents the extension from loading
  at all, so the file is test-pinned).

## [0.1.6] — 2026-08-15

### Build

- **Version bumped to 0.1.6** (`manifest.json`, `package.json`,
  `package-lock.json`). Carries the post-update notice below.

### Changed

- **Popup Undo/Redo buttons use circular-arrow SVG icons** instead of the ↶/↷
  text glyphs (Evan's request, 2026-08-15). New `undoIcon`/`redoIcon` builders
  in `shared/icons.js` (Lucide rotate-ccw/rotate-cw paths, same CSP-safe
  createElementNS pattern as the existing trash/pipette icons, `aria-hidden`
  with the button text as the accessible name), prepended by `popup/popup.js`;
  new `.icon-text` flex alignment in `popup/popup.html`. Builder tests in
  `shared/__tests__/icons.test.js`.

### Added

- **One-time post-update notice** (requested by Evan 2026-08-15 so users who
  hit the 0.1.4 Docs breakage learn it is fixed). New pure `lib/update-note.js`
  maps updated-to versions to notice copy (`UPDATE_NOTES`, currently only
  0.1.6); the service worker's `onInstalled` (reason `update` only — installs
  get the intro) stores the version (`updateNoteVersion`, `chrome.storage.local`)
  and sets a "NEW" toolbar badge (`chrome.action.setBadgeText`, no new
  permission). The popup clears the badge on any open, shows the notice via the
  banner slot (`choosePopupBanner` priority: errors > update > intro > rating),
  clears the flag on dismiss, and silently clears a stale version with no
  mapped copy. Unit tests in `lib/__tests__/update-note.test.js` and
  `rating.test.js`; versions without an `UPDATE_NOTES` entry show nothing, so
  routine releases stay silent.

## [0.1.5] — 2026-08-15

### Build

- **Version bumped to 0.1.5** (`manifest.json`, `package.json`). Carries the two
  0.1.4 field-report fixes below (Docs Brand label, cloned tooltips) and the
  mandatory in-browser release gate. PATCH per the versioning policy.

### Added

- **Bug reports now carry the diagnostics that actually crack cases**
  (bd workspace-custom-palette-mmd, prompted by the 2026-08-15 field reports):
  `buildExtras` in `shared/feedback-email.js` appends bug-only lines below the
  diagnostics footer — `UI language: <navigator.language>` (the decisive
  variable in the "sort" report) and `App: <Docs/Sheets/Slides>` from a new
  optional checkbox row on the feedback page (bug type only). Extras render
  below the footer per the feedback standard's domain-specific-extras clause;
  the footer line itself is unchanged. `docs/PRIVACY.md` and the page's own
  privacy copy updated to disclose the additions.

- **`EXTENSION_ID` filled in `lib/rating.js`** (bd workspace-custom-palette-iml)
  with the live CWS listing id; `RATE_URL` verified to resolve to the listing's
  /reviews page. The gated review prompt is now armed.

### Changed

- **The bug/feature/feedback intro template is no longer prepended at compose
  time.** Both 0.1.4 field reports arrived as the untouched
  "Steps to reproduce/Expected/Actual" scaffold with the real description
  dumped after it. `feedback/feedback.js` now seeds the template INTO the
  description textarea, and `buildBody` composes
  `description + --- + footer + extras`. What ships is exactly what the user
  edited. The anti-clobber decision (seed only an empty box or another type's
  untouched template; never overwrite user text) is the pure `seedValue` in
  `shared/feedback-email.js`, unit-tested in
  `shared/__tests__/feedback-email.test.js`.

- **The synthetic monitor now fails when the Brand LABEL is not visible**
  (`monitor/src/check.ts`, new `SELECTORS.brandLabel`). The 0.1.4 breakage
  stayed green because the monitor only asserted the swatches + apply readback;
  an unlabeled row is a user-facing failure and now trips the `inject` stage.

- **The monitor also asserts the Brand swatch's effective tooltip**
  (`monitor/src/check.ts`): the innermost `title` — and, when present, the
  innermost `data-tooltip` (Google's own tooltip layer) — under the swatch
  must carry the brand name from its `aria-label`. Covers the third leg of the
  smoke matrix (label / tooltip / apply) against the live DOM's actual tooltip
  attributes, which the jsdom regression test for the cloned-title bug cannot
  see.

- **`npm run package` now enforces the in-browser release gate**
  (`dev/package.sh`): it refuses to build the distribution zip unless the
  three-app smoke matrix (Docs/Sheets/Slides: label visible, tooltips correct,
  color applies — `docs/TEST_PLAN.md`) is confirmed via prompt or
  `SMOKE_CHECKED=1`. Mandated in `CLAUDE.md` and `LAUNCH_CHECKLIST.md` after
  0.1.4 shipped without any real-browser check.

### Fixed

- **The Brand row now carries its "Brand" label in Docs.** Two 0.1.4 field
  reports (2026-08-15) said the Brand colors were "missing" in Docs while fine
  in Sheets/Slides. Live capture showed the row DID inject, but Docs' picker has
  no `.goog-menuheader` to clone, so `findSectionLabel` returned null and the
  label was silently skipped — the row blended into Google's grid unlabeled.
  `config/selectors.default.json` `shared.sectionLabel` now also matches Docs'
  "CUSTOM" heading (`.docs-colormenuitems-custom-header`), and
  `injectBrandRow` neutralizes the clone's `margin`/`width` inline (that class
  carries context-specific negative margin / fixed width that clipped the label
  outside the menu). Contract version rolled to `2026-08-15`; verified live in
  Docs, Sheets, and Slides. Regression test in
  `content/__tests__/dom-harness.test.js`.

- **Brand swatch tooltips no longer show the cloned native color name.** A
  Danish 0.1.4 report: every Brand swatch tooltip read "sort" (black). The
  clone source is the first main-grid swatch (black) and its inner
  `div`'s `title` survived `cloneNode` — the innermost `title` wins on hover,
  shadowing the cell-level title we set. `injectBrandRow` now overwrites
  `title` on all clone descendants (and refreshes any `data-tooltip`) with
  `"<name> (<hex>)"`. Regression test in `dom-harness.test.js`; the jsdom
  picker fixture now models the inner `title` like the live DOM.

## [0.1.4] — 2026-08-10

### Build

- **Version bumped to 0.1.4** (`manifest.json`). 0.1.3 is the live Web Store
  release and the CWS rejects re-used version strings; everything in this
  Unreleased section ships as 0.1.4. PATCH per the versioning policy —
  incremental feature work, no re-onboarding.

### Fixed

- **Options Save no longer silently re-saves the packaged palette when every
  row was deleted.** `options/options.js` `save()` used `resolvePalette`, whose
  empty-input fallback substituted the defaults and then reported "Saved N
  colors" for colors the user had just removed. It now uses `normalizePalette`;
  an empty editor clears the override (`clearUserPalette`) and the status says
  the default palette will apply. Matches the popup's behavior (both now leave
  the stored override absent/empty so the packaged default resolves).

### Changed

- **Removed dead `findPopupWithin` scan from `content/picker-observer.js`.**
  It only ran when `isPickerPopup(node)` was already false, but `isPickerPopup`
  does a deep `querySelector` for the picker markers, so no descendant could
  ever match — the helper always returned null while walking every `div`/`table`
  under each added node. `handle()` now returns early on a non-picker node,
  removing a per-mutation subtree scan from the observer hot path. Behavior is
  unchanged (an added ancestor of the popup still matches via the deep query).

- **Product renamed** from "Brand Palette Injector" to "Custom Color Palette for
  Google Workspace Docs, Sheets & Slides" for Chrome Web Store SEO ("Injector"
  matches no searches and reads malware-adjacent; the new name front-loads
  category keywords and uses the trademark-compliant "for Google Workspace"
  pattern). Touches `manifest.json` (`name`, `action.default_title`), `PRODUCT`
  in `shared/feedback-email.js`, the HTML page titles, `STORE_LISTING.md`, the
  privacy pages, and the package slug (`package.json` name and the
  `dev/package.sh` zip: `dist/custom-color-palette-<version>.zip`). The
  published privacy URL keeps its `/brandpaletteinjector/` path until the page
  is republished.

### Changed

- **Store listing description rewritten as plain text** (`STORE_LISTING.md`):
  the CWS description field renders markdown literally (the live listing was
  showing raw `###` headers), so the detailed description now uses caps-line
  section headers and hyphen bullets, covers the 0.1.4 features (popup editor
  with undo/redo, eyedropper, adaptive icon, local error notices), and is
  wrapped in BEGIN/END paste markers with a plain-text-only warning. Added the
  0.1.4 "What's new" entry. Post-review (roborev 3599): the What's-new leads
  with the product rename and adds the empty-save fix (the dormant review
  prompt is deliberately unannounced), and the central-palette claims are
  qualified to "managed deployment" since the store build ships with
  `CONFIG_BASE` empty and no extra host permission.
- **Palette-stripe icon promoted from placeholder to the shipping icon**
  (decision recorded in bd workspace-custom-palette-ejv). `dev/gen-icons.py`
  now draws the CURRENT default palette's first five colors
  (Cloud/Sky/Poppy/Sunshine/Rose from `config/palette.default.json`) instead
  of the stale pre-redesign Google-primary stripes, so the static
  store/extensions icon matches the runtime toolbar repaint (`lib/icon.js`,
  `ICON_STRIPES`). `icons/icon{16,48,128}.png` regenerated;
  `LAUNCH_CHECKLIST.md`, `STORE_LISTING.md`, `docs/DEPLOY.md`, and `CLAUDE.md`
  no longer call the icons placeholders.

### Added

- **Screen eyedropper in the palette editor** (`shared/palette-editor.js`):
  a pipette icon button to the right of each row's hex field (popup and
  options both, since they share the component) drives the native
  `EyeDropper` API — pick any pixel on screen and the normalized hex lands in
  the row via the same update path as typing, so live picker sync, autosave,
  and undo all apply. Feature-detected off the editor document's
  `defaultView` (button not rendered when the API is absent; jsdom tests stub
  it). Cancel (Esc) and garbage results are no-ops. New `eyedropperIcon` in
  `shared/icons.js`; `.bpi-pick` styles in `shared/palette-editor.css`.
  Tests: four new cases in `shared/__tests__/palette-editor.test.js`.
- **Background-error surfacing per the feedback standard** (closes the one
  outright compliance gap against
  `templates/feedback-and-bug-reports/chrome-extension.md`). The service worker
  now records its own `error`/`unhandledrejection` events into an `errorBuffer`
  in `chrome.storage.session` (pure logic in `lib/error-buffer.js`:
  `appendError` collapses repeats of the newest message, caps at
  `MAX_BUFFERED_ERRORS`, truncates messages; accessors in `lib/storage.js`).
  The popup and options pages drain it on open (`drainBackgroundErrors` in
  `shared/page-errors.js`) into a dismissible `.error-notice` (styles in
  `shared/theme.css`) whose "Report this" opens the feedback page `?type=bug`.
  Report and Dismiss both clear the buffer. Nothing is auto-sent (no-telemetry
  commitment). Tests: `lib/__tests__/error-buffer.test.js`,
  `shared/__tests__/page-errors.test.js` (jsdom smoke).
- **Own-page error listeners**: `installPageErrorListener` (also
  `shared/page-errors.js`) is installed on the popup, options, and feedback
  pages; a page throw or unhandled rejection surfaces the same local notice,
  at most once per page load. Previously only the content script surfaced its
  errors (`content/health-probe.js`); our own pages just `console.error`ed.
- **"Report a bug" companion links** beside "Send feedback" in the popup and
  options footers, deep-linking `?type=bug` (mirrors the reference impl's
  dashboard footer in ebay-watchlist-watch).
- **Milestone-gated Chrome Web Store review prompt**, ported from the fleet's
  proven module (`ebay-watchlist-watch`/`haunted-doll-watchlist`
  `shared/rating.js`) and split per this repo's convention: all state math is
  pure in `lib/rating.js` (`normalizeRatingState`, `recordOpen`,
  `shouldShowRatingPrompt`, `choosePopupBanner`), storage I/O in
  `lib/storage.js` (`ratingPrompt` key, `chrome.storage.local`). Gates: >= 10
  popup opens AND >= 5 days since first open AND one-shot rated/dismissed flags
  AND a health gate — `content/health-probe.js` now records the last
  inject/apply outcome (`lastHealth` in `chrome.storage.local`) and the prompt
  requires a recorded SUCCESS, so we never ask while the extension looks broken
  (or was never used). The popup banner area is a single slot arbitrated
  errors > first-run intro > rating (`choosePopupBanner`, adopted from
  local-ebay-sniper's `chooseBanner`). `RATE_URL` derives from `EXTENSION_ID`
  in `lib/rating.js`, which is EMPTY until the first CWS publish — while empty
  the prompt is fully suppressed (tracked: workspace-custom-palette-9rl).
  Tests: `lib/__tests__/rating.test.js` (ports the ebay 14-case suite +
  normalize/recordOpen/arbitration cases). Post-review hardening (roborev
  3377): the Rate handler persists `ratedAt` BEFORE `chrome.tabs.create`,
  since opening a tab tears down the popup context and would otherwise lose
  the one-shot write; a failed open reverts the flag best-effort.
- **First-run popup intro** (`popup/popup.html` + `popup.js`): a dismissible
  callout shown the first time the popup opens, explaining that the toolbar icon
  paints stripes of the palette's leading `ICON_STRIPES` (5) colors and refreshes
  as the palette changes (mirrors `lib/icon.js` + the service-worker draw). Gated
  on a new `introSeen` flag in `chrome.storage.sync` (`getIntroSeen`/`setIntroSeen`
  in `lib/storage.js`) so it shows once and stays dismissed across machines.
- **Core injection engine** (`extension/src/content/`): `picker-observer`
  detects a color picker opening (by the shared swatch grid / custom-color
  button, not the per-app menu wrapper); `injector` clones the native swatch
  markup into an idempotent "Brand" row; `dom-contract` is the single
  selector owner, consuming `config/selectors.default.json`.
- **Apply flow** (`apply-color.js`): applies a brand hex via Google's own
  picker using synthetic events. Fast-path clicks an existing custom swatch;
  otherwise registers the color through the custom-color dialog
  (`setNativeInputValue` + Enter to commit, full pointer-event sequence — plain
  `.click()` doesn't drive Google's menus), then reopens the picker and clicks
  the registered swatch. The reopen is required in Sheets, whose dialog OK is
  `isTrusted`-gated; `applyColor` throws (surfacing the banner) if it can't
  reopen there. Verified end-to-end by the synthetic monitor (4/4).
- **Palette config + UI**: `lib/palette` (normalize/resolve/reorder) and
  `lib/storage` (`chrome.storage.sync`); options page (add/edit/remove/reorder,
  hex validation, live preview, import/export) and popup (on/off toggle,
  options + feedback links). Edits apply on the next picker open, no reload.
- **Remote config**: `lib/config` (`isValidContract`/`pickContract`/
  `remoteSwatches`, version-aware), a `chrome.alarms` service worker that
  refreshes `/config/*` into `chrome.storage.local` (validated before caching;
  cleared when remote disabled), and the FastAPI `service/` serving
  `/config/selectors` + `/config/palette`. Source priority: remote team palette
  → user override → packaged default.
- **Local health surfacing** (`health-probe.js`): a Shadow-DOM banner with a
  "Report this" deep link on a failed inject/apply or an own-script error; no
  remote telemetry (architecture commitment).
- **Feedback flow** (`shared/feedback-email.js` + `feedback/`): pure compose
  layer (Gmail / Outlook / mailto / copy, diagnostics-only footer, no PII) and a
  dedicated page, per the Raylytics Chrome-extension standard.
- **Synthetic monitor** (`monitor/`): Playwright matrix over app × picker that
  loads the unpacked extension, signs in as a dedicated test account, and reads
  back the applied color; diagnostic bundle + Healthchecks heartbeat +
  `/monitor-result` POST.
- **Failure-to-update loop** (`service/alerts.py`): a failing monitor run opens
  a deduped GitHub issue (+ optional Slack); a green run auto-closes it.
  Token-gated, shape-validated, atomic `POST /config/selectors` publishes a
  selector fix that reaches clients on next refresh (no repackage).
- Tooling: tracked Tier-1 pre-commit hook composing with beads `core.hooksPath`;
  `tools/mock-service/` dependency-free config mock with test-control endpoints.
- Docs: `plan.md`, `SPEC.md` (verified picker contract + the `isTrusted`
  finding), `TEST_PLAN.md`, `DEPLOY.md`, `PRIVACY.md`.
- **Dynamic toolbar icon** (`lib/icon.js` + `background/service-worker.js`): the
  `chrome.action` icon is repainted at runtime from the effective palette's top
  `ICON_STRIPES` (5) colors as vertical stripes (mirroring the
  `dev/gen-icons.py` placeholder design), via `OffscreenCanvas` +
  `chrome.action.setIcon`. Re-rendered on install/startup and on
  `chrome.storage` changes to the user palette (`sync.palette`) or the cached
  remote team palette (`local.cachedPalette`); falls back to the packaged icon
  when there is nothing to draw. Pure `topHexes`/`stripeBands` (exact tiling)
  are unit-tested; the canvas/`setIcon` glue is worker-only. Toolbar icon only —
  `manifest.icons` (extensions page + Web Store) stays static. No new
  permissions (`chrome.action.setIcon` needs none).

### Added

- **Editable palette in the popup** (`popup/`, `shared/palette-editor.js`,
  `lib/history.js`): the toolbar popup now hosts the full editor (add / rename /
  reorder / remove, native `<input type="color">` per row) with **debounced
  auto-save** — edits land in an open picker live via `refreshBrandRows`, no Save
  button. **Undo / redo** of recent changes is backed by a bounded, persisted
  history (`chrome.storage.local`); the pure `lib/history.js` (record/undo/redo,
  capped) is unit-tested. Import/export, reset, and theme stay in the options
  page, reachable via "More settings…". No new permissions.
- **Dark / light theme for the extension's pages** (`shared/theme.css`,
  `shared/theme.js`, `lib/storage.js`, options/popup/feedback): a
  System / Light / Dark preference (default System), set from a selector on the
  options page and stored in `chrome.storage.sync`. Pure `resolveTheme`
  (unit-tested) maps the preference + OS scheme to a concrete theme; `initTheme`
  applies it as `<html data-theme>` and updates live on OS-scheme or preference
  change. Theme variables are centralized in one stylesheet linked by all three
  pages (replacing each page's inline `:root` block). Does not affect the
  injected Brand row, which Google styles.

### Changed

- **Branded UI redesign of the extension's own pages** (`shared/theme.css`,
  `shared/palette-editor.css`, `popup/popup.html`, `options/options.html`,
  `feedback/feedback.html`): replaced the Google-Material look (Material blue
  `#1a73e8`, Google grays) with a Raylytics identity. New OKLCH token system in
  `theme.css` (warm-tinted neutrals, a committed Poppy accent used as a fill with
  Night text, a deepened-Poppy `--accent-text` for links, a Night-based dark
  theme, plus spacing / radius / motion tokens), all pairs verified WCAG AA. Adds
  a pure-CSS brand-stripe mark + wordmark (`.brandbar` / `.brandmark`) echoing the
  striped toolbar icon, a real on/off switch in the popup, flagship interaction
  states (hover / `:focus-visible` ring / active / disabled) across buttons,
  inputs, and the row editor, and `prefers-reduced-motion` support. No JS, DOM
  ids, or markup hooks changed; all 105 tests still green.

- **Trash-can icon for remove** (`shared/icons.js`, `shared/palette-editor.{js,css}`):
  the palette-editor row's text "Remove" button is now an icon-only trash can.
  New `shared/icons.js` builds inline SVG via `createElementNS` (no innerHTML,
  CSP-safe) with `stroke="currentColor"`, mirroring the sibling
  ebay-watchlist-watch icon module; `trashIcon(size, doc)` is the first glyph.
  The button keeps its `aria-label` and reads muted at rest, danger-red on
  hover/focus. Both the popup and options page get it (shared editor). jsdom-tested.

- **Plain-text import/export** (`lib/palette-text.js`, `options/options.{html,js}`):
  the options-page import/export box now uses a dead-simple format — one swatch
  per line, `Name #RRGGBB` — replacing the JSON array. A named line must spell
  the hex with a leading `#` (so a name ending in a bare hex-like token isn't
  silently mis-parsed); a single bare hex on its own line still imports, taking
  the hex as its name. New pure `parsePaletteText` /
  `formatPaletteText` (forgiving on import, canonical on export; never throw),
  unit-tested; import still routes through `normalizePalette` so validation is
  shared. The textarea id changed `#json` → `#text`.
- **Packaged default palette** (`config/palette.default.json`): replaced the
  Google-ish placeholder swatches with the Raylytics brand set, seven named
  colors in order — Cloud `#F9F4EB`, Sky `#9BDCD7`, Poppy `#FE5917`,
  Sunshine `#EABF26`, Rose `#E69C9C`, Grass `#385834`, Night `#1A2D27`. The
  brand-stripe mark (`--brand-1..7` in `theme.css`) tracks this set. Only the
  shipping fallback; user overrides and the remote palette still win.
- **Version bumped to 0.1.3** (`manifest.json`, `package.json`) — ships the
  plain-text import/export, the trash-can remove icon, the branded UI redesign
  (OKLCH tokens, brand mark, switch, states) with the switch-contrast fix, and
  the seven-color default palette; all PATCH.

- **Reusable palette-editor component** (`shared/palette-editor.js` +
  `shared/palette-editor.css`): extracted the options page's inline row-editing
  logic into one component (`mountPaletteEditor`) so the popup and options page
  share a single editor instead of duplicating it. Each row now also has a native
  `<input type="color">` picker alongside the hex field. Options page refactored
  to host it (Save / Reset / import-export / theme unchanged). jsdom-tested.
- **"Brand" section label** (`content/injector.js`, `dom-contract.js`,
  `config/selectors.default.json`): the injected swatch row now carries a "Brand"
  header above it, cloned from the picker's own "Standard"/"Custom" section
  header (`shared.sectionLabel` / `findSectionLabel`) so it matches Google's
  styling and the row is discoverable. Mounts only for table palettes and is
  skipped gracefully when the picker has no such header; idempotent (one label,
  no duplicate on re-inject). Covered in `dom-harness.test.js`.
- **Extension moved to the repo root** to match the other Raylytics extensions:
  `extension/manifest.json` → `manifest.json` and `extension/src/*` →
  `background/ content/ config/ feedback/ lib/ options/ popup/ shared/` (plus
  `extension/icons/` → `icons/`). You now **load the repo root** unpacked, not an
  `extension/` subfolder. Updated manifest paths (dropped the `src/` prefix), the
  `getURL`/fetch literals (`loader.js`, `bootstrap.js`, `options.js`,
  `open-feedback.js`), `tsconfig.json` includes, the monitor's `extensionPath` +
  packaged-config/shared-validator paths, `tools/mock-service` seed paths, and
  `dev/` tooling (`package.sh`, `reload-server.mjs`, `gen-icons.py`).

- **Apply-failure diagnostics** (`content/apply-color.js`): `waitFor` timeouts
  now name the step they were waiting on ("custom-color dialog to open" /
  "registered custom swatch to reappear after reopen"), so the existing
  `[brand-palette] apply failed` console log pinpoints which stage rejected.
  Aids `workspace-custom-palette-fov` (Sheets first-apply false banner).

### Fixed

- **Popup auto-save flush** (`popup/popup.js`): the debounced auto-save is now
  flushed (a) before undo/redo, so undo steps back from the actually-current edit
  instead of over-stepping and dropping an in-progress change, and (b) on popup
  dismissal (`visibilitychange` hidden / `pagehide`), so an edit made within the
  debounce window before clicking away isn't silently lost. Debounce shortened to
  250ms. (roborev 1443)
- **Theme edge cases** (`shared/theme.css`, `lib/storage.js`): a forced
  Light/Dark theme now also pins `color-scheme`, so UA chrome (scrollbars,
  `<select>` popups, form controls, autofill) follows the override instead of the
  OS; and `onSettingsChanged` normalizes the `theme` change value like `getTheme`
  (a cleared/unknown key propagates as `"system"`), so a reset reverts the page
  rather than being silently ignored. (roborev 1426)
- **Apply broke for newly edited colors in a refresh-injected Sheets picker**
  (`content/injector.js`): the reopen handler was captured at injection time via
  `findExpandedColorButton`, which is null for rows `refreshBrandRows` injects
  into a cached, hidden picker (nothing expanded then). Clicking such a new color
  in Sheets then threw `can't apply without reopening`. The reopen button is now
  captured lazily inside the click/apply closure (the picker is expanded at click
  time, read before the custom-color dialog closes it). Apply path stays
  monitor-covered. (roborev 1418)
- **Brand label accessibility** (`content/injector.js`): the cloned "Brand"
  section header now strips the native `aria-label` (so its accessible name
  matches the visible text, not a stale "Standard"), and the label row + cell
  carry `role="presentation"` so the cosmetic header stays out of the grid's
  row/column model. Covered in `dom-harness.test.js`. (roborev 1412)
- **Needless Brand-row rebuilds on unrelated settings writes** (`content/bootstrap.js`):
  `refreshBrandRows` now runs only when the palette or enabled state actually
  changed in an `onSettingsChanged` event. (roborev 1418)
- **Palette edits not reflected in a cached picker** (`content/picker-observer.js`
  `refreshBrandRows`, `bootstrap.js`): editing the palette (or toggling on/off)
  didn't change an already-open/cached picker until a full page reload — Google
  reuses the color menu, so reopening re-shows the stale Brand row and the
  observer never re-fires. `bootstrap` now calls `refreshBrandRows` from
  `onSettingsChanged`, which removes the injected rows/labels and re-injects the
  current palette into every picker menu present in the DOM (an empty palette /
  disabled state just leaves them removed). Covered in `dom-harness.test.js`
  (`workspace-custom-palette-aei`).
- **Brand row duplicated across picker grids + wrong colors**
  (`content/dom-contract.js`, `injector.js`, `picker-observer.js`): a picker
  renders several swatch grids (main palette + smaller STANDARD/theme and CUSTOM
  grids — 80/10/10 cells in Sheets). The observer fired for each, and the
  injector cloned/mounted into whichever it was handed, so the Brand row appeared
  multiple times and the CUSTOM-grid clone rendered the wrong color (all one
  shade). Now `findMainSwatchCells` clones from and mounts into the LARGEST
  (main) grid, and `closestPopupRoot` normalizes every sub-palette trigger to the
  one enclosing menu so per-root idempotency injects exactly one row. Covered by
  multi-grid tests in `content/__tests__/{dom-harness,dom-contract}.test.js`.
- **Sheets first-apply false failure** (`config/selectors.default.json`,
  `docs/SPEC.md`): the Sheets fill/text toolbar buttons are now matched by their
  stable id (`#t-cell-color` / `#t-text-color`) instead of
  `[aria-label="Fill color"]`. Sheets strips `aria-label`/`data-tooltip` off the
  button while its picker is open, so the old selector never matched the
  *expanded* button — `findExpandedColorButton` returned null, `reopen` was never
  captured, and the cold apply hit the "can't apply in Sheets without reopening"
  guard and showed a false "couldn't apply" banner even though the color landed.
  Regression covered in `content/__tests__/dom-contract.test.js` (expanded button
  with no aria-label). The monitor stayed green because it reopens the *closed*
  button itself and reads the cell color back, never exercising the extension's
  reopen capture (`workspace-custom-palette-fov`).

- **Remediation safety** (`monitor/src/remediate.ts`): `verifyCandidate` now
  fails fast (`assertPackagedOnly`/`readConfigBase`) unless `endpoints.js`
  `CONFIG_BASE` is empty, so a cached remote contract can't shadow the swapped
  packaged file and make the matrix verify the wrong contract. The candidate
  swap moved into a `withSwappedContract` seam that restores the packaged
  contract on a thrown error AND on SIGINT/SIGTERM; the module's auto-run is
  guarded behind `import.meta.url` so it's importable. Already-green now exits
  `0` (distinct from no-candidate `1`) via `exitCodeForResolution`. The
  duplicate `isValidContract` was removed in favor of the shared
  `extension/src/lib/config.js` one (monitor tsconfig: `allowJs`); covered by
  `monitor/src/__tests__/remediate.test.ts`.
- **Dev hot-reload** (`extension/src/background/dev-reload.js`): bound the
  reconnect loop (`MAX_ATTEMPTS`, reset on open) so a plain unpacked install
  without `npm run dev` stops flooding the console and keeping the service
  worker alive.
- **Packaging** (`dev/package.sh`): exclude the `src/**/__tests__` directory
  entries as well as their contents, so no empty test-dir records reach the
  CWS zip.

### Documentation

- **First-run setup guide** (`docs/SETUP.md`): minimal install → set brand
  colors → use flow for the single-team use case; linked from `README.md`.
- **Store-asset capture guide** (`store-assets/CAPTURE_GUIDE.md`): CWS image
  specs + shot list, matching the sibling Raylytics extensions.
- **`STORE_LISTING.md`**: data-usage answers rewritten as the dashboard's
  checkbox Q&A + certifications block, plus a "What's new" section, a
  privacy-policy-URL note, and concrete dashboard submission steps.
- **Design context** (`PRODUCT.md`, `DESIGN.md`): strategic product brief
  (register, users, brand personality, anti-references, a11y) and the visual
  system (OKLCH token table, brand mark, typography, components, motion) that the
  branded UI redesign was built against.

### Notes

- No remote telemetry anywhere; the only client network call is a read-only
  config pull (disabled by default until `CONFIG_BASE` is set).
- `apply-plan.js` (an early 3-step plan model) was removed; the apply flow is
  now the fast-path/register/reopen sequence above.

[Keep a Changelog]: https://keepachangelog.com/
[Semantic Versioning]: https://semver.org/
