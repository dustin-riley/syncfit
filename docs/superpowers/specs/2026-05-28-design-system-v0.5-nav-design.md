# Design-system v0.5: nav migration + conformance pass

**Status:** approved (brainstorming) — ready for implementation plan
**Date:** 2026-05-28
**Source bundle:** `syncfit-design-system` v0.5 handoff (claude.ai/design, ref `RuMCl2dEL80GzcYrEseK1g`)

## Summary

The Dustin Riley design system shipped a v0.5 release. The headline change is a
new canonical `.site-nav` recipe — an anchored hard-edge top bar with a
"connected-chip" account dropdown and a mobile rail — built specifically to
retire SyncFit's pre-v0.5 floating-pill nav (the one divergence the v0.5 cycle
set out to close). This spec covers:

1. Vendoring the new `.site-nav` recipe into the SyncFit design-system copy.
2. Replacing `src/app/(app)/site-nav.tsx` with the bundle's drop-in component.
3. One structural conformance fix surfaced by a full UI audit.
4. A durable record of the full audit findings (including deferred items).

The work is small and well-specified: the bundle provides both the exact CSS
recipe and an exact drop-in React component.

## Background: where SyncFit already stands vs v0.5

A diff of the SyncFit-vendored design files (`src/styles/design/`) against the
v0.5 bundle:

- **`tokens.css`** — already at full v0.5 token parity. Every new v0.5 token
  (`--focus-outline`, `--container-max-width`, `--rule-translucent-hatch`,
  `--fs-h4`/`--fs-h5`) is already present. The only diffs are cosmetic (hex
  case, whitespace) plus two **intentional consumer adaptations** that must be
  preserved: (a) no Google-Fonts `@import` — the app loads Outfit/DM Sans/
  JetBrains Mono via `next/font` in `src/app/layout.tsx`; (b) the mask URL
  points at the public path `/loader-bar-curl.svg` rather than the bundle's
  relative `../assets/...`. **No change to `tokens.css`.**
- **`components.css`** — identical in content **except** it is entirely missing
  the new `.site-nav` recipe (~335 lines). All other diffs are formatting from
  a past Prettier pass plus the `@import "./tokens.css"` consumer path.
- **Consumer source (`src/`)** — already clean. No live `.ds-*` classes or
  `--ds-*` tokens (the three matches are all comments/docs), no stray hardcoded
  hex outside one documented shadcn-compat Tailwind var in `globals.css`. The
  floating-pill nav is the single documented divergence.

## Scope

### 1. Vendor the `.site-nav` recipe

**Surgical insert**, not a full re-vendor. Insert the `.site-nav` recipe block
(the `============ .site-nav · canonical top navigation ============` section
through the closing `@container (max-width: 600px)` query) into
`src/styles/design/components.css`, matching the file's existing formatting.

Decision: **do not** replace the whole `components.css`/`tokens.css` with the
bundle copies. A full re-vendor would (a) produce a large noise diff from the
pre-existing Prettier formatting divergence and (b) reintroduce the Google-Fonts
`@import` and the relative mask path the app deliberately overrides. A surgical
insert keeps the diff to exactly what is new in v0.5.

The recipe references only tokens that already exist in the vendored
`tokens.css` (`--rule`, `--rule-width`, `--radius-chip`, `--accent-ochre`,
`--focus-outline`, `--border`, `--surface`, `--text`, `--text-muted`, `--bg`,
`--font-display/body/mono`, `--duration-fast/base`, `--ease-standard`,
`--space-3/6`), so no token additions are required.

### 2. Replace `site-nav.tsx`

Replace `src/app/(app)/site-nav.tsx` with the bundle's `handoff/site-nav.tsx`.
Changes:

- All inline `style={{}}` chrome → `.site-nav*` recipe classes. The only
  surviving inline style is the one-line `color: var(--error)` on the sign-out
  error text.
- Connected-chip account dropdown: `data-open={menuOpen}` on
  `.site-nav__account`; the menu is a DOM **sibling** of the account wrap (CSS
  grid positions it), so the outside-pointer-down handler tests **both** an
  `accountRef` (on `.site-nav__account`) and a `menuRef` (on `.site-nav__menu`)
  — a pointerdown inside either is "inside." This matters because `pointerdown`
  fires before `click`; testing only the wrap would unmount the menu before a
  menu item's `onClick` could land.
- Mobile responsiveness moves from Tailwind `sm:` breakpoints to the recipe's
  `@container (max-width: 600px)` query: `.site-nav__links` (full labels) and
  `.site-nav__rail` (short labels) are sibling elements the query toggles. The
  nav responds to its own inline width, not the viewport.
- Removes the `lucide-react` `ChevronDown` import (chevron is now a
  `.site-nav__chev` `▾` glyph). `lucide-react` remains a project dependency —
  other components still import from it.

**Behavior contract preserved (unchanged):**

- Outside-pointer-down + Escape dismissal, with focus returned to the trigger.
- `aria-haspopup="menu"` / `aria-expanded` / `aria-controls` (the last only set
  while the menu is mounted, per WAI-ARIA).
- Sign-out flow: `authClient.signOut()`, inline error on failure, hard
  navigation to `/login` on success (so server components re-render
  unauthenticated against the cleared cookie).
- `src/lib/nav.ts` (`NAV_ITEMS`, `isActivePath`) reused as-is; `shortLabel` now
  feeds the mobile rail instead of a Tailwind-hidden span. The `proxy.ts`
  matcher and the `nav.ts` unit tests are untouched.

### 3. Structural conformance fix

The full audit (Section "Audit findings" below) found **no high-severity
violations**. With copy edits explicitly out of scope (see decision below),
exactly one structural fix remains:

- **`src/app/(app)/log/page.tsx`, kind selector (~L71–88)** — a hand-rolled
  pair of `.btn`/`.btn--ghost` toggle buttons with `aria-pressed` duplicates the
  `.seg` segmented-control recipe. The same two-option `aria-pressed` toggle is
  already implemented correctly via `.seg` in
  `progress-workspace.tsx`'s `PillToggle`. Adopt the `.seg` recipe here for
  consistency.

### 4. Written findings doc

This spec is the durable record. The full audit findings (including deferred
cosmetic items and the copy-voice inconsistency) are recorded below.

## Decisions

- **Copy left as-is.** SyncFit headings/labels are currently inconsistent (some
  all-lowercase — `weekly plan`, `log a workout`, `devices`; some Title-case —
  `Import Strong CSV`). The DS rule is sentence-case (capitalize the first word
  only). Per user decision, **no copy is changed in this pass**; the
  inconsistency is documented here for a later, separate decision.
- **`chart-card.tsx` stroke stays `--accent-teal`.** The progression chart is a
  single series with no categorical meaning; `--accent-teal` is a valid brand
  token. Forcing a `--cat-*` data-viz token would be semantically wrong. No
  change.
- **No full re-vendor of the CSS files** (see Section 1).

## Audit findings (full record)

Conformance audit of all signed-in + auth surfaces against the v0.5 recipes and
tokens. Rules: (1) hardcoded hex/px that should be a token — inline
`style={{}}` *referencing* a token is allowed; (2) hand-rolled UI duplicating a
recipe; (3) link text using `--primary` instead of `--link`; (4) copy not
sentence-case / emoji / exclamation; (5) v0.5 primitive adoption opportunities
(`.container`, `.h1`–`.h5`).

**No high-severity findings in any file.** No hardcoded hex in component files,
no `--primary`-on-link-text, no wholesale recipe duplication. All inline styles
reference tokens (the allowed case).

### Acted on

- **`log/page.tsx` L71–88** (rule 2, medium) — kind selector duplicates `.seg`.
  → adopt `.seg`. **(Section 3)**

### Deferred (documented, not changed)

- `training-week.tsx` L146–186 (rule 2, low) — inline `fontVariantNumeric:
  "tabular-nums"` on measurement cells where `.metric` exists. Cosmetic.
- `chart-card.tsx` L126 (rule 1, borderline) — stroke `--accent-teal` vs a
  data-viz token. Decided: leave (single-series, no categorical meaning).
- `progress-workspace.tsx` L73,77 (rule 3-adjacent, low) — redundant inline
  `var(--link)` on `<a>` links (the element default already supplies `--link`).
- `progress-workspace.tsx` L59,70 (rule 5, low) — `p-4` overrides `.card`'s
  canonical `--space-5` padding.
- `import/page.tsx` L13 (rule 1, low) — inline `var(--text-muted)` could use
  `.caption` / the `text-muted-foreground` bridge utility.
- `import/page.tsx` L27 (rule 2, low) — file `<input>` lacks `.input` (file
  inputs are a known recipe edge case).
- `devices-client.tsx` L134–143 (rule 2, low) — pairing code uses `.display` +
  inline mono instead of the idiomatic `.metric .metric-md`.
- `auth-form.tsx` L129 (rule 2, low) — `disabled:cursor-not-allowed
  disabled:opacity-60` re-implements the built-in `.btn:disabled` (and at 0.6 vs
  the system's 0.4).
- `log/page.tsx` L91,163 (rule 2, low) — `.metric-label` reused as a form-field
  label; no dedicated field-label recipe exists in the vendored set, so this is
  a reasonable reach.
- **Copy-voice inconsistency** (rule 4) — lowercase vs Title-case headings/
  labels across pages (`weekly plan`/`log a workout`/`devices` vs `Import
  Strong CSV`; buttons `add exercise`/`build with ai` vs `Save plan`).
  Left as-is per decision above.

### Exemplary (no findings)

`verdict-banner.tsx` (textbook `.ai-banner` usage), `page.tsx` and
`plan/page.tsx` and `progress/page.tsx` (already adopt `.container` + `.h1`/
`.h4`), `field.tsx`, `(auth)/layout.tsx`, `login`/`signup` pages, `globals.css`
(the `@theme` bridge is correct).

## Files touched

- `src/styles/design/components.css` — insert the `.site-nav` recipe block.
- `src/app/(app)/site-nav.tsx` — replace with the v0.5 handoff component.
- `src/app/(app)/log/page.tsx` — kind selector adopts `.seg`.
- `docs/superpowers/specs/2026-05-28-design-system-v0.5-nav-design.md` — this
  spec.

## Out of scope / non-goals

- No `tokens.css` change (already at v0.5 parity).
- No full re-vendor / reformat of the design-system CSS files.
- No copy/voice normalization (deferred by decision).
- No removal of `lucide-react` (still used elsewhere).
- The deferred cosmetic findings above.

## Verification

Client-UI-only change; no DB or server-action paths touched.

- `npm test` (offline unit tests — `nav.ts` tests unchanged, must stay green)
- `npx tsc --noEmit`
- `npm run lint`
- `npm run format:check`
- `npm run build`

Integration tests and the iOS build are not required (no server-action/DB/iOS
changes). Manual visual check of the nav at desktop and < 600px widths
(connected-chip dropdown seam, mobile rail) is recommended.
