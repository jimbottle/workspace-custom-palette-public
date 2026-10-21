# Custom Color Palette for Google Workspace Docs, Sheets & Slides — Plan

Chrome extension (MV3) that injects a company brand color palette directly into
the native fill / text / border color dropdowns in Google Docs, Sheets, and
Slides, plus a server-hosted synthetic monitor that detects when Google's UI
changes break the injection and drives a fix.

> **Revised 2026-05-29** against the Raylytics templates
> (`/Users/evanray/Projects/raylytics/templates`). Two material changes from the
> first draft: (1) **passive user telemetry is removed** — it violated the
> company "no remote telemetry" privacy standard; the synthetic monitor is now
> the sole authoritative breakage signal. (2) A **mandatory in-extension
> feedback / bug-report flow** was added per the Chrome-extension feedback
> standard. See "Alignment with company standards" below.

## How to use this plan

- Each phase is independently executable and has explicit acceptance criteria —
  treat those as the done-signal.
- `dom-contract` (the selector module) is the single source of truth for every
  DOM lookup. No selectors anywhere else in the codebase.
- Selectors and palette ship as remote-fetched data with a packaged fallback.
  Code logic is static and Web-Store-reviewed; the volatile data is
  hot-swappable.
- Phase 0 is a feasibility spike — do not start Phase 1 until it passes, because
  the whole approach depends on the native apply flow being drivable.
- **Issue tracking is `bd` (beads), not markdown TODOs.** File one `bd` issue
  per phase (and per acceptance criterion where useful); `bd ready` is the work
  queue. This plan is the narrative; `bd` is the live state.

## Goals

- Brand colors appear inside the real Google color dropdown, not a side panel —
  hard requirement.
- Palette is trivial for a non-technical user to maintain (edit names/hex in an
  options page, or central team palette pushed from server).
- Applying a brand color is one click in the native picker, identical to
  clicking any built-in swatch.
- A scheduled synthetic test confirms the injection still works across all three
  apps and all picker types.
- When the test fails, a fix is triggered and can deploy without a Web Store
  round-trip — for deployments that configure `CONFIG_BASE`. Store installs run
  on the packaged fallback and are fixed by a release (decided 2026-08-19; see
  `docs/REMOTE_CONFIG_DECISION.md`).
- The extension ships with **no remote telemetry** and a consistent
  feedback/bug-report surface, matching every other Raylytics extension.

## Non-goals

- Modifying Google's admin console or any server-side Workspace setting (not
  possible).
- Theming the document chrome, fonts, or anything beyond the color pickers.
- Supporting non-Chromium browsers in v1.
- **Collecting any per-user usage data.** No crash reporter, no analytics, no
  passive health beacons. (Deliberate company privacy stance — see commitments.)

## Architecture commitments (non-negotiable)

These do not get relitigated without an explicit user ask and an ADR.

- **`dom-contract` is the only module that touches selectors.** Every other
  module calls its resolver functions. A selector lives in exactly one place.
- **Selectors and palette are remote data with a packaged fallback.** A selector
  fix is a data publish, not a code release / Web Store round-trip — for
  deployments that set `CONFIG_BASE`. The shipped default is empty, so store
  installs use the packaged fallback and are fixed by a release. Remote config
  is an enterprise / self-hosted facility by decision, not by accident.
- **Apply rides Google's own custom-color flow.** We drive "add custom color →
  set hex → confirm" rather than reimplementing Google's apply handler, so we
  survive apply-logic changes.
- **No remote telemetry.** The extension never auto-sends user activity,
  identifiers, document content, or URLs to any server. Config fetch is a
  read-only pull; the only thing the extension POSTs is what the *synthetic
  monitor* (a dedicated test account, not a real user) generates. This is a
  privacy commitment, not a default — changing it requires an explicit decision.
- **Core logic stays in pure, side-effect-free functions** (`dom-contract`
  resolvers, the apply-sequence planner, the feedback compose builders). These
  are the testable load-bearing core and survive a stack rewrite.

## Key design decisions

- **Selectors as remote data** — the only frequently-breaking part is Google's
  obfuscated DOM. All selectors live in `selectors.json`, fetched from your
  server, cached locally, with the packaged copy as fallback.
- **Apply via Google's own custom-color flow** — on swatch click, the extension
  drives the native "add custom color → set hex → confirm" sequence. As a bonus
  the color also lands in the document's native Custom row.
- **Single authoritative health signal: the synthetic monitor.** A scheduled
  Playwright run against a dedicated test account exercises the full
  app × picker-type matrix. It catches breakage with zero real-user data and
  zero dependence on user activity. (The first draft's passive-telemetry second
  tier is dropped — it conflicted with "no remote telemetry.")
- **Local-only error surfacing for real users.** `health-probe` still asserts
  inject + apply succeeded, but a failure only surfaces a local, dismissible
  banner with a "Report this" link into the feedback flow (`?type=bug`). Nothing
  is auto-sent; the user chooses whether to report.
- **Server owns config and remediation, not telemetry.** A small FastAPI service
  serves selector/palette config and receives *monitor* results, fans out
  alerts, and opens the remediation loop. It has no user-facing telemetry
  endpoint.

## Alignment with company standards

Mapped to `/Users/evanray/Projects/raylytics/templates`:

| Standard | Source template | How this plan complies |
| --- | --- | --- |
| No remote telemetry / no crash reporter | `feedback-and-bug-reports/chrome-extension.md` | Passive telemetry phase removed; only the synthetic monitor (test account) posts data. |
| Mandatory feedback / bug-report flow | `feedback-and-bug-reports/chrome-extension.md` | New Phase 6 — dedicated feedback page, popup + options entry points, `dev@raylytics.io` with `[Bug]/[Feature]/[Feedback]` subjects, Gmail/Outlook/mailto/copy transports, pure `shared/feedback-email.js`, diagnostics footer (version/browser/OS only). |
| Local error banner → "Report this" deep link | same | `health-probe` surfaces a banner linking to feedback with `?type=bug`; nothing auto-sent. |
| Three test tiers, pure-function core, tracked pre-commit hook, mock server, `docs/TEST_PLAN.md` | `testing/android.md` (principles transfer to JS) | See "Testing" and Phases 1–7; FastAPI service gets a mock under `tools/`. |
| CLAUDE.md house style + CHANGELOG/RELEASE_NOTES/FUTURE_IMPROVEMENTS/semver | `agents/CLAUDE.md` | Repo carries all four; `CLAUDE.md` at root (this project also runs `bd`). |

## Architecture

```
workspace-custom-palette/
  CLAUDE.md                  # root, company-standard + beads managed block
  CHANGELOG.md               # engineering log (Keep a Changelog)
  RELEASE_NOTES.md           # user-facing, Web Store changelog voice
  FUTURE_IMPROVEMENTS.md     # parking lot for deferred/rejected ideas
  manifest.json              # MV3; minimal permissions (at the repo root — load this dir)
  content/
    picker-observer.js       # detects a color picker opening (all apps, all picker types)
    injector.js              # mounts the Brand swatch row into the open picker, idempotently
    apply-color.js           # on click, drives Google's native custom-color apply flow
    dom-contract.js          # consumes selectors.json, exposes resolver functions ONLY
    health-probe.js          # asserts inject + apply; on fail shows a LOCAL "Report this" banner
  background/
    service-worker.js        # chrome.alarms: refresh remote config; no DOM, no telemetry
  popup/
    popup.html
    popup.js                 # on/off toggle, link to options, "Send feedback" footer link
  options/
    options.html
    options.js               # palette editor: add/edit/remove/reorder, hex validate, import/export
  feedback/
    feedback.html            # dedicated feedback page (NOT a modal)
    feedback.js              # DOM wiring + live preview panel; reads env, calls shared builder
  shared/
    feedback-email.js        # PURE: buildSubject/buildBody/buildComposeUrls; no DOM, no chrome.*
  config/
    selectors.default.json   # packaged fallback DOM contract
    palette.default.json     # packaged fallback palette
  icons/                     # 16/48/128 (placeholder art from `npm run icons`)
  monitor/                   # synthetic monitor — runs on your server
    checks.spec.ts           # Playwright matrix: app x picker-type
    runner.ts                # scheduler entrypoint, diagnostic bundling
  service/                   # FastAPI — runs on your server
    app.py                   # /config/*, /monitor-result, alerting + remediation
  tools/
    mock-service/            # dependency-light stand-in for the FastAPI service (tests/E2E)
  scripts/
    hooks/
      pre-commit             # tracked; symlinked into .git/hooks; Tier-1 gate
      install.sh             # idempotent installer; refuses to clobber a non-symlink hook
  docs/
    plan.md                  # this file
    SPEC.md                  # the contract: picker matrix, apply sequences, config schema
    TEST_PLAN.md             # tier mapping, monitor matrix, manual release checklist
    DEPLOY.md                # Web Store + enterprise force-install runbook
    PRIVACY.md               # Web Store privacy disclosure: "config pull only, no telemetry"
```

## Components

### Injection engine (content script)

- **picker-observer** — a MutationObserver watching for the picker popup
  mounting. Must recognize the picker regardless of which button opened it (text
  color, cell/highlight fill, border, table) across all three apps. Uses
  `dom-contract` resolvers only; no raw selectors here.
- **injector** — clones the native swatch markup so the Brand row is visually
  indistinguishable, builds a labeled "Brand" section, mounts it into the open
  picker. Idempotent — never double-injects if the observer fires twice.
- **apply-color** — on Brand swatch click, runs the native custom-color sequence
  to apply the hex to the current selection. The *ordering* of steps is computed
  by the pure `apply-plan` module; `apply-color` only executes the plan and
  verifies the input/confirm elements via `dom-contract`.
- **health-probe** — after each injection and apply, asserts success. On
  failure it surfaces a **local, dismissible banner** with a "Report this" link
  that deep-links to `feedback/feedback.html?type=bug`. It does **not** send
  anything anywhere. (This replaces the dropped telemetry push.)

### DOM contract (the maintenance lever)

- `selectors.json` holds every selector and heuristic, keyed by app
  (docs/sheets/slides) and picker-type, plus the custom-color apply-flow
  elements.
- Load order: remote (your server, cached in `chrome.storage.local`) then
  packaged default as fallback. Versioned so the monitor and clients can report
  which contract they're running.
- `dom-contract.js` is the only module that reads this file and the only module
  that touches selectors.

### Palette config

- `palette.json` is a list of `{ name, hex, order }`.
- Source priority: remote team palette (optional, set by you centrally) then
  user overrides via the options page (`chrome.storage.sync`) then packaged
  default.
- Options page: add/edit/remove/reorder swatches, hex validation, live preview,
  import/export JSON.

### Popup

- Minimal surface: an enable/disable toggle, a link to the options page, and a
  "Send feedback" footer link (required entry point per the feedback standard).

### Feedback / bug-report flow (company standard)

Implements `feedback-and-bug-reports/chrome-extension.md` verbatim — copy the
`ebay-watchlist-watch` reference implementation and rename `PRODUCT`.

- Dedicated page `feedback/feedback.html` (never a modal). Entry points: popup
  footer link, options page link, and any error banner's "Report this" link
  (deep-links with `?type=bug`).
- Inbox `dev@raylytics.io`; subject `[{Type}] {CWS listing name}`; types
  Bug / Feature / Feedback (default Feedback unless `?type=` says otherwise).
- Diagnostics footer is the only mandatory payload: extension version, browser +
  version, OS — parsed client-side. **No** email, tab URL, content, identifiers,
  or `chrome.storage` values.
- Four transports built from one URL builder: Gmail, Outlook (`.live.com`),
  default `mailto:`, and "Copy email address."
- Compose logic is the pure `shared/feedback-email.js`
  (`buildSubject`/`buildBody`/`buildComposeUrls`) — unit-tested in Node, no DOM,
  no `chrome.*`. The DOM wiring + collapsible live-preview panel live in
  `feedback.js`.

### Background service worker

- `chrome.alarms` schedules periodic refresh of both config files. No DOM
  access; purely coordinates fetch, cache, and storage. Falls back to packaged
  config when offline or the server is unreachable.
- **No telemetry flush** (removed). Its only network activity is the config
  pull.

### Synthetic monitor (your server)

- Playwright + Chromium loads the unpacked extension and signs into a dedicated
  test Google account.
- Iterates the full app × picker-type matrix: open a test doc, open each picker,
  assert the Brand row mounted, click a swatch, read back the applied color to
  confirm the apply flow worked end to end.
- On pass: ping a Healthchecks.io heartbeat so a missed run also alerts.
- On fail: capture a diagnostic bundle (screenshot, picker `outerHTML`,
  accessibility tree, and which resolver failed) and POST it to the service.
- Scheduled via systemd timer or cron on your box (Pi 5 / DigitalOcean), or
  GitHub Actions if you'd rather keep it off-box.

### Config + remediation service (FastAPI, your server)

Endpoints:
- `GET /config/selectors` — serves the current DOM contract; clients fetch on
  schedule and startup.
- `GET /config/palette` — serves the central team palette.
- `POST /monitor-result` — synthetic monitor results plus diagnostic bundles.
  **(The first draft's `POST /telemetry` is removed.)**

Failure-to-update loop:
- A monitor failure opens a GitHub issue with the diagnostic bundle attached and
  notifies you (email / Slack).
- Optional automated remediation: a headless agent job ingests the captured
  picker DOM, proposes updated entries in `selectors.json`, reruns the monitor
  against the candidate, and on green either opens a PR or publishes the updated
  `/config/selectors`.
- Because selectors are remote data, publishing the new contract fixes every
  *configured* client on its next refresh — no repackage, no Web Store review.
  Clients with `CONFIG_BASE` empty (the shipped default, so every store install)
  do not refresh and still need a release; see the decision entry under "Risks
  and open decisions".

A dependency-light **mock of this service** lives in `tools/mock-service/` so
the extension's config-fetch path and the monitor's POST path can be tested
without standing up real infra (per the testing standard's mock-server
convention).

## Testing

Three tiers, adapting `testing/android.md` to the extension stack. Pure-function
core is the test budget's priority.

| Tier | What it runs | When | Gate |
| --- | --- | --- | --- |
| 1 — Fast | Unit tests (pure modules) + typecheck/lint, in-process | every commit | pre-commit hook |
| 2 — Medium | ESLint, content-script integration tests against a saved picker-DOM fixture | before PR | on demand / CI |
| 3 — Slow | Playwright monitor matrix against the live apps (real test account) | before release cut | manual / scheduled |

- **Pure modules get the coverage:** `dom-contract` resolvers, `apply-plan`,
  `feedback-email` builders, hex validation. These run in Node with no DOM.
- **Tracked pre-commit hook:** `scripts/hooks/pre-commit`, symlinked into
  `.git/hooks/`, installed by `scripts/hooks/install.sh`. File-filtered (skip
  when no JS/TS staged), graceful fallback if `node_modules` is missing. Runs
  Tier 1 only.
- **No real network in unit tests** — content-script integration tests run
  against saved picker `outerHTML` fixtures; service/config tests run against
  `tools/mock-service/`.
- **`docs/TEST_PLAN.md`** maps tiers → monitor matrix → the manual cases that
  can't be automated (MFA login friction, a brand-new picker variant, Web Store
  review behavior).

## Phases

> File each phase as a `bd` issue; acceptance criteria become the close
> condition. Phases are renumbered from the first draft — the old "Phase 4
> passive telemetry" is gone and the feedback flow is added.

### Phase 0 — Feasibility spike (de-risk the apply flow)

- Manually reverse the picker DOM in all three apps; document selectors and the
  exact custom-color apply sequence per picker-type in `docs/SPEC.md`.
- Throwaway content script that mounts one Brand swatch in the Sheets fill
  picker and applies it on click.
- **Acceptance:** clicking the injected swatch reliably applies the correct hex
  to the selected cell in Sheets, and the same sequence is confirmed feasible
  (selectors documented) in Docs and Slides.

### Phase 1 — Core injection engine

- Implement picker-observer, injector, apply-color, apply-plan (pure), and
  dom-contract with the packaged selectors from Phase 0. Unit-test apply-plan
  and dom-contract; stand up the pre-commit hook in this phase.
- **Acceptance:** Brand row appears in every targeted picker across
  Docs/Sheets/Slides; clicking applies the correct hex; injection is idempotent;
  no console errors on repeated open/close; Tier 1 hook is green.

### Phase 2 — Palette config and options page

- `palette.json`, `chrome.storage.sync`, options UI with validation and
  import/export. Pure hex-validation module is unit-tested.
- **Acceptance:** a user edits the palette in options and the change is
  reflected on the next picker open with no extension reload.

### Phase 3 — Remote config and service worker

- FastAPI `GET /config/*` endpoints; service worker fetch, cache, and packaged
  fallback. `tools/mock-service/` stands in for tests.
- **Acceptance:** changing remote selectors or palette propagates to a client on
  next refresh; with the server unreachable the client still works on packaged
  config.

### Phase 4 — Local health surfacing (no telemetry)

- `health-probe` asserts inject/apply success; on failure shows a local
  dismissible banner with a "Report this" link to `feedback?type=bug`. Wire the
  `window.error` / `unhandledrejection` catch to the same banner. Nothing is
  sent anywhere.
- **Acceptance:** an intentionally broken selector produces a local banner with
  a working deep link; confirm via network inspection that **no** request leaves
  the browser.

### Phase 5 — Synthetic monitor

- Playwright checks across the full app × picker-type matrix; scheduled;
  diagnostic bundle on failure; Healthchecks heartbeat on success; `POST
  /monitor-result` to the service (mock in tests).
- **Acceptance:** the monitor catches an intentionally broken selector and POSTs
  a complete diagnostic bundle; a missed run trips the Healthchecks alert.

### Phase 6 — Feedback / bug-report flow (company standard)

- Build `shared/feedback-email.js` (pure, unit-tested) and `feedback/` page per
  `feedback-and-bug-reports/chrome-extension.md`; add popup + options entry
  points; wire the error-banner deep link from Phase 4.
- **Acceptance:** all four transports open a correctly pre-filled compose with
  the right subject prefix and a diagnostics-only footer; preview panel mirrors
  the body live; no PII in the payload; pure builders pass unit tests.

### Phase 7 — Failure-to-update loop

- Service opens a GitHub issue with diagnostics on monitor failure; optional
  agent remediation job; publish updated remote selectors.
- **Acceptance:** a simulated break produces an issue, an updated contract is
  published, the monitor goes green, and clients recover without a repackage.

### Phase 8 — Hardening and deploy

- Minimize permissions; write `docs/SPEC.md`, `docs/TEST_PLAN.md`,
  `docs/DEPLOY.md`, `docs/PRIVACY.md`. Web Store listing or enterprise
  force-install via Workspace admin policy.
- **Acceptance:** clean install applies the palette in all three apps;
  permission set is minimal and documented; remote config is documented as
  data-only for review; privacy disclosure states "config pull only, no
  telemetry"; the feedback flow is reachable from popup and options.

## Risks and open decisions

- **Apply-flow side effects** — adding a custom color normally also applies it
  to the selection. Confirm there are no surprises when no cell/text is selected,
  per app.
- **Picker variation** — Sheets fill vs Docs highlight vs Slides shape fill vs
  border/table pickers may differ enough to need separate contract entries.
  Phase 0 must enumerate them.
- **Docs canvas rendering** — the document is canvas, but the picker popup is
  DOM, so injection is fine; still verify the table and border pickers
  specifically.
- **Web Store review** — content scripts on Google domains plus remote config
  may draw scrutiny. `docs/PRIVACY.md` documents explicitly that remote config
  is data-only, the consuming logic is packaged, and the extension sends no user
  data.
- **The remote-config lever is not connected for store users — decided, Option
  B, 2026-08-19.** `CONFIG_BASE` ships empty, so a selector fix reaches Web
  Store installs through a release, not a data publish. This is now documented
  as the intended posture rather than a gap: remote config is an enterprise /
  self-hosted facility, and the privacy stance stays absolute (no origin to
  phone home to, so no connection metadata reaches us). Options and costs are in
  `docs/REMOTE_CONFIG_DECISION.md` (bd `workspace-custom-palette-307`). **Revisit
  trigger:** the first break caused by Google changing their DOM rather than by
  one of our own selector bugs — that arrives unannounced, hits every user at
  once, and cannot be prevented by better tests. Until then the leverage is in
  detection (the pseudo-localized Tier 1 fixture, the Danish monitor leg), not
  in fix-delivery speed.
- **Monitor auth** — dedicated test Google account; store credentials in your
  secrets manager; pre-resolve any MFA friction for headless login. This is the
  one account whose activity the service legitimately receives — it is not a
  real user, so it doesn't breach "no remote telemetry."
- **Deployment for ease of use** — for an org rollout, force-install via the
  Chrome/Workspace admin policy so end users install nothing and the palette
  simply appears.
- **beads vs company push discipline** — the repo's beads integration says "work
  is not complete until `git push` succeeds." The company standard says "never
  push without explicit user approval." Resolve before the first push (see
  CLAUDE.md "Commit and changelog discipline").
