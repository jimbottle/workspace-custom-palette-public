# Custom Color Palette for Google Workspace Docs, Sheets & Slides

A Chrome extension (MV3) that injects a company brand color palette directly
into the native fill / text / border color dropdowns in Google Docs, Sheets, and
Slides — so a brand color is one click in the real Google picker, not a side
panel. A server-hosted synthetic monitor detects when Google's obfuscated DOM
changes break the injection and drives a data-only fix — for self-hosted and
enterprise deployments, which point the extension at their own config service.
Web Store installs ship with `CONFIG_BASE` empty and receive selector fixes
through a release.

**Read `docs/plan.md` first** before changing anything load-bearing — it is the
phased build plan and records the two architecture decisions that shaped this
repo (no remote telemetry; mandatory feedback flow). `docs/SPEC.md` is the
contract for the picker matrix, apply sequences, and config schema.

This project follows the Raylytics house conventions in
`/Users/evanray/Projects/raylytics/templates`. The Chrome-extension feedback
standard (`templates/feedback-and-bug-reports/chrome-extension.md`) and the
testing standard (`templates/testing/android.md`, principles only) are binding.

<!-- BEGIN BEADS INTEGRATION v:1 profile:minimal hash:7510c1e2 -->
## Beads Issue Tracker

This project uses **bd (beads)** for issue tracking. Run `bd prime` to see full workflow context and commands.

### Quick Reference

```bash
bd ready              # Find available work
bd show <id>          # View issue details
bd update <id> --claim  # Claim work
bd close <id>         # Complete work
```

### Rules

- Use `bd` for ALL task tracking — do NOT use TodoWrite, TaskCreate, or markdown TODO lists
- Run `bd prime` for detailed command reference and session close protocol
- Use `bd remember` for persistent knowledge — do NOT use MEMORY.md files

**Architecture in one line:** issues live in a local Dolt DB; sync uses `refs/dolt/data` on your git remote; `.beads/issues.jsonl` is a passive export. See https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md for details and anti-patterns.

## Session Completion

**When ending a work session**, you MUST complete ALL steps below. Work is NOT complete until `git push` succeeds.

**MANDATORY WORKFLOW:**

1. **File issues for remaining work** - Create issues for anything that needs follow-up
2. **Run quality gates** (if code changed) - Tests, linters, builds
3. **Update issue status** - Close finished work, update in-progress items
4. **PUSH TO REMOTE** - This is MANDATORY:
   ```bash
   git pull --rebase
   git push
   git status  # MUST show "up to date with origin"
   ```
5. **Clean up** - Clear stashes, prune remote branches
6. **Verify** - All changes committed AND pushed
7. **Hand off** - Provide context for next session

**CRITICAL RULES:**
- Work is NOT complete until `git push` succeeds
- NEVER stop before pushing - that leaves work stranded locally
- NEVER say "ready to push when you are" - YOU must push
- If push fails, resolve and retry until it succeeds
<!-- END BEADS INTEGRATION -->

> **Reconciling beads "always push" with the company push rule.** The block
> above (tool-managed by beads) says to push at session end. The Raylytics
> standard is **never push without explicit user approval.** Until the user
> decides otherwise, the company rule wins: commit freely and autonomously, but
> **do not `git push` without an explicit go-ahead.** Treat the beads "push"
> step as "stage everything so a one-word approval can push." This conflict is
> tracked in `docs/plan.md` under "Risks and open decisions."

## Stack

- **Extension:** Chrome MV3, vanilla JS (ES modules) + TypeScript-checked where
  it pays off; no UI framework — the injected swatch row clones Google's own
  markup.
- **Content scripts:** MutationObserver-driven injection on
  `docs.google.com/{document,spreadsheets,presentation}`.
- **State / persistence:** `chrome.storage.sync` (user palette overrides),
  `chrome.storage.local` (cached remote config).
- **Background:** MV3 service worker + `chrome.alarms` (config refresh only).
- **Monitor:** Playwright + Chromium (TypeScript), scheduled via systemd/cron or
  GitHub Actions.
- **Service:** FastAPI (Python) — serves config, receives monitor results, opens
  the remediation loop. Mock under `tools/mock-service/`.
- **Hosting / infra:** your box (Pi 5 / DigitalOcean); Chrome Web Store or
  Workspace admin force-install for distribution.

## Quick start

```bash
# Extension: load unpacked
#   chrome://extensions → Developer mode → Load unpacked → the repo root
#   (the directory with manifest.json — the extension lives at the root, like
#    the other Raylytics extensions; there is no extension/ subfolder)
npm install
npm run typecheck && npm test          # Tier 1 (what the pre-commit hook runs)
bash scripts/hooks/install.sh          # symlink the tracked pre-commit hook

npm run dev                            # WS hot-reload: watch the extension dirs, auto-reload
npm run icons                          # regenerate icons/ from the brand stripes (dev/gen-icons.py)
npm run package                        # build dist/<name>-<version>.zip for the CWS

# Monitor / service have their own setup — see docs/DEPLOY.md
```

The extension lives at the **repo root**: `manifest.json` plus `background/`,
`content/`, `lib/`, `config/`, `popup/`, `options/`, `feedback/`, `shared/`, and
`icons/`. `dev/` holds the dev-only tooling (`reload-server.mjs`, `package.sh`,
`gen-icons.py`); `background/dev-reload.js` is the WS client and is excluded from
the packaged zip. The `dist/` zip output is gitignored.

## Architecture

The extension is a thin DOM-injection layer over Google's native pickers. A
`MutationObserver` (`picker-observer`) notices a color picker mounting; the
`injector` clones the native swatch markup to add a labeled "Brand" row;
`apply-color` drives Google's own "add custom color → set hex → confirm"
sequence on click so we ride Google's real apply path. Every DOM lookup goes
through **`dom-contract`**, the single module that reads `selectors.json` — no
selectors live anywhere else.

Selectors and the palette are **remote data with a packaged fallback.** The
service worker pulls `selectors.json`/`palette.json` from the FastAPI service on
a schedule, caches them in `chrome.storage.local`, and falls back to the
packaged defaults when offline.

**Who actually gets the data-publish path.** `config/endpoints.js` ships
`CONFIG_BASE = ""`, so a default build — including every Chrome Web Store
install — never fetches remote config and runs on the packaged fallback alone.
A selector fix is a data publish, not a code release, **only for deployments
that set `CONFIG_BASE` to their own service** (self-hosted, or an org that
force-installs). For store users a selector fix is a release. That is a
deliberate decision, not a gap: keeping the default empty is what holds
`host_permissions` to the three `docs.google.com` surfaces and lets
`docs/PRIVACY.md` say a default install makes no network requests at all.
Decided 2026-08-19 (bd `workspace-custom-palette-307`); the options, costs and
the trigger to revisit are in `docs/REMOTE_CONFIG_DECISION.md`.

Breakage detection is a **single authoritative signal: the synthetic monitor.**
A scheduled Playwright run signs into a dedicated test account and exercises the
full app × picker-type matrix. There is deliberately **no passive user
telemetry** (see commitments). For real users, a failed inject/apply only
surfaces a local "Report this" banner into the feedback flow — nothing is
auto-sent.

### Pure-function core

The load-bearing, infrastructure-free modules — test these:
`dom-contract` resolvers + the pure accessors, `lib/config.js`
(contract/pick logic), `lib/palette.js` (normalize/resolve/reorder),
`content/settings-plan.js` (what a storage change requires of the Brand row),
`shared/feedback-email.js` (`buildSubject`/`buildBody`/`buildComposeUrls`), and
hex validation. They have no DOM and no `chrome.*` access and run in Node. The
apply flow itself (`apply-color.js`: fast-path swatch → register via dialog →
reopen + click the registered custom swatch) is DOM glue, verified by the
synthetic monitor rather than Node unit tests.

## Architecture commitments (non-negotiable)

Do not relitigate without an explicit user ask + an ADR in the same commit.

- **`dom-contract` is the only module that touches selectors** — every other
  module calls its resolvers. One selector, one place.
- **Selectors + palette are remote data with a packaged fallback** — fixes ship
  as data, not code, for deployments that configure `CONFIG_BASE`. The store
  default is empty on purpose; see "Who actually gets the data-publish path".
- **Apply rides Google's own custom-color flow** — we don't reimplement Google's
  apply handler.
- **No remote telemetry** — the extension never auto-sends user activity,
  identifiers, document content, or URLs. Config fetch is a read-only pull; the
  only data POSTed comes from the *synthetic monitor's test account*, not real
  users. This is the company privacy stance — changing it needs an explicit
  decision and a Web Store disclosure update.

## Current scope (v1)

Build only what's in `docs/plan.md`. Anything else: **ask first.**

- Brand swatch row injected into fill / text / border / table pickers across
  Docs, Sheets, Slides.
- Palette editor (options page) + central remote palette.
- Remote selector/palette config with packaged fallback.
- Synthetic monitor + config/remediation service.
- Mandatory feedback / bug-report flow.
- **Multiple named palettes with a switcher** (0.2.0), opt-in defaulting ON;
  per-palette sync storage.
- **Enterprise org palettes** (0.2.0): an admin publishes one or several via
  the Admin console, optionally enforced with `paletteLocked`. Unlocked org
  colors are what a user starts on; anything they customized is never
  displaced. `docs/DEPLOY.md` is the admin runbook, `docs/TESTING-0.2.0.md`
  the release walkthrough.

### Deferred — do not build without asking

- Passive usage telemetry — **rejected** on privacy grounds (see plan). Parked
  in `FUTURE_IMPROVEMENTS.md` only as a record of why.
- Non-Chromium browser support.
- Theming anything beyond the color pickers.

## Ask when in doubt

This project is refined iteratively. If a design decision is ambiguous, a spec
detail is unclear, or there are multiple reasonable approaches, **stop and ask
before implementing.** A brief clarifying question is cheaper than the wrong
rewrite — especially for selector-contract shape, picker-variant handling, and
anything touching the "no telemetry" line.

## Coding conventions

- **JS / TS:** ES modules; TypeScript strict for typecheck (`npm run
  typecheck`); ESLint on demand (Tier 2), not in the hook. No UI framework in
  the extension.
- **Selectors:** never inline a selector outside `dom-contract.js`. If you're
  about to write a `querySelector` elsewhere, add a resolver instead.
- **Pure where possible:** business logic is side-effect-free under the pure
  modules listed in Architecture; that's what the tests target.
- **Persisted-data shape changes need a migration.** The user's palette lives in
  `chrome.storage.sync` (`palette`) and survives version updates — Chrome only
  clears it on uninstall, and nothing in `onInstalled` resets it. So if you ever
  change the stored swatch shape (today `{name, hex, order}`) or rename/repurpose
  a storage key, you MUST ship a migration that reads the old shape and rewrites
  it forward, or the resolver must tolerate both shapes. Never assume stored data
  matches the current code's shape. Same rule for any other persisted key
  (`enabled`, `theme`, `introSeen`, the `local` history/cache). Add a test for
  the migration in the same commit.
- **No emoji** in code, commit messages, or user-facing strings unless the user
  asks. No em-dashes in shipped user copy (fine in engineering docs).

## Commit and changelog discipline

Read this before committing.

- Commit after any **impactful** change (feature, behavior/schema change, dep
  change, bug fix, completed refactor) — one logical concern per commit.
- **Conventional Commits** prefixes (`feat:`/`fix:`/`refactor:`/`chore:`/
  `docs:`/`build:`/`test:`). Subject ≤ 72 chars, imperative; the body explains
  **why**.
- **Never push without explicit user approval** — this overrides the beads
  "always push" block above. Commit autonomously; push only on a go-ahead.
- Never amend a pushed commit; never commit secrets or ignored files; leave
  `git status` clean.
- Every impactful commit updates `CHANGELOG.md` in the same commit. User-visible
  changes also update `RELEASE_NOTES.md`.

### CHANGELOG.md vs RELEASE_NOTES.md

- `CHANGELOG.md` — engineering log, [Keep a Changelog] sections, names file
  paths / functions / constants. `## [Unreleased]` at top.
- `RELEASE_NOTES.md` — user-facing (Web Store voice): what changed for the user,
  no file/function names, no em-dashes. Internal refactors/tests go in
  CHANGELOG only.

## Automated testing workflow

| Tier | Command | When | Needs |
| --- | --- | --- | --- |
| 1 — unit + types + **locale** | `npm run typecheck && npm test` | every commit (hook) | nothing |
| 2 — lint + service + monitor | `npm run tier2` | before PR | one-time `npm run tier2:setup` |
| 3 — extension pages | `npm run smoke:pages` (real Chromium, extension loaded) | after any popup/options change; before a release cut | nothing |
| 3 — monitor matrix | `npm run monitor` (Playwright) | before release cut | test Google account |
| 3 — in-browser smoke | manual/driven check in a real Chrome | **MANDATORY before any package/release** | signed-in Chrome |

- **Every UI-facing check must survive a non-English UI.** All three field bugs
  so far were locale bugs that the English-only tiers reported green: 0.1.4's
  "sort" tooltips, and 0.1.6's apply failure in Docs *and* Sheets (contract
  keyed on `aria-label="Hex color"`; Danish renders "Hex-farve"). Tier 1 now
  pseudo-localizes a captured picker fixture and asserts every resolver still
  resolves (`content/__tests__/locale-fixture.test.js`), and the static scan
  rejects translated-attribute selectors in both contract files and in
  `monitor/src/matrix.ts`. Never add a selector that matches on visible text —
  ids and class names are identical in every language.

- **`npm run smoke:pages` is not the smoke check.** It drives the extension's
  own pages in a real Chromium, which is the only tier that sees CSS - that is
  what makes it worth having, since the `[hidden]` bug that shipped three times
  was invisible to jsdom. But it never opens Docs, Sheets or Slides and never
  touches enterprise policy, so it can be green while the thing users actually
  do is broken. Never report it as the release smoke.

- **No release or distribution zip without the in-browser smoke check.** Before
  `npm run package`, confirm in a real browser, in **all three apps** (Docs,
  Sheets, Slides): the Brand LABEL is visible above the row, swatch tooltips
  show the brand names, and a brand color actually applies. `dev/package.sh`
  enforces this (refuses without confirmation / `SMOKE_CHECKED=1`); never
  confirm it without having actually done the check on the current tree.
  Background: 0.1.4 shipped with the Brand row unlabeled in Docs while Tier 1
  and the monitor were green (2026-08-15 field reports).

- **Canonical pre-commit hook:** `scripts/hooks/pre-commit` (tracked).
  `.git/hooks/pre-commit` is a symlink to it. Install via
  `bash scripts/hooks/install.sh` — refuses to clobber a non-symlink hook.
- **File-filtered + graceful fallback:** skip when no JS/TS is staged; if
  `node_modules` is absent, warn and exit 0 rather than hard-fail.
- **Not in the hook:** ESLint, the service and monitor unit tests, the
  Playwright matrix — those are Tier 2/3.
- **There is no separate "integration" tier.** The fixture-driven tests that
  exercise real captured picker markup (`content/__tests__/dom-harness.test.js`,
  `locale-fixture.test.js`) and the jsdom page tests (`popup/__tests__/`,
  `options/__tests__/`) all run inside Tier 1 under plain `node --test`. The
  tier table used to promise a `test:integration` script that was never defined
  in `package.json`; it was removed rather than invented, since a tier that
  cannot run is worse than one that does not exist.
- **No real network in unit tests.** Content-script tests run against saved
  picker `outerHTML` fixtures; config/service tests run against
  `tools/mock-service/`.
- **Coexistence with beads / roborev hooks:** keep them in `.git/hooks/`
  alongside this symlink; do not switch to `core.hooksPath`.

## Testing

- Every feature ships with tests in the **same commit**.
- Bias the budget to the pure modules (`dom-contract`, `config`, `palette`,
  `feedback-email`, hex validation) — happy path + one edge + error handling.
- The synthetic monitor is the only end-to-end signal; it must read back the
  applied color, not just assert the swatch mounted.
- `docs/TEST_PLAN.md` maps tiers → monitor matrix → manual-only cases.

## Versioning

[Semantic Versioning][semver], **high bar for non-patch bumps. Default to
PATCH.** MINOR only for a genuinely new core capability; MAJOR only for a change
that forces users to re-accept/re-onboard. Incremental work — a new palette
option, a new picker variant, polish — is PATCH.

### Store-facing version

- **`version` in `manifest.json`** is the human-facing semver. Bump by the rules
  above.
- **Bump it in the FIRST commit of work after a release, not at the release
  cut.** A tree that differs from a shipped version carries a new version
  number, so an unpacked install, the popup and the changelog all say what is
  being run (owner ruling, 2026-09-18). `package.json` moves with it. The
  changelog and release-notes headings read `[x.y.z] — Unreleased` until the
  roll commit dates them.
- The Chrome Web Store rejects re-uploads of an already-used version string;
  every upload (including testing) needs a higher `version`. Burned numbers
  can't be reused; gaps are fine.

## Deployment / Release

See `docs/DEPLOY.md` for the full runbook (Web Store listing vs Workspace admin
force-install, monitor scheduling, service hosting). Principles: minimal
permissions, document any permission addition here and in `CHANGELOG.md`, ship
test-safe defaults, and keep the privacy disclosure (`docs/PRIVACY.md`) accurate
— it states "config pull only, no telemetry," which Web Store review will check
against the manifest's host permissions.

## Secrets

**Every credential an agent uses lives in 1Password.** API keys, tokens, DSNs,
OAuth client secrets, webhook URLs, signing keys: if Claude Code, a cron job, an
MCP server, or CI needs it, 1Password is the source of truth, and anything else
(a local `.env`, SSM, GitHub Secrets, a server-side env file) is a derived copy
seeded from it. This applies to the credentials this repo already uses, not only
to new ones. "Secrets manager" anywhere in this repo's docs means 1Password.

- **Reference, don't copy.** Tracked files carry env var *names* and
  `op://<vault>/<item>/<field>` references, never values. Load at run time with
  `op run --env-file=op.env -- <cmd>` (an `op.env` of `op://` lines, gitignored)
  or `op read "op://..."` piped straight into the consumer. Document every
  required env var (name + purpose) in `docs/DEPLOY.md`; names only.
- **Name items `<repo>-<service>`** (for example `mc-epn`), one item per service,
  fields named after the env vars. Use the 1Password account that owns the work
  (personal `my.1password.com` for this repo) and pass `--account`
  when more than one is signed in. This repo's slug is `wcp-`.
- **A literal `.env` is debt, not a pattern.** It must be gitignored and
  `chmod 600`, and the inventory below marks it as pending migration. Move the
  values into 1Password the next time you touch them. `.gitignore` already
  excludes Dolt/db files and `.beads-credential-key`; add `.env` and `op.env`
  patterns before introducing either.
- **Never print a secret.** Prove a key works by calling the API. Don't `cat` env
  files, echo variables, or paste values into transcripts, commit messages, or
  this file.
- **Found a literal secret in a tracked file or in history?** Stop and tell the
  owner. It needs rotating and purging, and that is their call.
- **Adding a credential:** create the 1Password item, add the `op://` line to
  `op.env.example` (or this repo's equivalent template), add a row below, and
  confirm the local copy is ignored.

### Credentials this repo uses

None are provisioned yet: the monitor and service are not hosted, so every row
below is "to create" and is filled in as built.

| Env var | Used by / purpose | Where it lives today | 1Password item |
|---|---|---|---|
| `MONITOR_GOOGLE_USER` / `MONITOR_GOOGLE_PASS` | synthetic monitor's dedicated Google test account (real login) | not provisioned | `wcp-monitor-google` (to create) |
| `MONITOR_TOKEN` = `SERVICE_TOKEN` | bearer shared by `service/app.py` (`/monitor-result`, `/config/selectors`) and the monitor's POST | not provisioned | `wcp-monitor-token` (to create; one field, used by both sides) |
| `HEALTHCHECKS_URL` | monitor heartbeat ping on a green run | not provisioned | `wcp-healthchecks` (to create) |
| `GITHUB_TOKEN` (+ `GITHUB_REPO`, not secret) | service opens/updates remediation issues | not provisioned | `wcp-github` (to create) |
| `SLACK_WEBHOOK_URL` | service failure message; dormant by decision (2026-09-01) | not provisioned | `wcp-slack` (to create only if revived) |

Not secrets: `SERVICE_URL`, `GITHUB_REPO`, `MONITOR_HEADLESS`, `MONITOR_USER_DATA_DIR`, `EXTENSION_PATH`, `MOCK_PORT`, `AUTH_TIMEOUT_MS`.

## Platform / API etiquette

- The extension touches Google Docs/Sheets/Slides DOM only via the picker popup;
  it does not call any Google API. Keep host permissions to the three
  `docs.google.com` surfaces — minimal permissions are a Web Store review
  signal.
- The synthetic monitor drives a real Google login; keep its cadence modest to
  avoid tripping Google's automation defenses, and keep its credentials in
  1Password (see Secrets).

## Future improvements

Deferred / rejected ideas live in `FUTURE_IMPROVEMENTS.md` with rationale,
difficulty, and risks — so we don't relitigate them. Passive telemetry is parked
there as explicitly rejected. When an idea graduates to "doing it," move it into
`docs/plan.md`.

## Cross-references

- `docs/plan.md` — phased build plan; read first
- `docs/SPEC.md` — picker matrix, apply sequences, config schema (the contract)
- `docs/TEST_PLAN.md` — tier mapping + manual release checklist
- `docs/DEPLOY.md` — Web Store + enterprise force-install runbook
- `docs/PRIVACY.md` — Web Store privacy disclosure
- `STORE_LISTING.md` — paste-ready CWS listing copy + review answers
- `LAUNCH_CHECKLIST.md` — pre-submission gate
- `FUTURE_IMPROVEMENTS.md` — deferred / rejected ideas
- `/Users/evanray/Projects/raylytics/templates` — house conventions (CLAUDE.md
  template, Chrome-extension feedback standard, testing standard)
- `/Users/evanray/Projects/raylytics/ebay-watchlist-watch` — reference impl for
  the feedback flow (copy `shared/feedback-email.js`, rename `PRODUCT`)

[Keep a Changelog]: https://keepachangelog.com/
[semver]: https://semver.org/
