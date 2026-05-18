# AI Plan Generation & Plan Goal — Design

Status: approved (brainstorm 2026-05-17)
Supersedes: nothing. Extends the SyncFit MVP (`2026-05-16-syncfit-mvp-design.md`).

## 1. Goal & Scope

Let a user build their weekly training plan by talking to the AI instead of
hand-entering 7 days of exercises, and give plans a durable free-text **goal**
that contextualizes the daily readiness verdict (a fat-loss cut and a bulk
should get different calls on the same trailing load).

### In scope

- A free-text **plan goal** persisted per user, fed into the readiness prompt.
- A conversational ("back and forth") AI plan builder: the AI may ask
  clarifying questions before it commits a proposed weekly plan.
- Plan page redesign (layout C): goal field + existing editor always visible;
  chat in an on-demand drawer.
- Proposed plan/goal flow into the existing controlled editor for review; the
  existing Save path persists everything. Nothing persists until Save.

### Explicitly deferred (documented, not built)

- Token streaming of chat replies (turns are request/response).
- Persisted or branchable chat history (conversation is ephemeral, client-only).
- Structured goal enum (goal is free text only).
- Per-day / partial AI targeting (a committed proposal is a full 7-day week).

## 2. Decisions (from brainstorm)

| Question | Decision |
|---|---|
| Goal representation | Free text only |
| Goal vs generation prompt | Conversational chat; AI can ask questions before setting a plan |
| Plan handoff | Propose → review in existing editor → Save (non-destructive) |
| Chat persistence | Ephemeral, client-only (no chat table) |
| AI context | Current saved weekly plan + recent training history |
| Goal capture | Always-visible editable field; AI pre-fills it on proposal |
| Page layout | C — chat in a drawer (goal + editor are the default surface) |

## 3. Data Model

New table, applied via `drizzle-kit push` (`default ''` keeps it safe for
existing rows — no backfill needed):

```
plan_profile
  user_id    text         primary key
  goal       text         not null default ''
  updated_at timestamptz  not null default now()
```

Rationale: "the plan" today is just the 7 per-user `planned_session` rows —
there is no plan-parent entity. `plan_profile` is the first home for
plan-level, per-user metadata. No chat table (conversation is ephemeral).

`src/db/schema.ts` gains `planProfile`. No change to `planned_session` /
`planned_exercise` / `readiness_analysis`.

## 4. AI Plan-Generator Library

New pure module `src/lib/plan-generator.ts`, mirroring `src/lib/ai-engine.ts`
conventions exactly:

- `ai` / `@ai-sdk/anthropic` imported dynamically inside the default generate
  fn so unit tests stay offline; tests inject a `generate` fn.
- One retry on failure, then throw a friendly `/couldn't build/i`-style error
  (parallel to ai-engine's `/couldn't analyze/i`).
- Reuses `MODEL_ID` / `MODEL_LABEL` from `ai-engine.ts` (same model).

**Per-turn structured contract** (request/response, not streaming) via
`generateObject` + Zod, consistent with the readiness engine:

```ts
PlanTurnSchema = {
  reply: string,                    // assistant's message to show
  proposedPlan: WeeklyPlan | null,  // non-null only when AI commits a plan
  proposedGoal: string | null,      // concise goal to pre-fill the goal field
}

WeeklyPlan = Array<{                 // exactly 7 entries, dayOfWeek 0..6
  dayOfWeek: number,
  title: string,
  notes: string,
  modality: "strength" | "endurance" | "rest",
  exercises: Array<{ name: string; targetSets: number;
                     targetReps: number; targetWeight: number }>,
}>
```

`WeeklyPlan` is shaped to map 1:1 onto the editor's existing
`PlanDayInput` / `Day[]` so an applied proposal drops straight into editor
state with no translation layer.

Behavior: the model returns `reply` with `proposedPlan: null` to ask
clarifying questions; it fills `proposedPlan` + `proposedGoal` only when it has
enough to commit. This is what makes the flow a back-and-forth rather than a
one-shot generate. A turn whose `proposedPlan` fails schema validation is
retried once, then surfaces the friendly error (no partial plan shown).

**Prompt context** passed in by the caller:

- The conversation so far (array of `{role, content}`; client-held).
- The user's current saved 7-day plan (so the AI can iterate on it, not always
  start from scratch).
- A recent-training summary built from `loadRecentTraining` /
  `computeRecentTraining` — the *same* source the readiness flow uses; the load
  aggregation is not re-duplicated.

## 5. Server Action

Thin `"use server"` action `proposePlanTurn(messages)` in
`src/app/actions/plan.ts` (or a sibling), following the project's
thin-action-over-pure-lib rule:

1. Resolve session; `redirect("/login")` if absent.
2. Scope by `userId`: load the user's current plan (`getPlanForUser`) and
   recent training (`loadRecentTraining`).
3. Delegate to `plan-generator` with the injected/default generate fn.
4. Return `{ reply, proposedPlan?, proposedGoal? }` or `{ error }`.

No DB writes — the action is read + LLM only. Persistence happens exclusively
through the existing Save path (§6).

## 6. Plan Page Restructure (layout C)

`src/app/(app)/plan/page.tsx` still resolves the session server-side and now
also loads `plan_profile.goal`. It renders a new client shell.

**New `plan-workspace.tsx` (client)** owns shared state seeded from the server:

- `days: Day[]` and `goal: string`.
- Renders, top to bottom:
  - editable **goal** field (always visible; AI pre-fills it),
  - the existing **`PlanEditor`**, refactored to accept `days` + change
    handlers from the parent instead of owning its own `useState` (it stays a
    controlled component — the React-19 form-reset rationale in CLAUDE.md still
    applies; field names `title-/notes-/modality-{0..6}`, `rowCount-{dow}`,
    `ex-{dow}-{row}-{name|sets|reps|weight}` are unchanged),
  - a **"build with ai"** button that opens the chat **drawer** (overlay; no
    permanent layout cost — the reason layout C was chosen).
- **Drawer**: ephemeral message list + text input. Each send calls
  `proposePlanTurn`. When a turn returns `proposedPlan`, the drawer shows an
  **"apply to plan"** action; applying lifts `proposedPlan` into `days` and
  `proposedGoal` into `goal`, then closes the drawer. The user reviews/tweaks
  in the editor and clicks **Save**.
- Closing the drawer or reloading discards the conversation (ephemeral).

**Save path**: the existing `savePlanWeek` form gains a `goal` field.
`savePlanWeek` reads it and `upsertPlanWeekForUser` (or a sibling call)
upserts `plan_profile` for the user — a single-statement write on `db`
(not `txDb`; consistent with plan-store's deliberately non-transactional,
single-user-blast-radius design). `revalidatePath("/plan")` and `"/"` as today.

## 7. Goal → Readiness Wiring

- `AnalyzeInput` (in `ai-engine.ts`) gains `goal: string`. `buildPrompt` adds
  one line — `User's stated goal: <goal>` — so verdict, `todayAdjustments`,
  and `progressionSuggestions` are interpreted through the goal. When `goal`
  is empty the line is omitted and behavior is byte-identical to today (safe
  rollout).
- `runReadinessAnalysis` loads `plan_profile.goal` for the user and passes it
  into `analyzeReadiness`. The goal is included in the persisted
  `planSnapshot` so historical `readiness_analysis` rows stay self-describing.
- No schema change to `readiness_analysis`.

## 8. Testing

**Unit (offline, LLM mocked, no DB/network — must stay green):**

- `plan-generator` with injected `generate`: (a) clarifying-question turn
  (`proposedPlan: null`, non-empty `reply`); (b) ready turn (valid 7-day
  `proposedPlan` + `proposedGoal`); (c) schema-invalid object → retry →
  friendly error thrown, no partial plan.
- `buildPrompt`: includes the goal line when `goal` is non-empty; omits it
  when empty.

**Integration (live `DATABASE_URL`, injected LLM, self-cleaning `itest-*`):**

- `savePlanWeek` upserts and updates `plan_profile.goal`; round-trips via the
  page load path.
- `runReadinessAnalysis` reads the user's goal and threads it into the prompt;
  empty-goal path unchanged.

**Green bar before the branch is done:** `npm test` + `npx tsc --noEmit` +
`npm run lint` + `npm run format:check` + `npm run build`, plus
`npm run test:integration` (server-action/DB paths are touched).

## 9. Design-System Constraints

All new UI (goal field, chat drawer, message bubbles, buttons) uses
`@dustin-riley/design`: reference `--ds-*` tokens / `.ds-*` classes only, no
hex/px, 3 radii (8/16/999) and warm shadows only, sentence-case copy, no
emoji. Implementation routes through the `dustinriley-design` skill (not the
generic `frontend-design` skill — the design surface is locked).

## 10. Out of Scope / Non-Goals

Streaming chat, persisted/branchable conversations, structured goal enums,
partial-week AI edits, multi-plan support, and any change to the
Strong-import / trailing-load / progression-decision subsystems.
