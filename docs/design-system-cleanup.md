# Design-system cleanup & follow-ups

A living backlog of design-system conformance and health items. This is **not** a
spec or plan (those live in `docs/superpowers/`); it's a checklist of known debt
to pick from. Source: the v0.5 nav-migration conformance audit (see
`docs/superpowers/specs/2026-05-28-design-system-v0.5-nav-design.md`) plus a
system-level quality review.

**Two surfaces** — items are tagged by where the fix lands:

- **[consumer]** — SyncFit repo (`workout-tracker`). Fixable here directly.
- **[upstream]** — the Dustin Riley design-system bundle (claude.ai/design),
  where `tokens.css` / `components.css` / `Tokens.swift` / `validate.mjs` /
  recipes are authored. Not present in this repo; changes land in a new bundle
  release and are then re-vendored.

Severity from the audit: **no high-severity violations exist.** Everything below
is low/medium polish or structural health.

---

## Do now — quick, low-risk consumer wins (no decision, no new recipe)

These are mechanical, isolated, and don't depend on anything else.

- [ ] **[consumer]** `src/app/(app)/progress/progress-workspace.tsx` L73,77 — drop the
      redundant inline `style={{ color: "var(--link)" }}` on the `<a>` links; the
      element default already supplies `--link`.
- [ ] **[consumer]** `src/app/(app)/progress/progress-workspace.tsx` L59,70 — remove
      `p-4` where it overrides `.card`'s canonical `--space-5` padding (keep `.card`'s
      own padding unless a tighter override is intentional).
- [ ] **[consumer]** `src/app/(app)/settings/devices/page.tsx` L7 — `.container` +
      `p-8` double-pads and overrides the container's safe-area-aware horizontal
      padding; drop `p-8` and apply only vertical padding if needed.
- [ ] **[consumer]** `src/app/(auth)/auth-form.tsx` L129 — remove
      `disabled:cursor-not-allowed disabled:opacity-60`; let the `.btn:disabled`
      recipe own the disabled state (note: this changes disabled opacity 0.6 → the
      system's 0.4 — intended).
- [ ] **[consumer]** `src/app/(app)/import/page.tsx` L13 — replace inline
      `style={{ color: "var(--text-muted)" }}` with the `text-muted-foreground`
      Tailwind-bridge utility (or `.caption`).
- [ ] **[consumer]** `src/app/(app)/settings/devices/devices-client.tsx` L134–143 —
      the pairing code uses `.display` + inline `font-mono`; switch to the idiomatic
      `.metric .metric-md` primitive (mono + tabular + slashed-zero by design).
- [ ] **[consumer]** `src/app/(app)/dashboard/training-week.tsx` L170 — inline
      `fontVariantNumeric: "tabular-nums"` on measurement cells; use the `.metric`
      treatment instead of re-implementing tabular-nums inline.

---

## Needs a decision first

- [ ] **[consumer]** **Copy-voice consistency.** Headings/labels are mixed:
      lowercase (`weekly plan`, `log a workout`, `devices`, buttons `add exercise`/
      `build with ai`) vs Title-case (`Import Strong CSV`, `Save plan`). The DS rule
      is sentence-case (first word capitalized). Pick one of: sentence-case
      everywhere / all-lowercase everywhere / leave as-is. (Deferred during the v0.5
      nav PR — revisit deliberately.) Files: `plan/page.tsx`, `log/page.tsx`,
      `import/page.tsx`, `settings/devices/page.tsx`, `plan/plan-editor.tsx`,
      `(app)/page.tsx`.
- [ ] **[consumer]** `src/app/(app)/import/page.tsx` L27 — file `<input>` lacks the
      `.input` recipe class. File inputs are a known recipe edge case (`.input`
      targets text/textarea/select); decide whether to extend the recipe upstream or
      leave file inputs unstyled.

---

## Structural / system health (mostly upstream)

Bigger items from the system-level review. Higher value, more effort; sequence
deliberately.

- [ ] **[upstream]** **Token value-parity, not just name-parity.** `validate.mjs`
      checks that `tokens.css` and `Tokens.swift` share token _names_, but not that
      they resolve to the same _values_ — CSS and Swift can silently drift. Either
      (a) generate both from a single source (e.g. Style Dictionary: JSON → CSS +
      Swift), or (b) extend `validate.mjs` to compare resolved values where they're
      expressible on both sides. Highest-leverage health fix before 1.0.
- [ ] **[consumer]** **Unify the spacing scale.** The Tailwind `@theme` bridge maps
      colors/radii/fonts onto tokens but **not** spacing, so the app mixes Tailwind's
      default rem scale (`p-4`, `my-3`) with the system's `--space-*`. Either bridge
      `--space-*` into `@theme` in `src/app/globals.css`, or standardize on one scale
      and sweep usages. Pairs with the "do now" padding items above.
- [ ] **[upstream]** **Fill recipe vocabulary gaps** so inline escape hatches go
      away: add a **field-label** recipe (today `.metric-label` is reused for form
      labels — `log/page.tsx` L91,163) and an **error/alert-text** recipe (today
      `style={{ color: "var(--error)" }}` is the sanctioned inline workaround, and the
      nav sign-out error borrows `.site-nav__menu-email`). Once they exist, sweep the
      consumer to adopt them.
- [ ] **[upstream/process]** **A repeatable re-vendor procedure + recipe-level
      versioning.** Each bundle update is currently a manual reconcile (strip the
      Google-Fonts `@import`, fix the `loader-bar-curl.svg` mask path, fix
      `@import` paths, Prettier-format the `.tsx`). The `.site-nav` recipe also
      changed structurally _twice within v0.5_ with no version bump. Document the
      exact re-vendor steps (so any future update is mechanical), and adopt
      recipe-level versioning so the consumer can tell what changed. Consider whether
      a published package is worth it once a second consumer appears.
- [ ] **[upstream]** **Carry the `role="none"` menu fix into the handoff.** The
      bundle's `site-nav.tsx` renders the email and sign-out-error `<p>`s as direct
      children of `role="menu"`, which isn't valid menu ARIA (a menu owns only
      `menuitem`/`separator`/`group`/presentational children). SyncFit re-applied the
      `role="none"` wrapper locally (it had been fixed in `5e02203`, then dropped by
      the v0.5 handoff); the handoff should ship with it so the next re-vendor doesn't
      revert it again.
- [ ] **[upstream]** **Desktop primary-nav landmark.** The `.site-nav__links` `<ul>`
      is placed directly in the CSS grid, so at desktop width there is no `<nav>`
      navigation landmark (the mobile rail, which is the `<nav>`, is `display:none`
      there). Wrapping the `<ul>` in a `<nav>` in the consumer would break the grid
      placement, so this needs to be solved in the recipe (e.g. make the landmark the
      grid child). Low severity.
- [ ] **[upstream]** **`.site-nav__menu` desktop min-width floor.** The v0.5 recipe
      drops the old `min-width: 248px` because the menu now spans the chip exactly for
      the connected seam. If a short email makes the chip (and thus the menu) too
      narrow in practice, consider a min-width floor that doesn't break the seam.
- [ ] **[consumer]** **Clear residual migration markers.** A few `.ds-*` / `--ds-*`
      references remain as comments (`src/app/globals.css` L6–7,
      `src/styles/design/components.css` L1334 region). Confirm they're purely
      historical and tidy the comments; ensure no live `.ds-*` usage exists.

---

## Done (for reference)

- [x] **[consumer/upstream]** Migrate the nav off the pre-v0.5 floating pill onto
      the `.site-nav` recipe; vendor the recipe; adopt `.seg` for the log
      workout-kind toggle. (PR #27, branch `design-system-v0.5-nav`.)
- [x] **[consumer/upstream]** `.site-nav__menu` reflow fix — absolutely-positioned
      child instead of a CSS-grid sibling so opening the menu never reflows content.
      (PR #27.)
