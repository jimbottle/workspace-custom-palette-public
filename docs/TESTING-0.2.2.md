# Testing 0.2.2

What ships: the refresh control beside the Palette selector on the settings
page (bd `workspace-custom-palette-46x`). Nothing in the content scripts, the
service worker, the contract or the policy handling changed since 0.2.1, so the
in-browser matrix below exercises the same injection and apply code that passed
11/11 live on 0.2.1 (f9b03a1). It still has to be run on THIS tree: the release
gate is "the current tree, all three apps", not "the last tree that passed".

This document is the executable script for the 0.2.2 release test, written for
an agent driving Chrome through browser control, with the few steps only a
person can do marked **[YOU]**. The assertion reference is `docs/TEST_PLAN.md`;
the policy walkthrough is `docs/TESTING-0.2.0.md` and is NOT re-run for 0.2.2
(no policy handling changed). Tracking: bd `workspace-custom-palette-8w6`.

## Readiness, established 2026-10-01 on 63dd8bf

What a machine already ran on this tree. None of these is a step.

| Check | Result |
| --- | --- |
| Tier 1, `npm run typecheck && npm test` | 569/569 |
| Tier 2, `npm run tier2` (lint, monitor typecheck, service, monitor) | green |
| Pages smoke, `npm run smoke:pages` (real Chromium, extension loaded) | 52/52, incl. five refresh-control checks |
| Unpacked build present in the owner's Chrome profile | yes: Brand row injected in a fresh Sheet |
| Browser control can drive a cold apply and read it back | yes: Sheets fill, Poppy, read-back `Custom Color #fe5917`, no banner |
| Synthetic monitor, `cd monitor && npm run monitor` | NOT runnable here: no `MONITOR_GOOGLE_USER` / `MONITOR_GOOGLE_PASS`, no saved auth state |

The pages smoke is the only automated tier that sees the 0.2.2 change in a
real engine, and it loads the current tree into its own Chromium. It says
nothing about whether the owner's profile has been reloaded onto this tree;
that is **R1** below.

## What browser control can and cannot reach

The agent's browser tools open and drive `docs.google.com` pages, run page
JavaScript, and screenshot. They **refuse `chrome://` and
`chrome-extension://` URLs**, so in the real profile the agent cannot open
`chrome://extensions`, the settings page, the popup or the feedback page. Those
are either covered by `npm run smoke:pages` (same tree, separate Chromium) or
are **[YOU]** steps. The split is marked on every step.

Four traps that bit this exact workflow. The first two are restated from
`docs/TEST_PLAN.md` because they both looked like product bugs; the last two
were found on the 2026-10-01 run and are agent-side only:

- **Close the Gemini side panel before opening any Sheets picker.** It opens
  by itself on a fresh Sheet and narrows the viewport enough for Google to
  collapse the fill, text and border buttons into the toolbar overflow. A
  collapsed button still reports `aria-expanded="true"`, so a cold apply
  false-banners. Check `innerWidth` is the full window before each app.
- **After the extension is reloaded, reload every open editor tab.** The
  Brand row in an orphaned tab is inert markup. The ground truth that the
  content script is running is `[data-brand-palette-row]` with a picker
  open, nothing else.
- **An occluded Chrome window stalls injection until something paints.**
  Found on the 2026-10-01 run: with the terminal covering Chrome,
  `document.hidden` read `true` in every editor tab even though the tab had
  focus, and the Brand row did not appear in the DOM after a synthetic picker
  open until a screenshot forced a paint. Polling for the row for five
  seconds inside one script call never saw it; the next screenshot showed it
  on screen. So drive each picker as three calls, not one: open the picker,
  take a screenshot, then assert and click. The apply flow completed fine
  with the window occluded, so this only affects the agent's own timing, not
  the product.
- **Closing a tab in the automation group can drop the whole group,** taking
  a second tab's handle with it. The page stays open in Chrome but the agent
  can no longer address it. Keep every scratch tab until the run ends, trash
  each document from its File menu, then close the tabs last.

And one rule: **every colour cold, one fresh document per app.** The fast path
clicks an existing custom swatch, so a colour used twice in a document never
exercises registration or the reopen. Use `docs.new`, `sheets.new`,
`slides.new`, and a different brand colour for every picker in that document.

## R. Reload (before anything else)

**R1 [YOU].** Open `chrome://extensions`, confirm exactly one copy of the
extension (the unpacked card pointing at this repo, ID
`hchpnnppgakgmobkbldgkohmplkcahjl`), and click **Reload** so the profile is
running 63dd8bf or later. The card must read **0.2.2**.
EXPECT: version 0.2.2, one card.
IF NOT: a Web Store copy alongside means two toolbar icons and a graded store
build; Remove it (its storage is separate).

**R2 [AGENT].** Close every Docs, Sheets and Slides tab the agent has open, or
reload them. Then say "run the matrix".

## M. The in-browser matrix [AGENT]

Twelve pickers across three apps. For each: open the picker, assert the row,
click a brand swatch, read the applied colour back. Record PASS with the
read-back hex, or FAIL with what was observed. Per picker the assertions are:

1. `[data-brand-palette-row]` is laid out (client rects > 0), exactly one.
2. `[data-brand-palette-label]` is laid out, text "Brand".
3. Seven cells; every cell's innermost `title` reads `Name (#HEX)` from the
   active palette, and the `aria-label` reads `Brand: Name`.
4. **No cell is selected or checked** (`aria-selected="false"` on all seven).
   Check this in the **Sheets text picker specifically**: it only goes wrong
   when the clone source is the active colour.
5. Click a brand swatch not yet used in this document (synthetic clicks must
   dispatch the full pointer/mouse sequence; a bare `.click()` does nothing on
   Google menus).
6. Read-back (every row except M5, which has its own below): reopen the
   picker and assert the selected native swatch carries the hex
   (`Custom Color #hex, ...`), the document shows the colour, and
   **no banner** mounted (no `#brand-palette-health-banner` host in the
   document; that is the Shadow-DOM "Report this" banner's host).

| # | App | Picker | How to reach it | Colour |
| --- | --- | --- | --- | --- |
| M1 | Sheets | Fill color | select A1, toolbar fill bucket | Poppy |
| M2 | Sheets | Text color | type in B1, toolbar text colour | Sky |
| M3 | Sheets | Border color | select C1, `#t-border` then the colour pencil | Grass |
| M4 | Sheets | Conditional formatting | Format, Conditional formatting, the fill chip in the rule panel | Rose |
| M5 | Sheets | Data validation chip | Data, Data validation, Add rule, Dropdown, an option's colour chip | Night |
| M6 | Docs | Text color | type a word, select it, toolbar text colour | Poppy |
| M7 | Docs | Highlight color | same selection, highlight colour | Sunshine |
| M8 | Docs | Table cell background | insert a 2x2 table, click a cell, table toolset (may sit behind `#moreButton`), `#cellColorMenuButton` | Sky |
| M9 | Docs | Table border color | same cell, `#borderColorMenuButton` | Grass |
| M10 | Slides | Shape fill | insert a shape (or Tab to select the title box), fill colour | Poppy |
| M11 | Slides | Border color | same shape, border colour | Night |
| M12 | Slides | Text color | select text in the shape, text colour | Rose |

M4 and M5 live in side panels. Open the panel, run the picker, then **close
the panel before the next Sheets row**, or the toolbar collapses and M-rows
after it false-fail.

**M4 uses step 6 like every shared-widget row, plus the rule preview.** The
conditional-formatting panel's fill chip opens the same Material palette as
the toolbar pickers, so reopening it from the chip and reading the selected
`Custom Color #hex` swatch is the authoritative read-back. The "Custom"
formatting-style swatch in the panel, whose computed background equals the
brand hex, is a second confirmation that the rule itself took the colour,
not a substitute. Run 1 graded M4 by the preview only and did not perform
step 6; the next run must do both.

**M5 has its own read-back; the aria-label read-back in step 6 does not
apply to it.** The dropdown-chip picker is a different widget
(`content/apply-color.js`, step 2b): it applies the colour on the dialog's OK,
its CUSTOM COLORS swatches carry no aria-label so no `Custom Color #hex`
label ever exists, and there is no toolbar button to reopen it with. Grading
M5 by step 6 would record a correct apply as a FAIL. Instead: assert the
option's colour chip in the Data validation panel (and the dropdown cell once
the rule is saved) renders the hex as its computed background colour, via
`getComputedStyle(chip).backgroundColor` compared to the brand hex as rgb, and
that no `#brand-palette-health-banner` host mounted. The 0.2.1 run recorded
M5 exactly this way, as `rgb(26,45,39)` for Night.

M5 is also the one picker the synthetic monitor cannot drive (no toolbar
button), so this run is its only end-to-end signal.

Finish by moving the three scratch documents to the trash.

## Run 1: 2026-10-01, tree e08ba4a, unpacked build reloaded by the owner

12/12 PASS. Every row: one Brand row laid out, "Brand" label laid out, seven
cells with `Name (#HEX)` titles and `Brand: Name` aria-labels, every cell
`aria-selected="false"` (including the Sheets text picker), no banner host,
fresh document per app, every colour cold.

| # | App | Picker | Colour | Read-back |
| --- | --- | --- | --- | --- |
| M1 | Sheets | Fill color | Poppy | `Custom Color #fe5917` |
| M2 | Sheets | Text color | Sky | `Custom Color #9bdcd7` |
| M3 | Sheets | Border color | Grass | `Custom Color #385834` |
| M4 | Sheets | Conditional formatting | Rose | rule preview background `#e69c9c` |
| M5 | Sheets | Data validation chip | Night | chip caption background `rgb(26, 45, 39)` |
| M6 | Docs | Text color | Poppy | `Custom Color #fe5917` |
| M7 | Docs | Highlight color | Sunshine | `Custom Color #eabf26` |
| M8 | Docs | Table cell background | Sky | `Custom Color #9bdcd7` |
| M9 | Docs | Table border color | Grass | `Custom Color #385834` |
| M10 | Slides | Shape fill | Poppy | `Custom Color #fe5917` |
| M11 | Slides | Border color | Night | `Custom Color #1a2d27` |
| M12 | Slides | Text color | Rose | `Custom Color #e69c9c` |

Notes from the run: the Docs table toolset was behind `#moreButton` at
1512px, as the row says. The Sheets Borders palette closed after the pick;
that is the behaviour bd `workspace-custom-palette-9qg` already documented on
2026-09-01 (the dialog's OK closes the enclosing menu), not a change, and the
read-back here reopened it from `#t-border`. Two gaps against the script's
own procedure, recorded rather than papered over: **M4 was graded by the rule
preview background only; step 6 was not performed.** **M5 was graded by the
option chip only; the saved dropdown cell's background was not checked.**
Both are complete-on-next-run items, not failures. The three scratch
documents were moved to the trash.

**Still open from this script: S2 to S5, which are [YOU].** The M matrix alone
is not the release gate.

## Run 2: 2026-10-08, tree bdbb169, dev@example.org profile

Same tree as the copy-hex button (f7e8e8e) plus its policy-builder fix
(bdbb169), loaded by the owner into the managed example.org
Chrome profile. Machine tiers on this tree first: Tier 1 575/575, Tier 2
green, `npm run smoke:pages` 61/61 (including nine copy-button layout checks
across the popup, Settings and the policy builder).

12/12 PASS. Every row: one Brand row laid out, "Brand" label laid out, seven
cells with `Name (#HEX)` titles and `Brand: Name` aria-labels, every cell
`aria-selected="false"` (including the Sheets text picker), no banner host,
`innerWidth` 1703 with the Gemini panel closed, fresh document per app, every
colour cold.

| # | App | Picker | Colour | Read-back |
| --- | --- | --- | --- | --- |
| M1 | Sheets | Fill color | Poppy | `Custom Color #fe5917` |
| M2 | Sheets | Text color | Sky | `Custom Color #9bdcd7` |
| M3 | Sheets | Border color | Grass | `Custom Color #385834` |
| M4 | Sheets | Conditional formatting | Rose | `Custom Color #e69c9c` on reopen; rule preview `rgb(230, 156, 156)` |
| M5 | Sheets | Data validation chip | Night | option chip `rgb(26, 45, 39)`; saved dropdown cell chip `rgb(26, 45, 39)` |
| M6 | Docs | Text color | Poppy | `Custom Color #fe5917` |
| M7 | Docs | Highlight color | Sunshine | `Custom Color #eabf26` |
| M8 | Docs | Table cell background | Sky | `Custom Color #9bdcd7` |
| M9 | Docs | Table border color | Grass | `Custom Color #385834` |
| M10 | Slides | Shape fill | Poppy | `Custom Color #fe5917` |
| M11 | Slides | Border color | Night | `Custom Color #1a2d27` |
| M12 | Slides | Text color | Rose | `Custom Color #e69c9c` |

Both Run 1 gaps are closed: M4 got the step 6 reopen as well as the preview,
and M5 checked the saved dropdown cell too. The cell is canvas-drawn, so its
colour was read by sampling the grid canvas pixel at the chip, not from the
DOM. Notes: the Docs table toolset was inline at 1703px (no `#moreButton`
overflow). The Sheets Borders palette closed after the pick, as bd 9qg
documents, and was reopened from `#t-border`. In Slides the title placeholder
stood in for the shape for M10 to M12. The three scratch documents were moved
to the trash.

**S2 to S5 and S2b: all confirmed by the owner, 2026-10-08.** With M 12/12
that completes the in-browser smoke the release gate requires for bdbb169.

## S. Settings and popup

**S1 [AGENT, already done].** `npm run smoke:pages` on the current tree covers
the opt-in, create, rename, switch, import, the two-click Reset and Delete,
settle-before-save, and the 0.2.2 refresh control: the button is present with
one palette and with several, has a rendered glyph, nothing moves on its own
when storage changes, and a click pulls in a palette renamed in storage.
52/52. The arm-on-unsaved-edits rule (first click warns, second refreshes) is
pinned in Tier 1 jsdom (`options/__tests__/options-refresh.test.js`), which
is why S2 checks it by eye.

**S2 [YOU].** The 0.2.2 change, seen with your own eyes in the real profile,
because the smoke runs in a separate Chromium and jsdom cannot see CSS.
DO: open Settings. Look at the Palette line.
EXPECT: a refresh icon beside the selector when you have two or more palettes,
and the same icon on its own line when you have one. It is visible in both
the light and dark theme.
DO: in the toolbar popup, rename the active palette. Back on the still-open
Settings tab, click the refresh icon.
EXPECT: the new name appears without a reload. Nothing else on the page
changes.
DO: edit a hex on Settings without saving, then click refresh once.
EXPECT: a warning that unsaved edits will be discarded; the page does not
refresh. Click again: the edit is gone and the stored values are back.
IF NOT: report which of the three.

**S2b [YOU].** The copy-hex button, which browser control cannot reach
(extension pages refuse it). The smoke pins its layout; this checks the
clipboard and the look in the real profile.
DO: in Settings and in the popup, click the copy icon at the right end of a
hex field, then paste into any text field.
EXPECT: the six digits with no `#` (for example `F9F4EB`); the icon turns
into a tick for about a second; the icon sits inside the box, clear of the
last digit, in both themes. On a locked org palette the icon is still there
and still copies.

**S3 [YOU].** Popup: there is no on/off toggle; "Edit palette" opens Settings;
"Send feedback" opens the feedback page. 0.2.2 has no `UPDATE_NOTES` entry, so
after the R1 reload the toolbar badge must NOT show NEW and the popup must
show no update notice.
IF the badge shows NEW: report; that means a notice is keyed to this version.

**S4 [YOU].** Feedback page: pick one transport (Gmail is enough) and confirm
the compose is pre-filled, the footer shows only version 0.2.2, browser and
OS, and a bug report adds the "Browser language" line.

**S5 [YOU].** No network: DevTools, Network, filter by the extension ID, open
a picker, apply a colour, open Settings.
EXPECT: no request leaves the page (`CONFIG_BASE` is empty in this build).

## After the run

- All of M green plus S2 to S5 confirmed is the in-browser smoke the release
  gate requires. Only then may `npm run package` be answered "verified".
- Any M-row FAIL: file a bd bug with the app, picker, colour, the read-back,
  and whether the toolbar was collapsed (`innerWidth` and the button's client
  rects) at the time, then stop; do not grade the rest as a release.
- Close bd `workspace-custom-palette-8w6` with the matrix table pasted into
  the close reason.
