# Design

Visual system for the extension's own pages (popup, options, feedback). The
injected "Brand" row inside Google's picker is deliberately excluded: it clones
Google's markup to look native and is not themed here. Tokens live in
`shared/theme.css` and propagate to all three pages.

## Visual Theme

Crafted utility, warm and earthy, not the cool Material default of the category.
Quiet brand-tinted neutrals carry the surface; a single committed Poppy accent
and a live brand-stripe mark carry the identity. Dual theme, both first-class:
light is a warm near-white, dark is built on Night (#1A2D27), not charcoal.

Color strategy: **Restrained-to-Committed.** Tinted neutrals + one accent
(Poppy) used for primary fills, links, focus, and the mark. The surface is never
drenched: the swatches the user edits must stay the only loud colors on screen.

## Color (authored as OKLCH; all pairs verified WCAG AA)

Brand palette (also the packaged default): Cloud `oklch(96.9% 0.013 82)`,
Sky `oklch(84.9% 0.066 190)`, Poppy `oklch(67.9% 0.212 38)`,
Sunshine `oklch(82% 0.159 91)`, Rose `oklch(76.5% 0.089 19)`,
Grass `oklch(42.5% 0.069 142)`, Night `oklch(27.9% 0.027 172)`.

| Token | Light | Dark | Role |
|---|---|---|---|
| `--bg` | `oklch(99.3% 0.004 56)` | `oklch(23.4% 0.021 169)` | page surface (no pure #fff/#000) |
| `--row` | `oklch(96.3% 0.007 68)` | `oklch(28.8% 0.026 167)` | raised row / preview |
| `--fg` | `oklch(27.3% 0.017 171)` | `oklch(93% 0.012 80)` | body text (Night-tinted ink) |
| `--muted` | `oklch(51.4% 0.013 90)` | `oklch(74.1% 0.024 160)` | secondary text |
| `--border` | `oklch(91% 0.013 71)` | `oklch(36.2% 0.031 166)` | hairlines |
| `--accent` | Poppy | Poppy | interactive **fill** only |
| `--accent-ink` | Night | Night | text/icon **on** the accent fill |
| `--accent-text` | `oklch(51.8% 0.164 38)` | `oklch(78.6% 0.141 53)` | links + accent text on `--bg` |
| `--danger` | `oklch(55% 0.16 28)` | `oklch(72% 0.13 30)` | destructive / invalid |

Rule: Poppy is a fill, never a text color on the page background. Text/links use
`--accent-text` (a deepened Poppy in light, a lightened Poppy in dark). Text on a
Poppy fill is Night (`--accent-ink`), not white (white on Poppy fails AA).

## Typography

System stack (no web fonts: CSP-safe, offline, on-brand with the no-network
ethos). Hierarchy by scale + weight, ratio >= 1.25.

- Wordmark: 13px, weight 700, letter-spacing 0.02em, `--fg`.
- Page title (`h1`): 18-20px / 700.
- Body: 14px / 1.5, capped ~64ch on the feedback page.
- Meta / status / hint: 12px, `--muted`.
- Mono (diagnostics preview, hex inputs): `ui-monospace, Menlo, monospace`.

## Brand mark

`.brandmark`: an 18px rounded square filled with hard-stop stripes of the brand
colors (Cloud, Sky, Poppy, Sunshine, Rose, Grass, Night) via a single
`linear-gradient`, with a 1px inset border. Pure CSS, no DOM, identical on every
page; echoes the striped toolbar icon. Paired with the wordmark in a `.brandbar`.
The `--brand-1..7` tokens track the packaged default palette.

## Spacing & shape

Scale: `--space-1..6` = 4 / 8 / 12 / 16 / 24 / 32px. Vary for rhythm; the header
gets more breathing room than dense rows. Radius: `--radius-sm` 6, `--radius` 8,
`--radius-lg` 12px.

## Components

- **Buttons.** Default: `--bg` fill, `--border`, `--fg`. Primary: Poppy fill +
  Night text. Link-button: `--accent-text`, no border. All get hover (subtle
  bg/border shift), `:focus-visible` ring, `:active` (translateY 1px), disabled
  (0.45 opacity). 28px+ hit height.
- **Toggle.** A real switch (track + knob), Poppy when on, animated knob.
- **Inputs / textarea.** `--border`, focus ring in `--accent-text`; invalid uses
  `--danger` border + faint tint.
- **Trash remove.** Icon-only, muted at rest, `--danger` on hover/focus.
- **Focus ring.** `box-shadow: 0 0 0 3px <accent-text @ ~30% alpha>` + 1px solid
  border, never `outline:none` without replacement.

## Motion

`--ease` = `cubic-bezier(0.22, 1, 0.36, 1)` (ease-out-quint), `--dur` 160ms.
Transition color/background/border/shadow/transform only, never layout
properties. Status text fades in. All wrapped in `@media (prefers-reduced-motion:
reduce)` to disable.
