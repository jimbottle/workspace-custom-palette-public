# monitor/ — synthetic monitor (Playwright)

Loads the unpacked extension into Chromium, signs in as a **dedicated test
Google account**, and runs the app × picker-type matrix on a schedule: open a
fresh doc, open each picker, assert the Brand row mounted, click a Brand swatch,
and read back that the color was applied via Google's native Custom row. It
tests the SHIPPED extension code path end to end.

- **All green** → pings the Healthchecks heartbeat (so a *missed* run also alerts).
- **Any red** → captures a diagnostic bundle (screenshot, picker `outerHTML`,
  a11y tree, failed stage → suspect resolver) and POSTs it to
  `${SERVICE_URL}/monitor-result` for the Phase 7 remediation loop.

## Setup (needs the dedicated test account)

```bash
cd monitor
npm install
npx playwright install chromium          # one-time: download the browser
npm run auth                             # sign in to the TEST account, press Enter to save
```

`npm run auth` opens a real Chromium with the extension loaded; sign in to the
**dedicated test account** (not a personal one — see CLAUDE.md "Monitor auth"),
pre-resolving any MFA. The session persists in `monitor/.user-data/` (gitignored;
no credentials are stored in the repo).

## Run

```bash
npm run monitor                          # full matrix; exit 0 = green, 1 = red, 2 = crash
npm run test:pw                          # same checks via `playwright test`
```

### Environment

| Var | Purpose | Default |
|---|---|---|
| `EXTENSION_PATH` | unpacked extension dir | `../extension` |
| `MONITOR_USER_DATA_DIR` | persistent profile w/ the test-account session | `./.user-data` |
| `HEALTHCHECKS_URL` | heartbeat ping on a green run | unset (skipped) |
| `SERVICE_URL` | base for `POST /monitor-result` on failure | unset (skipped) |
| `SERVICE_TOKEN` | bearer token for `/monitor-result` (must equal the service's `MONITOR_TOKEN`) | unset |
| `MONITOR_HEADLESS` | `1` to run new-headless (default headed) | headed |

## Scheduling

Run `npm run monitor` from a systemd timer / cron on your box (Pi 5 /
DigitalOcean), or a scheduled GitHub Actions job. Pair with the Healthchecks
heartbeat so a stalled scheduler also pages you. Keep the cadence modest to
avoid tripping Google's automation defenses.

## Remediation (verify a fix, publish on green)

When the monitor goes red and the service opens a GitHub issue with the
diagnostic bundle, `remediate` is the safe way to apply a fix:

```bash
npm run remediate -- path/to/candidate-selectors.json
```

It swaps the candidate contract into the extension, runs the FULL matrix against
live Google, and publishes to the service (`POST /config/selectors`, needs
`SERVICE_URL` + `SERVICE_TOKEN`) **only if every check goes green** — so a bad
candidate can never reach clients. Without those env vars it verifies only.

Authoring the candidate (reading the failure bundle's picker `outerHTML` + the
suspect resolver, then writing corrected selectors) is currently human-driven.
`src/proposer.ts` is the seam for automating that step with an LLM; the default
proposer makes no proposal. Run `npm run remediate` with no argument to exercise
the auto-propose path (it runs the matrix, then asks the proposer).

## Coverage & first-run tuning

`src/matrix.ts` covers the pickers proven in Phase 1 (Sheets fill/text, Docs
text, Slides shape fill). Add a row + opener to extend to the border/table
pickers once their selectors are captured (the ❓ rows in `docs/SPEC.md`).

The read-back (`src/check.ts`) confirms the applied color appears in Google's
native Custom row; the exact Custom-row markup may need a tweak on the first
real run — that's expected, and the diagnostic bundle on failure shows the live
picker HTML to tune against.

This monitor stores **no end-user data**; it drives a dedicated test account.
