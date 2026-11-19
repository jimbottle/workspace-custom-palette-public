# Release notes

What changed for you, in plain terms. For the engineering log see CHANGELOG.md.

## 0.2.5

### Fixed

A palette with more than ten colors no longer runs off the edge of the color
picker in Slides, where the last colors were cut off behind a scrollbar. Brand
colors now wrap onto a second row after ten, in Docs, Sheets and Slides alike.

## 0.2.4

### Changed

Importing a list of colors on the Settings page now asks what to call the
new palette before creating it, with a suggested name you can accept by
pressing Enter. The button reads "Import as new palette" so it is clear that
nothing you already have is replaced. Import is also available while your
organization's palette is on screen: the imported colors go into a palette of
your own.

## 0.2.3

Not published on its own. These fixes were released as part of 0.2.4.

### Fixed

On the Settings page, "Copy current palette" now really copies your palette
to the clipboard, ready to paste into a message or another computer. Before,
it only placed the list in the box. The Import / export box also shows your
own colors when you open it, in place of two example colors.

Two cases where clicking a brand color went wrong, with nothing actually
wrong in Google's color picker. Both are fixed.

If a color's name was its own hex code (for example a color named #1A73E8,
which is what you get when you import a list of bare hex codes), clicking it
did nothing at all. It now applies.

If a color was one that Google already offers in its own grid, such as pure
black, white or red, it was applied but the message "That brand color
couldn't be applied" appeared anyway, every time. The message no longer
appears, and these colors apply faster.

## 0.2.2

### Added

Each color's hex code now has a small copy button at the right end of the
box. Click it to copy the code (for example F9F4EB) so you can paste it into
another app. It works on colors your organization has locked too.

The Settings page has a refresh button on the Palette line, next to the
selector when one is showing and on its own when you have a single palette. If
you rename, recolour or add a palette from the toolbar popup, in another
Settings tab or on another computer signed in to the same account, click it to
bring this page up to date without reloading. If you have edits you have not
saved, the first click warns you and the second click discards them.

## 0.2.1

### Fixed

Brand colours now work on dropdown chips in Google Sheets. If you opened Data
validation, chose Dropdown and clicked a brand colour for one of the options,
the colour did not apply and you saw a message saying it could not be applied.
That picker is built differently from the toolbar ones and the extension did
not recognise it. It does now, and a brand colour sets the chip background in
one click, the same as everywhere else.

### For administrators

The policy builder can now start from the palettes already in your browser.
Open it from Settings, click Start from my palettes, and every palette you have
built in the extension is brought in with its names and hex codes, ready to
publish, so nothing has to be retyped. Your own palettes are only read, never
changed. The builder's colour rows also gained the same reorder, delete and
eyedropper controls the Settings page has. A copy of the builder sent to
someone without the extension still works exactly as before.

## 0.2.0

### For administrators

Setting up organization colors is documented correctly now. The instructions
previously said to add the extension to the Admin console by ID, which does not
work: that option is for extensions a company hosts itself and asks for an
installation URL. Add it from the Chrome Web Store instead, by name, using the
plus button on the Apps and extensions page.

### Fixes

When you save a change to your workplace's colors, the copy that gets made for
you is now called "My colors" instead of "Default". It was never the default
palette, and the old name made that confusing.

The first palette you create is now called Palette 1. Before it could come out
as Palette 2 when another palette already existed.

If your organization publishes more than one palette, switching between them
now works everywhere. Before, picking the second one showed its colors for a
moment, then documents, the toolbar icon, and the panel itself all went back to
showing the first palette's colors under the second one's name.

Colors you type in the popup are saved when you finish typing them, not
letter by letter. Before, a color could be saved while you were still halfway
through typing it, which meant a value you never chose could end up stored and
sitting in your undo history. Nothing is lost by the change: closing the popup
or switching palettes still saves whatever you last typed.

A note saying your organization provides your colors could appear for
everyone, whether or not your workplace had set anything up. It now appears
only when your organization really does provide colors.

Switching palettes now reaches every open Google tab and the toolbar icon
right away. Before, a document open in another tab could keep showing the
previous palette until you edited a color again, and the toolbar icon did not
follow palette switches at all.

If your workplace provides colors and your own palette sits beside theirs in
the selector, selecting your own palette now shows its Rename and Delete
controls. Before, those controls stayed hidden until you turned on Multiple
palettes in settings, even though the palette itself was right there and
editable.

Reset on the settings page now asks before acting. The first click tells you
that your last saved colors will come back and unsaved changes will be lost;
clicking anywhere else cancels, so a stray click changes nothing.

The links at the bottom of the popup are now centered.

### What is new

Your workplace can now provide brand colors that stay put. If your
administrator turns this on, your company's colors become the palette you start
on in every picker, and they cannot be edited, so everyone works from the same
set.

You are not shut out of your own colors. Turn on Multiple palettes in settings
and you can create palettes of your own, switch between them, and go back to
your company's colors whenever you like. Nothing of yours is ever deleted by
enforcement.

You can keep more than one palette now and switch between them. Turn on
Multiple palettes in settings to create, rename, and delete palettes; with no
workplace colors in play, your original palette stays alongside as Default.
If your workplace provides colors, those colors take the place of that default
until you turn Multiple palettes on, and anything you create then appears next
to your company's palette. Your administrator can also provide several named
palettes, for example one per sub brand, and you can switch between those
right away.

The switch that turned the brand colors on and off is gone. Both the popup
and settings now stay focused on the colors themselves. If you had turned the
colors off, they are back on.

Reset now brings back the colors you last saved, rather than the ones the
extension shipped with. Once you have saved a palette of your own, that is the
version worth getting back to.

Nothing is lost either way. Colors you saved for yourself stay in your account
the whole time, and they come straight back if your administrator ever removes
the setting.

Most people will never see any difference. This only applies where an
administrator chooses to use it.

### Changed

If your workplace provides colors and you turn Multiple palettes back off, you
return to your workplace's colors rather than being left on a palette of your
own with no way to switch. Nothing you made is deleted: turn Multiple palettes
on again and your palettes are all still there, and you can switch back.

The extension now calls itself Custom Color Palette wherever it names itself,
which is the name you installed it under. The panel and settings used to say
Brand Palette, so the name on the Chrome Web Store and the name on screen did
not match. The colors themselves are still your brand colors, and the row
inside Google's pickers is still called Brand.

If you administer Google Workspace for your organization, settings now has an
Administrators section with a colour builder. It writes the settings you paste
into the Google Admin console, so nobody has to hand-write configuration. You
only need it if you are setting colours for a whole organization.

The little striped mark on the settings and popup pages, and the icon on the
browser tab, now wear your actual colors, the same way the toolbar icon already
did. Before, those two showed a fixed set of colors that had nothing to do with
your palette.

Multiple palettes is now on from the start, so the palette chooser and the
New palette button are there without turning anything on. You can still switch
it off in settings if you prefer a single palette. Switching it off only hides
the chooser, it never deletes a palette: turn it back on and everything you
made is there, in order.

When your workplace provides colors, those colors are now what you start on,
rather than sitting in the chooser waiting to be picked. Colors you customized
yourself are the exception and are never replaced, and your own palettes are
always kept either way.

Importing a list of colors now creates a new palette and switches to it, so
the palette you were looking at is left alone. This applies when you have
Multiple palettes turned on. With it off, importing works as it always did:
the colors load into the editor and you decide whether to save them.

The settings page now shows which version you are running, at the bottom beside
Send feedback and Report a bug. It saves hunting through Chrome's extensions
page when you want to mention it in a report.

The bug report form now asks which language your Google editor is set to. Almost
every problem reported so far has turned out to depend on that language, and it
is not something the form can work out on its own. Answering it makes a report
much faster to act on.

## 0.1.7

### Fixes

Brand colors now apply correctly when Google Docs, Sheets, or Slides is set to a
language other than English. The colors appeared in the picker but clicking one
could leave the text or shape unchanged.

Your brand colors no longer show a stray check mark. In some pickers every color
in the Brand row appeared to be the one currently in use, which was confusing and
also read incorrectly to screen readers.

### What is new

If your workplace installed this extension for you, your administrator can now
publish your company's brand colors to everyone at once, so the right colors are
simply there the first time you open a color picker.

You can still change them for yourself. Worth knowing: once you edit any of
them, even one color, you keep a private copy and your company's later updates
stop reaching you. The popup tells you when that has happened and offers "Use
organization colors" to put you back on the company palette; on the settings
page, pick Organization colors in the Palette list.

## 0.1.6

### What is new

The Undo and Redo buttons in the popup now use crisp circular arrow icons
instead of small text arrows, so they are easier to spot at a glance.

After this update, a small NEW badge appears on the toolbar icon and the popup
shows a short note confirming that Google Docs support is restored. Brand
colors were effectively missing in Docs; they are now fully working, the Brand
row shows its label again, and hovering a brand color shows its name. Dismiss
the note once and it stays gone. Future updates will only show a note when
there is something you would actually want to know.

## 0.1.5

### What is new

Reporting a bug is a little smarter. The report template now sits inside the
message box where you can write into it or delete it, instead of being glued
above whatever you type. Bug reports can also say which app the problem
happened in (Docs, Sheets, or Slides) with one optional tick, and they include
your browser's interface language, which helps us reproduce issues that only
show up in some languages. Everything attached is visible in the message
before you send it.

### Fixes

In Google Docs the Brand section now shows its "Brand" heading again. The brand
colors were being added to the bottom of the standard color grid with no
heading, so they looked like part of Google's own palette and were easy to miss
entirely.

Hovering a brand color now shows that color's name. Before, every brand swatch
showed the name of one of Google's own colors (for example "Black", or its
translation in your language) no matter which brand color you pointed at.

## 0.1.4

### Fixes

If you delete every color on the options page and press Save, the page now
tells you the default palette will be used instead of quietly bringing the
default colors back and calling them saved. Reset still loads the default
palette into the editor whenever you want it.

### What is new

The extension icon now shows the brand palette stripes everywhere, so the icon
you see in the store and on the extensions page matches the one in your
toolbar.

Grab a color straight from your screen. Each row in the palette editor now has
a small eyedropper button next to the hex field. Click it, then click any pixel
in any window, and that color fills the row. Press Escape to cancel a pick.

If something goes wrong inside the extension, it now tells you. A small notice
appears in the popup or settings page with a Report this button that opens the
feedback page, so you can send us the details in one step. Nothing is ever sent
on its own; you always write and send the report yourself.

There is also a new Report a bug link next to Send feedback in the popup and on
the settings page, so bug reports start with the right template.

After you have used the extension for a while, it may ask once whether you
would like to leave a review on the Chrome Web Store. One small card in the
popup, and whatever you choose, it never asks again.

The extension has a new name: Custom Color Palette for Google Workspace Docs,
Sheets & Slides. Same extension, same features, a name that better says what it
does.

Your company brand colors now live right inside the color pickers in Google
Docs, Sheets, and Slides. Open any fill, text, or border color menu and you will
see a Brand row at the top. Click a color and it applies in one step, just like
any built in color.

You can edit your palette right from the toolbar popup: add, rename, reorder, or
remove colors, with a color picker on each row. Edits save automatically and show
up in an open color menu live. An Undo and Redo let you step back through recent
changes. The full options page adds bulk import or export, reset to default, and
the theme setting.

Import and export is now plain text: one color per line, name then hex, like
"Brand Blue #1A73E8". Paste a list to load a whole palette at once, or copy your
current palette to share it. It is easy to type by hand and works with anything
that can make a simple list.

Each color row now has a trash can icon to remove it, in place of the old
"Remove" text, so the editor is tidier and quicker to scan.

The popup, settings, and feedback pages have a fresh, on-brand look: a warm color
scheme with the brand palette, a small striped mark, a proper on/off switch, and
clearer buttons and focus outlines. Dark mode is built to match. It is easier to
read and unmistakably part of the same product.

The toolbar button now shows your palette: it is painted with stripes of your
first five brand colors and updates whenever you change them, so the icon always
matches your current palette. The first time you open the popup, a short, friendly
note points this out so you know what the striped icon means.

The brand colors now appear under a "Brand" heading in the color menu, styled
like the menu's own "Standard" and "Custom" sections, so they are easy to spot.

The options page, popup, and feedback page now support a dark or light theme.
Pick System, Light, or Dark from the new Appearance setting on the options page;
System (the default) follows your operating system.

### Fixes

- Google Sheets: the first time you applied a brand color in a tab, you could
  see a "couldn't apply" message even though the color was applied. That false
  message is gone; applying a brand color in Sheets is now clean every time.
- The Brand row could appear more than once in the color menu, and the extra
  copies showed the wrong colors. The Brand row now appears exactly once, in the
  main color grid, with the correct colors.
- Editing your palette (or toggling the extension on/off) now updates the color
  menu right away. Previously a change could keep showing the old colors until
  you reloaded the page.

### Privacy

The extension collects nothing. No tracking, no analytics, and your documents
never leave your browser. See the Privacy page for details.

### Sending feedback

There is a Send feedback link in the popup and the options page. It opens an
email in your own mail app with just your version, browser, and OS attached, so
nothing is sent unless you send it.

### Limitations

- Chrome and other Chromium browsers only in this version.
- Works in the color pickers of Docs, Sheets, and Slides; other Google apps are
  not covered yet.
