# Design-System Adoption — `@dustin-riley/design`

**Date:** 2026-05-16
**Branch:** `feature/design-system`
**Status:** Approved (brainstorming) — pending spec review

## Context

This executes the scheduled §11 migration from the SyncFit MVP spec
(`docs/superpowers/specs/2026-05-16-syncfit-mvp-design.md`), with a correction:
the published package is **`@dustin-riley/design`** (scoped, hyphenated). All
existing docs (CLAUDE.md, MVP spec §0/§2a/§11, MVP plan) incorrectly say
`@dustinriley/design` / `dustinriley/design`.

This is not a cosmetic parity swap. The current `globals.css` shim is
**tokens-only** (spec §0: "tokens/bridge ONLY, no furniture"), but components
already reference `.ds-container`, `.ds-panel`, `.ds-btn`, `.ds-btn-primary`,
`.ds-mono-note`, etc. Those primitive classes are currently **no-ops** — the
package's `core.css` is what defines them. Adopting the package will visibly
style the UI, not merely preserve appearance.

The migration discipline held: no hard-coded hex/px leaked into components, so
the swap is clean.

## Decisions

1. **Import strategy: single import.** The published package README contract
   evolved since the MVP spec was written. For Tailwind v4 + shadcn projects,
   `@import "@dustin-riley/design/tailwind.css"` transitively pulls in
   `core.css` → `tokens.css` — one import is the whole contract. The MVP spec
   §2a/§11 (three explicit imports) is superseded and will be updated to match.
2. **Bundled Claude skill: enabled in-repo.** Per MVP spec §11 step 4. The
   package ships `skill/dustinriley-design/SKILL.md`; it is vendored verbatim
   into `.claude/skills/dustinriley-design/SKILL.md` and checked in, with a
   CLAUDE.md note to re-sync on version bump.
3. **Exact version pin.** `@dustin-riley/design@0.2.3`, no `^` — the design
   surface must not shift under the app between installs.
4. **No trace of the migration in living docs.** The MVP spec/plan and
   CLAUDE.md are rewritten to read as if the package was always consumed; the
   shim → package history survives only here and in git (see §4).

## Changes

### 1. Dependency

`npm i @dustin-riley/design@0.2.3` — exact pin, added to `dependencies` in
`package.json`. Verify `package.json` records `"0.2.3"` (no caret).

### 2. `globals.css`

Replace the entire vendored shim block — from the
`/* === VENDORED DESIGN-SYSTEM SHIM ... === */` opener through
`/* === END SHIM === */` (current lines 3–92) — with a single package import.
Final file:

```css
@import "tailwindcss";
@import "@dustin-riley/design/tailwind.css";
```

`tailwind.css` delivers, in one line: `--ds-*` tokens + focus ring
(`tokens.css`), the `.ds-*` primitive vocabulary and minimal base element
styling (`core.css`), and the Tailwind v4 `@theme` radius map + shadcn HSL
bridge generated from tokens.

`src/app/layout.tsx` is **not** changed: it loads Outfit / DM Sans /
JetBrains Mono via `next/font` and overrides `--ds-font-*` on `<html>`. The
package is framework-free CSS and loads no fonts by design; the app-side
override remains the source of the font families.

### 3. Bundled Claude skill

- Create `.claude/skills/dustinriley-design/SKILL.md` as a verbatim copy of
  `node_modules/@dustin-riley/design/skill/dustinriley-design/SKILL.md`.
- This is the project's first `.claude/` content; create the directory tree.
- Add a CLAUDE.md note: re-sync this file from the package whenever the
  `@dustin-riley/design` version is bumped (drift bounded by the exact pin).

### 4. Documentation — erase the migration, don't annotate it

Intent: the living docs must read as if SyncFit **always** consumed
`@dustin-riley/design`. Leave **no trace** that a vendored shim or a migration
ever existed — no "formerly", no "now adopted", no §0 copy-first sequencing, no
§11 migration task, no breadcrumb comments. The historical record (that there
was an interim shim, why, and how it was removed) lives **only** in git history
and in this adoption spec, which is the audit trail. The MVP spec, MVP plan,
and CLAUDE.md become trace-free.

- **`globals.css`** — no `=== SHIM ===` / "replace with package imports"
  comments survive. The final file is exactly the two `@import` lines in §2,
  nothing else.
- **CLAUDE.md** — delete the "Design system is a vendored shim on this branch"
  gotcha entirely. Replace with a plain present-tense statement: the project
  consumes `@dustin-riley/design` via a single
  `@import "@dustin-riley/design/tailwind.css"`; the design rules apply
  (reference `--ds-*` tokens / `.ds-*` classes, never hard-code hex/px; 3 radii
  8/16/999; warm shadows only; sentence case; no emoji); re-sync the vendored
  skill on version bump (§3). No mention of a prior shim or migration.
- **MVP spec** (`2026-05-16-syncfit-mvp-design.md`) — **remove** §0
  (design-system sequencing / copy-first) and §11 (scheduled migration)
  outright; renumber as needed. Rewrite §2a to describe steady state only:
  SyncFit consumes `@dustin-riley/design` via the single `tailwind.css`
  import, exact-pinned, fonts app-side, skill vendored. No "interim",
  "shim", "until published", "end state", or three-import language.
- **MVP plan** (`docs/superpowers/plans/2026-05-16-syncfit-mvp.md`) — remove
  the shim build step / migration-later framing from the intro, Task 1, and
  §11; the plan reads as if Task 1 always installed and imported the package.
- Across all files: no surviving `@dustinriley/design` / `dustinriley/design`
  string, and no surviving word that implies a transition occurred.

### 5. Verification (parity check)

All must pass before the branch is done:

- `npm run build`
- `npx tsc --noEmit`
- `npm run lint`
- `npm run format:check`
- `npm test` (offline unit tests stay green/offline)
- `grep -rnE '#[0-9a-fA-F]{3,6}\b|[0-9]+px' src --include="*.tsx" --include="*.ts"`
  excluding `globals.css` — expect no leaked hard-coded hex/px (already clean;
  any hit is migration debt fixed here, not carried forward).

**Visual-parity note (MVP spec §11 step 3):** the package generates the shadcn
HSL bridge from tokens, so values differ slightly from the hand-converted shim
(e.g. `--background 36 48% 96% → 36 50% 96%`, `--foreground 33 20% 10% →
33 22% 10%`). The **generated values are canonical** — accept the diff, do not
reconcile back to the old shim numbers.

Integration tests (`npm run test:integration`) are **not** required: no
server-action / DB paths are touched.

## Out of scope (YAGNI)

- No shadcn React component scaffolding (Button/Card/etc. via shadcn CLI) —
  the package's bridge themes them automatically if/when added later.
- No component refactors, no new site furniture (nav/footer/hero), no font
  changes.
- No per-user theming, no dark mode.

## Risks

- **Import order / Tailwind v4:** `@import "tailwindcss"` must precede the
  package import so Preflight and the package `@layer base` / `@theme` compose
  correctly. Mitigated by the fixed two-line `globals.css` order in §2 and the
  `npm run build` check.
- **Visual shift is expected, not a regression:** `.ds-*` primitives go from
  no-op to styled. This is the intended outcome; reviewers should expect the
  dashboard / readiness card / forms / buttons to change appearance.
- **Skill copy drift:** the vendored `.claude/skills/...SKILL.md` can drift
  from the package. Bounded by the exact version pin + the CLAUDE.md re-sync
  note.
