# Chrome Web Store listing — Custom Color Palette for Google Workspace Docs, Sheets & Slides

Paste-ready copy + the review answers for submission. Privacy details:
`docs/PRIVACY.md`. Pre-submit gate: `LAUNCH_CHECKLIST.md`.

## Name

Custom Color Palette for Google Workspace Docs, Sheets & Slides

## Summary (under 132 chars)

Your brand colors, one click away in the native color pickers in Docs, Sheets, and Slides. Workspace admins can push them org-wide.

<!-- 131 chars. Revised 2026-10-08: the second sentence used to be "For one
     person or a whole team.", which told an IT admin nothing about HOW a team
     gets the colors. It now names the admin and the org-wide push, the thing
     that buyer is searching for. "Google" is dropped before Docs because the
     name directly above already says Google Workspace. -->
<!-- Earlier note (2026-08-26), still binding: Positioning settled 2026-08-26: the PRODUCT is named "Custom
     Color Palette" everywhere, matching what people install and what the panel
     now says; the MARKETING speaks to brand and to organizations, which is
     what the description does. So the summary deliberately leads with "brand
     colors" (the outcome) under a product called Custom Color Palette (the
     name) and closes on the team case. Do not re-litigate by renaming the
     product to Brand Palette; that mismatch is what was just fixed. -->

## Category

Productivity

## Detailed description

The CWS description field is PLAIN TEXT: markdown is shown literally, not
rendered. Keep this block free of `#`, `*`, and backticks. Caps lines are the
section headers; hyphen bullets read fine as plain text. Paste everything
between the BEGIN/END markers.

<!-- BEGIN paste -->

Custom Color Palette puts your brand colors inside the color pickers you already use in Google Docs, Sheets, and Slides. Open any fill, text, border, or table color menu and a Brand row appears with your colors. Click one and it applies in a single step, exactly like a built in color. Use it on your own, or have your Workspace administrator roll one palette out to everyone.

WHY PEOPLE USE IT

- Your brand colors are one click away, in the place you already look for colors.
- No more hunting for hex codes or pasting them between documents.
- Nothing to learn. The row sits inside Google's own picker and behaves like the rest of it.

FOR ORGANIZATIONS AND IT ADMINS

- Deploy it to your whole organization from the Google Admin console. Force-install the extension, set the colors by managed policy, and everyone opens Docs, Sheets, and Slides with your brand colors already there. Nothing for staff to set up.
- Settings includes a builder that writes the Admin console policy for you, with a live preview of the colors together. No hand written configuration, and no server to run.
- Publish several named palettes if you have sub brands, and let people switch between them.
- Choose whether staff can change them. Enforced colors are what everyone starts on and cannot be edited, so the brand stays the brand.
- Nothing anyone made is ever deleted. Personal palettes stay in the account throughout, and come straight back if the policy is removed.

KEEP MORE THAN ONE PALETTE

- Build as many palettes as you need and switch between them. A client palette, a product line, a seasonal set.
- Name them, reorder them, delete the ones you are finished with.
- Switching applies everywhere at once. Documents you already have open and the toolbar icon follow immediately, with no reload.

EDIT YOUR PALETTE ANYWHERE

- Click the toolbar icon for a quick editor. Add, rename, reorder, and remove colors. Changes save as you finish each one and show up in an open picker right away.
- Undo and Redo step back through recent changes.
- Pick a color visually, type a hex, or use the eyedropper to grab one from anything on your screen.
- Import and export as plain text, one color per line, so sharing a palette is copy and paste.
- Reset brings back the colors you last saved, and asks before it acts.

MADE TO FEEL BUILT IN

- The Brand row lives inside Google's own pickers and applies colors through Google's own controls, so the result is exactly what Google would do.
- The extension wears your colors. The toolbar icon, the panel, and the browser tab all paint themselves from the palette in use, and update when it changes.
- Light and dark appearance, or follow your system setting.

PRIVATE BY DEFAULT

- No tracking, no analytics, no data collection. Your documents never leave your browser.
- A default install makes no network requests at all.
- If something breaks, the extension tells you and lets you choose whether to send a report by email. Nothing is ever sent on its own.

Questions or ideas? Use Send feedback in the extension. Reports go straight to the developers.

<!-- END paste -->

## Single-purpose description

The extension has one purpose: to add the user's brand colors into the native color pickers in Google Docs, Sheets, and Slides so they can be applied in one click. Everything it does serves that: editing the palette, keeping more than one, and letting a Workspace administrator supply the colors are all ways of deciding WHICH colors appear in that row.

## Permission justifications

- Host access to `docs.google.com` (spreadsheets, document, presentation): required to insert the Brand colors into the color pickers on those editor pages. The extension runs only there.
- `storage`: saves the user's palettes, which one is active, and their appearance preference so they persist. Also how an administrator's palette reaches the extension, via Chrome's managed storage, which is read only to the extension.
- `alarms`: schedules the periodic check for updated palette and selector configuration. The published build has no configuration server set, so that check makes no network request at all; it only clears any cached configuration so the extension uses the copy packaged inside it. The extension makes no network requests in its default configuration.

The extension fetches only configuration data (the palette and the CSS selectors it uses), never executable code. The consuming logic is packaged and reviewed.

## What's new (per release)

Paste into the "What's new in this version" field on each upload. Keep entries short, user-facing, past tense.

### 0.2.2
- Each hex code in the palette editor has a copy button. One click copies the code, ready to paste into another app. It works on colors your organization has locked too.
- Settings has a refresh button on the Palette line, so a palette changed in the toolbar panel or on another computer shows up without reloading the page.

### 0.2.0
- You can now keep several palettes and switch between them. Create, rename, and delete them in settings.
- Your workplace can now provide brand colors for everyone, and choose whether they can be edited. Palettes you made yourself are always kept, and come back if the setting is removed.
- Administrators get a color builder in settings that writes the Admin console configuration for them, with a live preview of the colors together.
- The panel and the browser tab now wear your palette's colors, the way the toolbar icon already did.
- Importing a list now creates a new palette instead of replacing the one you are on.
- Reset now brings back the colors you last saved, and asks before it acts.
- Colors are saved when you finish typing them, rather than letter by letter.
- The settings page now shows which version you are running.
- The switch that turned the brand colors on and off is gone. If you had turned them off, they are back on.

### 0.1.4
- The extension has a new name: Custom Color Palette for Google Workspace Docs, Sheets & Slides. Same extension, same features.
- Added an eyedropper to the palette editor: grab a color from anything on your screen.
- The extension now tells you if something goes wrong and lets you choose to send a report. Nothing is sent automatically.
- New Report a bug link next to Send feedback.
- The extension icon now matches the palette stripes you see in your toolbar.
- Fixed: saving the options page with every color deleted now says the default palette will be used instead of quietly restoring it.

<!-- Maintainer note, do not paste: the milestone review prompt shipped in
     0.1.4 disabled, pending EXTENSION_ID. That was filled on 2026-08-15
     (lib/rating.js, id hchpnnppgakgmobkbldgkohmplkcahjl), so the prompt is
     live and simply was never announced. Nothing to do; kept as history. -->

### 0.1.0
- Initial release: a Brand color row inside the fill, text, and border pickers in Google Docs, Sheets, and Slides, with a palette editor and an on/off toggle.

## Data usage disclosures (Privacy tab checkboxes)

Answer the dashboard's data-collection form with these:

- Personally identifiable information? **No**
- Health information? **No**
- Financial or payment information? **No**
- Authentication information? **No**
- Personal communications? **No**
- Location? **No**
- Web history? **No**
- User activity? **No**
- Website content? **No** (it touches only the color-picker popup markup to add and apply swatches; it never reads or transmits document content)

**Certifications** (check all three):
- I do not sell or transfer user data to third parties outside the approved use cases
- I do not use or transfer user data for purposes unrelated to my item's single purpose
- I do not use or transfer user data to determine creditworthiness or for lending purposes

The sole network request is a read-only download of configuration data (palette + selectors). In a default install with no server configured, the extension makes no network requests at all.

## Hosted resources

- **Privacy policy URL** (required): published live at
  https://raylytics.io/brandpaletteinjector/privacy — paste it into the
  dashboard's Privacy tab. Source of record is `docs/PRIVACY.md`; the
  paste-ready copies are `store-assets/privacy.html` and `store-assets/privacy.txt`.

## Assets needed before submission

Capture specs and shot list: `store-assets/CAPTURE_GUIDE.md`.

- [x] Store icon 128x128 — `icons/icon128.png`, the brand palette-stripe mark
      (Cloud/Sky/Poppy/Sunshine/Rose) generated by `npm run icons`. Promoted to
      the final icon 2026-08-09; it matches the adaptive toolbar icon.
- [x] Screenshots 1280x800, five (`store-assets/screenshots/`), all rendered
      2026-10-08 from the 0.2.2 pages. 04 and 05 are new: the listing shows the
      admin side, not only the end user's.
      1. `01-brand-row-sheets` — "One click, in Google's own picker": the
         Brand row boxed in a Sheets fill picker (raw captured by hand).
      2. `02-options-editor` — "Set your brand colors once": Settings editor.
      3. `03-popup-editor` — "Edit them from the toolbar": the toolbar panel.
      4. `04-managed-palette` — "Roll one palette out to your organization":
         Settings as a force-installed user sees it, org colors locked.
      5. `05-policy-builder` — "Admins pick the colors, it writes the policy":
         the Admin console policy builder and the JSON it generates.
- [x] Small promo tile 440x280 — `store-assets/promo/small-440x280.png`.
- [x] Marquee promo tile 1400x560 — `store-assets/promo/marquee-1400x560.png`.
- [x] **Every image says "Custom Color Palette" and has no alpha channel.**
      All seven are rendered from `store-assets/templates/` by `npm run shots`
      (`dev/capture-shots.mjs`, then `dev/render-store-art.mjs`) as 24-bit RGB.
      They replaced hand-made images on 2026-10-08 that still said "Brand
      Palette", the name retired on 2026-08-26. Edit the HTML, never the PNG.

## Submission checklist

**This is an UPDATE, 0.2.1 to 0.2.2** (the store showed 0.2.1 on
2026-10-08), not a first publish. The item already exists under
`hchpnnppgakgmobkbldgkohmplkcahjl`, so do not create a new one; the version
string must be higher than 0.2.1, which 0.2.2 is. Burned version numbers can
never be reused, so do not upload a throwaway build under 0.2.2. The listing
copy and images changed in the same cycle (2026-10-08), so they go into this
one submission rather than a separate listing-only review.

**Submitted 2026-10-08 by the owner, all steps below done; review pending.**
When the review clears, confirm the live page shows the new copy and images.
The next release replaces this section with its own update.

Full pre-submit gate: `LAUNCH_CHECKLIST.md`. The dashboard steps:

- [x] `npm run package` → `dist/custom-color-palette-<version>.zip`; confirm
      `manifest.json` is at the zip root and `dev-reload.js` / `__tests__` are
      excluded (the script prints contents).
- [x] Confirm `manifest.json` `version` is 0.2.2 and has never been uploaded
      (burned numbers can't be reused; gaps are fine).
- [x] CWS Developer Dashboard → the EXISTING item
      (`hchpnnppgakgmobkbldgkohmplkcahjl`) → Package → upload the zip.
- [x] Store listing tab: replace the Summary and Detailed description with the
      copy above (Name, Category and Single-purpose are unchanged; re-paste
      only if the dashboard differs).
- [x] Paste the 0.2.2 "What's new in this version" entry.
- [x] Store listing tab: delete the old screenshots and upload all five in
      order 01 to 05; replace both promo tiles.
- [x] Privacy tab: unchanged (no permission or data-use change since 0.2.0);
      confirm the privacy URL still loads.
- [x] Submit for review.
