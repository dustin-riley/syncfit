# SyncFit MVP — Design Spec

**Date:** 2026-05-16
**Status:** Approved (brainstorming) — pending implementation plan

## 1. Goal & Scope

Ship the thinnest vertical slice that delivers SyncFit's core value: a logged-in
user uploads their Strong CSV export, enters their weekly training plan, and
clicks **Analyze Readiness** to get an AI verdict on today's session based on
trailing strength load.

**Audience:** You + a few testers. Lightweight multi-user with auth and
per-user data isolation. Not a public product yet.

### In scope (v1)

- Email auth (Better Auth), per-user data isolation.
- Strong **CSV** import via authenticated upload page.
- Weekly training plan entry (recurring 7-day template).
- Dashboard: today's planned session, activity feed, light progression view.
- AI readiness analysis (verdict + rationale), persisted.

### Explicitly deferred

- **v2:** Strava OAuth + endurance model (`endurance_activity` + `activity_split`).
- **v1.1:** Populate AI `modifications[]` (per-exercise plan edits). Schema is
  built in v1; only the prompt changes — no schema change, no UI rework.

### Known v1 limitations (documented, accepted)

- **No RPE / perceived exertion.** The Strong CSV export has an empty `RPE`
  column. Trailing "load" in v1 = Σ volume, set count, frequency, rest days.
- **No endurance.** Strong CSV rows that are actually cardio (Distance/Seconds
  populated, Weight 0) are skipped with a warning — no endurance home until v2.
- **Single timezone.** All date math uses `APP_TZ = 'America/New_York'`. No
  per-user timezone. Acceptable for a button-driven daily tool.

## 2. Tech Stack

- **Framework/host:** Next.js (App Router) + Tailwind CSS v4, deployed on Vercel.
- **DB:** Neon Postgres + Drizzle ORM.
- **Auth:** Better Auth (email).
- **AI:** Vercel AI SDK (`ai`) + `@ai-sdk/anthropic`. Provider-agnostic
  interface; model swappable later.
- **Design system:** `@dustin-riley/design` (npm, exact-pinned). See §2a.

## 2a. Design System (`@dustin-riley/design`, npm)

SyncFit consumes the published `@dustin-riley/design` package. `globals.css` is
two imports — `@import "tailwindcss";` then
`@import "@dustin-riley/design/tailwind.css";`. The package's `tailwind.css`
transitively pulls in `core.css` (the `.ds-*` primitive vocabulary +
`:where()`-wrapped base element styling) and `tokens.css` (`--ds-*` constitution

- focus ring), and adds the Tailwind v4 `@theme` radius map + shadcn HSL bridge
  generated from the tokens.

* **shadcn React primitives are not in the package** (deferred there under
  YAGNI). If SyncFit adds shadcn/ui components, the bridge themes them
  automatically — no hand-copied HSL, no drift.
* **Fonts are app-side** (the package is framework-free CSS): `layout.tsx`
  loads Outfit (display), DM Sans (body), JetBrains Mono (mono) via
  `next/font` and binds them to `--ds-font-*`.
* The package version is exact-pinned (no `^`) so the design surface can't
  shift under the app. The bundled `dustinriley-design` Claude skill is
  vendored at `.claude/skills/dustinriley-design/SKILL.md`; re-sync on version
  bump.

**`DESIGN.md` constraints are spec rules:** reference `--ds-*` tokens, never
hard-code hex/px; exactly 3 radii (8/16/999px), warm-tinted shadows only;
sentence case; no emoji/italics in UI chrome; no gradient backgrounds or
glassmorphism; color is never the only state signal. Palette is warm-neutral on
burnt orange (`--ds-primary #b8541c`).

## 3. Architecture — Units

Each unit has one purpose, a defined interface, and is independently testable.

1. **Auth** — Better Auth, email login, sessions. Every data row scoped by
   `userId`; every server action/component resolves `userId` from the session.
2. **Strong CSV parser** — _pure module._ CSV text → normalized workout/set
   records. No DB, no HTTP. Standalone so a CLI could wrap it later.
3. **Ingestion** — authenticated upload page (`/import`) + server action: calls
   the parser, writes user-scoped rows, dedupes re-uploads.
4. **Plan entry** — structured recurring weekly plan (`/plan`), one planned
   session per day per user.
5. **Dashboard** (`/`) — daily view + Analyze button, unified activity feed,
   light progression view.
6. **AI engine** — _pure module._ `(plan + trailing load) → structured prompt →
Vercel AI SDK generateObject → Zod-typed result.` No DB/HTTP inside.
7. **Trailing-load aggregator** — _pure module._ `(userId rows, now, window) →`
   structured load summary. Designed to compose strength + (future) endurance
   sources without refactor.

## 4. Data Model (Postgres / Drizzle)

- **Better Auth tables** — `user`, `session`, `account`, `verification`
  (library-managed).
- **`workout`** — `id`, `userId`, `performedAt` (timestamptz, parsed from CSV
  `Date` in `APP_TZ`), `title` (from `Workout Name`), `source`
  (`'strong_csv'`), `contentHash` (sha256 of the normalized rows for this
  workout), `createdAt`. **Unique `(userId, contentHash)`** → re-uploading the
  same workout is silently skipped.
- **`workout_set`** — `id`, `workoutId`, `userId`, `exerciseName`, `equipment`
  (parenthetical, e.g. "Barbell"; null when absent, e.g. "Pull Up"),
  `setNumber`, `weight` (numeric, lb), `reps` (int), `volume` (generated
  `weight*reps`). One row per set. **Strength only — no distance/seconds.**
- **`planned_session`** — `id`, `userId`, `dayOfWeek` (0–6, recurring weekly
  template), `title`, `description` (free text; the AI reads it), `modality`
  (`strength` | `endurance` | `rest`). Upsert: one row per day per user.
- **`readiness_analysis`** — `id`, `userId`, `analysisDate`, `planSnapshot`
  (jsonb), `loadSnapshot` (jsonb), `verdict`, `headline`, `rationale`,
  `modifications` (jsonb, `[]` in v1), `model`, `createdAt`. Persisted so the
  feed shows history and a refresh doesn't re-bill the LLM.

**Deferred to v2 (not built in v1):** `endurance_activity` (one row per
run/ride: distance, duration, avg pace, avg HR, source) + `activity_split`
child table (split index, distance, time, pace, HR). Separate schema,
introduced with Strava — never retrofitted onto `workout_set`.

## 5. Strong CSV Format (reference)

Header:

```
Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
```

Example:

```
2022-07-26 10:39:06,"Day 1",27m,"Incline Bench Press (Barbell)",1,20.0,10.0,0,0.0,"","",
2022-07-26 10:39:06,"Day 1",27m,"Pull Up",1,0,4.0,0,0.0,"","",
```

Parsing rules:

- A **workout** = all rows sharing the same `Date` timestamp. `Workout Name`
  repeats across dates and is **not** an identity.
- `performedAt` = `Date` parsed as `America/New_York`.
- `Exercise Name` → split trailing `(Equipment)` into `exerciseName` +
  `equipment`; no parens → `equipment = null` (e.g. "Pull Up").
- `Weight = 0` is valid (bodyweight); `volume = 0` for those sets.
- Cardio rows (Distance/Seconds populated, Weight 0, no reps) → **skipped with
  a warning** (no endurance model in v1).
- Quoted fields and empty trailing columns must parse cleanly.

## 6. Data Flow

1. **Auth** — Better Auth email login → session cookie. Server code resolves
   `userId`; all queries filtered by it.
2. **Import** (`/import`) — user uploads `.csv`. Server action →
   `parser.parse(text)` → `[{ performedAt, title, exercises:[{ name,
equipment, sets:[{ setNumber, weight, reps }] }] }]` → write `workout` +
   `workout_set`, dedupe via `contentHash`. Returns `{ added, skipped,
warnings }`. Handles multiple workouts in one file.
3. **Plan** (`/plan`) — 7-day grid; edit each day's title/description/modality;
   server action upserts `planned_session`.
4. **Dashboard** (`/`) — today's planned session (vs `APP_TZ`) +
   **Analyze Readiness** button; activity feed (recent workouts grouped from
   `workout_set` + past `readiness_analysis`, chronological); light progression
   view (top-set weight over time for a few key lifts — minimal; may slip to
   v1.1).
5. **Analyze** — button → server action: `getPlannedSession(today)` +
   `computeTrailingLoad(userId, now, 72h)` (Σ volume, set count, sessions,
   per-exercise breakdown, rest days, last session) → `aiEngine.analyze(input)`
   → Vercel AI SDK `generateObject` with the Zod schema → persist
   `readiness_analysis` → render card.

## 7. AI Engine

**Input** (from aggregator + plan):
`{ plannedSession, trailingLoad: { windowHours, sessions, totalVolume,
setCount, perExercise[], lastSessionAt, restDays }, units }`

**Output schema (final shape; v1 leaves `modifications` empty):**

```ts
{
  verdict: 'push_harder' | 'proceed_as_planned' | 'reduce_intensity' | 'rest',
  headline: string,
  rationale: string,
  modifications: { exercise: string, change: string }[]  // [] in v1, populated v1.1
}
```

- `buildPrompt(input)` is a pure function (snapshot-testable).
- v1 prompt instructs the model to return verdict + headline + rationale and
  leave `modifications` empty. v1.1 enriches the prompt to populate
  `modifications[]` — same schema, no schema change, no UI rework.
- `analyze(input)` calls `generateObject({ model: anthropic(...), schema,
prompt })`.

## 8. Error Handling

- **Parser** — tolerant per-row: malformed/blank rows skipped and collected as
  `warnings`, never throws mid-file. Non-numeric weight/reps → row skipped +
  warning. Zero valid sets → user-facing "couldn't read this file" error,
  nothing written.
- **Dedupe** — duplicate `contentHash` → skipped silently, counted in the
  post-import `{ added, skipped, warnings }` summary.
- **AI** — `generateObject` wrapped with one retry; on schema-validation
  failure or timeout, graceful "couldn't analyze, try again" message and **no**
  partial `readiness_analysis` persisted. One in-flight analysis per user
  (button disabled while pending) to avoid double-billing.
- **Auth** — protected routes/actions redirect unauthenticated users to login.
- **Empty states** — no workouts → dashboard prompts import; no plan for today
  → Analyze explains it needs a planned session first.

## 9. Testing Strategy (TDD — tests first for pure modules)

- **Parser (unit, highest priority)** — fixtures from the real
  `strong_workouts.csv`: multi-workout file, bodyweight `Weight=0` ("Pull Up"),
  no-equipment names, quoted fields, empty trailing columns, same
  `Workout Name` across different `Date`s, a cardio row (assert skipped +
  warned).
- **Trailing-load aggregator (unit)** — fixture sets → assert Σ volume, set
  count, session count, rest-day math against a fixed `now`.
- **AI engine (unit)** — `buildPrompt(input)` snapshot-stable for a fixture;
  model call **mocked** to verify Zod parsing + retry path. No real API calls.
- **Server actions (integration)** — import + analyze against a test DB (or
  mocked repo): auth scoping, dedupe, persistence.

## 10. Open Items for Implementation

- Confirm Better Auth email delivery approach (email+password vs. magic link
  via Resend) at plan time — minor for the testing phase.
- Pick the specific Anthropic model id (`claude-...`) at implementation.
- Decide whether the progression view ships in v1 or slips to v1.1 based on
  remaining effort after the core loop works.
