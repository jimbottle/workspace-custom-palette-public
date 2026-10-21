# Session handoff — 2026-08-16

Written for an agent taking over with the same repo access. Compressed on
purpose. Read `CLAUDE.md` first for the binding rules; this covers only what is
not already written down elsewhere.

## 1. Blocking problem — start here

> **UPDATE, later on 2026-08-16: this has cleared.** While diagnosing the new
> 0.1.6 field report, a live Docs check found the content script running
> normally: the Brand row and its label mounted on the first picker open, and
> clicking Poppy applied it to the selection through the custom-color dialog.
> Nothing in the repo was changed to achieve that, which supports the
> browser-side diagnosis below — treat §1 as a Chrome-state fault that a
> restart resolves, not an open defect. The §5 "not verified" items (Sheets,
> Slides on 0.1.7) are therefore **unblocked**, not fixed: they still need
> running. The user had asked to hold off on further browser testing, so the
> smoke matrix was deliberately NOT run.

**Chrome is not executing the content script.** This is browser-side, not a code
defect. Evidence gathered 2026-08-16:

- A marker set on the **first line of `content/loader.js` never appears** in the
  page. Nothing downstream (bootstrap, dom-contract, injector) can be at fault.
- Extension is **enabled**; `withholding_permissions: false`; `scriptable_host`
  lists all three `docs.google.com` paths; it **serves its files** (fetched
  `config/managed-schema.json` and `config/selectors.default.json` from a page).
- The extension's **own modules inject perfectly** when imported into the page
  and run against a live Sheets picker: `isPickerPopup` ✓, `closestPopupRoot` ✓,
  `findMainSwatchCells` = 80 ✓, `findSectionLabel` ✓, `injectBrandRow` → row
  mounts. So the contract and injector are good.
- It **worked once**, on the first page load after the user clicked Reload ↻
  (13:37 local; `last_update_time` in the profile's Secure Preferences confirms
  the reload). It stopped after roughly one page load and has not recovered.
- **Toggle off/on did NOT fix it**, and the user reports **no error badge** on
  the extension card.

Ruled out: dev-reload server (not running, port 8765 free), stale June manifest
(same `content_scripts` entry), profile mismatch (the one working test rendered
the user's own 7 colors), host permissions, `disable_reasons`.

Untried escalations: full Chrome restart; Remove + Load unpacked again; a clean
profile. The user asked to **hold off on further testing** while unrelated work
proceeds in another session.

Diagnostic that settled it, reusable:

```js
// content/loader.js, first line inside the IIFE — REMOVE after use
document.documentElement.setAttribute("data-brand-palette-loader", "1");
```

then reload the page and read the attribute from the page context.

## 2. Concurrent work in the tree — now committed

That work landed in `b5efaaf`: locale-fixture tests, widened locale scan incl.
`data-tooltip`/`label`, monitor selector scan, and `package.sh` running Tier 1
at cut time and refusing a dirty tree. `CLAUDE.md`, `docs/TEST_PLAN.md` and
`CHANGELOG.md` describe them.

Useful fact confirmed live 2026-08-16: the hex field's `aria-label` is
translated text ("Hex color" → Danish "Hex-farve") while
`input.docs-material-hex-input` resolves in any language — which is why the old
`[aria-label="Hex color"]` selector broke apply in **both** Docs and Sheets for
that reporter.

**CORRECTION (verified 2026-08-16):** an earlier version of this note said a
non-English UI could not be had from a URL parameter. That was wrong. `?hl=da`
alone is indeed ignored (the account language wins), but **`?hl=da&forcehl=1`
works** — the editor is genuinely Danish, `documentElement.lang="da"`. The full
7-picker matrix has since been run in that real Danish UI. The pseudo-localized
Tier 1 fixture still earns its place (no account, runs in the hook, fails for
every language), but a Danish Tier 3 monitor pass is now possible with the
existing credentials.

## 3. Release state — as of 2026-08-17 (`4fb7e41`)

Verify the numbers rather than trusting them; this section has drifted before.
`git status -sb`, `node -p "require('./manifest.json').version"`, `ls dist/`.

- **0.1.7 shipped.** `dist/custom-color-palette-0.1.7.zip` was cut, uploaded and
  confirmed live by Evan on 2026-08-17. bd `8ge` (rollout) and `r0k` (the P0
  non-English apply failure) are both CLOSED. Nothing about 0.1.6 is pending —
  ignore any older text telling you to upload it.
- `manifest.json` / `package.json` / `package-lock.json` are at **0.1.8**,
  bumped in `d11cd2a` as soon as the tree moved past the shipped zip (leaving
  the manifest on a shipped version would make `npm run package` emit a zip with
  a version string the Web Store rejects).
- **No 0.1.8 zip is cut.** Its only shipped change is
  `shared/feedback-email.js`; `content/`, `lib/`, `config/` and `options/` are
  byte-identical to 0.1.7. The mandatory in-browser smoke matrix HAS passed on
  this tree — see §5b — so `npm run package` is unblocked, but the release gate
  still requires whoever cuts it to have done that check themselves.
- `CHANGELOG.md` `[Unreleased]` is 0.1.8 work; `[0.1.7]` is dated and closed.
  `RELEASE_NOTES.md` has an `Unreleased` section to roll at the cut.
- `main` is **88 commits ahead of origin and has never been pushed.** Pushing
  needs explicit user approval every time (company rule beats the beads
  "always push" block).

## 4. What 0.1.7 contains

**`sfx` — enterprise managed-policy palette.** `manifest.storage.managed_schema`
→ `config/managed-schema.json` (one `palette` policy: array of `{name, hex}`);
declaring the schema is what makes Admin console show the "Policy for
extensions" field. `lib/storage.js` gains `getManagedPalette` (read-only,
never throws, 1500 ms timeout) and `onManagedChanged`. `lib/config.js`
`managedSwatches` accepts a bare array **and** Admin console's `{"Value": [...]}`
wrapper. Tiering is **remote > user > managed > packaged**: the org palette is
the default staff start from, a personal palette still wins. Popup and options
seed from that baseline, show an org note, and offer a way back
("Use organization colors" / Reset). `planManagedReset` in `lib/palette.js` is
the pure, tested decision behind that button. `service/alerts.py`
`is_valid_contract` is the publish gate: rejects translated-text selectors and
requires the full `REQUIRED_SHARED` set. Admin runbook is in `docs/DEPLOY.md`.

**`7as` — locale hardening (closed).** Contract `2026-08-15b`. Toolbar buttons
by id (`#textColorButton`, `#bgColorButton`, `#fillColorMenuButton`,
`#lineColorMenuButton`, Sheets already `#t-cell-color`/`#t-text-color`); dialog
inputs by class (`input.docs-material-hex-input`,
`input.docs-material-rgba-{red,green,blue}-input`). `service/data/selectors.json`
was stale and is now synced — that file is what the service publishes to users,
so it must never drift behind `config/selectors.default.json` (a test pins them
together).

**Last commit `faf181c`** removes enterprise policy as a gate on injection
(`getManagedPalette` was inside the blocking `Promise.all`, so a slow or
unanswered policy read could silently kill the feature with no error and no
health banner). Its message states plainly that this is hardening and **not**
the cure for §1 — an earlier version of that message claimed otherwise and was
amended. Keep that distinction.

## 5b. Pre-0.1.8 in-browser smoke matrix — 2026-08-17 (supersedes §5a)

Run by the agent against the unpacked extension in Evan's signed-in Chrome, on
the tree at `d11cd2a`. **All three apps pass.** Readback is the applied hex, not
pixels: Docs/Sheets read the swatch Google marks selected, Slides reads the SVG
`fill`/`stroke`.

| Check | Applied | Read back | Label | Tooltips | Inherited-selected |
| --- | --- | --- | --- | --- | --- |
| Docs · text | Poppy | `Custom Color #fe5917` | "Brand" visible | 8/8 correct | 0 |
| Sheets · fill | Grass | `Custom Color #385834` | "Brand" visible | 8/8 correct | 0 |
| Sheets · text | Rose | `Custom Color #e69c9c` | "Brand" visible | 8/8 correct | 0 (8/8 `aria-selected=false`) |
| Slides · fill | Poppy | SVG `fill="#FE5917"` | "BRAND" visible (screenshot) | 8/8 correct | 0 |
| Slides · border | Night | SVG `stroke="#1A2D27"` | "BRAND" visible (screenshot) | 8/8 correct | 0 |

No health banner in any app. The `auq` regression (Brand swatches inheriting the
clone source's selected state) is clean in the Sheets **text** picker, which is
the only place it ever showed.

**Scope of what this covers.** Only three packaged files changed since the
verified 0.1.7 cut: `manifest.json` (version string only),
`shared/feedback-email.js`, and `background/dev-reload.js` (excluded from the
zip). `content/`, `lib/`, `config/` and `options/` are byte-identical to the
build that shipped, so this matrix exercises exactly the unchanged injection and
apply path and re-confirms it live. The one changed shipped file,
`feedback-email.js`, is NOT exercised by this matrix — it is covered by 15 unit
tests, and its page is unreachable to automation (see §7).

**Still not verifiable from here:** the popup, options and feedback pages
(`chrome-extension://` and `chrome://` are both refused by the automation —
re-confirmed this session), and the Tier 3 monitor (no credentials).

### Two automation lessons from this run, both new

- **A wedged renderer looks exactly like broken code.** The first tab stopped
  answering `Page.captureScreenshot` (30s CDP timeouts) yet still ran
  `javascript_tool` fine. On that tab, coordinate clicks silently did nothing —
  I spent a dozen calls concluding Slides "would not select a shape". Opening a
  FRESH tab fixed it instantly. If screenshots time out, stop and open a new
  tab; do not debug the page.
- **Screenshot pixels are not CSS pixels.** The screenshot came back 1273x952
  while `window.innerWidth/Height` reported 1703x1274 — a 1.338x factor. Any
  coordinate taken from `getBoundingClientRect` is in the SECOND space and will
  miss. This is the sharper form of the "~12px offset" warning already in §7:
  derive coordinates from the screenshot image, or click by element `ref`.
- Google's "Getting started" **modal** on a fresh Slides deck covers the canvas
  and swallows clicks. Escape did not close it and neither did a real click on
  its X; dispatching a full synthetic pointer sequence on the close button did.

## 5a. Pre-0.1.7 test pass — 2026-08-16 (supersedes §5)

Run against the UNPACKED build (confirmed: the automation profile serves
contract `2026-08-16` from the repo; the store 0.1.6 is a different extension id
and is not in that profile). Readback method: reopen the picker and read which
swatch Google marks `aria-selected` — do not trust pixels, and do not use SVG
fills (Docs and Sheets paint to canvas; Slides placeholder prompt text is not
the applied run).

| Check | Result |
| --- | --- |
| Docs · text | label + 8 tooltips + apply -> `#fe5917` selected |
| Sheets · fill | label + tooltips + apply -> `#fe5917` selected |
| Sheets · text | label + tooltips + apply -> `#385834` selected |
| Slides · fill | label + tooltips + apply -> `#fe5917` on the SVG |
| Slides · border | apply -> `#1a2d27` stroke |
| Slides · text | apply -> `#f9f4eb` selected |

No health banner in any app. **One defect found and fixed** (`70995da`, bd
`auq`): Brand swatches inherited the clone source's selected state. It shows up
ONLY where the clone source is the active colour — the Sheets text picker — so
Docs and Slides looked clean. The manual checklist now names that picker.

Because that fix changed code AFTER the matrix above ran, all three apps were
re-checked on the final tree (`70995da`): Sheets text (8/8 `aria-selected=false`,
Google's own cell still `true`, apply -> `#fe5917`), Docs (label + tooltips
clean, apply -> `#e69c9c`), Slides fill (apply -> `#385834` on the SVG). Shipping
a zip verified against an earlier tree is precisely how 0.1.6 went out broken —
if you touch code after the matrix, run it again.

Still NOT verifiable from here:

- **Popup org note + reset UI** — `chrome-extension://` is still unreachable to
  the browser automation (re-confirmed, §7 stands). Needs a human click-through.
  Its decision logic (`planManagedReset`) has 5 unit tests.
- **A real admin-published policy** — needs a managed device.
- **Tier 3 monitor matrix** — no `MONITOR_GOOGLE_USER`/`PASS` in the
  environment. The monitor's own unit tests pass (11).
- **Tier 2** — `npm run lint` and `npm run test:integration` are both
  non-functional (bd `8fd`); only `cd service && pytest` runs.

## 5. Verified vs not, for 0.1.7 (as of the blocked session — see 5a)

Verified: Chrome **accepts the `managed_schema` declaration** (the extension
loads, which an invalid schema would prevent); Docs shows the Brand label, all
7 tooltips are correct, and Rose applied through the custom-color dialog using
the new locale-independent selectors.

Not verified: Sheets and Slides on 0.1.7 (blocked by §1); a real
admin-published policy (needs a managed device); the popup's org note and reset
UI (`chrome-extension://` pages are unreachable to the browser automation).

## 6. Open bd issues

**Run `bd ready` — that is the source of truth.** This section is a summary for
orientation only, and it has already gone stale once (it listed `r0k`, `8ge`,
`sfx` and `5vs` as open long after all four were closed, which would send a
fresh agent to redo a finished rollout). Do not act on the list below without
checking.

As of 2026-08-17 the whole backlog is four issues, none of them blocking:

- `t28` (P2, **human**) — decide the privacy-policy URL after the product
  rename, then republish the page.
- `ykj` (P3) — decide whether a green monitor run should deterministically drive
  GitHub issue recovery. The recovery branch exists but no caller reaches it, so
  issues are closed by hand today. Changes outbound GitHub/Slack behavior, hence
  a decision rather than a fix.
- `afb` (P3) — record `documentElement.lang` live across all three apps in both
  languages, so the monitor's English-leg locale check can be promoted from a
  warning to a failure.
- `7f3` (P3) — capture the border/table picker selectors. Declared v1 scope in
  `CLAUDE.md` and `docs/SPEC.md`, never captured.

## 7. Browser-automation gotchas (hard-won)

- First click on a Google toolbar button often only focuses or shows a tooltip.
  Click again, or dispatch the full sequence
  `pointerover → pointerdown → mousedown → pointerup → mouseup → click`.
- **Google's menus close between MCP tool round trips.** A screenshot can show
  the picker open and the very next `javascript_tool` call finds zero visible
  `.goog-menu`. Put open + click + verify in ONE `browser_batch`; a swatch click
  issued in a later call lands on the grid behind the closed menu. This produced
  two convincing false results in the 2026-08-16 run (a "white fill" and a
  "cornflower blue fill" that were really clicks on the spreadsheet).
- **Slides deselects the shape between batches too** — re-press Tab inside the
  same batch before opening a colour picker, or the toolbar buttons are absent.
- **Never click a Brand swatch on a fixed delay.** Injection is not instant; a
  3 s wait once landed on Google's STANDARD row instead. Assert the row exists
  (or read its rect) in the same batch first.
- **Window size changes invalidate cached coordinates.** The window went from
  1568x771 to 1512x687 mid-session and every stored toolbar coordinate silently
  moved. Re-derive per session. At that size CSS coords and screenshot coords
  matched 1:1, but confirm rather than assume.
- **Derive click coordinates from screenshots, not `getBoundingClientRect`.**
  A ~12 px offset between the two once produced a convincing false "apply
  applied black" bug report.
- `chrome-extension://` and `file://` URLs are unreachable to the automation
  tool. Serve scratch pages from `localhost` via `python3 -m http.server`.
- `read_console_messages` proved unreliable here — it returned nothing even for
  the pattern `.` on a busy page. Do not treat its silence as evidence.
- Chrome's per-profile state lives in
  `~/Library/Application Support/Google/Chrome/<Profile>/Secure Preferences`;
  `extensions.settings.<id>` carries `last_update_time`, `active_permissions`
  and `disable_reasons`, which is how the reload timing above was established.
