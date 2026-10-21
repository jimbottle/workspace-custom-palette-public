# Product

## Register

product

The design serves a tool. The interface is chrome around a single job (curate a
brand palette); it should be confident and on-brand but must never compete with
the color swatches the user is editing, which are the real content.

## Users

Brand-conscious people on a team that has a defined color palette: a designer,
brand owner, marketer, or ops person who lives in Google Docs, Sheets, and
Slides. They configure the palette once (in a quick toolbar popup or the options
tab) and then forget the tool exists, reaching for their brand colors one click
deep inside Google's own pickers. Context: a normal daytime browser session,
often mid-document; they want trust (this won't phone home) and to recognize
their own colors instantly.

## Product Purpose

Custom Color Palette for Google Workspace Docs, Sheets & Slides adds a company's brand colors as a native "Brand" row
inside the real fill / text / border color pickers in Google Docs, Sheets, and
Slides, so a brand color is one click in Google's own UI, not a side panel.
Success is invisibility: the brand colors are simply *there*, applied through
Google's own apply path, and the extension's own pages are quick, legible, and
unmistakably the product's, not a generic settings panel.

A hard product principle: **no remote telemetry.** The extension never auto-sends
user activity, identifiers, document content, or URLs. The UI should make that
trustworthiness felt (calm, honest, no dark patterns).

## Brand Personality

Crafted, calm, confident. Three words: precise, warm, trustworthy. The voice is
plain and direct (no marketing gloss, no emoji, no em dashes in shipped copy).
The Raylytics palette is warm and earthy (Cloud, Sky, Poppy, Sunshine, Rose,
Grass, Night) rather than the cool corporate blue this category defaults to; the
UI should feel like that palette made it, without drowning in it.

## Anti-references

- **Google Material clone.** The reflex for a Google extension is Google blue
  (#1a73e8), Roboto, and Material grays, making the pages look like a Google
  settings panel. Explicitly avoid this; it is the category reflex and it erases
  the product's identity. (The injected Brand row *inside Google's picker* is the
  one exception: it must clone Google's markup to look native, and is off-limits
  to styling.)
- **Telemetry-heavy "dashboard" SaaS.** No hero metrics, no analytics cards, no
  account nags. This tool watches nothing.
- **Loud color-tool chrome.** Rainbow gradients, drenched surfaces, or decorative
  swatches in the chrome itself: the swatches the user edits must stay the only
  colors that matter on screen.

## Strategic Design Principles

1. **Content is color; chrome is quiet.** Restrained, brand-tinted neutrals with
   a single committed accent (Poppy). Identity lives in the header, the accent,
   and the dark theme, not in a saturated surface.
2. **Identity through a live mark, not decoration.** A small brand-stripe mark
   (the five brand colors) ties the popup, options, and feedback pages to the
   striped toolbar icon. It means something (this is *your palette's* tool).
3. **Dual theme, both first-class.** System default; light is warm near-white,
   dark is built on Night (#1A2D27), not Google charcoal. Neither is an
   afterthought.
4. **Trust is a feature.** Honest copy, no dark patterns, visible focus, generous
   hit targets. Privacy stance stated plainly on the feedback page.
5. **Flagship craft on a tiny surface.** Every interactive element gets full
   states (hover / focus-visible / active / disabled); spacing follows a scale;
   motion is subtle, ease-out, and respects reduced-motion.

## Accessibility & Inclusion

- Target WCAG AA: body text and icons meet 4.5:1 (3:1 for large text / UI). The
  Poppy accent is used as a *fill* with dark (Night) text on it; links and accent
  text on a background use a deepened Poppy that passes AA.
- Visible `:focus-visible` rings on every interactive element (never remove
  without replacement).
- Respect `prefers-reduced-motion`; respect `prefers-color-scheme` as the default.
- No meaning by color alone (status text accompanies state changes; the trash
  remove control carries an aria-label).
