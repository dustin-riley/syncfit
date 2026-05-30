# `.fig` Aligned-Figure Primitive Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Vendor the v0.5 `.fig` aligned-figure recipe into SyncFit and adopt it at the one column that needs it, retiring the inert inline `tabular-nums` workaround.

**Architecture:** `.fig` is a direct recipe class (mono face + tabular figures) added to the vendored `src/styles/design/components.css`, byte-faithful to the design bundle. The `weight×reps` table column adopts it via `className="fig"`; the pairing code stays on `.metric` but bumps a size. The cleanup backlog is reconciled to match.

**Tech Stack:** Next.js 16 / React 19 / TypeScript, Tailwind v4, vendored Dustin Riley design system CSS (Prettier-ignored).

**Note on testing:** There is no business logic here — this is vendored CSS plus two `className` edits. Each task's verification is the standard gate (offline test suite stays green; `tsc` / `lint` / `format:check` / `build` pass). No new unit tests are warranted; inventing assertions over static class strings would test nothing real.

**Spec:** `docs/superpowers/specs/2026-05-30-fig-aligned-figure-primitive-design.md`

---

### Task 1: Vendor the `.fig` recipe into `components.css`

**Files:**
- Modify: `src/styles/design/components.css` (insert between `.metric-label` rule and the `.field-label` comment, ~line 216)

- [ ] **Step 1: Insert the `.fig` block**

In `src/styles/design/components.css`, find the end of the `.metric-label` rule:

```css
.metric-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

/* -------- .field-label · form field label --------
```

Insert the `.fig` block (full bundle comment + rule, Prettier-formatted to match the repo's `.metric` style) in the blank line between the `.metric-label` closing `}` and the `/* -------- .field-label` comment, so it reads:

```css
.metric-label {
  font-family: var(--font-mono);
  font-size: 11px;
  font-weight: 500;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
}

/* -------- .fig · aligned measurement figures --------
   The house treatment for numbers that have to line up: weight×reps
   cells in a column, a stat list, a timer that updates in place, an
   pairing code. Renders figures on the MONO face, which
   is tabular by construction — every glyph is one width — so columns
   lock with NO dependency on an OpenType feature.

   Why not just `font-variant-numeric: tabular-nums` on the body face?
   Because the DM Sans + Outfit webfonts Google Fonts serves (what
   tokens.css @imports, and what the consumer's next/font/google pulls)
   STRIP the `tnum`/`zero` lookups, so that request is silently inert
   on those builds. Mono sidesteps it entirely. (If the full DM Sans /
   Outfit builds are ever self-hosted — they DO carry the features —
   a face-agnostic variant could be reintroduced. See CHANGELOG.)

   `slashed-zero` is kept as belt-and-suspenders: harmless on mono,
   and it keeps a measurement 0 unmistakably a digit (e.g. 270×10).
   (It does nothing for pairing codes — those use a full Crockford
   alphabet with no 0/1/I/L/O/U, so there's no 0 to disambiguate;
   mono just gives them the fixed width.) NOTE: .fig sets the
   font family, so it changes the face — that's intentional. The big
   hero numbers (.metric, readiness, weekly volume) stay in Outfit;
   only column-aligned figures move to mono. */
.fig {
  font-family: var(--font-mono);
  font-variant-numeric: tabular-nums slashed-zero;
  font-feature-settings:
    "tnum" 1,
    "zero" 1;
}

/* -------- .field-label · form field label --------
```

- [ ] **Step 2: Verify the recipe is present and CSS still builds**

Run: `grep -c '^\.fig {' src/styles/design/components.css`
Expected: `1`

Run: `npm run build`
Expected: build completes with no CSS/compile errors.

- [ ] **Step 3: Commit**

```bash
git add src/styles/design/components.css
git commit -m "$(cat <<'EOF'
feat(design): vendor the v0.5 .fig aligned-figure recipe

Mono-face tabular figures — the one v0.5 changelog item not yet vendored.
Byte-faithful to the bundle, inserted between .metric-label and .field-label.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Adopt `.fig` at the `weight×reps` column

**Files:**
- Modify: `src/app/(app)/dashboard/training-week.tsx:164-182` (the per-set `<td>`)

- [ ] **Step 1: Swap the inline `tabular-nums` for `className="fig"`**

Current (`src/app/(app)/dashboard/training-week.tsx`, the `ex.sets.map` cell):

```tsx
                              {ex.sets.map((s, i) => (
                                <td
                                  key={i}
                                  style={{
                                    width: "11ch",
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                    paddingLeft: "var(--space-4)",
                                    paddingTop: "var(--space-1)",
                                    paddingBottom: "var(--space-1)",
                                    color: s.isTop
                                      ? "var(--link)"
                                      : "var(--text-muted)",
                                    fontWeight: s.isTop ? 600 : 400,
                                  }}
                                >
                                  {s.weight}×{s.reps}
                                </td>
                              ))}
```

Change to — add `className="fig"`, delete the `fontVariantNumeric` line (now redundant; `.fig` owns the figure variant and switches the column to the mono face):

```tsx
                              {ex.sets.map((s, i) => (
                                <td
                                  key={i}
                                  className="fig"
                                  style={{
                                    width: "11ch",
                                    textAlign: "right",
                                    paddingLeft: "var(--space-4)",
                                    paddingTop: "var(--space-1)",
                                    paddingBottom: "var(--space-1)",
                                    color: s.isTop
                                      ? "var(--link)"
                                      : "var(--text-muted)",
                                    fontWeight: s.isTop ? 600 : 400,
                                  }}
                                >
                                  {s.weight}×{s.reps}
                                </td>
                              ))}
```

- [ ] **Step 2: Verify no inline `fontVariantNumeric` remains in the consumer**

Run: `grep -rn "fontVariantNumeric\|font-variant-numeric: tabular-nums" src/app`
Expected: no matches (the training-week cell was the only one).

- [ ] **Step 3: Gate — types, lint, format, tests, build**

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint && npm run format:check`
Expected: both pass (the `.tsx` is Prettier-clean).

Run: `npm test`
Expected: all offline tests pass (count unchanged from baseline).

Run: `npm run build`
Expected: build completes.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/training-week.tsx"
git commit -m "$(cat <<'EOF'
feat(dashboard): route weight×reps cells through the .fig recipe

Drops the inline font-variant-numeric: tabular-nums — a documented no-op on
the served Google Fonts builds. .fig puts the column on the tabular mono face
so the cells actually line up.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Bump the pairing code to `.metric metric-lg`

**Files:**
- Modify: `src/app/(app)/settings/devices/devices-client.tsx:132`

- [ ] **Step 1: Change the size class**

Find the pairing-code element (around line 132):

```tsx
              className="metric metric-md"
```

Change to:

```tsx
              className="metric metric-lg"
```

(Stays on `.metric` — display face, per the system rule that only column figures move to mono. The pairing code is a single static value; the bump just makes it more prominent to read and type.)

- [ ] **Step 2: Verify the swap**

Run: `grep -n 'metric metric-lg\|metric metric-md' "src/app/(app)/settings/devices/devices-client.tsx"`
Expected: one `metric metric-lg` match, no `metric metric-md`.

- [ ] **Step 3: Gate**

Run: `npx tsc --noEmit && npm run lint && npm run format:check`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/settings/devices/devices-client.tsx"
git commit -m "$(cat <<'EOF'
feat(devices): bump the pairing code to .metric metric-lg

Larger display-face treatment so the code is easier to read and type.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Reconcile `docs/design-system-cleanup.md`

**Files:**
- Modify: `docs/design-system-cleanup.md` (the `[~]` training-week item ~L85-94; the `[upstream]` tabular-nums item ~L143-151; the "Done" list ~L170+)

- [ ] **Step 1: Flip the training-week item to done**

Replace the `[~]` item (currently "Left inline by decision"):

```markdown
- [~] **[consumer]** **`src/app/(app)/dashboard/training-week.tsx` L170** — inline
  `fontVariantNumeric: "tabular-nums"` on measurement cells. **Left inline by
  decision.** The recipe set has no tabular-nums-only primitive: `.metric` is a
  hero-display treatment (display face, weight 700, wide tracking) and the size
  classes `.metric-sm/-md/-lg/-xl` only set `font-size`, so `.metric-sm` alone
  gives no tabular-nums and `.metric .metric-sm` pulls in the full display face —
  wrong altitude for dense `weight×reps` data-table cells, and it would collide
  with the per-cell top-set color/weight logic. Keeping the inline
  `font-variant-numeric` here is correct until an upstream lightweight primitive
  exists (see the `.tnum` item below).
```

with:

```markdown
- [x] **[consumer]** **`src/app/(app)/dashboard/training-week.tsx` `weight×reps`
      cells** — the inline `fontVariantNumeric: "tabular-nums"` (a documented
      no-op on the served Google Fonts builds) is gone; the cells now carry
      `className="fig"`. The v0.5 `.fig` recipe (mono face, tabular by
      construction) is the lightweight primitive that was missing — the per-cell
      top-set color/weight logic composes on top unchanged. (bundle
      `UE-8vqOumILzbaoC2WpjWQ`.)
```

- [ ] **Step 2: Close the upstream tabular-nums primitive item**

Replace the `[upstream]` item:

```markdown
- [ ] **[upstream]** **Lightweight tabular-nums primitive (`.tnum` / `.metric-data`).**
      The recipe set only carries tabular-nums via the heavy `.metric` display
      treatment; there is no "tabular-nums only" utility for dense data-table cells
      (the size classes `.metric-sm/-md/-lg/-xl` set `font-size` only). Consequence:
      the `training-week.tsx` measurement cells keep an inline
      `font-variant-numeric: tabular-nums` because no recipe fits. Consider adding a
      small `.tnum` utility (just `font-variant-numeric: tabular-nums slashed-zero` +
      feature settings, no font/weight change) so data tables can drop the inline
      style. Surfaced by the v0.5 conformance sweep.
```

with:

```markdown
- [x] **[upstream] Lightweight aligned-figure primitive — shipped as `.fig`.**
      Resolved by the v0.5 `.fig` recipe (bundle `UE-8vqOumILzbaoC2WpjWQ`).
      Upstream went **mono-face**, not a body-face `.tnum`: the
      `font-variant-numeric: tabular-nums` request is inert on the DM Sans /
      Outfit webfonts Google Fonts serves (the lookups are stripped), so the
      inert `.tnum` was retired and `.fig` routes column figures to the mono
      face, which is tabular by construction. Consumer adoption: the
      `training-week.tsx` cells (above). A face-agnostic variant could return if
      the full font builds are ever self-hosted.
```

- [ ] **Step 3: Add a "Done" entry**

In the `## Done (for reference)` list, add:

```markdown
- [x] **[consumer/upstream]** Vendor the v0.5 `.fig` aligned-figure recipe and
      adopt it at the `training-week` `weight×reps` column; bump the devices
      pairing code to `.metric metric-lg`. (bundle `UE-8vqOumILzbaoC2WpjWQ`.)
```

- [ ] **Step 4: Verify the doc no longer claims the cells are inline-by-decision**

Run: `grep -n "Left inline by decision\|\.tnum" docs/design-system-cleanup.md`
Expected: no "Left inline by decision"; any remaining `.tnum` mention is inside the now-`[x]` historical context only.

- [ ] **Step 5: Commit**

```bash
git add docs/design-system-cleanup.md
git commit -m "$(cat <<'EOF'
docs(design): close the tabular-nums backlog items — .fig shipped

The training-week cells adopt .fig; the upstream "lightweight tabular-nums
primitive" item is resolved (mono-face .fig, the inert .tnum retired).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Full verification gate

**Files:** none (verification only)

- [ ] **Step 1: Run the complete offline gate**

Run: `npm test`
Expected: all tests pass (count unchanged from baseline — no tests added or removed).

Run: `npx tsc --noEmit`
Expected: no errors.

Run: `npm run lint`
Expected: clean.

Run: `npm run format:check`
Expected: clean (the vendored `components.css` is Prettier-ignored; the two `.tsx` edits and the markdown are Prettier-clean).

Run: `npm run build`
Expected: production build succeeds.

- [ ] **Step 2: Confirm the change set**

Run: `git log --oneline design-system-fig-primitive ^main`
Expected: the spec commit plus the four implementation commits (Tasks 1–4).

No integration (`test:integration`) or iOS (`xcodebuild`) runs are needed — no DB/server-action or Swift paths are touched.
