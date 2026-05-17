# SyncFit Dashboard Redesign — Design Spec

**Date:** 2026-05-16
**Status:** Approved (brainstorming) — pending implementation plan
**Supersedes:** the MVP spec's §1 "light progression view" and the
`modifications[]`-deferred-to-v1.1 note in `2026-05-16-syncfit-mvp-design.md`
(§1 "Explicitly deferred", §7). Those are now built, not deferred. Everything
else in the MVP spec still stands (single timezone, no RPE, no endurance,
Strong-CSV-only import, auth/scoping model).

## 1. Goal & Scope

The MVP dashboard is a developer scaffold: a date+title list with no weights, a
free-text plan the AI can only comment on, and an AI output (`modifications[]`)
that is intentionally left empty. Two concrete gaps motivate this redesign:

1. You cannot see the weights/reps you actually lifted anywhere in the app.
2. The AI cannot propose concrete weight changes against your plan, because the
   plan has no structured exercises to change.

This redesign reworks the plan into a **structured weekly template** (exercises
with target sets × reps × weight), splits the AI's output into **today-only
autoregulation** and **durable progression suggestions**, and rebuilds the
dashboard around a single daily decision: _what do I do in today's session, and
is my body ready for it?_

This is one cohesive feature, not independent subsystems, so it ships as one
spec → one plan. It is, however, larger than a visual refresh: it changes the
data model, the plan editor, the AI engine I/O, and the dashboard.

### In scope

- Structured plan model (`planned_exercise` child of `planned_session`).
- Plan editor rewrite (controlled, structured exercise rows + per-day notes).
- AI engine I/O: structured plan input + per-exercise recent-actual input;
  output split into `todayAdjustments[]` and `progressionSuggestions[]`.
- Dashboard rebuild (Layout A — focused single column) including visible
  lifted weights and a progression accept/dismiss inbox.

### Out of scope (unchanged from MVP spec)

- Strava/endurance, RPE, per-user timezone, progression charts/graphs (the
  redesign uses textual recent-actuals, not plotted trends), exercise-name
  autocomplete (reconciliation is fuzzy, in the AI prompt — see §4).

## 2. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| What does "AI edits the plan" mean? | Structured plan with target weights; AI proposes edits; user accepts/rejects; accepted edits update the recurring template. |
| Plan day structure | Exercises with target **sets × reps × weight**, plus a per-day free-text notes field (AI reads both). |
| Today-only vs. progression | **Two distinct AI outputs**: ephemeral today-only adjustments, and durable progression suggestions that write back to the template on accept. |
| Planned↔actual exercise name matching | **Free text**, reconciled by name similarity inside the AI prompt. No autocomplete UI, no first-import requirement. |
| Dashboard layout | **A — focused single column.** Today's session is the hero; readiness annotates it in place; progression is a secondary inbox. |

## 3. Data Model Changes (Postgres / Drizzle)

**`planned_session`** — keep `id, userId, dayOfWeek, modality`. `title` stays.
Rename `description` → `notes` (semantics unchanged: free text the AI reads).
Migration copies existing `description` values into `notes`.

**`planned_exercise`** (new) — one row per exercise per planned day:

- `id` (uuid pk), `plannedSessionId` (uuid, fk → `planned_session.id`,
  `onDelete: cascade`), `userId` (text, for direct user-scoped queries),
- `name` (text, free), `targetSets` (int), `targetReps` (int),
  `targetWeight` (numeric, lb), `orderIndex` (int — display order within day).

**`readiness_analysis`** — replace the single `modifications` jsonb with two:

- `todayAdjustments` jsonb `[{ exercise: string, change: string }]` — ephemeral,
  display-only, never written back. `[]` when none.
- `progressionSuggestions` jsonb
  `[{ exercise: string, currentWeight: number, suggestedWeight: number,
  suggestedSets?: number, suggestedReps?: number, rationale: string,
  status: 'pending' | 'accepted' | 'dismissed' }]`. Accept/dismiss mutates
  `status` in place; accept also writes the target onto the matching
  `planned_exercise`. No separate decisions table (YAGNI).

`planSnapshot`/`loadSnapshot`/`verdict`/`headline`/`rationale`/`model` are
unchanged. `planSnapshot` now snapshots the structured day (session + its
exercises).

Migration order: `drizzle-kit push` adds `planned_exercise`, renames
`planned_session.description` → `notes`, **adds** the two new
`readiness_analysis` jsonb columns (default `[]`), a one-time backfill copies
any old `modifications` into `todayAdjustments`, then the `modifications` column
is dropped. Old `readiness_analysis` rows are historical and had `[]` anyway,
so this is effectively a rename + add.

## 4. AI Engine I/O (`src/lib/ai-engine.ts`, `src/lib/trailing-load.ts`)

**`trailing-load.ts`** gains, per exercise, the **recent top set** within the
window: `{ exerciseName, topSetWeight, topSetReps, performedAt }` (heaviest set;
ties broken by most reps then most recent). This is the actual-performance
signal the model and the dashboard both read. Existing fields
(volume, setCount, sessions, restDays, lastSessionAt) are unchanged. This stays
a pure module; new behavior is unit-tested against a fixed `now`.

**`AnalyzeInput`** gains structured plan data:
`plannedSession: { title, modality, notes, exercises: [{ name, targetSets,
targetReps, targetWeight }] }`, and `trailingLoad.perExercise` carries the
recent-top-set fields above.

**Output schema (Zod):**

```ts
{
  verdict: 'push_harder' | 'proceed_as_planned' | 'reduce_intensity' | 'rest',
  headline: string,
  rationale: string,
  todayAdjustments: { exercise: string, change: string }[],          // ephemeral
  progressionSuggestions: {
    exercise: string,
    currentWeight: number,
    suggestedWeight: number,
    suggestedSets?: number,
    suggestedReps?: number,
    rationale: string,
  }[],                                                               // → template on accept
}
```

The model returns `progressionSuggestions` **without** a `status`; the server
stamps every emitted suggestion `status: 'pending'` on persist.

**`buildPrompt`** changes (still pure, snapshot-tested):

- Supplies the structured planned exercises (with targets + notes) and the
  per-exercise recent top set.
- Instructs the model to **fuzzy-match planned exercise names to the trailing
  actual names by similarity** (e.g. "Bench" ≈ "Bench Press"); unmatched
  planned exercises get no progression suggestion.
- Separates the two outputs explicitly: `todayAdjustments` = "back off / push
  *today only* given 72h load"; `progressionSuggestions` = "durable target
  change going forward, only on clear evidence" (clean reps at or above target
  across recent sessions, or a stall). Default both to `[]`; emit progression
  only with evidence.
- No RPE (unchanged MVP constraint); fatigue judged on volume/frequency/rest.

Retry/offline behavior is unchanged: one retry, friendly `/couldn't analyze/i`
error on failure, dynamic import of `ai`/`@ai-sdk/anthropic` so unit tests stay
offline, and **nothing persisted on failure** (MVP spec §8 still holds).

## 5. Plan Editor Rewrite (`src/app/plan/plan-editor.tsx`, `plan-store.ts`)

Per day: a modality select, a notes textarea, and a repeatable list of exercise
rows — `name`, `targetSets`, `targetReps`, `targetWeight` — with add-row and
remove-row controls. The component **stays controlled** (value+onChange from
state) for every field including the dynamic exercise rows: React 19 calls
native `form.reset()` after a `<form action={serverAction}>` submit, so
uncontrolled fields revert after Save (existing CLAUDE.md gotcha). Field naming
must encode day + row index so the bulk action can read them
(e.g. `ex-{day}-{row}-name`); document the scheme alongside the existing
`title-/notes-/modality-{0..6}` convention.

`plan-store.ts` save is **replace-on-save per day**: upsert `planned_session`
(title/modality/notes) and replace that day's `planned_exercise` rows
(delete-then-insert within the day's scope) so removed rows disappear and order
is authoritative. Server action resolves `userId` from session, scopes all
writes, redirects unauthenticated (unchanged auth model).

A new server action **`applyProgressionDecision({ analysisId, exercise,
decision: 'accept' | 'dismiss' })`**: session-scoped; on `accept`, writes
`suggestedWeight` (and `suggestedSets`/`suggestedReps` if present) onto the
matching `planned_exercise` for the relevant day and sets that suggestion's
`status` to `accepted`; on `dismiss`, only sets `status: 'dismissed'`. Matching
the suggestion's `exercise` string to a `planned_exercise` row uses the same
case-insensitive similarity rule as the prompt; an unresolvable match returns a
friendly error and changes nothing.

## 6. Dashboard (`src/app/page.tsx`) — Layout A, focused column

Single column, top to bottom:

1. **Today hero** (`.ds-panel`) — weekday + modality, the planned exercises as a
   table (`exercise · sets × reps @ weight`), the day's notes, and the
   **analyze readiness** button (`.ds-btn .ds-btn-primary`). One analysis in
   flight per user — button disabled+labeled while pending (MVP spec §8).
2. **Readiness result** (after analyze) — a **verdict banner** then each planned
   exercise annotated inline with its today adjustment (if any) and its recent
   actual: `recent: 185 × 5 (3d ago)`, pulled from the trailing top-set data.
   This is the fix for "I can't see my weights": targets and actuals sit side
   by side on the thing you're about to do.
3. **Recent activity** — a disclosure list of recent workouts; expanding a
   workout shows its sets as `weight × reps` per exercise. Real numbers, the
   second half of the weights fix.
4. **Progression inbox** — `progressionSuggestions` with `status: 'pending'`
   from the latest analysis: each shows `current → suggested` (+ sets/reps if
   changed) and the model's rationale, with **accept** and **dismiss** controls
   wired to `applyProgressionDecision`. Accepted/dismissed suggestions leave the
   inbox; accepted ones are reflected next time the plan/that weekday renders.
5. **History** — condensed past readiness checks (date · verdict · headline).

**Empty states:** no planned session for today → hero invites building the plan
(`next/link` → `/plan`); no imports → invite import (`next/link` → `/import`);
analyze with no planned session → the existing "add one on the Plan page first"
message.

## 7. Design-System Conformance (`@dustin-riley/design`)

Binding rules for this UI (validated against the `dustinriley-design` skill):

- **Verdict banner is never color-only.** Each of the four verdicts renders a
  **sentence-case word + a `lucide-react` icon + an accent**. Accents draw only
  from the existing palette — primary burnt orange / ochre / teal — no new
  colors. Suggested mapping: `proceed_as_planned` → teal + check,
  `push_harder` → primary + arrow-up, `reduce_intensity` → ochre + arrow-down,
  `rest` → ochre + pause. The word, not the color, is the signal.
- **Accept/dismiss and the recent-activity disclosure** carry text labels and a
  lucide icon/arrow — color is never the only state signal; motion < 300ms.
- **Links** use `--ds-link` (not `--ds-primary`) and `next/link`, not raw `<a>`
  (the current `page.tsx` `<a>` tags are replaced).
- **Primitives only:** surfaces `.ds-panel`; buttons `.ds-btn` +
  `-primary|-secondary|-ghost`; type `.h1`–`.h6`/`.ds-*`; layout
  `.ds-container`/`.ds-section`. No hand-rolled boxes — the 3 radii (8/16/999)
  and warm shadows come from the primitives. No hard-coded hex/px; reference
  `--ds-*` tokens only.
- **Voice:** sentence case everywhere ("today", "recent activity",
  "progression"), first person where there's voice, no emoji, no italics in
  chrome.

## 8. Error & Empty Handling (deltas only; MVP spec §8 otherwise holds)

- AI failure → friendly error, **nothing persisted** (unchanged).
- Progression accept where the suggestion can't be matched to a
  `planned_exercise` → friendly error, no write.
- Plan day with zero exercises is valid (e.g. a rest day); analyze on a day
  with no exercises still produces a verdict (no targets to adjust → empty
  `todayAdjustments`/`progressionSuggestions`).
- Re-running analyze the same day appends a new `readiness_analysis`; the
  dashboard reads the latest (unchanged).

## 9. Testing Strategy (TDD — pure modules first; `npm test` stays offline)

- **`trailing-load` (unit, first):** recent-top-set per exercise — heaviest set,
  tie-break reps then recency, window boundaries, no-data → null, against a
  fixed `now`. Existing aggregate assertions kept.
- **`ai-engine` (unit):** `buildPrompt` snapshot-stable for a structured-plan
  fixture; model call **mocked**; assert the two output lists parse, defaults to
  `[]`, retry path, and `status` is server-stamped not model-supplied.
- **`plan-store` + `applyProgressionDecision` (integration):** auth scoping,
  replace-on-save (removed rows gone, order authoritative), accept writes
  `targetWeight`/sets/reps onto the right `planned_exercise`, dismiss mutates
  only `status`, unmatched accept is a no-op error. Self-cleaning `itest-*`
  users, run via `node --env-file=.env.local` (unchanged harness).
- Build gate unchanged: `npm test` + `npx tsc --noEmit` + `npm run lint` +
  `npm run format:check` + `npm run build`; `npm run test:integration` for the
  server-action/DB paths.

## 10. Open Items for Implementation

- Confirm the exact similarity rule shared by the prompt and
  `applyProgressionDecision` (case-insensitive substring/containment is likely
  enough for v1; pick at plan time and keep it in one helper so prompt and
  server agree).
- Decide column rename vs. add+backfill+drop for `description`→`notes` and
  `modifications`→two columns at plan time (Neon/drizzle-kit mechanics; data is
  effectively empty/`[]` so either is low-risk).
