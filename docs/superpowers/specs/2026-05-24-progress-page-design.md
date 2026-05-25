# Progress page — design

**Date:** 2026-05-24
**Status:** approved (brainstorm), ready for implementation plan

## Summary

A new signed-in page at `/progress` that graphs every strength lift the user has ever logged. One chart card per `(exerciseName, equipment)` pair, all-time history, page-level toggles for the y-axis metric (top-set weight vs. estimated 1RM) and the sort order (recent / frequent / A–Z). Strong-CSV imports and manual log entries both feed the same view; endurance is excluded.

## Goals

- Answer "am I getting stronger on this lift?" at a glance.
- Cover every distinct lift the user has performed — no curation step.
- Reuse the established pure-compute / DB-loader split so the metric math is unit-tested offline.

## Non-goals (out of scope, deliberate)

- Endurance progress (different units, different page; if added later it gets its own design).
- Per-card metric toggle. Page-level only; switching applies to every chart at once.
- Time-range zoom (3m / 6m / 1y). The chart always shows all-time history.
- Comparing two lifts on one chart.
- Sharing / export.
- URL state for `metric` / `sort` (can be added later without a redesign).

## User flow

1. User opens the floating nav → clicks **Progress** (new item, slotted between **Today** and **Weekly plan**).
2. Server resolves the session via the `(app)` layout (redirects to `/login` if absent).
3. The page renders a toolbar plus a single vertical column of chart cards, ordered most-recently-performed-first by default.
4. User can flip **Top set ↔ e1RM** and re-sort **Recent / Frequent / A–Z** without a network round trip — both toggles re-render from the same in-memory series.
5. Empty user → a `.ds-panel` empty-state directing them to **Import** or **Log workout**.

## Architecture

### Route & page

- `src/app/(app)/progress/page.tsx` — server component. Lives under the `(app)` route group so it inherits the session-required layout and the floating nav. URL is `/progress`.
- `src/app/(app)/progress/progress-workspace.tsx` — `"use client"` workspace that owns `metric: "topSet" | "e1rm"` and `sort: "recent" | "frequent" | "az"`. Renders the toolbar and the card list.
- `src/app/(app)/progress/chart-card.tsx` — `"use client"` card for a single series. Wraps a `recharts` `<ResponsiveContainer><LineChart>…</LineChart></ResponsiveContainer>`.

### Server action (loader)

- `src/app/actions/progress.ts` — `loadProgressData()`. Thin `"use server"` wrapper: `getSession()` → one Drizzle read joining `workout_set` to `workout` scoped by `userId` and ordered by `performedAt asc` → calls `computeProgress(rows, now)` → returns `{ data: ProgressData, error?: string }`. DB errors are caught and genericized so raw driver messages don't leak (matches the `analyze`/`plan` posture).

### Pure compute lib

- `src/lib/progress.ts` — pure module. Importable by unit tests; must not statically import `@/db`.

```ts
export type ProgressPoint = {
  /** UTC instant of the day's best set. */
  performedAt: Date;
  /** Calendar day in APP_TZ ("YYYY-MM-DD") used to dedupe multi-session days. */
  day: string;
  topSetWeight: number;
  topSetReps: number;
  /** Epley: weight * (1 + reps/30). */
  e1RM: number;
};

export type ProgressSeries = {
  /** Stable react key: `${exerciseName}|${equipment}` exactly as stored. */
  exerciseKey: string;
  /** As-stored exercise name (no normalization), for display. */
  exerciseName: string;
  /** As-stored equipment, may be empty string when missing. */
  equipment: string;
  /** Newest-last so a line chart reads left-to-right naturally. */
  points: ProgressPoint[];
  totalSessions: number;
  lastPerformedAt: Date;
  firstTopSetWeight: number;
  currentTopSetWeight: number;
  firstE1RM: number;
  currentE1RM: number;
};

export type ProgressData = { series: ProgressSeries[] };

export type ProgressInputRow = {
  performedAt: Date;
  exerciseName: string;
  equipment: string | null;
  weight: number;
  reps: number;
};

export function computeProgress(
  rows: ProgressInputRow[],
  now: Date
): ProgressData;

export function sortSeries(
  series: ProgressSeries[],
  mode: "recent" | "frequent" | "az"
): ProgressSeries[];
```

`computeProgress` semantics:

- Group by `(exerciseName, equipment ?? "")` exactly as stored — no fuzzy collapse. Two rows that differ only in trailing whitespace are not merged in v1 (matches how Strong CSV import already preserves names).
- Within a series, group by **calendar day in `APP_TZ`** (`America/New_York`, the project-wide single timezone). Pick the "best" set per day as the one with the highest `topSetWeight`; tie-break on higher `reps`. e1RM is derived from that chosen set, not from a separate max — so the displayed `e1RM` always corresponds to the same set as `topSetWeight`.
- e1RM uses Epley: `weight × (1 + reps/30)`. Rounded for display only at the render layer (the lib keeps the raw number).
- `points` is sorted newest-last (oldest → newest) so a line chart reads chronologically left-to-right.
- Default series order returned by `computeProgress` is **most-recent first** (`lastPerformedAt` descending). The client re-sorts via `sortSeries` when the user clicks Frequent or A–Z; "Recent" returns the input order.
- Empty input → `{ series: [] }`. A series with one point is still emitted (chart renders a single dot).

### DB read

- The loader pulls every row needed in one statement against `db` (neon-http; no transaction needed). Shape:

```sql
SELECT w.performed_at, s.exercise_name, s.equipment, s.weight, s.reps
FROM workout_set s
JOIN workout w ON w.id = s.workout_id
WHERE s.user_id = $1
ORDER BY w.performed_at ASC;
```

- Drizzle expression mirrors the above; `weight` is `numeric` in Postgres → coerced to `number` at the lib boundary (the existing `strong-parser` / `manual-log` reads already do this; reuse the same coercion).
- No new index. The existing `(user_id, content_hash)` unique on `workout` plus the natural `workout_set.workout_id` FK index handle this access pattern at v1 scale.

### Nav integration

- Add `{ href: "/progress", label: "Progress", shortLabel: "Progress" }` to `NAV_ITEMS` in `src/lib/nav.ts`, slotted between Today and Weekly plan:
  ```
  Today · Progress · Weekly plan · Log workout · Import
  ```
- Add `/progress/:path*` to the proxy matcher in `src/proxy.ts` so the cookie gate covers it.
- The `isActivePath` rule already handles exact-and-nested matching; no changes needed.

## UI

### Toolbar

A single row at the top of the page content:

- Left: page title ("Progress") as `.h2`.
- Right: two pill toggles (visually styled to match the existing `.ds-panel` / `.ds-btn` vocabulary; the design system does not ship a dedicated pill primitive, so the implementer hand-builds with `.ds-panel` + flex utilities — consult the `dustinriley-design` skill and substitute as needed):
  - **Metric:** `[ Top set | e1RM ]`
  - **Sort:** `[ Recent | Frequent | A–Z ]`

### Chart card

One full-width card per series, stacked single-column (mobile and desktop alike — layout A from the brainstorm). Card structure:

- **Header row** (flex, space-between):
  - Left: exercise name as `.h5`, equipment as a quieter caption inline next to it (e.g. "Bench Press · Barbell"). Equipment is omitted from display when empty.
  - Right: current value styled as `.h5`, e.g. `225 lb` in top-set mode or `238 e1RM` in e1RM mode.
- **Meta row** (caption): `Last 2d ago · 47 sessions · +35 lb from first session`. The delta flips units with the metric toggle (`+35 lb` in top-set mode, `+42 e1RM` in e1RM mode).
- **Chart:** `recharts` `<ResponsiveContainer width="100%" height={80}><LineChart data={…}><XAxis hide /><YAxis hide /><Line dataKey={metric === "topSet" ? "topSetWeight" : "e1RM"} dot={…} stroke="var(--ds-accent)" /><Tooltip /></LineChart></ResponsiveContainer>`. Single muted axis baseline only; tooltip shows the date and the exact value. The stroke colour pulls from a design token (`--ds-accent` or the closest equivalent the implementer confirms in the skill).

### Empty / sparse states

- **No workouts at all:** a single `.ds-panel` with `Nothing to chart yet — import a Strong CSV or log a workout` and two text links to `/import` and `/log`.
- **Single-point series:** still rendered. Chart shows one dot; meta reads `1 session`; the "from first session" delta is omitted.
- **Error from loader:** an error `.ds-panel` with a generic message ("Couldn't load your progress. Refresh to try again."). No raw driver message.

## Data model

No new tables, no migrations. Reads only from existing `workout` and `workout_set`. The `equipment` column on `workout_set` is already nullable — the loader passes it through as-is and the lib normalises `null → ""` for the grouping key.

## Dependency

Adds **`recharts`** to `package.json` (`dependencies`). Rationale: React-first, tree-shakeable (`LineChart` + `Line` + `ResponsiveContainer` + `Tooltip` is ~25kb gzipped), gives us tooltips, axis ticks, and responsive resizing for free. Hand-rolling SVG would technically work but is not worth the lost ergonomics for an MVP. The dependency must be pinned to an exact version (matches the repo convention).

## Auth & scoping

- Web auth model only — no iOS surface for this page in v1.
- The `(app)/layout.tsx` resolves the session and redirects to `/login` on absence; the page itself relies on that.
- The loader independently calls `auth.api.getSession` and filters every query by `session.user.id`. Without a session it returns `{ data: { series: [] }, error: undefined }` and the page renders the empty state (matches the established RPC-style action shape).

## Error handling

- DB error in the loader → caught, message genericized, returned as `{ data: { series: [] }, error: "..." }`.
- recharts render error → caught by a thin error boundary around the chart card so one corrupt series can't kill the page. (Practically very unlikely with our data, but the boundary keeps the blast radius to a single card.)
- No partial state — the read is idempotent and one-shot. Refresh recovers.

## Testing

- **`tests/progress.test.ts`** (unit, offline): covers `computeProgress` and `sortSeries`.
  - Grouping by `(exerciseName, equipment)` keeps "Bench Press (Barbell)" and "Bench Press (Dumbbell)" separate.
  - Two workouts of the same lift on one calendar day (in `APP_TZ`) collapse to one point; best set is picked by highest weight then highest reps.
  - e1RM formula: a `5 × 185` set → `e1RM = 185 × (1 + 5/30) ≈ 215.83`.
  - Default sort is most-recent first; `sortSeries("frequent")` orders by `totalSessions desc`; `sortSeries("az")` is alphabetical on `exerciseName` (tie-break on `equipment`).
  - Empty rows → `{ series: [] }`; single-row series → one point, sensible deltas.
  - Equipment `null` and empty string collapse to the same series.
- **`tests/integration/progress.test.ts`** (live DB): end-to-end through `loadProgressData`.
  - Seed via the existing Strong-CSV import path + one manual `logStrengthWorkout` call for the same exercise on a different day; assert both contribute to the same series and that the series count matches expected `(exerciseName, equipment)` cardinality.
  - Self-cleaning `itest-*` user, mirrors the existing integration-test pattern.
- **`tests/nav.test.ts`** (extend existing): assert `/progress` is in `NAV_ITEMS` and `isActivePath("/progress", "/progress")` is true.
- No visual-regression testing for charts; recharts is treated as a trusted black box.

## Performance

One full-table scan per page load against `workout_set` filtered by `user_id`. A heavy real-user dataset is ~5–10k rows — a tiny payload. If this ever becomes a bottleneck, the natural next step is a per-user, per-day, per-exercise materialised view; not warranted now.

## Open questions

None outstanding from the brainstorm. Items deliberately deferred are listed under **Non-goals**.

## Affected files

New:

- `src/app/(app)/progress/page.tsx`
- `src/app/(app)/progress/progress-workspace.tsx`
- `src/app/(app)/progress/chart-card.tsx`
- `src/app/actions/progress.ts`
- `src/lib/progress.ts`
- `tests/progress.test.ts`
- `tests/integration/progress.test.ts`

Modified:

- `src/lib/nav.ts` — add Progress item.
- `src/proxy.ts` — extend matcher to cover `/progress/:path*`.
- `tests/nav.test.ts` — assertions for the new item.
- `package.json` — add `recharts` (exact-pinned).
