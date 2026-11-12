# Testing 0.2.3

What ships: two fixes.

- **Apply** (bd `workspace-custom-palette-ox4`, PR 2): a swatch named by its
  own hex applied nothing, silently, and a brand colour equal to one in
  Google's main grid applied and then showed "That brand color couldn't be
  applied" on every click. Field report on 0.2.2, Sheets, Chrome 157.
  `content/apply-color.js` gained a step that clicks Google's own cell for a
  built-in colour, and `findSwatchByHex` no longer matches our own Brand row.
- **Settings** (bd `workspace-custom-palette-8jc`, PR 3): "Copy current
  palette" now writes the clipboard, and opening Import / export shows the
  palette on screen instead of example colours.

The apply path changed, so the whole in-browser matrix is re-run on this tree,
not only the new cases. No policy handling changed; the Admin console
walkthrough in `docs/TESTING-0.2.0.md` is NOT re-run.

This is the executable script for the 0.2.3 release test, in the same shape as
`docs/TESTING-0.2.2.md`: an agent drives Chrome through browser control, and
the steps only a person can do are marked **[YOU]**. The traps listed in that
document (Gemini panel, reload editor tabs after an extension reload, occluded
window, tab-group handles) and the per-picker assertions 1 to 6 of its section
M apply here unchanged and are not restated.

## Readiness, established 2026-11-11 on 588ba09

| Check | Result |
| --- | --- |
| Tier 1, `npm run typecheck && npm test` | 590/590 |
| Tier 2, `npm run tier2` | green |
| Pages smoke, `npm run smoke:pages` | 61/61 |
| CI on PR 2 and PR 3 | green |
| Synthetic monitor | NOT runnable here: no monitor account provisioned |

## N. The new cases [AGENT]

Needs a palette holding a swatch NAMED by its hex and at least one colour from
Google's main grid. The run below used the owner's "Test" palette:
`#1A73E8` named `#1A73E8`, Pure black `#000000`, Signal red `#FF0000`.

Per row: Brand row and label laid out, titles read `Name (#HEX)`, no cell
selected, click the swatch, then:

- the picker closes by itself and no `#brand-palette-health-banner` mounts
  (wait at least 5 seconds: the 0.2.2 banner arrived after 4);
- on reopening, a built-in colour shows Google's OWN cell selected (its
  aria-label is the colour name, its swatch background the rgb), and no custom
  swatch was added for it; the hex-named swatch shows `Custom Color #1a73e8`
  selected;
- the document shows the colour.

N4 is the dropdown-chip picker, which is not the shared palette widget. The
built-in shortcut must NOT be taken there (pinned in Tier 1 by
`content/__tests__/apply-color-chip.test.js`); the colour goes through the
dialog, and the read-back is the option chip's colour.

| # | App | Picker | Swatch | Kind |
| --- | --- | --- | --- | --- |
| N1 | Sheets | Fill color | Pure black | built-in |
| N2 | Sheets | Text color | Signal red | built-in |
| N3 | Sheets | Border color | #1A73E8 | hex-named |
| N4 | Sheets | Data validation chip | Signal red | built-in, chip widget |
| N5 | Docs | Text color | Signal red | built-in |
| N6 | Docs | Highlight color | #1A73E8 | hex-named |
| N7 | Docs | Text color | Pure black | built-in |
| N8 | Slides | Fill color | Pure black | built-in |
| N9 | Slides | Border color | #1A73E8 | hex-named |
| N10 | Slides | Text color | Signal red | built-in |

## M. The standing matrix [AGENT]

The twelve rows M1 to M12 of `docs/TESTING-0.2.2.md`, same colours, same
read-backs, on the **default palette** (Cloud, Sky, Poppy, Sunshine, Rose,
Grass, Night). It needs seven distinct brand colours that are neither built-in
nor hex-named, which the N palette does not have, so the owner switches
palettes between N and M (**P1** below).

## S. Settings and popup

**S1 [AGENT, done].** `npm run smoke:pages` 61/61 on this tree.

**S2 [YOU].** The 0.2.3 Settings change, which browser control cannot reach
and no automated tier can check (no tier has a real clipboard).
DO: open Settings with the "Test" palette active and open Import / export.
EXPECT: the box lists the three colours of the palette on screen, not example
colours.
DO: click "Copy current palette", then paste into any text field.
EXPECT: the same three lines.
DO: without touching the box, click "Import from box".
EXPECT: it is refused with "Nothing new to import"; no palette is created.

**P1 [YOU].** Switch the Palette selector to the default palette (the seven
colours above), then say "run the matrix".

**S3 [YOU].** Popup: 0.2.3 has no `UPDATE_NOTES` entry, so after a reload the
toolbar badge must NOT show NEW and the popup shows no update notice. The
popup and the extensions card read version 0.2.3.

**S4 [YOU].** No network: DevTools, Network, open a picker, apply a colour,
open Settings. No request leaves the page.

## Run 1: 2026-11-11, tree 588ba09, unpacked build, Chrome 157, English

The unpacked tree loaded in the owner's profile is file-for-file the merged
`main` (the content scripts are unchanged since the build the owner loaded).
Fresh document per app, Gemini panel closed, `innerWidth` 1512, toolbar not
collapsed.

### N: 10/10 PASS

Every row: one Brand row laid out, "Brand" label laid out, three cells titled
`#1A73E8 (#1A73E8)`, `Pure black (#000000)`, `Signal red (#FF0000)`, every
cell `aria-selected="false"`, picker closed by itself, no banner host after 5
to 6 seconds.

| # | App | Picker | Swatch | Read-back |
| --- | --- | --- | --- | --- |
| N1 | Sheets | Fill color | Pure black | Google's `black` cell selected, `rgb(0, 0, 0)`; A1 filled black; CUSTOM empty |
| N2 | Sheets | Text color | Signal red | Google's `red` cell selected, `rgb(255, 0, 0)`; B1 text red; CUSTOM empty |
| N3 | Sheets | Border color | #1A73E8 | `Custom Color #1a73e8` selected; C1 border blue |
| N4 | Sheets | Data validation chip | Signal red | option chip red; no banner |
| N5 | Docs | Text color | Signal red | Google's `red` cell selected; text red |
| N6 | Docs | Highlight color | #1A73E8 | `Custom Color #1a73e8` selected; highlight blue |
| N7 | Docs | Text color | Pure black | Google's `black` cell selected; text back to black |
| N8 | Slides | Fill color | Pure black | Google's `black` cell selected; title box filled black |
| N9 | Slides | Border color | #1A73E8 | `Custom Color #1a73e8` selected |
| N10 | Slides | Text color | Signal red | Google's `red` cell selected; title text red |

Notes: the Sheets Borders palette closed after the pick, as bd
`workspace-custom-palette-9qg` documents, and was reopened from `#t-border`.
In Slides the title placeholder stood in for a shape. N4 was graded by the
option chip in the panel by eye (screenshot), not by a computed-style read.

### M: 12/12 PASS

Run after the owner switched to the default palette and reloaded the
extension (P1); a second fresh document per app, so every colour was cold.
Every row: one Brand row laid out, "Brand" label laid out, seven cells with
`Name (#HEX)` titles and matching `Brand: Name` aria-labels, no cell selected
(including the Sheets text picker), picker closed by itself, no banner host
after 6 seconds, `innerWidth` 1512 with the Gemini panel closed.

| # | App | Picker | Colour | Read-back |
| --- | --- | --- | --- | --- |
| M1 | Sheets | Fill color | Poppy | `Custom Color #fe5917` |
| M2 | Sheets | Text color | Sky | `Custom Color #9bdcd7` |
| M3 | Sheets | Border color | Grass | `Custom Color #385834` |
| M4 | Sheets | Conditional formatting | Rose | `Custom Color #e69c9c` on reopen; rule preview rose |
| M5 | Sheets | Data validation chip | Night | option chip `rgb(26, 45, 39)`; saved dropdown cell chip Night by eye |
| M6 | Docs | Text color | Poppy | `Custom Color #fe5917` |
| M7 | Docs | Highlight color | Sunshine | `Custom Color #eabf26` |
| M8 | Docs | Table cell background | Sky | `Custom Color #9bdcd7` |
| M9 | Docs | Table border color | Grass | `Custom Color #385834` |
| M10 | Slides | Shape fill | Poppy | `Custom Color #fe5917` |
| M11 | Slides | Border color | Night | `Custom Color #1a2d27` |
| M12 | Slides | Text color | Rose | `Custom Color #e69c9c` |

Notes: the Docs table toolset was behind `#moreButton` at 1512px. The Sheets
Borders palette closed after the pick (bd 9qg) and was reopened from
`#t-border`. In Slides the title placeholder stood in for the shape. For M5
the saved dropdown cell is canvas-drawn and was graded from a zoomed
screenshot, not a pixel sample. Reloading the extension dropped the agent's
tab group, so the three N documents could not be trashed from their File
menus.

### S: owner, 2026-11-11

- **S2:** the owner confirmed "Copy current palette" now reaches the
  clipboard. The "Import from box" refusal was not reported either way.
- **P1:** done (default palette active, extension card reads 0.2.3).
- **S3, S4:** not reported.

## After the run

- N and M green plus S2 to S4 confirmed is the in-browser smoke the release
  gate requires. Only then may `npm run package` be answered "verified".
- Any FAIL: file a bd bug with the app, picker, swatch, read-back, and
  `innerWidth`, then stop; do not grade the rest as a release.
- Move the scratch documents to the trash, and remove or keep the "Test"
  palette as the owner prefers.
