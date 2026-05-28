# Design System Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate SyncFit's web frontend from the installed soft-aesthetic `@dustin-riley/design@0.5.0` npm package to the vendored hard-edge "athletic" Dustin Riley Design System, retiring all `--ds-*` tokens and `.ds-*` classes.

**Architecture:** Vendor the bundle's `tokens.css` + `components.css` (+ loader SVG, `celebrate.js`) into `src/styles/design/`, drop the npm dependency, keep Next's font optimization (rebinding to `--font-*`), and add a thin Tailwind `@theme` bridge so existing utilities resolve to the new tokens. Then re-skin every surface per the bundle's 19-surface migration map — recipe swaps + a mechanical `--ds-*`→unprefixed token rename. No behavior, route, server-action, or data changes.

**Tech Stack:** Next.js 16 (App Router) · React 19 · Tailwind v4 (`@tailwindcss/postcss`) · TypeScript · vendored CSS design system.

---

## Reference: global mapping rules (used by every task)

These two tables are the migration's backbone. Tasks 2–8 apply them per file; only structural rewrites get bespoke code.

### A. Token rename (inline `var(--ds-*)`, all of `src/`)

**Rule:** drop the `ds-` prefix. Examples (non-exhaustive — same rule for every token):

| Old | New |
|---|---|
| `--ds-bg` `--ds-surface` `--ds-surface-sunken` `--ds-border` `--ds-text` `--ds-text-muted` | `--bg` `--surface` `--surface-sunken` `--border` `--text` `--text-muted` |
| `--ds-primary` `--ds-primary-hover` `--ds-primary-pressed` `--ds-link` `--ds-link-hover` | drop prefix |
| `--ds-accent-ochre` `--ds-accent-teal` `--ds-success` `--ds-warning` `--ds-error` `--ds-on-primary` | drop prefix |
| `--ds-surface-ai` `--ds-on-surface-ai` | drop prefix |
| `--ds-fs-*` `--ds-lh-*` `--ds-tracking-*` `--ds-space-N` | `--fs-*` `--lh-*` `--tracking-*` `--space-N` |
| `--ds-radius-sm/md/pill` `--ds-shadow-sm/md/lg` | drop prefix |
| `--ds-duration-fast/base/slow` `--ds-ease-standard` | drop prefix |
| `--ds-border-width` (1px) | `--rule-width` on structural surfaces; or literal `1px` for a soft hairline (`1px solid var(--border)`) — pick per surface |

`--ds-accent-plum`, `--ds-fs-h6`, `--ds-lh-h6`, `--ds-focus-ring-color` are **not referenced in `src/`** — no rename needed (focus is handled globally by the vendored CSS).

### B. Class swap

| Old class | New class |
|---|---|
| `ds-panel` | `card` (working surfaces) / `card--soft` (floating + welcome chrome — only where noted) |
| `ds-btn ds-btn-primary` | `btn` (+ `btn--cta` on the one primary CTA per screen) |
| `ds-btn ds-btn-secondary` | `btn btn--secondary` |
| `ds-btn ds-btn-ghost` | `btn btn--ghost` |
| `ds-mono-note` | `caption` (mono meta) — keep any inline color override after token-rename |
| `grid-label` | `metric-label` |
| `ds-caption` | `caption` |
| `ds-display` | `display` |
| `ds-container` | `container` |
| raw input classes `border rounded p-2 …` | `input` |

**Note on `caption` vs `metric-label`:** the new `.caption` is the body-face small/muted recipe; `.metric-label` is the **mono uppercase** micro-label. Use `metric-label` where the old `.ds-mono-note`/`.grid-label` was clearly a mono eyebrow/column header; use `caption` for sentence-case helper text. When unsure, `metric-label` preserves the mono look `.ds-mono-note` had.

### C. Verification snippet (run after each task's edits, scoped to the task's files)

```bash
grep -rEn "\-\-ds-|ds-panel|ds-btn|ds-ai|ds-mono-note|ds-caption|ds-display|ds-container|grid-label" <files-touched-this-task>
```
Expected: no matches.

---

## Task 1: Vendor the design system + wire globals, fonts, package

**Files:**
- Create: `src/styles/design/tokens.css`
- Create: `src/styles/design/components.css`
- Create: `public/loader-bar-curl.svg`
- Create: `src/styles/design/celebrate.js`
- Modify: `src/app/globals.css`
- Modify: `src/app/layout.tsx`
- Modify: `package.json`

Bundle source (extracted earlier this session):
`/Users/dustin/.claude/projects/-Users-dustin-Development-workout-tracker/565ccc19-9432-4130-bfad-d42e48ad3d5a/tool-results/extracted/syncfit-design-system/project/`
(If gone: re-fetch `https://api.anthropic.com/v1/design/h/P8GROCYhu6IP2joYbiXZiw` → it's a gzipped tar → extract → same layout.)

- [ ] **Step 1: Copy the four vendored files**

```bash
SRC="/Users/dustin/.claude/projects/-Users-dustin-Development-workout-tracker/565ccc19-9432-4130-bfad-d42e48ad3d5a/tool-results/extracted/syncfit-design-system/project"
mkdir -p src/styles/design public
cp "$SRC/tokens/tokens.css"            src/styles/design/tokens.css
cp "$SRC/web/components.css"           src/styles/design/components.css
cp "$SRC/assets/loader-bar-curl.svg"  public/loader-bar-curl.svg
cp "$SRC/web/celebrate.js"             src/styles/design/celebrate.js
```

- [ ] **Step 2: Edit `src/styles/design/tokens.css` — remove the font @import, fix the loader mask path**

Delete the line (near the top, ~line 17):
```css
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap');
```
(Fonts are loaded by `next/font` in `layout.tsx`; this avoids a double load.)

Change the loader mask (search `--mask-loader-bar-curl`):
```css
  --mask-loader-bar-curl: url("../assets/loader-bar-curl.svg");
```
to (the SVG now lives in `public/`, served from web root):
```css
  --mask-loader-bar-curl: url("/loader-bar-curl.svg");
```

- [ ] **Step 3: Edit `src/styles/design/components.css` — fix the tokens import**

Change the top import:
```css
@import url('../tokens/tokens.css');
```
to:
```css
@import "./tokens.css";
```

- [ ] **Step 4: Rewrite `src/app/globals.css`**

```css
@import "tailwindcss";
@import "../styles/design/components.css";

/* Thin Tailwind bridge — maps Tailwind utility keys onto the NEW design tokens
   so existing utilities (rounded-*, font-*, text-muted-foreground, bg-card,
   border-input, text-destructive, …) keep resolving. The --ds-* layer is gone;
   this bridge is Tailwind-only and does not reintroduce --ds-* names. */
@theme {
  --radius-sm: 8px;
  --radius-md: 16px;
  --radius-lg: 16px;
  --radius-xl: 16px;
  --radius-2xl: 16px;
  --radius-3xl: 16px;

  --font-display: "Outfit", system-ui, sans-serif;
  --font-body: "DM Sans", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, monospace;

  --color-background: var(--bg);
  --color-foreground: var(--text);
  --color-card: var(--surface);
  --color-card-foreground: var(--text);
  --color-muted: var(--surface-sunken);
  --color-muted-foreground: var(--text-muted);
  --color-primary: var(--primary);
  --color-primary-foreground: var(--on-primary);
  --color-destructive: var(--error);
  --color-destructive-foreground: #ffffff;
  --color-border: var(--border);
  --color-input: var(--rule);
  --color-ring: var(--primary);
}

@layer base {
  *,
  ::after,
  ::before,
  ::backdrop,
  ::file-selector-button {
    border-color: var(--border);
  }
}
```

- [ ] **Step 5: Rebind fonts in `src/app/layout.tsx`**

Change the three font variable bindings from `--ds-font-*` to `--font-*`:
```tsx
const display = Outfit({ subsets: ["latin"], variable: "--font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono" });
```
(The `<html className={...}>` line and everything else stay exactly as-is.)

- [ ] **Step 6: Remove the npm dependency**

In `package.json`, delete the line:
```json
    "@dustin-riley/design": "0.5.0",
```
Then:
```bash
npm install
```
Expected: install succeeds; `@dustin-riley/design` no longer in `node_modules`.

- [ ] **Step 7: Verify the build resolves the vendored CSS**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors).

Run: `npm run build`
Expected: build completes; CSS `@import`s resolve; no "module not found @dustin-riley/design" and no unresolved `url()` for the loader. (Pages will look mid-migration — that's expected; later tasks fix appearance.)

- [ ] **Step 8: Commit**

```bash
git add src/styles/design/ public/loader-bar-curl.svg src/app/globals.css src/app/layout.tsx package.json package-lock.json
git commit -m "feat(design): vendor hard-edge design system; drop @dustin-riley/design package"
```

---

## Task 2: Auth surfaces

**Files:**
- Modify: `src/app/(auth)/layout.tsx`
- Modify: `src/app/(auth)/field.tsx`
- Modify: `src/app/(auth)/auth-form.tsx`
- Modify: `src/app/(auth)/login/page.tsx`
- Modify: `src/app/(auth)/signup/page.tsx`

- [ ] **Step 1: `(auth)/layout.tsx` — welcome shell → `.card--soft`**

Replace the panel + display/caption classes:
```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="card--soft w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="display">SyncFit</h1>
          <p className="caption text-muted-foreground">
            Train smart. Progress on purpose.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
```
Note: `.card--soft` is a modifier on `.card`; apply both. Correct form:
```tsx
      <div className="card card--soft w-full max-w-md p-8">
```

- [ ] **Step 2: `(auth)/field.tsx` — input → `.input` recipe**

Replace the `<input>` className (keep `value`/`onChange`/`aria-*` — field STAYS controlled). The `.input` recipe styles `[aria-invalid="true"]` itself, so drop the manual border classes:
```tsx
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          className={`input w-full ${trailing ? "pr-11" : ""}`}
        />
```
And the label + hint:
```tsx
        <label htmlFor={id} className="caption mb-1 block">
```
```tsx
        <p id={hintId} className="caption mt-1 text-muted-foreground">
```

- [ ] **Step 3: `(auth)/auth-form.tsx` and `login/page.tsx`, `signup/page.tsx` — apply tables A + B**

Open each file. Apply the **Class swap (B)** and **Token rename (A)** rules: `ds-btn ds-btn-primary` → `btn btn--cta` for the submit button; `ds-btn ds-btn-ghost`/`-secondary` → `btn btn--ghost`/`btn btn--secondary`; `ds-caption`→`caption`; any `var(--ds-*)`→unprefixed. Submit buttons that drive an async request get `aria-busy={<pending state>}` (use the form's existing pending/loading boolean; if there's a `"…"` label swap, keep it). Keep all inputs controlled.

- [ ] **Step 4: Verify (table C) over the auth files**

```bash
grep -rEn "\-\-ds-|ds-panel|ds-btn|ds-ai|ds-mono-note|ds-caption|ds-display|ds-container|grid-label" src/app/\(auth\)
```
Expected: no matches.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(auth\)
git commit -m "feat(design): migrate auth surfaces to new recipes"
```

---

## Task 3: Site nav + app layout

**Files:**
- Modify: `src/app/(app)/site-nav.tsx`
- Modify: `src/app/(app)/layout.tsx` (only if it carries `--ds-*`/`.ds-*` — apply tables A+B; likely no change)

- [ ] **Step 1: `site-nav.tsx` — token rename + class swaps (preserve the bespoke floating-pill look)**

The nav is intentionally a custom inline-styled floating pill (the soft chrome the map calls for). Do NOT restructure it. Apply:
- **Token rename (A)** to every inline `var(--ds-*)` (e.g. `--ds-bg`→`--bg`, `--ds-border`→`--border`, `--ds-shadow-md`→`--shadow-md`, `--ds-radius-pill`→`--radius-pill`, `--ds-font-display`→`--font-display`, `--ds-accent-ochre`→`--accent-ochre`, `--ds-on-primary`→`--on-primary`, `--ds-text`/`-muted`→`--text`/`--text-muted`, `--ds-link`→`--link`, `--ds-fs-*`→`--fs-*`, `--ds-space-*`→`--space-*`). For the nav border, map `--ds-border-width` → literal `1px` (the floating pill keeps a soft hairline, not the 1.5px ink rule).
- **Class swap (B):** nav links and the account trigger `ds-btn ds-btn-ghost` → `btn btn--ghost`; the dropdown `<div role="menu" className="ds-panel …">` → `card card--soft` (floating chrome); menu items `ds-btn ds-btn-ghost` → `btn btn--ghost`; the email line `ds-mono-note` → `caption`; the error `ds-mono-note` → `caption` (keep its `color: var(--error)` after rename).

- [ ] **Step 2: Verify (table C) over `src/app/(app)/site-nav.tsx` and `layout.tsx`**

```bash
grep -rEn "\-\-ds-|ds-panel|ds-btn|ds-ai|ds-mono-note|ds-caption|ds-display|ds-container|grid-label" src/app/\(app\)/site-nav.tsx src/app/\(app\)/layout.tsx
```
Expected: no matches.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/site-nav.tsx src/app/\(app\)/layout.tsx
git commit -m "feat(design): migrate floating nav + app layout"
```

---

## Task 4: Dashboard

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/dashboard/today-session.tsx`
- Modify: `src/app/(app)/dashboard/verdict-banner.tsx`
- Modify: `src/app/(app)/dashboard/progression-inbox.tsx`
- Modify: `src/app/(app)/dashboard/training-week.tsx` (apply tables A+B if it carries any `--ds-*`/`.ds-*`)

- [ ] **Step 1: `verdict-banner.tsx` — full rewrite to the `.ai-banner` recipe**

This is a structural change (not a class swap). Replace the whole file:

```tsx
import { ArrowUp, ArrowDown, Check, Pause, Bot } from "lucide-react";

const MAP: Record<
  string,
  { label: string; Icon: typeof Check; modifier: string }
> = {
  proceed_as_planned: {
    label: "proceed as planned",
    Icon: Check,
    modifier: "ai-banner--proceed",
  },
  push_harder: { label: "push harder", Icon: ArrowUp, modifier: "ai-banner--push" },
  reduce_intensity: {
    label: "reduce intensity",
    Icon: ArrowDown,
    modifier: "ai-banner--reduce",
  },
  rest: { label: "rest", Icon: Pause, modifier: "ai-banner--rest" },
};

export function VerdictBanner({
  verdict,
  headline,
  rationale,
  model,
}: {
  verdict: string;
  headline: string;
  rationale: string;
  model: string;
}) {
  const v = MAP[verdict] ?? MAP.proceed_as_planned;
  return (
    <div className={`ai-banner ${v.modifier} my-3`}>
      <span className="ai-banner__eyebrow">
        <Bot size={13} aria-hidden="true" /> the model says · {model}
      </span>
      <p className="ai-banner__verdict">
        <v.Icon size={16} aria-hidden="true" />
        {v.label}
      </p>
      <p className="ai-banner__headline">{headline}</p>
      <p className="ai-banner__body">{rationale}</p>
    </div>
  );
}
```

- [ ] **Step 2: `today-session.tsx` — `.card` + analyze CTA with loader**

Apply: section `ds-panel p-4 my-3` → `card p-4 my-3`; `.ds-mono-note` → `caption`; inline `var(--ds-link)`→`var(--link)`, `var(--ds-accent-ochre)`→`var(--accent-ochre)`, `var(--ds-error)`→`var(--error)`.

Replace the analyze button so it's the screen CTA and shows the bar-curl loader while busy:
```tsx
      <button
        className="btn btn--cta mt-3"
        aria-busy={busy}
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setOut(await analyzeToday());
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "analyzing…" : "analyze readiness"}
      </button>
```
(The `.btn[aria-busy="true"]::before` recipe renders the loader automatically; keep the label swap.)

- [ ] **Step 3: `(app)/page.tsx` — empty-state → `.card`; readiness feed → `.field-grid`**

- "no plan for today" `<section className="ds-panel p-4 my-3">` → `card p-4 my-3`; `.ds-mono-note`→`caption`; `var(--ds-link)`→`var(--link)`.
- `.ds-container p-8` → `container p-8`.
- The "past readiness checks" list (activity rows) becomes a `.field-grid` of `.field--paper` blocks (rows are not individual cards):

```tsx
      <section className="my-6">
        <h2 className="h4">past readiness checks</h2>
        <div className="field-grid">
          {pastAnalyses.map((a) => (
            <div key={a.id} className="field field--paper">
              <span className="caption">
                {a.analysisDate} · {a.verdict.replace(/_/g, " ")}
              </span>{" "}
              <strong>{a.headline}</strong>
            </div>
          ))}
        </div>
      </section>
```

- [ ] **Step 4: `progression-inbox.tsx` + `training-week.tsx` — apply tables A+B**

Open each. `ds-panel`→`card`; `ds-btn ds-btn-*`→`btn`/`btn btn--ghost`/`btn btn--secondary` (accept/dismiss pairs: accept = `btn`, dismiss = `btn btn--ghost`); `ds-mono-note`/`grid-label`→`caption`/`metric-label`; token rename (A) on all inline `var(--ds-*)`.

- [ ] **Step 5: Verify (table C) over the dashboard files**

```bash
grep -rEn "\-\-ds-|ds-panel|ds-btn|ds-ai|ds-mono-note|ds-caption|ds-display|ds-container|grid-label" src/app/\(app\)/page.tsx src/app/\(app\)/dashboard
```
Expected: no matches.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/app/\(app\)/page.tsx src/app/\(app\)/dashboard
git commit -m "feat(design): migrate dashboard (ai-banner, field-grid feed, loader CTA)"
```

---

## Task 5: Plan (editor + chat sheet)

**Files:**
- Modify: `src/app/(app)/plan/plan-editor.tsx`
- Modify: `src/app/(app)/plan/plan-chat-drawer.tsx`
- Modify: `src/app/(app)/plan/plan-workspace.tsx`
- Modify: `src/app/(app)/plan/page.tsx`

- [ ] **Step 1: `plan-editor.tsx` — `.card` + `.input` (KEEP CONTROLLED, KEEP FIELD NAMES)**

Hard constraints (do not violate): every `<input>/<select>/<textarea>` keeps `value`+`onChange`; the `name` attributes (`rowCount-${dow}`, `title-${dow}`, `modality-${dow}`, `ex-${dow}-${ei}-{name|sets|reps|weight}`, `notes-${dow}`) and the positional `ei` row index stay exactly as-is.

Apply:
- `<section className="ds-panel p-4 my-3">` → `card p-4 my-3`.
- Every text/number input `className="border rounded p-2 …"` → `className="input …"` (preserve the width utilities `w-full`/`w-16`/`w-20`/`flex-1` and `my-1`). The `<select>` and `<textarea>` likewise → `input`.
- `grid-label` → `metric-label` (the column headers).
- The hidden spacer `<span className="ds-btn ds-btn-ghost" …>` → `btn btn--ghost`.
- Remove-exercise button `ds-btn ds-btn-ghost` → `btn btn--ghost`.
- Add-exercise button `ds-btn ds-btn-secondary` → `btn btn--secondary`.
- Save button `ds-btn ds-btn-primary` → `btn btn--cta`.

- [ ] **Step 2: `plan-chat-drawer.tsx` — right-drawer → bottom `.sheet` + `.bubble` (structural; PRESERVE behavior)**

Behavior to preserve verbatim: focus trap (`handlePanelKeyDown`), open-focus + restore-focus effect, Escape-to-close, the backdrop-click guard (`if (!pending) onClose()`), ephemeral state across close/reopen, `send()`, `toDays()`, the "apply this plan" button. Only the markup/classes change (and position: bottom sheet, not right drawer).

Replace the returned JSX (keep all hooks/handlers above it unchanged):

```tsx
  return (
    <>
      <div
        className="scrim"
        onClick={() => {
          if (!pending) onClose();
        }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="sheet sheet--large"
        onKeyDown={handlePanelKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="build plan with ai"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <h2 className="sheet-title">build with ai</h2>
          <button
            type="button"
            className="sheet-close"
            aria-label="close"
            onClick={onClose}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        <div className="sheet-body flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="caption">
              tell the coach your goal, schedule, and any constraints. it may
              ask a few questions before proposing a week.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "self-end" : "self-start"}
            >
              <span className={m.role === "user" ? "bubble bubble--user" : "bubble"}>
                {m.content}
              </span>
            </div>
          ))}
          {busy && <p className="caption">thinking…</p>}
          {error && (
            <p className="caption" role="alert" style={{ color: "var(--error)" }}>
              {error}
            </p>
          )}
        </div>

        <div className="sheet-foot flex flex-col gap-2">
          {pending && (
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => onApply(toDays(pending.plan), pending.goal)}
            >
              apply this plan to the editor
            </button>
          )}
          <div className="flex gap-2">
            <input
              className="input flex-1"
              aria-label="message"
              placeholder="message the coach…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              className="btn btn--secondary"
              aria-busy={busy}
              disabled={busy}
              onClick={() => void send()}
            >
              send
            </button>
          </div>
        </div>
      </div>
    </>
  );
```

Note: the old root `<div className="fixed inset-0 …" onClick={backdrop}>` is replaced by the `.scrim` (backdrop) + `.sheet` (panel) pair; the backdrop click handler moves onto `.scrim`. The `.sheet`'s own clicks no longer need `stopPropagation` because the scrim is a separate sibling element, not a parent.

- [ ] **Step 3: `plan-workspace.tsx` + `plan/page.tsx` — apply tables A+B**

`ds-btn ds-btn-*`→`btn`/variants (the "build with ai" trigger = `btn btn--ghost` or `btn btn--secondary`; the form Save, if rendered here, = `btn btn--cta`); `ds-panel`→`card`; `ds-mono-note`/`grid-label`→`caption`/`metric-label`; `ds-container`→`container`; token rename (A). If the plan form has a pending state on submit, set `aria-busy` on the Save button.

- [ ] **Step 4: Verify (table C) over the plan files**

```bash
grep -rEn "\-\-ds-|ds-panel|ds-btn|ds-ai|ds-mono-note|ds-caption|ds-display|ds-container|grid-label" src/app/\(app\)/plan
```
Expected: no matches.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/plan
git commit -m "feat(design): migrate plan editor + chat (bottom sheet, bubbles, controlled inputs)"
```

---

## Task 6: Progress (cards, segmented filters, chart recolor)

**Files:**
- Modify: `src/app/(app)/progress/progress-workspace.tsx`
- Modify: `src/app/(app)/progress/chart-card.tsx`
- Modify: `src/app/(app)/progress/chart-card-boundary.tsx`
- Modify: `src/app/(app)/progress/page.tsx`

- [ ] **Step 1: `progress-workspace.tsx` — `PillToggle` → `.seg`; empty/error → `.card`**

The two empty/error states: `<section className="ds-panel p-4 my-4">` → `card p-4 my-4`; inline `var(--ds-link)`→`var(--link)`; header inline `var(--ds-space-*)`→`var(--space-*)`.

Rewrite `PillToggle` as a segmented control (keep the generic typed API and `value`/`onChange`):
```tsx
function PillToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="seg" role="group">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={active ? "on" : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: `chart-card.tsx` — `.card` + recharts recolor + token rename**

- `<article className="ds-panel" style={{ padding: "var(--ds-space-3) var(--ds-space-4)" }}>` → `className="card"` with `padding: "var(--space-3) var(--space-4)"`.
- `.ds-mono-note` → `caption`; `.h5` stays.
- All inline `var(--ds-space-*)`→`var(--space-*)` (including `height: var(--ds-space-9)`→`var(--space-9)`).
- recharts `<Line stroke="var(--ds-accent-teal)" …>` → `stroke="var(--accent-teal)"`.

- [ ] **Step 3: `chart-card-boundary.tsx` + `progress/page.tsx` — apply tables A+B**

`ds-panel`→`card` (the error boundary fallback); `ds-container`→`container`; `ds-mono-note`→`caption`; token rename (A).

- [ ] **Step 4: Verify (table C) over the progress files**

```bash
grep -rEn "\-\-ds-|ds-panel|ds-btn|ds-ai|ds-mono-note|ds-caption|ds-display|ds-container|grid-label" src/app/\(app\)/progress
```
Expected: no matches.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/\(app\)/progress
git commit -m "feat(design): migrate progress (cards, segmented filters, chart tokens)"
```

---

## Task 7: Import + Log result panels

**Files:**
- Modify: `src/app/(app)/import/page.tsx`
- Modify: `src/app/(app)/log/page.tsx`

- [ ] **Step 1: Apply tables A+B to both pages**

Result panels `ds-panel`→`card`; submit/primary buttons `ds-btn ds-btn-primary`→`btn btn--cta` (import / log buttons get `aria-busy` on their pending state if one exists); other buttons → `btn btn--ghost`/`btn btn--secondary`; inputs `border rounded …`→`input`; `ds-mono-note`/`grid-label`→`caption`/`metric-label`; `ds-container`→`container`; token rename (A).

- [ ] **Step 2: Verify (table C)**

```bash
grep -rEn "\-\-ds-|ds-panel|ds-btn|ds-ai|ds-mono-note|ds-caption|ds-display|ds-container|grid-label" src/app/\(app\)/import src/app/\(app\)/log
```
Expected: no matches.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/import src/app/\(app\)/log
git commit -m "feat(design): migrate import + log surfaces"
```

---

## Task 8: Settings · devices

**Files:**
- Modify: `src/app/(app)/settings/devices/devices-client.tsx`
- Modify: `src/app/(app)/settings/devices/page.tsx`

- [ ] **Step 1: Apply tables A+B**

The three `.ds-panel` surfaces (error banner, pair-device section, paired-device list) → `card`. The pair/unpair buttons → `btn`/`btn btn--ghost`; the pairing-code input (if present) → `input`; a destructive "remove device" action, if any, → `btn btn--danger` (paired with a `btn btn--ghost` cancel). `ds-mono-note`/`grid-label`→`caption`/`metric-label`; `ds-container`→`container`; token rename (A). Async buttons get `aria-busy` on their pending state.

- [ ] **Step 2: Verify (table C)**

```bash
grep -rEn "\-\-ds-|ds-panel|ds-btn|ds-ai|ds-mono-note|ds-caption|ds-display|ds-container|grid-label" src/app/\(app\)/settings
```
Expected: no matches.

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/app/\(app\)/settings
git commit -m "feat(design): migrate settings/devices surfaces"
```

---

## Task 9: Final sweep, gate, and manual verification

**Files:** none (verification only) — fix-ups land in whichever file a grep flags.

- [ ] **Step 1: Repo-wide leftover sweep**

```bash
grep -rEn "\-\-ds-|ds-panel|ds-btn|ds-btn-primary|ds-btn-ghost|ds-btn-secondary|ds-ai|ds-ai-mark|ds-mono-note|ds-caption|ds-display|ds-lede|ds-container|ds-section|ds-page-header|ds-back-link|grid-label|@dustin-riley/design" src
```
Expected: **no matches.** If any line appears, migrate it using tables A+B (or, for `kbd`/`ds-page-header`/`ds-back-link` one-offs: `kbd`→`chip`, page-header eyebrow→`caption`, back-link→a muted inline `<Link>` with `var(--link)`), then re-run until clean.

- [ ] **Step 2: Confirm the package is fully gone**

```bash
grep -rn "@dustin-riley/design" . --include=*.json --include=*.ts --include=*.tsx --include=*.css ; ls node_modules/@dustin-riley 2>&1
```
Expected: no source references; `node_modules/@dustin-riley` does not exist.

- [ ] **Step 3: Full verification gate**

```bash
npm test
npx tsc --noEmit
npm run lint
npm run format:check
npm run build
```
Expected: all green. (`npm test` is offline unit tests — unchanged by a presentational migration; if `format:check` complains, run `npm run format` and amend the relevant task's commit or add a formatting commit.)

- [ ] **Step 4: Manual browser pass**

Run: `npm run dev`, then visit and eyeball each route for the new hard-edge look + no broken/unstyled elements:
- `/login`, `/signup` — soft welcome card, `.input` fields, controlled (type, submit a bad cred, confirm fields DON'T clear/revert).
- `/` — today `.card` + analyze `.btn--cta` (click → bar-curl loader spins, button re-enables), `.ai-banner` verdict with correct state color, past-readiness `.field-grid`.
- `/plan` — day `.card`s, `.input` rows; open "build with ai" → bottom `.sheet` with `.bubble`/`.bubble--user`, Escape closes, backdrop click is ignored while a proposal is pending, "apply" works; **Save the plan and confirm fields don't revert** (controlled-form check).
- `/progress` — `.seg` filter toggles switch metric/sort, chart line uses the teal token, cards render.
- `/import`, `/log` — result `.card`s, CTA loaders.
- `/settings/devices` — device `.card`s, pairing flow.

Document anything visually off (spacing/density) and fix in-place; the hard-edge offset shadows are heavier than the old soft look — tune padding/`my-*` where rows feel cramped.

- [ ] **Step 5: Final commit (if Step 1/3/4 produced fix-ups)**

```bash
git add -A
git commit -m "fix(design): final migration sweep + density tuning"
```

---

## Notes / deferred

- **`celebrate.js`** is vendored at `src/styles/design/celebrate.js` but intentionally **not wired** in this pass (it attaches `window.celebrate`/`window.popNumber`; wiring needs a small client component, e.g. a number-pop on a successful readiness score). Leave for a follow-up; not required for the migration to be complete.
- **iOS / `Tokens.swift`** untouched (separate consumer; platform-additive policy).
- **No new automated tests** — this is presentational; the gate proves correctness alongside the manual pass.
