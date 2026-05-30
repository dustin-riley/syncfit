# `.fig` aligned-figure primitive — adoption design

**Date:** 2026-05-30
**Status:** approved (brainstorming)
**Bundle ref:** `UE-8vqOumILzbaoC2WpjWQ` (Dustin Riley design system, v0.5)

## Problem

The v0.5 changelog ships one recipe the consumer never adopted: **`.fig`**, the
aligned-figure primitive. It is the only substantive item in the bundle's
canonical `web/components.css` that is missing from the repo's vendored
`src/styles/design/components.css` — every other v0.5 addition (`.site-nav`,
`.password-field`, `.field-label`, `.alert-text`, `.container`, the `.h*`
classes, all new tokens) is already present. A whole-file diff of the two CSS
files shows the only non-Prettier delta is the absent `.fig` block.

`.fig` exists because inline `font-variant-numeric: tabular-nums` is a **silent
no-op** on the DM Sans + Outfit webfonts Google Fonts serves (the `tnum`/`zero`
lookups are stripped from the served files, and the CSS2 `@import` API has no
feature parameter to re-enable them). The fix routes column-aligned figures to
the **mono** face, which is tabular by construction. That exact inert inline
workaround is still live in the consumer at
`src/app/(app)/dashboard/training-week.tsx:170` — the `weight×reps` table cells.

## Scope

Vendor `.fig`, adopt it at the one genuine column, bump the pairing code size,
and reconcile the cleanup backlog. No DB / integration / iOS paths are touched.

### 1. Vendor the recipe

Insert the bundle's `.fig` block — full explanatory comment plus rule — into
`src/styles/design/components.css` between `.metric-label` and the `.field-label`
comment (its exact position in the bundle). Keep it byte-faithful to the bundle,
Prettier-formatted to match repo convention (the `font-feature-settings` wraps
multi-line exactly like `.metric` does):

```css
.fig {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums slashed-zero;
  font-feature-settings:
    "tnum" 1,
    "zero" 1;
}
```

No Tailwind `@theme` bridge change: `.fig` is a direct recipe class (used as
`className="fig"`, like `.metric`), and `--font-mono` already exists.

### 2. Adopt at the one true column

`src/app/(app)/dashboard/training-week.tsx:170` — remove the inline
`fontVariantNumeric: "tabular-nums"` line from the `weight×reps` `<td>` and add
`className="fig"`. This routes the column to the mono face so the cells actually
line up (tabular by construction), and removes the inert inline request. The
per-cell inline `color` / `fontWeight` / `width` / padding logic is untouched —
`.fig` only sets the face and figure variant, so the top-set color/weight styling
still composes on top.

### 3. Pairing code: bump to `.metric metric-lg`

`src/app/(app)/settings/devices/devices-client.tsx:132` — change
`className="metric metric-md"` to `className="metric metric-lg"`. The pairing
code stays on `.metric` (display face) rather than moving to `.fig`: it is a
single static value, not a column, so it gains nothing from mono alignment, and
the system's own rule is *"only figures that line up in a column move to mono;
hero numbers stay in Outfit."* The size bump (`md` → `lg`) makes the code more
prominent to read and type. (User call: bigger is wanted.)

### 4. Reconcile `docs/design-system-cleanup.md`

- Flip the `[~]` "training-week.tsx L170 — left inline by decision" item to
  `[x]`: the `.fig` primitive now exists upstream and the cells adopt it; the
  "no tabular-nums-only primitive" rationale no longer holds.
- Close the `[upstream]` "Lightweight tabular-nums primitive (`.tnum` /
  `.metric-data`)" item: `.fig` is its upstream resolution — mono-based because
  tabular-nums is inert on the served Google Fonts builds, and the inert `.tnum`
  request was retired upstream so the system never ships a silently-no-op
  utility.
- Add a short "Done" entry referencing the `.fig` adoption and this bundle ref.

## Non-goals

- Self-hosting the full DM Sans / Outfit builds to make body-face tabular-nums
  work (a face-agnostic `.fig` variant could return then — deferred upstream,
  per the changelog).
- Touching any other inline numeric styling beyond the two named sites.

## Verification gate

`npm test` (119 tests, offline) · `npx tsc --noEmit` · `npm run lint` ·
`npm run format:check` · `npm run build` — all green. The vendored CSS stays
Prettier-ignored (faithful to the bundle); the consumer `.tsx` edits are
Prettier-clean.
