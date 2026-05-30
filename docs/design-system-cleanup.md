# Design-system cleanup & follow-ups

A living backlog of design-system conformance and health items. This is **not** a
spec or plan (those live in `docs/superpowers/`); it's a checklist of known debt
to pick from. Source: the v0.5 nav-migration conformance audit (see
`docs/superpowers/specs/2026-05-28-design-system-v0.5-nav-design.md`), a
system-level quality review, and the upstream **v0.5 post-audit hardening**
release (bundle ref `eiknX9mTb9wMJD2y9JM7aw`).

**Two surfaces** — items are tagged by where the fix lands:

- **[consumer]** — SyncFit repo (`workout-tracker`). Fixable here directly.
- **[upstream]** — the Dustin Riley design-system bundle (claude.ai/design),
  where `tokens.css` / `components.css` / `Tokens.swift` / `validate.mjs` /
  recipes are authored. Not present in this repo; changes land in a new bundle
  release and are then re-vendored.

Severity from the audit: **no high-severity violations exist.** Everything below
is low/medium polish or structural health.

---

## Upstream update — v0.5 post-audit hardening (ref `eiknX9mTb9wMJD2y9JM7aw`)

A post-audit pass incorporated four of six `[upstream]` findings from this
backlog and fixed three `.site-nav` recipe bugs. What it closed (details in the
relevant items below):

- **U-01 token value-parity** — `validate.mjs` now compares resolved _values_
  (104/109 shared tokens; 5 layered shadows skipped), not just names.
- **U-02 recipe vocabulary** — added `.field-label` and `.alert-text` recipes.
- **U-04 / U-05 nav ARIA** — handoff ships the `role="none"` menu wrappers; the
  recipe adds a `.site-nav__nav` `<nav aria-label="Primary">` desktop landmark.
- **U-03 (first half) re-vendor procedure** — `RE-VENDOR.md` + a three-part gate
  (token parity, stylelint, preview render check).
- **Recipe bug fixes B-01 / B-02** (and **B-03** noted, deferred).

### Action this creates for us — re-vendor the release

- [ ] **[consumer]** **Re-vendor the v0.5 post-audit-hardening bundle into
      SyncFit.** High value because it: (1) **fixes B-02** — our vendored mobile
      `.site-nav__menu` anchors to the chip and paints over the rail; the fix
      anchors it to the bar so it drops flush below the rail; (2) lets us **drop
      our local `role="none"` patch** (commit on PR #27) and re-converge with the
      byte-faithful handoff, which now ships that fix upstream; (3) brings
      `.field-label` / `.alert-text` so the consumer vocabulary items below become
      actionable; (4) adds the `.site-nav__nav` desktop landmark. Follow
      `RE-VENDOR.md` (strip Google-Fonts `@import`, fix loader mask path + entry
      `@import`, Prettier the `.tsx`) and run its three-part gate. **Note:** B-01
      (a nested `*/` dropping the `.site-nav` base rule) was verified _not_
      present in our current vendored copy, so we're not currently broken on that
      one — but re-vendoring keeps us aligned. **B-03** (the `.site-nav`
      self-query-container override never applying, so mobile side-padding stays
      at the desktop value) is deferred upstream and will still be present after
      re-vendor; tracked there.

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

### Unblocked by the new recipes (do _after_ the re-vendor above)

- [ ] **[consumer]** `src/app/(app)/log/page.tsx` L91,163 — the form labels reuse
      `.metric-label` (mono measurement caption). Now that `.field-label` exists
      upstream, switch these to `.field-label`.
- [ ] **[consumer]** Adopt `.alert-text` for error/alert copy and drop the inline
      `style={{ color: "var(--error)" }}` escape hatches (e.g.
      `today-session.tsx`, `progression-inbox.tsx`, `import/page.tsx`,
      `devices-client.tsx`). The re-vendored handoff already uses `.alert-text`
      for the nav sign-out error.

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

## Structural / system health

- [ ] **[consumer]** **Unify the spacing scale.** The Tailwind `@theme` bridge maps
      colors/radii/fonts onto tokens but **not** spacing, so the app mixes Tailwind's
      default rem scale (`p-4`, `my-3`) with the system's `--space-*`. Either bridge
      `--space-*` into `@theme` in `src/app/globals.css`, or standardize on one scale
      and sweep usages. Pairs with the "do now" padding items above. (Still open —
      this one is consumer-side and untouched by the upstream release.)
- [ ] **[upstream/process]** **Recipe-level versioning.** Half of U-03 shipped
      (`RE-VENDOR.md` + the three-part gate). Still deferred upstream: per-recipe
      versioning so the consumer can tell what changed between bundles (the
      `.site-nav` recipe changed structurally _three times_ across v0.5 with no
      version bump). Upstream notes this waits for a second consumer.
- [ ] **[upstream]** **`.site-nav__menu` desktop min-width floor.** The v0.5 recipe
      drops the old `min-width: 248px` because the menu now spans the chip exactly for
      the connected seam. If a short email makes the chip (and thus the menu) too
      narrow in practice, consider a min-width floor that doesn't break the seam.
      (Not addressed by the hardening release.)
- [ ] **[upstream]** **B-03 — `.site-nav` self-query-container override.** The bar is
      its own `container-type`, so its mobile `@container` self-overrides
      (`--sn-pad-*`, `column-gap`) never apply; mobile side-padding silently stays at
      the desktop value. Deferred upstream (needs a markup-contract change to move
      `container-type` to a wrapper); documented in `RE-VENDOR.md`. Present in our
      vendored copy and will remain after re-vendor.
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
- [x] **[consumer]** Restore `role="none"` wrappers on the menu's non-`menuitem`
      children (PR #27). Superseded upstream by U-04 — re-vendoring will replace the
      local patch with the shipped fix.
- [x] **[upstream] U-01 — token value-parity.** `validate.mjs` now value-compares
      104/109 shared tokens (closes the `#B8541C → #B8541D` name-only-pass hole).
      Was the highest-leverage health item.
- [x] **[upstream] U-02 — recipe vocabulary gaps.** `.field-label` and `.alert-text`
      recipes added. (Consumer adoption tracked under "Unblocked by the new recipes"
      above, pending re-vendor.)
- [x] **[upstream] U-04 — `role="none"` in the handoff.** Now ships upstream so the
      next re-vendor won't revert it.
- [x] **[upstream] U-05 — desktop primary-nav landmark.** Recipe adds
      `.site-nav__nav` `<nav aria-label="Primary">` as the grid child (the `<ul>`
      can't carry the landmark without breaking grid placement).
- [x] **[upstream] U-03 (first half) — re-vendor procedure.** `RE-VENDOR.md` +
      three-part gate (token parity, stylelint, preview render). Recipe-level
      versioning still open (above).
