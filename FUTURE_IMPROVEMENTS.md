# Future improvements

The parking lot. Ideas that were considered and **deferred** or **rejected**,
each with the reasoning that got them there, so they are not relitigated from
scratch every time someone has the same idea again.

An entry here is not a backlog item. When something graduates to "we are doing
this", it moves into `docs/plan.md` and gets a bd issue; delete it from here in
the same commit.

Audience: maintainers. Engineering-log voice.

---

## Rejected

### Passive usage telemetry

**Rejected on privacy grounds.** The extension never auto-sends user activity,
identifiers, document content, or URLs. Config fetch is a read-only pull; the
only data ever POSTed comes from the synthetic monitor's dedicated test account,
which is not a real user.

- **Why rejected:** this is the company privacy stance, and it is load-bearing
  in three outward-facing places at once - `docs/PRIVACY.md`, the Chrome Web
  Store listing's data-usage answers, and the minimal `host_permissions` that
  review scrutinizes. "We collect nothing" is a claim that is either absolutely
  true or worthless, and it is currently absolutely true.
- **What we gave up:** we genuinely cannot see how often injection or apply
  fails for real users. That gap is filled deliberately by two other things: the
  synthetic monitor as the single authoritative breakage signal, and a local
  "Report this" banner that surfaces a failure to the user and sends nothing
  unless they choose to.
- **Difficulty if ever reversed:** low to build, high to ship - it needs an
  explicit decision from Evan, an ADR, a Web Store disclosure update, and
  probably a re-review.
- **Risk:** the privacy claim is a differentiator for an extension that runs on
  Google Docs. Trading it for diagnostics we have another route to would be a
  bad trade.

### Hardcoding a requesting organization's colors as a selectable default

An org admin asked for their brand colors to be available out of the box.

- **Why rejected:** it ships one customer's branding to every user, does not
  scale past the first request, and makes us the maintainer of someone else's
  palette forever.
- **What we built instead:** enterprise managed storage
  (`config/managed-schema.json`), so any Workspace admin publishes their own
  palette from Admin Console with no code change from us. Shipped in 0.1.7; the
  admin runbook is in `docs/DEPLOY.md`.
- **Interim option for anyone who cannot use policy:** the options page accepts
  a pasted palette block, so an admin can email the palette and staff paste it
  once.

### Reading the Google editor language from the content script

Bug reports need to say which language the Google editor is set to, because
every field bug so far has been a locale bug and `navigator.language` reports
the *browser's* language instead.

- **Why rejected:** the feedback page is not a content script and never touches
  `docs.google.com`, so this would mean reading the editor's `lang` in the
  content script and plumbing it across surfaces through storage - real
  complexity, and a new piece of page-derived state to justify against the
  no-telemetry line, for a value the user can simply be asked for.
- **What we did instead:** the diagnostics footer now says `Browser language:`
  so it is not misread, and the seeded bug template asks for the editor's
  language directly (bd `workspace-custom-palette-5nc`).
- **Reconsider if:** reporters routinely leave the question blank.

---

## Deferred

### Google Forms support

Forms sits on the same host as the three supported editors and has a
hex-capable custom color picker, so it reads like a fourth row in the picker
matrix. A live DOM probe (2026-08-19, signed-in Chrome, blank form) says it is
not: a different frontend stack, no reusable contract, and an apply path we
could not drive. Full evidence - per-selector probe results, the apply-path log
and the cost breakdown - is at
<https://claude.ai/code/artifact/4e5ba05c-a314-479f-989a-db3649259338>.

- **Why deferred - the blocker:** the custom-hex apply path could not be driven
  from a content script. Synthetic events do work for part of the flow: they
  open the Theme panel, and clicking a built-in theme swatch applies
  end-to-end (verified - the header stripe went to `rgb(76,175,80)` and Drive
  saved). But "Add custom color" did not open across four techniques over ~18s
  on a clean load, and the native-value-setter + `input`/`change`/Enter sequence
  that works in Docs and Sheets changes the hex field's text without moving the
  Wiz component's model - so "Add" commits the stale color. Real keystrokes do
  move it. Everything else below is cost; this is the only hard blocker.
- **Zero contract reuse:** every selector in `config/selectors.default.json`
  returns 0 matches in Forms, including `[class*="goog-"]` - there is not one
  Closure class in the document. Forms is Wiz/Boq
  (`jscontroller`/`jsname`/`jsaction` with compiler-generated class hashes like
  `zY7l6d`, `UBrD9d`, `Hvn9fb`). The `shared` block generalizes across Docs,
  Sheets and Slides only because those three share a frontend, so Forms needs
  its own - a schema change, since `lib/config.js` `isValidContract()`
  hard-requires `shared.customColorButton`, `shared.hexInput` and
  `shared.okButton`.
- **No locale-safe hook exists:** theme swatches and the "Add custom color"
  button are identifiable only by `aria-label` - translated text, the trap
  behind both 0.1.4 and 0.1.6. The hex input's `aria-label` is the empty string
  and its `jsname="YPqjbf"` is the generic text-input component name, shared
  with the document-title and answer-option fields; its only distinguishing
  attribute is `maxlength="7"`. No Forms contract can pass the aria-label scan
  in `content/__tests__/dom-contract.test.js`.
- **Two defects that defeat existing infrastructure:** the custom picker is not
  idempotent (repeated opens stacked three live instances), and all three were
  laid out - so `getClientRects().length > 0`, the heuristic
  `findCustomDialog`/`findCustomColorButton` use to pick the live instance out
  of Google's cached ones, cannot tell them apart.
- **No escape hatch:** the Forms API v1 `Form` resource is `formId`, `info`,
  `settings`, `items`, `revisionId`, `responderUri`, `linkedSheetId`,
  `publishSettings` - no theme, style, color or branding field, and calling a
  Google API is ruled out by the platform-etiquette rule regardless. Driving the
  saturation square by coordinates, and writing the Wiz model from page context,
  both violate the "apply rides Google's own custom-color flow" commitment.
  Display-only injection is worse than nothing: a Forms swatch's color is bound
  through jsaction data rather than the DOM, so a cloned Brand swatch would look
  correct and apply the clone source's color.
- **The value is low regardless:** Forms has two color surfaces, both set once
  per form. Theme color is 12 presets plus one custom slot; background offers no
  custom option at all - its four choices are tints auto-derived from the theme
  color. Forms also parks a chosen custom color in a "Current color" slot, so
  reuse within a form is already one click. Contrast the supported editors,
  where the entire value is a color reached for dozens of times per document.
- **Difficulty:** high. Not a matrix row - a second injector and apply engine.
  `resolveApp` is trivial; the other ~9 `dom-contract` resolvers, `injector.js`
  (Forms is a flex list split by literal `<br>` inside a persistent side panel,
  not a table inside a popup menu) and all of `apply-color.js` need Forms
  variants, plus a new monitor `Opener` and read-back method, the contract
  schema change above, and a Web Store re-review for the new host permission.
  Roughly 3-4 weeks. The extension's own name also says "Docs, Sheets & Slides".
- **Risk if built:** Docs-stack selectors are hand-written and churn on Google's
  *redesign* cadence; Forms' class hashes churn on its *build* cadence. Remote
  config makes each break a data publish rather than a store round-trip for
  deployments that configure `CONFIG_BASE` (Web Store installs ship it empty
  and still need a release), which is the right architecture, but every publish
  still needs a live capture and
  verification - the monitor would go red materially more often.
- **Reconsider if:** a synthetic-input technique is found that moves the Wiz
  color model (the only hard blocker); or Forms migrates onto the Docs editor
  stack, which would make it a genuine fourth matrix row; or an admin asks for
  Forms specifically, which would justify a two-day time-box on the blocker
  alone.

Not covered by the probe: a non-English Forms UI, and whether the observed class
hashes actually rotate between Google builds. Both are moot until the blocker
moves.

### Non-Chromium browser support

Firefox and Safari have their own extension APIs and, more importantly, their
own versions of Google's DOM behavior to re-verify.

- **Why deferred:** v1 scope is Chromium. The whole selector contract was
  verified against Chrome; nothing about it is known to hold elsewhere, so this
  is not a port so much as a second verification programme.
- **Difficulty:** medium for MV3-to-WebExtension mechanics, high for the
  re-verification and a second monitor matrix.
- **Risk:** doubles the surface that locale and DOM changes can break, against a
  test tier that is already the project's scarcest resource.

### Theming anything beyond the color pickers

Requests to restyle other parts of the Google editors.

- **Why deferred:** out of v1 scope, and it changes what the product *is*. The
  current architecture commitment is a thin injection layer that rides Google's
  own apply path; restyling unrelated chrome means owning selectors for surfaces
  with no equivalent of the picker contract behind them.
- **Risk:** every additional selector is another thing an obfuscated-DOM change
  can break, and each one dilutes the single clear promise the store listing
  makes.

---

**Not here: the remaining border / table pickers.** They are unverified in
`docs/SPEC.md`, but they are declared **in scope for v1** by `CLAUDE.md`
("fill / text / border / table pickers"), by `docs/plan.md` (Phase 0/1 capture
work), and by `docs/SPEC.md:35` itself ("Phase-1 capture work, not feasibility
risks"). Parking them here would silently narrow v1 scope, which `CLAUDE.md`
requires an explicit ask plus an ADR to do. Tracked as ordinary work in bd
instead.

## Retired: the "Show brand colors" on/off toggle (removed 0.2.0-dev)

Existed 0.1.x in the popup, moved to settings 2026-08-22, removed the same day
at the product owner's direction: "I cant think of a single use case in which
it would make sense where they wouldnt just uninstall the extension." The
MECHANISM is intact and honored - the `enabled` key in `chrome.storage.sync`,
`getEnabled`/`setEnabled` in `lib/storage.js`, and the content script's
`getPalette()` gate - so re-adding it is a UI-only change. The worker's
migration one-time-flips a stored `false` back to `true` so a 0.1.7 user who
had toggled off is not stranded invisible with no control to find.

## Policy builder: start from an existing palette

**Status:** accepted, scheduled for the next MINOR (bd `workspace-custom-palette-uh4`).
Requested by the owner 2026-08-28, immediately after 0.2.0 shipped.

An admin who has already built their brand colors in the extension has to
retype every name and hex into the builder to publish them. That is the most
likely path into the tool, since nobody publishes colors they have not already
chosen, and it is pure transcription where a hex typo lands silently in a
policy payload.

**Difficulty:** low to moderate. `options/policy-builder.js` contains zero
`chrome.*` references today, and that is deliberate: the builder is a single
self-contained page that can be mailed to an admin who does not have the
extension. It is opened as an extension page in the normal flow, so
`chrome.storage.sync` is reachable there, but any import must feature-detect and
DEGRADE rather than gate. With no storage to read, the affordance is simply
absent and the page behaves exactly as it does now.

**Risk:** the no-chrome path is the one most likely to regress and least likely
to be noticed, because the normal flow always has chrome. It needs an explicit
test, not incidental coverage. Imports must also feed the builder's existing
validation and caps (`MAX_SWATCHES`, `MAX_PALETTES`) rather than bypassing them;
those caps shipped out of sync with `lib/palette.js` once already (roborev 4108)
and are now pinned by a test.

**Settled** (owner, 2026-08-28): import **all** palettes, and reach editor
parity by **reusing** `shared/palette-editor.js` rather than reimplementing its
rows. That module exports a container-based `mountPaletteEditor`, so the builder
can mount one per palette box and get reordering, deletion, the color chip and
the eyedropper for free, with the two editors becoming the same code rather than
merely similar.

The file-count objection turned out to be weaker than first stated: the builder
already needs two co-located files, since MV3's CSP forced its script out of the
page, so "mail it to an admin" is already "send these files together". Reuse
widens that to a small folder rather than breaking a single-file property that no
longer exists. No owner decision required.

Pasting an existing policy payload back in to edit published colors remains the
idea with the best long-run value, and is still not scheduled.
