# Design system migration — `@dustin-riley/design` v0.5 (hard-edge) — design

**Date:** 2026-05-27
**Status:** approved (design); awaiting user review before plan
**Topic:** Migrate SyncFit's web frontend from the installed soft-aesthetic `@dustin-riley/design@0.5.0` npm package to the vendored hard-edge "athletic" evolution of the Dustin Riley Design System delivered as a Claude Design handoff bundle.

## Source of truth

The new design system arrived as a handoff bundle (`syncfit-design-system/`) from Claude Design. The two files that get vendored are:

- `project/tokens/tokens.css` — atomic token layer (unprefixed names: `--bg`, `--surface`, `--rule`, `--primary`, the fitness overlay, v0.3 mobile/touch/safe-area additions).
- `project/web/components.css` — the web recipe layer (`@import`s tokens.css; defines `.btn`, `.card`, `.field`, `.chip`, `.seg`, `.tog`, `.input`, `.readiness`, `.metric`, `.ai-banner`, `.advice`, `.bubble`, `.sheet`, `.pr-badge`, zone utilities, `.loader`, celebration motion, and the v0.3 system overrides).

Plus two assets referenced by the recipes: `project/assets/loader-bar-curl.svg` (the `--mask-loader-bar-curl` mask) and `project/web/celebrate.js` (burst + number-pop helpers).

The bundle's `README.md` contains an authoritative **SyncFit surface migration map** (resolves its own G-05) — each of the 19 current `.ds-panel` instances is pre-assigned to a specific new recipe. This spec adopts that map verbatim.

### The aesthetic shift

The installed package is the **soft** mid-century look: pill buttons, 1px hairlines, warm soft shadows, rounded 16px panels (`.ds-panel`, `.ds-btn`, `.ds-ai`). The new system is **hard-edge by default**: 1.5px ink `--rule` strokes, 4×4 hard offset shadows, `--radius-chip` (4px) action surfaces, ink-filled "on" states. The soft look survives only as opt-in `--soft` modifiers (`.btn--soft`, `.card--soft`) for casual/floating chrome.

## Goals

1. Replace the npm-package design layer with vendored, version-controlled CSS.
2. Adopt the new (unprefixed) token names everywhere — retire `--ds-*` entirely.
3. Re-skin every existing surface to the new recipes per the bundle's migration map.
4. Keep all current pages, routes, features, server actions, and data unchanged — this is a presentational migration.
5. Keep the full verification gate green.

## Non-goals (explicitly deferred)

- The rich `web/mocks/SyncFit Dashboard.html` composition — orange "today's lift" hero, readiness gauge, stacked weekly-load bar chart, PR celebration card, streak counter, activity feed. These introduce new features/data the app does not have. The mock is illustrative only.
- Any new product feature (PRs, streaks, RPE, zones-as-data). Zone/PR/heat tokens are vendored (they ship with the system) but only wired where a current surface already has the concept.
- The iOS consumer (`ios/SyncFit/`, `Tokens.swift`). Per the platform-additive policy, iOS is a separate consumer and is untouched here.
- Publishing a new npm package version. We can't publish to npm; vendoring is the chosen delivery.

## Architecture

### Delivery — vendored CSS

New directory:

```
src/styles/design/
  tokens.css           # verbatim from bundle, MINUS the Google Fonts @import line
  components.css       # verbatim from bundle (@imports ./tokens.css)
  loader-bar-curl.svg  # referenced by --mask-loader-bar-curl in tokens.css
  celebrate.js         # vendored; wired only as an optional flourish (see below)
```

`src/app/globals.css` becomes:

```css
@import "tailwindcss";
@import "../styles/design/components.css";

@theme {
  /* thin Tailwind bridge — maps utility classes onto the NEW tokens */
}
```

Remove `@dustin-riley/design` from `package.json` `dependencies`. After `npm install` the package is gone; nothing imports it.

### Fonts

Keep Next's `next/font/google` optimization (avoids the render-blocking Google Fonts `@import` and FOUT). In `src/app/layout.tsx`, rebind the three font CSS variables from `--ds-font-display/body/mono` to the names the new recipes expect: `--font-display`, `--font-body`, `--font-mono`. Because Next now supplies those variables, **delete the `@import url('https://fonts.googleapis.com/...')` line** at the top of the vendored `tokens.css` so the faces aren't loaded twice. (The token file's `--font-*` declarations stay; Next's variables override the family names at the `<html>` level exactly as the `--ds-font-*` binding does today.)

### Tailwind bridge (`@theme`)

A small `@theme` block in `globals.css` keeps Tailwind utilities resolving to the **new** tokens. Layout/spacing utilities (`p-4`, `flex`, `gap-2`, `my-3`, `max-w-md`, …) are core Tailwind and need nothing. The bridge covers:

- **Radii** — map `--radius-*` Tailwind keys to the system's allowed radii (block 0 / chip 4 / sm 8 / md 16 / pill 999) so `rounded-*` utilities stay on-system.
- **Fonts** — `--font-display/body/mono` so `font-display` etc. resolve.
- **Semantic color utilities still in use** (≈7 spots) → new tokens:
  - `text-muted-foreground` → `--text-muted`
  - `text-foreground` → `--text`
  - `bg-card` → `--surface`
  - `border-input` → `--rule`
  - `text-destructive` / `border-destructive` → `--error`

These are bridged (not per-file-edited) because they're Tailwind utilities, not design-system classes. The "no bridge" decision below applies to `--ds-*` tokens and `.ds-*` classes, not to Tailwind's own `@theme`.

## Token migration — `--ds-*` fully retired

Mechanical rename across the ~132 inline `var(--ds-*)` references in `src/` (15 files). The overwhelming majority just drop the `ds-` prefix:

| Old prefix family | New |
|---|---|
| `--ds-bg`, `--ds-surface`, `--ds-surface-sunken`, `--ds-border`, `--ds-text`, `--ds-text-muted` | drop prefix (`--bg`, `--surface`, …) |
| `--ds-primary`, `--ds-primary-hover`, `--ds-primary-pressed`, `--ds-link`, `--ds-link-hover` | drop prefix |
| `--ds-accent-ochre`, `--ds-accent-teal` | drop prefix |
| `--ds-success`, `--ds-warning`, `--ds-error`, `--ds-on-primary` | drop prefix |
| `--ds-surface-ai`, `--ds-on-surface-ai` | drop prefix |
| `--ds-fs-*`, `--ds-lh-*`, `--ds-tracking-*` | drop prefix |
| `--ds-space-N` | `--space-N` |
| `--ds-radius-sm/md/pill` | `--radius-sm/md/pill` |
| `--ds-shadow-sm/md/lg` | `--shadow-sm/md/lg` |
| `--ds-duration-*`, `--ds-ease-standard` | drop prefix |

One judgment-call mapping touches `src/` (verified by grep — `--ds-border-width` is referenced 7 times):

| Old | New | Rationale |
|---|---|---|
| `--ds-border-width` (1px) | `--rule-width` (1.5px) on action/structural surfaces; `1px solid var(--border)` for soft hairlines | The new system splits "structural ink rule" (1.5px) from "soft hairline" (1px). Pick per surface. |

Two further name gaps exist in the token *vocabulary* but are **not referenced in `src/`**, so they need no inline rename — noted only so the implementer doesn't go hunting:

- `--ds-accent-plum` — no new equivalent (`#6E3A5E` = `--cat-core` if ever needed); 0 uses in `src/`.
- `--ds-fs-h6` / `--ds-lh-h6` — new type scale stops at h5; 0 uses in `src/`.

**Focus model** changes globally via the CSS swap, not per file: the old package's `:focus-visible { outline: 2px @ 40% glow }` is gone, replaced by the vendored recipes' solid `--focus-outline` (3px `--primary`). No `src/` inline focus styles reference the old token, so there is no per-file focus work.

**Acceptance:** `grep -rn "\-\-ds-" src` returns zero matches.

## Component migration — the bundle's 19-surface map

Adopted verbatim from the bundle README. Per-surface:

| # | Surface | File | New recipe |
|---|---|---|---|
| 1 | auth login shell | `(auth)/layout.tsx` | `.card--soft` (welcome tone) |
| 2 | settings · device error banner | `settings/devices/devices-client.tsx` | `.card` |
| 3 | settings · pair device section | `settings/devices/devices-client.tsx` | `.card` |
| 4 | settings · paired device list | `settings/devices/devices-client.tsx` | `.card` |
| 5 | progress · chart card | `progress/chart-card.tsx` | `.card` |
| 6 | progress · chart error boundary | `progress/chart-card-boundary.tsx` | `.card` |
| 7 | progress · empty CTA ×2 | `progress/progress-workspace.tsx` | `.card` |
| 8 | progress · filter pill row | `progress/progress-workspace.tsx` | **`.seg`** (the `PillToggle` becomes a segmented control: `.seg > button` with `.on`/`aria-pressed="true"` for the active value) |
| 9 | plan editor · day block | `plan/plan-editor.tsx` | `.card` |
| 10 | plan chat · drawer surface | `plan/plan-chat-drawer.tsx` | **`.sheet sheet--large`** + `.scrim` |
| 11 | plan chat · message bubbles | `plan/plan-chat-drawer.tsx` | **`.bubble`** (assistant) + `.bubble--user` (outbound) |
| 12 | dashboard · today session | `dashboard/today-session.tsx` | `.card` |
| 13 | dashboard · progression inbox row | `dashboard/progression-inbox.tsx` | `.card` |
| 14 | dashboard · verdict banner | `dashboard/verdict-banner.tsx` | **`.ai-banner`** + per-verdict state modifier |
| 15 | dashboard · activity panel | `(app)/page.tsx` | `.card` |
| 16 | dashboard · activity rows (`<li>`) | `(app)/page.tsx` | **`.field-grid` of `.field--paper`** |
| 17 | log · result panel | `log/page.tsx` | `.card` |
| 18 | import · result panel | `import/page.tsx` | `.card` |
| 19 | site nav · floating dropdown | `(app)/site-nav.tsx` | `.card--soft` (floating chrome) |

### Notable transformations beyond a class swap

- **Verdict banner → `.ai-banner`** (`verdict-banner.tsx`): rebuild markup to the recipe's slots — `.ai-banner__eyebrow` ("the model says · {model}" + bot glyph), `.ai-banner__verdict` (icon + label), `.ai-banner__headline`, `.ai-banner__body`. Map verdicts to state modifiers: `proceed_as_planned`→`--proceed`, `push_harder`→`--push`, `reduce_intensity`→`--reduce`, `rest`→`--rest`. Drop the inline `--ds-*` token coloring (the modifier colors the verdict line).
- **Progress filter → `.seg`** (`progress-workspace.tsx`): the generic `PillToggle` is reimplemented as a `.seg` wrapper with `<button>` children; active option gets `aria-pressed="true"` (and/or `.on`). Keep the generic typed component API (`options/value/onChange`).
- **Plan chat drawer → bottom sheet** (`plan-chat-drawer.tsx`): the recipe `.sheet` is a **bottom** sheet (fixed full-width at viewport bottom), whereas the current UI is a **right-side** drawer (`justify-end`, `max-w-md`, full height). Adopting the recipe changes the drawer's position from right to bottom. **All behavior is preserved**: focus trap, Escape-to-close, the backdrop-click guard while a proposal is `pending` (ephemeral chat), focus restore on close, and the "apply this plan to the editor" button. Use `.scrim` for the backdrop, `.sheet-head`/`.sheet-body`/`.sheet-foot` for structure, `.sheet-close` for the X, and `.bubble`/`.bubble--user` for messages.
- **Activity rows → `.field-grid`** (`(app)/page.tsx`): the `<ul>` of `<li>` rows becomes a `.field-grid` whose children are `.field--paper` blocks (the 1.5px ink rule is the only divider — no per-row padding rings).
- **Buttons** across all files: `.ds-btn ds-btn-primary`→`.btn`; `.ds-btn ds-btn-ghost`→`.btn .btn--ghost`; `.ds-btn ds-btn-secondary`→`.btn .btn--secondary`. The single primary CTA per screen (e.g. "analyze readiness", "save plan", "import") additionally gets `.btn--cta`.
- **Async/in-flight buttons** get `aria-busy="true"` while a request is pending — the recipe auto-renders the bar-curl loader via `::before`. Targets: analyze readiness, save plan week, import CSV, log workout, plan-chat send, device pair. (Replaces ad-hoc "thinking…"/"analyzing…" text where present; keep a polite live region if one exists.)
- **Inputs/select/textarea** → `.input` (`(auth)/field.tsx`, plan editor rows, log form, plan-chat input, import form). The plain `border rounded p-2` input in plan-chat becomes `.input`.
- **Readiness state** (today-session / verdict): use `.readiness--rested/-primed/-strained/-depleted` for any live readiness pill (color + glyph + label together — never color alone).
- **Big numbers**: any large measurement (readiness score, weekly load, e1RM headline) uses `.metric` + `.metric-sm/md/lg` with a `.metric-label`, not raw `<h1>`.
- **recharts recolor** (`progress/chart-card.tsx`): series colors move from `var(--ds-accent-teal)` / shadcn `chart-*` to the new data-viz tokens — primary series `--accent-teal` or `--primary`; if multiple categories ever render, use `--cat-*`. The chart card chrome becomes `.card`.
- **Leftover soft `.ds-*` classes not in the map** (`.ds-mono-note` ×24, `.ds-container` ×6, `.ds-caption` ×4, `.ds-display` ×2, `.grid-label` ×6, `.ds-page-header`, `.ds-back-link`, `.kbd`): convert to the new system's equivalents —
  - `.ds-mono-note` / `.grid-label` → `.metric-label` or a `.caption`/mono inline style (mono, uppercase, muted) per context.
  - `.ds-container` → `.container` (the new page-level wrapper utility).
  - `.ds-caption` → `.caption`.
  - `.ds-display` → `.display`.
  - `.ds-page-header` / `.ds-back-link` / `.kbd` → compose from new primitives (heading + `.caption` eyebrow; a muted inline link; `.chip` for kbd) — decided per use site during implementation.

**Acceptance:** `grep -rEn "ds-(panel|btn|ai|caption|display|lede|container|section|page-header|back-link|mono-note)" src` returns zero matches; `grep -rn "ds-ai-mark\|grid-label" src` returns zero matches.

### celebrate.js scope

`celebrate.js` and the celebration recipes (`.burst`, `.pop`) are vendored because they ship with the system. Wiring is **optional** and limited to at most one moment: a successful readiness analysis (number-pop on the score). It is acceptable to vendor-but-not-wire in this pass and leave it for a follow-up. No PR/streak celebration (those features don't exist).

## Hard constraints to preserve (from CLAUDE.md)

- **Controlled forms stay controlled.** `plan/plan-editor.tsx` and the `(auth)/field.tsx` inputs must keep `value`+`onChange` (React 19 calls `form.reset()` after `<form action>` submit; uncontrolled fields would visually revert). Class/style swaps only — do not reintroduce `defaultValue`.
- **`savePlanWeek` field names unchanged**: `title-/notes-/modality-{0..6}`, `rowCount-{dow}`, `ex-{dow}-{row}-{name|sets|reps|weight}`, with the positional row `name` index intact.
- **Route-group structure unchanged.** Don't move pages out of `(app)`/`(auth)`; don't add nav to the root layout; `proxy.ts` matcher untouched.
- **Single timezone** (`APP_TZ`); no behavioral/data changes.
- Server actions, API routes, lib modules, and the pure/loader split are not touched.

## Verification

No new automated tests (presentational change). The existing gate must stay green:

- `npm test` (offline unit) — still green; no logic changed.
- `npx tsc --noEmit` — type check.
- `npm run lint` and `npm run format:check`.
- `npm run build` — production build, including CSS resolution of the vendored `@import`s and the loader SVG mask path.
- Manual browser pass (`npm run dev`) of every migrated page — dashboard (`/`), `/plan` (+ chat sheet), `/progress`, `/import`, `/log`, `/settings/devices`, `/login`, `/signup`. Verify the golden path and the **controlled-form reset edge case** (save plan / submit auth and confirm fields don't revert). Confirm async buttons show the bar-curl loader and re-enable.
- `npm run test:integration` only if a server-action/DB path is incidentally touched (not expected).

Final greps (all must be empty over `src/`): `--ds-`, `ds-panel`, `ds-btn`, `ds-ai`, `ds-mono-note`, `ds-container`, `grid-label`.

## Risks / open questions

- **Plan-chat right-drawer → bottom sheet** is the one real UX change (position), prescribed by the map. Behavior preserved; flagged for the user's awareness.
- **Visual density**: the hard-edge aesthetic (offset shadows, ink rules) is heavier than the current soft look across many small surfaces (settings rows, progression inbox). Expect to tune spacing during the manual pass.
- **`.field-grid` activity rows**: requires the activity list markup to become sibling `.field--*` blocks under one ruled grid rather than gapped cards — a small structural rewrite of `(app)/page.tsx`'s list.
