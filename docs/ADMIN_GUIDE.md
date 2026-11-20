# Administrator guide: publishing your organization's palette

For Google Workspace administrators. This page explains how to give everyone
in your organization the same brand colors inside Google Docs, Sheets and
Slides, using the Custom Color Palette extension and the Google Admin console.
You do not need anything from the extension's source code to follow it.

Everything here was checked by a real administrator in a real Admin console
(2026-08-24) and then rechecked. Where the console is unclear, this guide says
so, because those are the places people got stuck.

## What you are setting up

The extension adds a row of your brand colors to the color pickers in Docs,
Sheets and Slides. On its own, each person picks their own colors. As an
administrator you can publish one palette (or several named ones) to every
managed browser in an organizational unit, and optionally enforce it so staff
cannot change those colors.

You do this in two steps:

1. Build the settings text with the policy builder (two minutes).
2. Paste it into the Admin console (five minutes, plus a minute or two for
   delivery).

## Before you start

- You need a Workspace administrator account. Only administrators can reach
  the console, which is Google's own access control and the reason the
  organization palette is set there rather than inside the extension.
- Decide which organizational unit the staff are in. Setting the policy on the
  top level applies it to everyone.
- Have your brand colors ready as six-digit hex codes (for example `#1A73E8`),
  each with a short name. Names appear when someone hovers a color.

## Step 1: build the settings text

Open the policy builder. If you have the extension installed, open its
Settings page, scroll to **Administrators**, and click **Build organization
palette**. The builder opens in a new tab.

Not sure where to start, or not installing the extension yourself? Email
dev@raylytics.io and we will help you set up your organization palette. Setup
help is free.

In the builder:

1. Choose **One palette for everyone**, or **Several named palettes** if you
   have sub-brands or product lines that need their own colors.
2. Leave **Staff cannot change these colors (recommended)** ticked unless you
   want your colors to be a starting point staff may personalize. Most
   administrators want it ticked: it is what "these are our brand colors"
   usually means, and without it a palette can quietly drift off-brand.
3. Enter each color's name and hex code. If the extension is installed, the
   **Start from my palettes** button brings in every palette already built in
   this browser so you do not retype anything.
4. Watch the striped mark at the top of the page. It shows the colors you are
   about to publish.
5. Click **Copy**. The text under "Paste this into Policy for extensions" is
   what goes into the console.

The builder warns you in plain words if a color has no name, is not a valid hex
code, or if you have more than the limit (24 colors per palette, 12 palettes).
Fix those before copying; anything it warns about would be skipped by the
extension.

## Step 2: paste it into the Admin console

1. Sign in at **admin.google.com** as a Workspace administrator.
2. Open the menu (three lines, top left) and go to **Devices**, then
   **Chrome**, then **Apps & extensions**, then **Users & browsers**.
3. In the left-hand list, select the organizational unit the staff are in.
4. Find **Custom Color Palette for Google Workspace Docs, Sheets & Slides** in
   the list of apps.

   **A new organization's list is empty.** The extension does not appear
   because someone installed it; you have to add it. Click the **yellow +
   button** at the bottom right, choose **Add from Chrome Web Store**, search
   for **Custom Color Palette**, click the extension, then click **Select**.

   Do **not** use **Add Chrome app or extension by ID**. That option is for
   extensions a company hosts itself. It asks for an installation URL, and
   there is nothing to enter there. It is the first thing a real administrator
   tried, and it is a dead end.

5. Click the extension's row to open its settings panel. **Check the ID under
   the name: it must read `hchpnnppgakgmobkbldgkohmplkcahjl`.** Settings are
   delivered per extension ID, so an entry with any other ID silently
   configures nothing, and nothing anywhere will tell you why.
6. Choose the installation policy on that same panel. **Force install** puts
   the extension on every managed browser in the unit automatically; **Allow
   install** lets staff install it themselves. Either one delivers your
   palette. Force install is what most organizations want.
7. Scroll down to the **Policy for extensions** box. Select everything already
   in it and paste the text you copied from the builder over it.
8. **Click SAVE. It is in the upper right of the settings panel**, not beside
   the box you just edited and not at the bottom of the page. Nothing takes
   effect until you click it.

   The box turns yellow when you edit it, and **stays yellow after you save**.
   That highlight means "set for this organizational unit", not "unsaved". It
   is not an error. To confirm the save stuck, reload the console page and
   check your text is still there.

## Step 3: confirm it arrived

Delivery is not instant. On a staff member's managed browser:

1. Open a new tab to `chrome://policy`.
2. Click **Reload policies** (top right).
3. Find the extension's section. The status should read **OK**, the source
   **Cloud**, and the value should be the text you pasted.

Allow a minute or two. If it is not there yet, wait about sixty seconds and
reload policies once more. Reloading repeatedly does not help. If it still has
not arrived after that, check these in order; the first is the usual cause:

1. The ID on the console entry matches `hchpnnppgakgmobkbldgkohmplkcahjl`.
2. The browser is signed in to an account in the organizational unit you set
   the policy on (or a unit that inherits from it).
3. The save actually stuck (reload the console page and look for your text).

Once it has arrived, the next color picker a staff member opens shows your
colors. No browser restart is needed, and later changes you make in the
console reach them the same way.

## What staff see

- Your palette becomes the palette they start on, labeled with your
  organization in the extension's Palette selector.
- If you ticked **Staff cannot change these colors**, the palette is shown
  read-only. Staff can still create palettes of their own alongside it and
  switch between them; they cannot edit yours.
- If you left it unticked, your palette is an editable starting point. Anyone
  who edits it keeps a personal copy and stops receiving your later updates
  until they switch back to the organization palette. If a rollout looks like
  it skipped someone, that is usually why.
- Palettes staff made themselves are never deleted by anything you publish.

## Changing or removing the palette later

Repeat step 2 with new text and save. To remove the organization palette
entirely, empty the **Policy for extensions** box and save; staff return to
their own colors. Publishing a lock with no palette, or a palette with only
invalid entries, is ignored rather than freezing anyone on colors they cannot
change.

## Screenshots to add to this guide

These are the screens administrators asked about. Capture them in a real
console, in this order, and place them beside the step they illustrate:

1. The empty app list in a new organization (step 2.4).
2. The yellow + menu showing its three add options (step 2.4).
3. The Chrome Web Store search result for Custom Color Palette (step 2.4).
4. The extension's panel with the ID visible under the name (step 2.5).
5. The installation policy selector (step 2.6).
6. The Policy for extensions box with the pasted text (step 2.7).
7. The panel with SAVE visible in the upper right (step 2.8).
8. A saved field still showing yellow, so the guide can say outright that
   yellow is not an error (step 2.8).
9. `chrome://policy` showing the keys with status OK (step 3).

## Privacy

The extension makes no network requests of its own in a standard install, and
it never sends document content, activity or identifiers anywhere. The policy
you publish is delivered by Chrome's own management channel, the same one that
delivers every other Chrome policy. Details are in the extension's privacy
disclosure on the Chrome Web Store.
