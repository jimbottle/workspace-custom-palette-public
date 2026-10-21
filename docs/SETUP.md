# Setup and first run

Getting Custom Color Palette for Google Workspace Docs, Sheets & Slides working for the first time. This is the whole
setup: install, enter your brand colors, use them. No account, no server
required.

> Rolling it out to a whole team or running the central palette server? That is
> `docs/DEPLOY.md`. This page is just first-run for one person.

## 1. Install

**From the Chrome Web Store** (once listed): open the listing and click **Add to
Chrome**. Pin it: click the puzzle-piece icon → pin **Custom Color Palette for Google Workspace Docs, Sheets & Slides**.

**Before it is listed (load unpacked):** `chrome://extensions` → turn on
**Developer mode** → **Load unpacked** → select the repo root (the folder with
`manifest.json`).

## 2. Enter your brand colors

1. Click the extension icon → **Options** (or right-click it → Options).
2. Add each brand color: paste a hex value (`#1A73E8`) and give it a name.
   Reorder by dragging; the first colors are what you reach for most.
3. **Save.** That is it — the palette lives in your browser.

Have the palette already? Use **Import** on the options page to paste a whole
palette at once: one color per line, name then hex, like `Brand Blue #1A73E8`.
**Copy current palette** exports the same format to share.

## 3. Use it

Open any Google **Doc, Sheet, or Slide**, then open any fill / text / border
color menu. A **Brand** row appears at the top of Google's own picker. Click a
color and it applies in one click.

In Slides, select a shape or text box first — Google hides the color buttons
until something is selected.

## 4. On / off

The toolbar popup has a single on/off switch if you ever want to hide the Brand
row without uninstalling.

---

## Optional: central team palette

If your company runs the config service (`docs/DEPLOY.md`), point the extension
at it and everyone gets the same palette pushed automatically — no one types hex
codes. Skip this for a personal install; the packaged palette and your edits
work fully offline.

## Troubleshooting

- **No Brand row?** Reload the Google tab (content scripts load on page load).
  Confirm the on/off switch is on.
- **Slides shows nothing to color?** Select a shape or text box first.
- **A color does not apply?** Google occasionally changes its picker markup;
  use **Send feedback** in the popup to report it.
