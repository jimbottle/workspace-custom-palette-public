# Custom Color Palette for Google Workspace Docs, Sheets & Slides

A Chrome (MV3) extension that injects your company brand colors directly into the
native fill / text / border color pickers in Google Docs, Sheets, and Slides, so
applying a brand color is one click in the real Google picker. A server-hosted
synthetic monitor detects when Google's DOM changes break the injection and
drives a data-only fix without a Web Store round trip, for deployments that
point the extension at their own config service. Web Store builds ship with
`CONFIG_BASE` empty and are fixed by a release.

**Install:** [Chrome Web Store listing](https://chromewebstore.google.com/detail/hchpnnppgakgmobkbldgkohmplkcahjl).
Workspace admins can also push a company palette to everyone through the Google
Admin console; see [`docs/ADMIN_GUIDE.md`](docs/ADMIN_GUIDE.md).

## Layout

| Path | What |
| --- | --- |
| `manifest.json` + `background/` `content/` `lib/` `config/` `popup/` `options/` `feedback/` `shared/` `icons/` | the MV3 extension, at the repo root (load this directory unpacked) |
| `service/` | FastAPI config + remediation service (`/config/*`, `/monitor-result`) |
| `monitor/` | Playwright synthetic monitor (app × picker matrix) |
| `tools/mock-service/` | dependency-free config-service mock for tests |
| `dev/` | dev-only tooling (hot-reload server, packager, icon generator) |
| `docs/` | `SETUP.md` (first run), `plan.md`, `SPEC.md`, `TEST_PLAN.md`, `DEPLOY.md`, `ADMIN_GUIDE.md` (for Workspace admins, no checkout needed), `PRIVACY.md` |

The extension lives at the repo root (manifest + code dirs together), so you
load the repo directory itself.

## Quick start

Requires Node.js 20.19+, 22.13+ or 24+ (per the jsdom and ESLint engines) and Chrome.

```bash
npm install
npm run typecheck && npm test     # Tier-1 gate (also the pre-commit hook)
bash scripts/hooks/install.sh     # install the tracked hook
```

`npm test` runs the extension's unit tests with Node's built-in test runner
(jsdom for DOM fixtures); no browser or network needed. The optional Tier-2
suite (lint, the Playwright monitor, and the Python service's pytest) needs a
one-time `npm run tier2:setup` and then `npm run tier2`.

**Load the extension:** `chrome://extensions` → Developer mode → **Load
unpacked** → select the **repo root** (this directory — the one that contains
`manifest.json`).

## Develop

```bash
npm run dev        # hot reload: watches the extension dirs, auto-reloads the
                   # unpacked extension on save (reload the Google tab for
                   # content-script changes). Load it once so dev-reload connects.
npm run icons      # regenerate icons/ from the default palette (placeholder art)
npm run package    # build dist/custom-color-palette-<version>.zip for the CWS
```

`dev-reload.js` only runs for an unpacked (development) install and is excluded
from the packaged zip.

First run (set your brand colors): `docs/SETUP.md`. Service:
`service/README.md`. Monitor: `monitor/README.md`. Ship: `docs/DEPLOY.md` +
`LAUNCH_CHECKLIST.md` + `STORE_LISTING.md` + `store-assets/CAPTURE_GUIDE.md`.

## Privacy

No remote telemetry. The only client network call is a read-only config pull,
disabled by default. See `docs/PRIVACY.md`.

## License

[MIT](LICENSE) © 2026 Evan J Ray

### Hooks

```bash
pre-commit install --hook-type pre-commit --hook-type commit-msg   # once per clone
```

Commits follow [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/) (`type(scope): subject`, at most 72 characters, a body that says why) and land through squash-merged PRs.

## Releasing

`scripts/release.sh X.Y.Z` on a clean, green `main` bumps `manifest.json`, prepends the release to [CHANGELOG.md](CHANGELOG.md) from the commits with git-cliff, commits `chore(release): vX.Y.Z` and pushes a signed tag; the `release` workflow creates the GitHub Release.
