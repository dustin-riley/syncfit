# Training week redesign — design

Date: 2026-05-17
Status: implemented (2026-05-17)

Supersedes the UI of `2026-05-17-weekly-training-view-design.md` (the
week-state derivation, navigation, and day-state matrix from that spec are
unchanged and remain authoritative; this spec replaces the accordion
presentation and fixes set ordering).

## Problem

The training week section is hard to read:

1. **Too dense.** Each day crams status + every workout title + a long
   monospace top-set summary into a single line, then hides the rest behind a
   per-day accordion. Even the collapsed view is a wall of text.
2. **Wrong order, even expanded.** Sets do not appear in the order they were
   performed or imported. Root cause: `workout_set` stores `setNumber` (the set
   index _within_ an exercise — reliable) but **nothing records the order of
   exercises within a workout**. `strong-parser`/`import-persist` _write_ rows
   in correct order (Strong CSV is chronological; first-seen exercise order is
   preserved), but `training-week-data.ts` then reads them
   `orderBy(asc(workoutSet.setNumber))`, which interleaves every exercise (all
   the "set 1"s, then all the "set 2"s). Exercise order is discarded at read
   time and is unrecoverable for already-imported rows (random uuid `id`, no
   `createdAt` on `workout_set`).

## Goal

Redesign the training week as a **vertical day stack with no accordion** — the
section is important and may be tall — where each completed day shows its
workouts inline as a **scannable tabular grid**, and fix the data model so sets
appear **grouped by exercise, exercises in the order started, sets in the order
performed**.

## Scope decisions

- **No accordion.** Remove expand/collapse entirely; all detail is inline.
- **Set ordering = grouped by exercise.** Exercises in first-started order;
  each exercise's sets in performed order. Not a raw interleaved
  (superset-as-performed) view.
- **Solo-user data reset, no backfill migration.** The single user will wipe
  and re-import rather than carry a best-effort legacy backfill.
- Out of scope (unchanged from MVP deferrals): weight units, RPE/per-set notes,
  progression charts, endurance schema changes, per-user timezone, an
  "exactly as performed" interleaved view.

## Data model

Add one column to `workout_set`:

- `seq` `integer NOT NULL DEFAULT 0` — 0-based position of the set within its
  workout, in performed/import order. The default keeps the column addition
  safe on a populated table and lets unrelated test fixtures omit it; the two
  real writers always set an explicit value.

`setNumber` keeps its current meaning (1-based set index within its exercise).
`seq` is strictly additional and is the new sort key for reads. Chosen over
redefining `setNumber` (which would touch the parser, manual-log sequencing,
and the dedupe content hash, and leave legacy rows with mixed semantics) and
over a coarser per-exercise `exerciseOrder` column (`seq` is simpler to assign
and future-proofs an "as performed" view).

### Write path

Both writers already hold rows in the correct order; they only need to stamp
the index:

- **`src/lib/strong-parser.ts`** — output unchanged: the flattened
  `exercises[].sets[]` is already first-seen exercise order × in-exercise set
  order.
- **`src/lib/import-persist.ts`** — when building the `workoutSet` insert rows,
  enumerate the existing `w.exercises.flatMap(...)` result and set
  `seq: index`.
- **`src/lib/manual-log.ts`** — `sequenceStrengthSets` additionally stamps a
  workout-wide 0-based `seq` over the full ordered list, alongside the existing
  per-exercise `setNumber`. `seq` is **excluded** from `strengthContentHash`
  (identity stays defined by what was done, not its index; dedupe behavior is
  unchanged).

### Rollout (no backfill)

The schema change and the data reset are **independent** (the `DEFAULT 0`
makes `drizzle-kit push` safe on the populated table). Order:

1. Apply the schema via `drizzle-kit push` (safe with rows present; existing
   rows get `seq = 0`).
2. Then, to get correct ordering for already-imported data — which is
   otherwise unrecoverable — the single user does a one-time data reset:
   `DELETE FROM workout;` (cascades to `workout_set`). This also removes any
   **manually logged strength workouts**, which would be re-entered by hand.
   **`endurance_activity` is untouched** (separate table, no schema change).
3. Re-upload the Strong CSV → true exercise/set order.

No data migration or app-side NULL handling is introduced. Legacy rows that
are not re-imported simply keep `seq = 0` and render in DB order (acceptable;
the user is wiping anyway).

### Read path

- **`src/lib/training-week-data.ts`** — change the sets query `orderBy` from
  `asc(workoutSet.setNumber)` to `asc(workoutSet.seq)`. Carry `seq` (and keep
  `setNumber`) into `WorkoutInput`.
- **`src/lib/week-view.ts`** — `buildTrainingWeek` groups each workout's sets by
  `exerciseName`, **preserving first-appearance order** (first `seq` seen);
  sets within a group ordered by `seq`. New per-workout shape:
  `exercises: { name: string; sets: { weight: number; reps: number }[] }[]`
  replacing the flat `sets[]`. The heaviest-set rule currently inside
  `summarize()` (heaviest; tie → more reps) is extracted into a small pure
  helper and reused to mark the tinted cell per exercise. The one-line
  `summary` string is **no longer rendered** by this component; `summarize()`
  and `DayCell.summary` are removed if no other consumer exists (current
  exploration shows `training-week.tsx` is the only consumer — verify and
  remove during implementation, otherwise leave intact).

## UI / design system

`src/app/(app)/dashboard/training-week.tsx` is rewritten:

- **Accordion removed.** No `open` state, chevron, expand button, or
  `canExpand`. Every day renders full content inline in a vertical stack.
- **Navigation/today unchanged.** Keep the prev/next + range label and the
  `loadTrainingWeek` transition; keep the today indicator (left primary border
  - "· today").
- **Per-day rendering by state:**
  - `rest` → one quiet line: `fri 15 · rest · no plan`.
  - `missed` / `planned` → one line with status-tinted pill and the planned
    title, sentence case: `mon 11 · missed · lift a — lower emphasis`.
  - `done` → day header line (date + status pill), then **one sub-section per
    workout** (in `performedAt` order): a small workout-title line, then the
    **tabular grid** —
    - left column: exercise name, fixed `ch`-based width;
    - right: each set in its own fixed-width `tabular-nums` cell as
      `weight × reps`, so set 1/2/3 align vertically down the whole workout;
      ragged tails (fewer sets) leave trailing cells empty;
    - the heaviest set per exercise gets a subtle accent tint via a `--ds-*`
      token (state/emphasis never by color alone — it is also the largest
      weight in its row);
    - **show everything** — no cap, no "+N more".
  - **endurance** (a `done` day may have strength sub-sections and/or
    endurance) → its own line(s) under the day, not in the set grid:
    `run · 2.0 mi · 22:20` (1-decimal distance per existing spec,
    `formatDuration`).
- **Empty week** → message copy becomes **"no workouts this week. log a
  workout"** linking to `/log` (the generic manual-log page), replacing the
  import-specific copy/link.
- **Design system.** `@dustin-riley/design` primitives only: `--ds-*` tokens,
  `.ds-*` classes, `--ds-space-*` spacing, three radii (8/16/999), warm
  shadows, sentence-case copy, no emoji, no hard-coded hex/px (column widths in
  `ch`). The `dustinriley-design` skill is used during implementation.

## Edge cases

- Day with strength **and** endurance → strength sub-section(s) then endurance
  line(s) under one `done` day.
- Exercise with a single set → still a one-cell row (consistent grid).
- Equipment (`(Barbell)` etc.) → kept on parser/DB, **not** shown in the row
  (matches current behavior; keeps the grid clean).
- Multiple workouts same day → one titled sub-section each, in `performedAt`
  order (existing day-sort preserved).
- `seq` is always dense and unique per workout (assigned by enumeration), so no
  collision/gap handling is needed.

## Testing

- **Unit** (`npm test`, offline, no DB/network):
  - `week-view.test.ts`: grouping preserves first-appearance exercise order;
    sets ordered by `seq`; ragged set counts; multi-workout day;
    strength+endurance day; correct heaviest-set (tint) target.
  - `strong-parser.test.ts`: flattening yields the intended `seq` ordering.
  - `manual-log.test.ts`: `sequenceStrengthSets` stamps correct workout-wide
    `seq` while `setNumber` stays per-exercise; `strengthContentHash`
    unchanged by `seq`.
- **Integration** (`npm run test:integration`, live `DATABASE_URL`): import →
  training-week query path returns sets in `seq` order grouped by exercise;
  self-cleaning `itest-*` user.

## Non-goals

- No weight unit shown (bare number, as today).
- No backfill migration (solo-user wipe + re-import).
- No interleaved "exactly as performed" view (`seq` makes it possible later;
  UI groups by exercise).
- No `setNumber` semantic change, no endurance schema change.
- Readiness / `trailing-load` untouched (aggregates weight×reps; set ordering
  is irrelevant there).

## Definition of done

`npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run format:check` +
`npm run build` green, plus `npm run test:integration` (server-action/DB path
is touched). Spec and plan in `docs/superpowers/` updated to reflect the
implemented state; the superseded UI section of
`2026-05-17-weekly-training-view-design.md` annotated as replaced by this spec.
