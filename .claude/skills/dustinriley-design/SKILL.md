---
name: dustinriley-design
description: Use when building or changing any web UI in SyncFit — enforces the vendored hard-edge Dustin Riley design system (warm mid-century tokens, the recipe vocabulary, sentence-case voice, no emoji). The system is vendored at src/styles/design/, not an npm package.
user-invocable: true
---

# Dustin Riley design system (SyncFit web)

Apply this whenever you add or change web UI. The system is **vendored** at
`src/styles/design/` and pulled in by `src/app/globals.css`. Read the source of
truth before styling:

- **`src/styles/design/tokens.css`** — every token (colors, type scale, spacing,
  radii, shadows, motion, fitness/data-viz tokens). Atomic values only.
- **`src/styles/design/components.css`** — the recipe layer (`.btn`, `.card`,
  `.input`, `.seg`, `.tog`, `.chip`, `.readiness`, `.metric`, `.field`/`.field-grid`,
  `.ai-banner`, `.advice`, `.bubble`, `.sheet`, `.loader`, system overrides). This is
  the canonical list of what exists — grep it before inventing markup.
- `globals.css` adds a thin Tailwind `@theme` bridge so utility classes
  (`rounded-*`, `font-*`, `text-muted-foreground`, `bg-card`, `border-input`,
  `text-destructive`) resolve to these tokens. Layout/spacing utilities work normally.

Aesthetic: **hard-edge by default** — 1.5px ink `--rule` strokes + offset shadows +
tight radii on action surfaces. The softer pill/hairline look survives only as the
opt-in `--soft` modifiers (`.btn--soft`, `.card--soft`) for casual/floating chrome.

## Non-negotiables

- **Palette.** One primary (burnt orange `--primary` `#B8541C`); accents `--accent-ochre`
  + `--accent-teal`. The fitness overlay also names readiness (`--readiness-rested/-primed/-strained/-depleted`),
  intensity zones (`--zone-1..5`), PR (`--pr` gold + `--pr-ink`), 7 categorical data-viz
  slots (`--cat-*`), and a 7-step heat ramp (`--heat-0..6`). Use tokens by name — never
  invent colors, never hard-code hex/px.
- **Link text** uses `--link` (a darker burnt orange that clears WCAG AA on both `--bg`
  and `--surface`), never `--primary` directly — `--primary` is for button fills and
  large display surfaces, and fails AA at small text sizes.
- **Radii (5):** `--radius-block` 0, `--radius-chip` 4, `--radius-sm` 8, `--radius-md` 16,
  `--radius-pill` 999. Pill is reserved for live-state chips, toggles/segmented, and the
  `--soft` modifier family.
- **Shadows (5):** `--shadow-sm/md/lg` (warm-tinted soft) for soft chrome; `--shadow-hard`
  (4×4 ink) / `--shadow-hard-sm` (2×2) behind the canonical `.btn`/`.card`. Don't invent.
- **Type.** Outfit (display) × DM Sans (body) × JetBrains Mono (mono/labels), bound to
  `--font-display/body/mono` via `next/font` in `src/app/layout.tsx`. Sentence case
  everywhere. **No emoji.** Big measurements use `.metric` + `.metric-label`, not raw `<h1>`.
- **Motion.** One easing (`--ease-standard`), three durations (`--duration-fast/base/slow`)
  plus `--duration-celebration` (PR burst + number pop only — the single >300ms exception).
- **State signalling.** Color never carries state alone — pair it with elevation, motion,
  OR a shape/glyph (e.g. `.readiness--*` is always color + dot + label).
- **System overrides** (Reduce Motion, Increase Contrast, Reduce Transparency) are honored
  by `components.css`; respect them when adding recipes.

## When to reach for what

| If you are… | Use… |
|---|---|
| a working surface / panel (dashboard, settings, results) | `.card` |
| welcome / floating chrome (auth shell, nav dropdown) | `.card card--soft` |
| the one primary action on a screen | `.btn btn--cta` |
| secondary / cancel / ghost actions | `.btn btn--secondary` / `.btn btn--ghost` |
| a destructive confirm | `.btn btn--danger` (paired with a ghost/secondary cancel) |
| an async button (request in flight) | add `aria-busy={pending}` — the recipe renders the bar-curl loader |
| a text input / select / textarea | `.input` (it styles `[aria-invalid="true"]` itself) |
| a 2–4 option toggle (metric/sort/mode) | `.seg` wrapper + `<button>`s, active = `aria-pressed="true"` / `.on` |
| a list of flush rows under one ink rule | `.field-grid` of `.field--paper` (not individual cards) |
| surfacing model output / a verdict | `.ai-banner` + state modifier `--proceed`/`--push`/`--reduce`/`--rest` |
| coach/advice copy (directive, non-state) | `.advice` |
| a chat bubble in a sheet/drawer | `.bubble` (assistant) / `.bubble--user` (outbound) |
| a bottom sheet / drawer | `.scrim` + `.sheet` (`--compact`/`--medium`/`--large`/`--full`) with `.sheet-head/-body/-foot` |
| a live-state or status tag | `.chip` (pill radius `--pill` only for live state) / `.readiness--*` |

## Voice

First-person, sentence case, dry for chrome copy. Workout-product copy adds a coach-like
layer: directive, plainspoken, second-person ("keep the prescribed weight today"). Both
share sentence-case + no-emoji + no-exclamation-in-running-copy. For glyphs, use a Lucide
icon (`lucide-react`) or a unicode arrow (→ ↗ ↓), never emoji.

The authoritative scope/design decisions (and the original migration map) live in
`docs/superpowers/specs/` and `docs/superpowers/plans/`.
