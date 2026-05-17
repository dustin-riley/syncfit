# Design-System Adoption (`@dustin-riley/design`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the vendored `globals.css` design-system shim with the published `@dustin-riley/design` npm package, and erase every trace from the living docs that a shim/migration ever existed.

**Architecture:** One exact-pinned npm dependency; `globals.css` collapses to two `@import` lines (the package's `tailwind.css` transitively pulls in `core.css` → `tokens.css`); the bundled Claude skill is vendored into `.claude/skills/`; the MVP spec/plan/CLAUDE.md/README are rewritten to read as if the package was always consumed. History survives only in git and `docs/superpowers/specs/2026-05-16-design-system-adoption-design.md`.

**Tech Stack:** Next.js 16, Tailwind v4, `@dustin-riley/design@0.2.3` (framework-neutral CSS package).

**Spec:** `docs/superpowers/specs/2026-05-16-design-system-adoption-design.md`

---

## Task 1: Install the package (exact pin)

**Files:**

- Modify: `package.json` (dependencies), `package-lock.json`

- [ ] **Step 1: Install exact version**

Run:

```bash
npm i --save-exact @dustin-riley/design@0.2.3
```

Expected: install succeeds; `package.json` `dependencies` gains `"@dustin-riley/design": "0.2.3"`.

- [ ] **Step 2: Verify the pin has no caret**

Run:

```bash
node -e "const v=require('./package.json').dependencies['@dustin-riley/design']; if(v!=='0.2.3'){console.error('BAD PIN: '+v);process.exit(1)} console.log('ok '+v)"
```

Expected: prints `ok 0.2.3`. If it prints `^0.2.3` or fails, re-run Step 1 with `--save-exact`.

- [ ] **Step 3: Confirm the package exposes the expected entrypoints**

Run:

```bash
node -e "console.log(require('@dustin-riley/design/package.json').exports)"
ls node_modules/@dustin-riley/design/skill/dustinriley-design/SKILL.md
```

Expected: `exports` lists `./tokens.css`, `./core.css`, `./tailwind.css`, `./DESIGN.md`; the `ls` prints the SKILL.md path (no "No such file").

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @dustin-riley/design@0.2.3 (exact pin)"
```

---

## Task 2: Collapse `globals.css` to the package import

**Files:**

- Modify: `src/app/globals.css` (currently 93 lines: line 1 `@import "tailwindcss";`, lines 3–92 the vendored shim block, ending `/* === END SHIM === */`)

- [ ] **Step 1: Replace the entire file**

Overwrite `src/app/globals.css` with exactly this — two lines, no shim, no comments, trailing newline:

```css
@import "tailwindcss";
@import "@dustin-riley/design/tailwind.css";
```

Rationale: `@dustin-riley/design/tailwind.css` `@import`s `core.css`, which `@import`s `tokens.css` — so this single line delivers `--ds-*` tokens + focus ring, the `.ds-*` primitive vocabulary + base element styling, and the Tailwind v4 `@theme` radius map + shadcn HSL bridge. `src/app/layout.tsx` is NOT modified — it loads Outfit/DM Sans/JetBrains Mono via `next/font` and overrides `--ds-font-*` on `<html>`; the package ships no fonts by design.

- [ ] **Step 2: Verify the file is exactly two lines**

Run:

```bash
wc -l src/app/globals.css && cat src/app/globals.css
```

Expected: `2 src/app/globals.css`; output is the two `@import` lines and nothing else (no `SHIM`, no `:root`, no hex).

- [ ] **Step 3: Verify the build resolves the package CSS and `.ds-*` primitives are now real**

Run:

```bash
npm run build
```

Expected: build succeeds. (This is the parity gate: `.ds-container/.ds-panel/.ds-btn-*/.ds-mono-note` go from no-op to styled — a visible UI change is expected and correct, not a regression. The package-generated shadcn HSL bridge differs slightly from the old hand-converted shim, e.g. `--background 36 48% 96% → 36 50% 96%`; the generated values are canonical — do not reconcile back.)

- [ ] **Step 4: Commit**

```bash
git add src/app/globals.css
git commit -m "feat: consume @dustin-riley/design via globals.css import"
```

---

## Task 3: Vendor the bundled Claude skill into the repo

**Files:**

- Create: `.claude/skills/dustinriley-design/SKILL.md` (verbatim copy of `node_modules/@dustin-riley/design/skill/dustinriley-design/SKILL.md`)

- [ ] **Step 1: Copy the skill file into the project**

Run:

```bash
mkdir -p .claude/skills/dustinriley-design
cp node_modules/@dustin-riley/design/skill/dustinriley-design/SKILL.md .claude/skills/dustinriley-design/SKILL.md
```

Expected: no output (success).

- [ ] **Step 2: Verify it copied verbatim**

Run:

```bash
diff node_modules/@dustin-riley/design/skill/dustinriley-design/SKILL.md .claude/skills/dustinriley-design/SKILL.md && echo "IDENTICAL"
head -3 .claude/skills/dustinriley-design/SKILL.md
```

Expected: prints `IDENTICAL`; the head shows the YAML frontmatter (`---` / `name: dustinriley-design`).

- [ ] **Step 3: Commit**

```bash
git add .claude/skills/dustinriley-design/SKILL.md
git commit -m "chore: vendor dustinriley-design Claude skill from package"
```

---

## Task 4: CLAUDE.md — delete the shim gotcha, state steady state

**Files:**

- Modify: `CLAUDE.md:43` (the "Design system is a vendored shim on this branch." bullet, under "## Non-obvious gotchas")

- [ ] **Step 1: Replace the bullet**

Find this exact line (line 43):

```
- **Design system is a vendored shim on this branch.** `src/app/globals.css` carries an inline `--ds-*` token + shadcn-bridge shim (spec §0). Adoption of the published `@dustin-riley/design` package is a separate branch/PR, not here. Per the design rules: reference `--ds-*` tokens / `.ds-*` classes, never hard-code hex/px; 3 radii (8/16/999) and warm shadows only; sentence-case UI copy; no emoji.
```

Replace it with (present tense, no mention of a prior shim/migration/branch):

```
- **Design system comes from `@dustin-riley/design`.** `src/app/globals.css` is exactly `@import "tailwindcss";` then `@import "@dustin-riley/design/tailwind.css";` — the package supplies `--ds-*` tokens, the `.ds-*` primitive classes, and the shadcn HSL bridge; never add tokens or hex/px to `globals.css`. Per the design rules: reference `--ds-*` tokens / `.ds-*` classes, never hard-code hex/px; 3 radii (8/16/999) and warm shadows only; sentence-case UI copy; no emoji. The package is exact-pinned; the bundled skill is vendored at `.claude/skills/dustinriley-design/SKILL.md` — re-sync it from `node_modules/@dustin-riley/design/skill/...` whenever the package version is bumped.
```

- [ ] **Step 2: Verify no trace words remain in CLAUDE.md**

Run:

```bash
grep -nE 'vendored shim|dustinriley/design|separate branch/PR|spec §0|spec §11' CLAUDE.md && echo "FOUND TRACE — fix" || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md states @dustin-riley/design as steady state"
```

---

## Task 5: MVP spec — remove §0 and §11, rewrite §2/§2a to steady state

**Files:**

- Modify: `docs/superpowers/specs/2026-05-16-syncfit-mvp-design.md`

Note: `## 0.` and `## 11.` are the first/last numbered sections, so deleting them requires **no renumbering** of §1–§10; §2a stays.

- [ ] **Step 1: Delete §0 entirely**

Delete the whole `## 0. Design-System Sequencing (copy-first, migrate later)` section — from the `## 0.` heading (line 6) up to but not including `## 1. Goal & Scope` (line 26), including the blank line before `## 1.`. The file must now begin §1 directly after the `**Date:** / **Status:**` header block.

- [ ] **Step 2: Delete §11 entirely**

Delete the whole `## 11. Design-System Migration (scheduled)` section — from the `## 11.` heading through end of file (the `5. Confirm no hard-coded hex/px leaked ...` line). `## 10.` is now the last section; ensure the file ends with a single trailing newline after §10's last line.

- [ ] **Step 3: Rewrite §2's design-system line**

In `## 2. Tech Stack`, find the bullet:

```
- **Design system:** Consumed **day one** from the published npm package
  **`@dustinriley/design`** (not copied from another repo). See §2a.
```

Replace with:

```
- **Design system:** `@dustin-riley/design` (npm, exact-pinned). See §2a.
```

- [ ] **Step 4: Replace the entire §2a body with a steady-state description**

Replace everything from `## 2a. Design System (...)` heading through the line immediately before `## 3. Architecture — Units` with exactly:

```
## 2a. Design System (`@dustin-riley/design`, npm)

SyncFit consumes the published `@dustin-riley/design` package. `globals.css` is
two imports — `@import "tailwindcss";` then
`@import "@dustin-riley/design/tailwind.css";`. The package's `tailwind.css`
transitively pulls in `core.css` (the `.ds-*` primitive vocabulary +
`:where()`-wrapped base element styling) and `tokens.css` (`--ds-*` constitution
+ focus ring), and adds the Tailwind v4 `@theme` radius map + shadcn HSL bridge
generated from the tokens.

- **shadcn React primitives are not in the package** (deferred there under
  YAGNI). If SyncFit adds shadcn/ui components, the bridge themes them
  automatically — no hand-copied HSL, no drift.
- **Fonts are app-side** (the package is framework-free CSS): `layout.tsx`
  loads Outfit (display), DM Sans (body), JetBrains Mono (mono) via
  `next/font` and binds them to `--ds-font-*`.
- The package version is exact-pinned (no `^`) so the design surface can't
  shift under the app. The bundled `dustinriley-design` Claude skill is
  vendored at `.claude/skills/dustinriley-design/SKILL.md`; re-sync on version
  bump.

**`DESIGN.md` constraints are spec rules:** reference `--ds-*` tokens, never
hard-code hex/px; exactly 3 radii (8/16/999px), warm-tinted shadows only;
sentence case; no emoji/italics in UI chrome; no gradient backgrounds or
glassmorphism; color is never the only state signal. Palette is warm-neutral on
burnt orange (`--ds-primary #b8541c`).

```

- [ ] **Step 5: Verify no trace remains in the MVP spec**

Run:

```bash
grep -nE 'dustinriley/design|copy-first|interim shim|vendored shim|until.*published|end state|migrat(e|ion)|## 0\.|## 11\.|three package|import all three' docs/superpowers/specs/2026-05-16-syncfit-mvp-design.md && echo "FOUND TRACE — fix" || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-05-16-syncfit-mvp-design.md
git commit -m "docs: MVP spec — remove shim sequencing/migration, steady state only"
```

---

## Task 6: MVP plan — strip shim/migration framing

**Files:**

- Modify: `docs/superpowers/plans/2026-05-16-syncfit-mvp.md` (lines 7, 35, Task 1 Step 2 region 76–174, commit msg line ~239, and lines ~1695 / ~1712 / ~1728 — find by string, not number, as earlier edits shift them)

- [ ] **Step 1: Fix the Architecture line (line 7)**

Find the trailing sentence:

```
Design system vendored as a copy-first shim (spec §0), migrated to `@dustinriley/design` later as an off-critical-path task.
```

Replace with:

```
Design system consumed from the `@dustin-riley/design` npm package (spec §2a).
```

- [ ] **Step 2: Fix the file-tree comment (line 35)**

Find:

```
    globals.css          # Tailwind v4 + vendored design-system shim (spec §0)
```

Replace with:

```
    globals.css          # Tailwind v4 + @dustin-riley/design import (spec §2a)
```

- [ ] **Step 3: Rewrite Task 1 heading and Step 2**

Change the Task 1 heading:

```
## Task 1: Project scaffold + design-system shim
```

to:

```
## Task 1: Project scaffold + design system
```

Then replace Task 1 **Step 2** in its entirety — from the line `- [ ] **Step 2: Add the design-system shim to `globals.css`**` through the closing ` ``` ` of its CSS code block (the fenced block that begins `@import "tailwindcss";` and contains the `=== VENDORED DESIGN-SYSTEM SHIM ===` comment and all `--ds-*`/`@theme` lines) — with exactly:

````
- [ ] **Step 2: Install the design system and import it in `globals.css`**

Run:

```bash
npm i --save-exact @dustin-riley/design@0.2.3
```

Then replace `src/app/globals.css` with exactly:

```css
@import "tailwindcss";
@import "@dustin-riley/design/tailwind.css";
```

The package's `tailwind.css` pulls in `core.css` (the `.ds-*` primitives + base element styling) and `tokens.css` (`--ds-*` + focus ring). Never add tokens or hex/px to `globals.css`.
````

- [ ] **Step 4: Fix the Task 1 commit message**

Find:

```
git commit -m "feat: scaffold Next.js app with vendored design-system shim"
```

Replace with:

```
git commit -m "feat: scaffold Next.js app with @dustin-riley/design"
```

- [ ] **Step 5: Fix the README-pointer line (~1695)**

Find the line containing `and the design-system migration pointer (spec §11)` (inside the Task 10 README description). Replace that clause so the sentence ends at the prior item — i.e. change:

```
`README.md`: document required env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY`), `npx drizzle-kit push`, `npm test`, and the design-system migration pointer (spec §11).
```

to:

```
`README.md`: document required env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY`), `npx drizzle-kit push`, and `npm test`.
```

- [ ] **Step 6: Remove the "Design-system package migration" deferred bullet (~1712)**

Delete the entire bullet line:

```
- **Design-system package migration** — spec §11. Scheduled when `@dustinriley/design` publishes; replace the shim block in `globals.css` with the three package imports + visual-parity check. Off critical path.
```

(Delete the whole line including its leading `- `; leave the surrounding list otherwise intact.)

- [ ] **Step 7: Fix the self-review coverage line (~1728)**

Find the segment in the spec-coverage paragraph:

```
§0 shim → Task 1;
```

Delete that segment (the `§0 shim → Task 1; ` text only) so the sentence continues with `§2/§2a stack → Tasks 1–6;`. Then find at the end of the same paragraph:

```
; §11 migration → Deferred section + Task 10 README pointer.
```

Replace it with a period: `.` (i.e. the paragraph now ends at `§10 open items → resolved in header (auth=email+pw, model=sonnet-4-6, progression deferred).`).

- [ ] **Step 8: Verify no trace remains in the MVP plan**

Run:

```bash
grep -nE 'dustinriley/design|vendored shim|design-system shim|copy-first|spec §0|spec §11|migrat(e|ion).*design|design.*migrat(e|ion)' docs/superpowers/plans/2026-05-16-syncfit-mvp.md && echo "FOUND TRACE — fix" || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 9: Commit**

```bash
git add docs/superpowers/plans/2026-05-16-syncfit-mvp.md
git commit -m "docs: MVP plan — design system installed in Task 1, no migration framing"
```

---

## Task 7: README — fix package name and dangling §0/§11 pointers

**Files:**

- Modify: `README.md` (lines ~14, ~58, ~75 — find by string)

- [ ] **Step 1: Fix the design-system status line (~14)**

Find:

```
The design system is currently a vendored shim pending the `@dustinriley/design` package (see spec §11).
```

Replace with:

```
The design system comes from the `@dustin-riley/design` npm package (see spec §2a).
```

- [ ] **Step 2: Fix the timezone pointer (~58) — §0 no longer exists**

Find:

```
- **Timezone:** a single fixed timezone, `America/New_York` (spec §0).
```

Replace with (the timezone limitation now lives in §1 "Known v1 limitations"):

```
- **Timezone:** a single fixed timezone, `America/New_York` (spec §1).
```

- [ ] **Step 3: Remove the deferred migration bullet (~75)**

Delete the entire line:

```
- **Design-system package migration** — vendored shim now; migrate to `@dustinriley/design` later (spec §11).
```

- [ ] **Step 4: Verify no trace remains in README**

Run:

```bash
grep -nE 'dustinriley/design|vendored shim|spec §0|spec §11|migrate to' README.md && echo "FOUND TRACE — fix" || echo "CLEAN"
```

Expected: `CLEAN`.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: README — @dustin-riley/design steady state, fix section pointers"
```

---

## Task 8: Whole-repo verification gate

**Files:** none (verification only)

- [ ] **Step 1: Green gate**

Run each; all must pass:

```bash
npm run build
npx tsc --noEmit
npm run lint
npm run format:check
npm test
```

Expected: build succeeds; `tsc` no errors; lint clean; `format:check` clean; Vitest all green and offline. (If `format:check` flags the edited Markdown/CSS, run `npm run format` and amend the relevant commit.)

- [ ] **Step 2: No leaked hard-coded hex/px in components**

Run:

```bash
grep -rnE '#[0-9a-fA-F]{3,6}\b|[0-9]+px' src --include="*.tsx" --include="*.ts" | grep -v 'globals.css'
```

Expected: no output. Any hit is migration debt — fix it here (replace with the appropriate `--ds-*` token), do not carry forward.

- [ ] **Step 3: Repo-wide dangling-trace sweep**

Run (excludes git history and the adoption spec, which is the intentional audit trail):

```bash
grep -rnE 'dustinriley/design|vendored shim|design-system shim|copy-first|interim shim|spec §0|spec §11' . \
  --include="*.md" --include="*.css" --include="*.ts" --include="*.tsx" \
  --exclude-dir=node_modules --exclude-dir=.git \
  | grep -v 'docs/superpowers/specs/2026-05-16-design-system-adoption-design.md' \
  && echo "FOUND TRACE — fix before done" || echo "CLEAN"
```

Expected: `CLEAN`. Any hit (outside the adoption spec) must be fixed before the branch is done.

- [ ] **Step 4: Final commit if Step 1 required formatting**

```bash
git add -A
git commit -m "chore: formatting after design-system adoption" || echo "nothing to commit"
```

---

## Notes

- **Integration tests are NOT required** (`npm run test:integration`): no server-action / DB / auth paths are touched. Running them is harmless but not part of the gate.
- **Expected visible UI change:** `.ds-*` primitives were no-ops under the tokens-only shim and are now styled by the package's `core.css`. The dashboard, readiness card, forms, and buttons will look different — this is the intended outcome, not a regression.
- **The adoption spec is the only surviving narrative** of the shim→package history (plus git). Do not add "formerly"/"migrated"/"previously" notes anywhere else.
