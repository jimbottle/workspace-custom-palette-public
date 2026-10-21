# spike/ — Phase 0 feasibility capture tool (THROWAWAY)

Not shipping code. This exists only to de-risk the project per `docs/plan.md`
Phase 0 and to capture the real picker DOM into `docs/SPEC.md`. Delete after
Phase 1 lifts the verified selectors into the real `dom-contract`.

## What it does

A content script (`capture.js`) on Docs/Sheets/Slides that:

1. Watches the DOM for popups mounting and heuristically detects color pickers
   (a grid of small single-color swatch cells — no hard-coded selectors).
2. On detection, logs a structured report (candidate selectors for popupRoot /
   swatchGrid / swatchCell / custom-color button) and the full popup
   `outerHTML`, and copies the `outerHTML` to the clipboard.
3. Exposes `window.__spikeApply("#1A73E8")` to test driving Google's own
   custom-color → set-hex → confirm flow against the current selection — the
   core "is the apply flow drivable?" question.

## Run it (needs a Google-authenticated Chrome)

1. `chrome://extensions` → enable **Developer mode** → **Load unpacked** →
   select this `spike/` directory.
2. Open a Sheet you can edit. Select a cell.
3. Open the **fill color** picker from the toolbar.
4. Open DevTools console, filter on `[spike]`. Read the detected-picker report;
   the popup HTML is on your clipboard.
5. With the picker open, run `__spikeApply("#1A73E8")` in the console and watch
   the logged steps. Note which event actually commits the hex.

## What to record back

Paste findings into `docs/SPEC.md`:
- §2 — the real selector strings for each picker (flip row status to 🔎/✅).
- §3 — the exact apply sequence and which event commits the value, plus the
  no-selection behavior and the read-back method.

Once Sheets fill is ✅ and the other matrix rows are confirmed same-shape,
Phase 0's acceptance is met and Phase 1 can begin.
