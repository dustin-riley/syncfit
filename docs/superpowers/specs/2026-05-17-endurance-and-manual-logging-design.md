# Endurance Activities + Manual Workout Logging — Design Spec

**Date:** 2026-05-17
**Status:** Approved (brainstorming) — pending implementation plan
**Supersedes (partially):** the "endurance deferred to v2" line in
`2026-05-16-syncfit-mvp-design.md` §1/§4. Endurance is now brought forward
(distance + duration only); `activity_split` and Strava remain deferred.

## 1. Goal & Scope

Two stacked capabilities:

1. **Manual workout logging** — there is currently _no_ manual entry path;
   strength only enters via Strong CSV import. Add a dedicated page to log a
   workout by hand, strength **or** endurance.
2. **Endurance activities** — a new first-class activity type (run/ride/swim/
   other, distance + duration) that flows into the AI readiness analysis so a
   hybrid athlete's running/riding fatigue informs strength readiness, and
   shows in the weekly training view alongside strength.

This iteration also **replaces the strength-only trailing-load aggregator**
with a single raw "recent training" builder feeding both the dashboard's
today card and the AI. This is a deliberate, scoped change (the old top-set
summary was low value); it is **not** a general AI-prompt-quality rework.

### In scope

- `endurance_activity` table (distance + duration; run/ride/swim/other).
- New `/log` page: manual strength **and** endurance entry.
- `recent-training` builder replacing `trailing-load`, 7-day window, raw
  strength sets + endurance activities, one source of truth for the today
  card and the AI input.
- Endurance rendered in the weekly training view.
- AI `AnalyzeInput` reshaped to the new raw context (input shape only).

### Explicitly deferred (recorded, not oversights)

- **Strava OAuth import** and any non-manual `source`.
- **`activity_split`** child table (per-split distance/time/pace/HR).
- **km / metric units**; distance is miles, duration stored as seconds.
- **Per-activity heart rate**, RPE, elevation.
- **Editing or deleting** a logged workout/activity after creation.
- **AI verdict-quality / prompt-reasoning redesign.** Only the _input shape_
  the model receives changes here; the verdict enum, retry path, and prompt
  reasoning are untouched. The known-weak "you lifted a lot, rest several
  days" behavior is acknowledged and left for a separate effort.

## 2. Data Model (Postgres / Drizzle)

New table; `workout` / `workout_set` are **untouched** (honors the MVP
spec's "endurance never retrofitted onto `workout_set`" rule).

```
endurance_activity
  id           uuid pk  default random
  userId       text   not null            -- scoped like every table
  performedAt  timestamptz not null        -- entered date+time, parsed APP_TZ
  activityType text   not null             -- 'run' | 'ride' | 'swim' | 'other'
  distance     numeric                     -- miles; NULLable (e.g. pool swim)
  durationSec  integer not null            -- seconds; required
  notes        text   not null default ''
  source       text   not null default 'manual'   -- forward-compat: 'strava'
  contentHash  text   not null
  createdAt    timestamptz not null default now
  unique(userId, contentHash)
```

- **Distance unit = miles**, **duration = seconds**. Pace/speed is **always
  derived** (distance + duration is the only source of truth), never stored.
- `activityType` is an application-level enum (stored as `text`, validated in
  the persist lib + form), matching how `planned_session.modality` is modeled.
- `source` + `contentHash` mirror `workout` so a future Strava importer can
  dedupe identically with zero schema change now.
- `distance` is nullable so a duration-only activity (e.g. an unmeasured
  swim) is loggable; the builder/prompt handle a null distance gracefully.
- Schema applied via `drizzle-kit push` (live Neon), per CLAUDE.md, run with
  `node --env-file=.env.local`.

## 3. Architecture — Units

Follows the existing "thin server actions over pure libs" pattern.

### 3.1 `src/lib/recent-training.ts` (pure) — replaces `trailing-load.ts`

`trailing-load.ts` and `tests/trailing-load.test.ts` are **removed**.

```ts
type StrengthSetView = { exerciseName: string; weight: number; reps: number };
type StrengthSession = {
  workoutId: string;
  performedAt: Date;
  title: string;
  sets: StrengthSetView[];
};
type EnduranceView = {
  performedAt: Date;
  activityType: string;
  distanceMi: number | null;
  durationSec: number;
  // derived, not stored:
  pacePerMi: number | null; // sec/mi; null when distance null/0
  mph: number | null; // null when distance null/0
};
type RecentTraining = {
  windowDays: number; // 7
  strengthSessions: StrengthSession[]; // newest-first
  enduranceActivities: EnduranceView[]; // newest-first
};

function computeRecentTraining(
  strengthRows: {
    workoutId: string;
    performedAt: Date;
    title: string;
    exerciseName: string;
    weight: number;
    reps: number;
  }[],
  enduranceRows: {
    performedAt: Date;
    activityType: string;
    distanceMi: number | null;
    durationSec: number;
  }[],
  now: Date,
  windowDays: number // 7
): RecentTraining;
```

Pure: no DB, no HTTP. Windowing is `[now - windowDays, now]`. Strength rows
are grouped into sessions by `workoutId`; sessions and activities are sorted
newest-first. Pace = `durationSec / distanceMi`; mph = `distanceMi /
(durationSec/3600)`; both `null` when `distanceMi` is null or `0`.

### 3.2 DB loader (in `src/lib/readiness.ts`) — replaces `loadTrailingLoad`

`loadTrailingLoad` is replaced by `loadRecentTraining(userId, now)`: one
query over `workout ⋈ workout_set` for the 7-day window **and** one over
`endurance_activity` for the same window, both `userId`-scoped, fed to
`computeRecentTraining`. Used by `runReadinessAnalysis` and the dashboard
page. The 72h aggregation is gone.

### 3.3 `src/lib/manual-log.ts` (pure-ish persist) — mirrors `import-persist.ts`

Two entry points, both `userId`-scoped, both idempotent via `contentHash` +
`onConflictDoNothing`:

- `logStrengthWorkout(userId, input)` → writes one `workout` + N
  `workout_set` rows. Reuses the existing single-statement `db` client (no
  `txDb`: a manual single-workout insert is small; consistent with the
  per-day non-transactional precedent in `plan-store`). `contentHash` =
  sha256 of the normalized `{performedAt,title,sets}` (same hashing helper
  shape as the Strong importer so dedupe semantics match).
- `logEnduranceActivity(userId, input)` → writes one `endurance_activity`.
  `contentHash` = sha256 of normalized `{performedAt,activityType,distance,
durationSec}`.

Validation (numeric weight/reps/distance/duration, non-empty exercise names,
valid `activityType`, parseable date) lives here and returns structured
field errors; the server action and form surface them. Pure validation/
hashing is unit-tested without a DB.

### 3.4 Server action — `src/app/actions/log.ts`

Thin `"use server"` wrapper: `auth.api.getSession`, redirect/`{error}` if
unauthenticated, parse `FormData`, delegate to `manual-log`. Returns a
`{ ok, added, skipped, fieldErrors?, error? }`-style result mirroring the
import action's shape.

### 3.5 Page — `src/app/(app)/log/page.tsx`

New route under the `(app)` group (URL `/log`; route group does not change
the path, consistent with the nav design). Added to `NAV_ITEMS` in
`src/lib/nav.ts` (unit-tested active-path logic already generic). Client
component:

- A **strength | endurance** segmented toggle (controlled `useState`).
- **All inputs controlled** (value+onChange) — the React-19
  `HTMLFormElement.reset()`-after-server-action gotcha documented for
  `plan-editor` applies; do **not** use uncontrolled `defaultValue`.
- Strength: date+time, title, dynamic exercise/set rows keyed by a stable
  `crypto.randomUUID()` (positional name indices in the submitted field
  names, per the plan-editor precedent).
- Endurance: date+time, activity-type `<select>`, distance (mi, optional),
  duration entered as `h:mm:ss` / `mm:ss` (parsed to seconds client-side
  before submit; server re-validates), notes.
- Built with the `dustinriley-design` + `frontend-design` skills at
  implementation time: `.ds-*` primitives / `--ds-*` tokens only, 3 radii,
  warm shadows, sentence-case copy, no emoji — no hex/px in `globals.css`.

### 3.6 Weekly view — `src/lib/week-view.ts` + `src/lib/training-week-data.ts`

`buildTrainingWeek` gains an `enduranceActivities: EnduranceInput[]` arg and
the `DayCell` carries an `endurance: EnduranceCell[]` list. A day with **any**
strength workout or endurance activity is `state: "done"`. The cell summary
includes endurance, e.g. `run 6.2mi · 48:00` (duration formatted `h:mm:ss`/
`mm:ss`; distance to 1 decimal; pace omitted from the compact summary). The
pure module stays pure (no DB); `training-week-data.ts` adds the
`endurance_activity` week query alongside its existing `workout` query.

### 3.7 AI engine — `src/lib/ai-engine.ts`

`AnalyzeInput.trailingLoad: TrailingLoad` → `recentTraining: RecentTraining`.
`buildPrompt` enumerates recent strength **sets** (per session: exercise,
weight×reps) and endurance activities (type, distance, duration, derived
pace/speed) over the 7-day window, instead of the aggregated top-set/volume
summary. The Zod **output** schema, verdict enum, retry-once path, and
offline dynamic-import strategy are **unchanged**. `tests/ai-engine.test.ts`
fixture + the buildPrompt snapshot are updated to the new input shape.

## 4. Data Flow

1. **Log** (`/log`) — user picks strength or endurance, fills the form →
   `logAction(FormData)` → `manual-log` validates + persists (`workout`+
   `workout_set` _or_ `endurance_activity`), dedupes via `contentHash` →
   `{ ok, added, skipped, fieldErrors? }` rendered inline.
2. **Dashboard today card** — `loadRecentTraining(userId, now)` →
   `TodaySession` shows, per planned exercise, the **last actual session's
   sets** (e.g. `3d ago — 185×5, 185×5, 190×3`) via fuzzy name match
   (`exercise-match.ts`, unchanged), replacing the old single top-set note.
3. **Weekly view** — `getTrainingWeek` now also loads endurance; the week
   grid shows runs/rides/swims on their day; an endurance-only day is `done`.
4. **Analyze readiness** — `runReadinessAnalysis` →
   `loadRecentTraining` → `analyzeReadiness({ plannedSession, recentTraining })`
   → same `generateObject` + Zod + persist path. `readiness_analysis`
   `loadSnapshot` now stores the `RecentTraining` shape.

## 5. Error Handling

- **Form validation** — invalid/blank numerics, empty exercise name, missing
  duration, unknown activity type, unparseable date → structured
  `fieldErrors`, **no write**, form stays populated (controlled inputs).
- **Dedupe** — duplicate `(userId, contentHash)` → `onConflictDoNothing`,
  counted as `skipped` in the result summary (mirrors import; never a false
  error).
- **Auth** — unauthenticated `logAction` returns `{ error }` / the page
  redirects to `/login` via the `(app)` layout, consistent with existing
  actions.
- **AI** — unchanged: failure returns `{ error }`, persists nothing; DB
  errors genericized (spec §8 of the MVP spec still holds).
- **Empty states** — no recent training → today card shows "no recent
  sessions"; the AI prompt states the window had no logged training.

## 6. Testing Strategy (TDD — pure modules first)

- **`recent-training` (unit, offline):** windowing boundaries, multi-session
  grouping by `workoutId`, newest-first ordering, pace/mph derivation,
  null/zero-distance → null pace, empty input.
- **`manual-log` (unit, offline):** validation rules + `contentHash`
  stability/normalization (pure parts; no DB).
- **`week-view` (unit, offline):** endurance-only day → `done`; mixed
  strength+endurance summary; duration formatting; existing strength cases
  stay green.
- **`ai-engine` (unit, offline):** `buildPrompt` snapshot for the new
  `recentTraining` input incl. an endurance activity; mocked model; retry
  path unchanged.
- **`log` action (integration, live DB):** auth scoping, strength path,
  endurance path, dedupe idempotency, field-error path. Self-cleaning
  `itest-*` users per the existing integration harness.
- **Removed:** `tests/trailing-load.test.ts` (module deleted).
- Green bar required before done: `npm test` + `npx tsc --noEmit` +
  `npm run lint` + `npm run format:check` + `npm run build`, plus
  `npm run test:integration` (server-action/DB paths touched).

## 7. Migration / Rollout Notes

- `drizzle-kit generate` then `push` the new table (no change to existing
  tables → no data migration; safe additive DDL).
- `loadTrailingLoad` → `loadRecentTraining` rename ripples to `page.tsx` and
  `readiness.ts`; `TodaySession`'s `actuals` prop is reshaped from a single
  top-set to last-session sets. `training-week-data.ts` adds a query.
- `readiness_analysis.loadSnapshot` is `jsonb` (untyped at the DB) so the
  shape change is backward-compatible for historical rows (older snapshots
  remain readable as opaque JSON; only new rows use the new shape).

## 8. Open Items for Implementation

- Confirm the duration input UX (single `h:mm:ss` text field vs. separate
  number fields) during the design-skill UI pass — does not affect schema.
- Confirm `/log` label/placement in `NAV_ITEMS` (e.g. "log" vs "add").
- Pick the compact weekly-summary truncation for days with both strength and
  endurance (reuse the existing `+N more` convention).
