# Training Week Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dense training-week accordion with a no-accordion vertical day stack whose completed days show a scannable tabular set grid, grouped by exercise in performed order via a new `workout_set.seq` column.

**Architecture:** One additive `seq` integer column on `workout_set` (`NOT NULL DEFAULT 0`). The two existing writers (`import-persist`, `manual-log`) stamp the real index at insert; `training-week-data` reads ordered by `seq`; the pure `week-view` lib groups each workout's already-ordered sets by exercise (first-appearance order) and marks the heaviest set; the `training-week.tsx` client component is rewritten to render the vertical stack + tabular grid. The existing `summarize()`/`DayCell.summary` is kept intact (it has test coverage and is harmless) and simply no longer rendered.

**Tech Stack:** Next.js 16 (App Router, TS), Drizzle ORM (neon-http / neon-serverless), Vitest, `@dustin-riley/design`.

---

### Task 1: Add `seq` column to `workout_set`

**Files:**
- Modify: `src/db/schema.ts:29-40`

- [ ] **Step 1: Add the column to the Drizzle schema**

In `src/db/schema.ts`, the `workoutSet` table currently is:

```ts
export const workoutSet = pgTable("workout_set", {
  id: uuid("id").defaultRandom().primaryKey(),
  workoutId: uuid("workout_id")
    .notNull()
    .references(() => workout.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  equipment: text("equipment"),
  setNumber: integer("set_number").notNull(),
  weight: numeric("weight").notNull(),
  reps: integer("reps").notNull(),
});
```

Add `seq` after `setNumber`:

```ts
export const workoutSet = pgTable("workout_set", {
  id: uuid("id").defaultRandom().primaryKey(),
  workoutId: uuid("workout_id")
    .notNull()
    .references(() => workout.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  equipment: text("equipment"),
  setNumber: integer("set_number").notNull(),
  // 0-based position of the set within its workout, in performed/import
  // order. setNumber stays per-exercise; seq is the new global sort key for
  // the training-week read. DEFAULT 0 keeps this addition safe on a
  // populated table; the two real writers always set an explicit value.
  seq: integer("seq").notNull().default(0),
  weight: numeric("weight").notNull(),
  reps: integer("reps").notNull(),
});
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: passes (no consumers reference `seq` yet; column is additive).

- [ ] **Step 3: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(schema): add workout_set.seq (within-workout set order)"
```

---

### Task 2: Group sets by exercise in the pure week-view lib (TDD)

**Files:**
- Modify: `src/lib/week-view.ts`
- Test: `tests/week-view.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these `it` blocks inside the existing `describe("buildTrainingWeek", ...)` in `tests/week-view.test.ts` (the `wk` helper and `WEEK`/`NOW` constants already exist at the top of that file):

```ts
it("groups a workout's sets by exercise, preserving first-appearance order", () => {
  const data = buildTrainingWeek({
    weekStartYmd: WEEK,
    now: NOW,
    workouts: [
      wk("w1", "2026-05-11", "Full", [
        { exerciseName: "Squat", weight: 225, reps: 5 },
        { exerciseName: "Bench", weight: 185, reps: 5 },
        { exerciseName: "Squat", weight: 245, reps: 3 },
        { exerciseName: "Bench", weight: 185, reps: 4 },
      ]),
    ],
    planDays: [],
  });
  const mon = data.days[0];
  const ex = mon.workouts[0].exercises;
  expect(ex.map((e) => e.name)).toEqual(["Squat", "Bench"]);
  expect(ex[0].sets).toEqual([
    { weight: 225, reps: 5, isTop: false },
    { weight: 245, reps: 3, isTop: true },
  ]);
  expect(ex[1].sets).toEqual([
    { weight: 185, reps: 5, isTop: true },
    { weight: 185, reps: 4, isTop: false },
  ]);
});

it("marks the heaviest set as top, tie broken by more reps; single set is top", () => {
  const data = buildTrainingWeek({
    weekStartYmd: WEEK,
    now: NOW,
    workouts: [
      wk("w1", "2026-05-11", "Tie", [
        { exerciseName: "Curl", weight: 30, reps: 8 },
        { exerciseName: "Curl", weight: 30, reps: 10 },
        { exerciseName: "Row", weight: 95, reps: 8 },
      ]),
    ],
    planDays: [],
  });
  const ex = data.days[0].workouts[0].exercises;
  expect(ex[0].sets.map((s) => s.isTop)).toEqual([false, true]); // 30×10 wins tie
  expect(ex[1].sets).toEqual([{ weight: 95, reps: 8, isTop: true }]); // lone set
});

it("keeps exercise groups per-workout for a multi-workout day", () => {
  const data = buildTrainingWeek({
    weekStartYmd: WEEK,
    now: NOW,
    workouts: [
      wk("a", "2026-05-12", "AM", [
        { exerciseName: "Squat", weight: 225, reps: 5 },
      ]),
      wk("b", "2026-05-12", "PM", [
        { exerciseName: "Curl", weight: 30, reps: 12 },
      ]),
    ],
    planDays: [],
  });
  const tue = data.days[1];
  expect(tue.workouts).toHaveLength(2);
  expect(tue.workouts[0].exercises.map((e) => e.name)).toEqual(["Squat"]);
  expect(tue.workouts[1].exercises.map((e) => e.name)).toEqual(["Curl"]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/week-view.test.ts -t "groups a workout"`
Expected: FAIL — `mon.workouts[0].exercises` is `undefined` (property does not exist yet).

- [ ] **Step 3: Add the `ExerciseGroup` type and grouping helper, wire into `buildTrainingWeek`**

In `src/lib/week-view.ts`, add the type next to `SetView` (after line 7):

```ts
export type ExerciseGroup = {
  name: string;
  sets: { weight: number; reps: number; isTop: boolean }[];
};
```

Add `exercises` to the `DayCell.workouts` element type (the line currently reads
`workouts: { id: string; title: string; sets: SetView[] }[];`):

```ts
  workouts: {
    id: string;
    title: string;
    sets: SetView[];
    exercises: ExerciseGroup[];
  }[];
```

Add this pure helper above `buildTrainingWeek` (near `summarize`). It trusts the
incoming array order — `training-week-data` returns sets ordered by `seq`, so
first-appearance == performed order; the heaviest-set rule mirrors `summarize`:

```ts
export function groupByExercise(sets: SetView[]): ExerciseGroup[] {
  const order: string[] = [];
  const byName = new Map<string, { weight: number; reps: number }[]>();
  for (const s of sets) {
    if (!byName.has(s.exerciseName)) {
      byName.set(s.exerciseName, []);
      order.push(s.exerciseName);
    }
    byName.get(s.exerciseName)!.push({ weight: s.weight, reps: s.reps });
  }
  return order.map((name) => {
    const raw = byName.get(name)!;
    let topIdx = 0;
    raw.forEach((r, i) => {
      const best = raw[topIdx];
      if (r.weight > best.weight || (r.weight === best.weight && r.reps > best.reps))
        topIdx = i;
    });
    return { name, sets: raw.map((r, i) => ({ ...r, isTop: i === topIdx })) };
  });
}
```

In `buildTrainingWeek`, the `workouts` mapping currently is:

```ts
      workouts: dayWorkouts.map((w) => ({
        id: w.id,
        title: w.title,
        sets: w.sets,
      })),
```

Change it to also emit grouped exercises:

```ts
      workouts: dayWorkouts.map((w) => ({
        id: w.id,
        title: w.title,
        sets: w.sets,
        exercises: groupByExercise(w.sets),
      })),
```

- [ ] **Step 4: Run the new tests and the whole file to verify pass + no regression**

Run: `npx vitest run tests/week-view.test.ts`
Expected: PASS — new tests pass and all pre-existing `summary`/state tests still pass (summarize untouched).

- [ ] **Step 5: Commit**

```bash
git add src/lib/week-view.ts tests/week-view.test.ts
git commit -m "feat(week-view): group workout sets by exercise with top-set marker"
```

---

### Task 3: Order the training-week read by `seq`

**Files:**
- Modify: `src/lib/training-week-data.ts:51`

- [ ] **Step 1: Change the sets `orderBy`**

In `src/lib/training-week-data.ts`, the sets query currently ends with:

```ts
        .orderBy(asc(workoutSet.setNumber))
```

Change it to:

```ts
        .orderBy(asc(workoutSet.seq))
```

(`asc` is already imported; `WorkoutInput` needs no change — `seq` is only a
sort key, not carried into the shape.)

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add src/lib/training-week-data.ts
git commit -m "fix(training-week): read sets in workout seq order, not per-exercise setNumber"
```

---

### Task 4: Stamp `seq` at both write paths

**Files:**
- Modify: `src/lib/import-persist.ts:38-49`
- Modify: `src/lib/manual-log.ts:148-158`

- [ ] **Step 1: Stamp `seq` in the Strong-CSV importer**

In `src/lib/import-persist.ts`, the set-rows builder inside the transaction
currently is:

```ts
        const sets = w.exercises.flatMap((e) =>
          e.sets.map((s) => ({
            workoutId: row.id,
            userId,
            exerciseName: e.name,
            equipment: e.equipment,
            setNumber: s.setNumber,
            weight: String(s.weight),
            reps: s.reps,
          }))
        );
        if (sets.length) await tx.insert(workoutSet).values(sets);
```

Replace with a running 0-based counter across the whole workout (exercise
order × in-exercise set order — exactly the parser's first-seen order):

```ts
        let seq = 0;
        const sets = w.exercises.flatMap((e) =>
          e.sets.map((s) => ({
            workoutId: row.id,
            userId,
            exerciseName: e.name,
            equipment: e.equipment,
            setNumber: s.setNumber,
            seq: seq++,
            weight: String(s.weight),
            reps: s.reps,
          }))
        );
        if (sets.length) await tx.insert(workoutSet).values(sets);
```

- [ ] **Step 2: Stamp `seq` in the manual-log writer**

In `src/lib/manual-log.ts`, the insert inside `logStrengthWorkout` currently is:

```ts
    await tx.insert(workoutSet).values(
      input.sets.map((s) => ({
        workoutId: row.id,
        userId,
        exerciseName: s.exerciseName.trim(),
        equipment: null,
        setNumber: s.setNumber,
        weight: String(s.weight),
        reps: s.reps,
      }))
    );
```

`input.sets` is already the full ordered list (post `sequenceStrengthSets`), so
the array index is the workout-wide `seq`. Replace with:

```ts
    await tx.insert(workoutSet).values(
      input.sets.map((s, i) => ({
        workoutId: row.id,
        userId,
        exerciseName: s.exerciseName.trim(),
        equipment: null,
        setNumber: s.setNumber,
        seq: i,
        weight: String(s.weight),
        reps: s.reps,
      }))
    );
```

(`ManualStrengthInput` and `sequenceStrengthSets` are intentionally unchanged —
`seq` is derived from insert order here, so `strengthContentHash` and all
existing manual-log unit tests are unaffected.)

- [ ] **Step 3: Type-check and run offline unit tests**

Run: `npx tsc --noEmit && npm test`
Expected: PASS — `seq` is a known column (Task 1); no unit test asserts on it; manual-log/strong-parser tests unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/lib/import-persist.ts src/lib/manual-log.ts
git commit -m "feat(log): stamp workout_set.seq on Strong import and manual logging"
```

---

### Task 5: Rewrite the training-week UI (vertical stack, tabular sets)

**Files:**
- Modify (rewrite render): `src/app/(app)/dashboard/training-week.tsx`

No unit test (client component); verified via `tsc`, `lint`, `build`, and the design-system rules. Use the `dustinriley-design` skill while editing this file.

- [ ] **Step 1: Replace the component body**

Replace the entire contents of `src/app/(app)/dashboard/training-week.tsx` with the following. Key changes vs. the old file: no `open`/expand state, no `ChevronDown`/`canExpand`, no per-day summary line; each `done` day renders one sub-section per workout with a tabular set grid (heaviest set tinted via a `--ds-*` token, never color alone — it is also the largest weight in its row); `rest`/`missed`/`planned` stay one-liners; the empty-week message links to `/log`.

```tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Check, X, CalendarClock, Minus } from "lucide-react";
import type { TrainingWeekData, DayState } from "@/lib/week-view";
import { formatDuration } from "@/lib/duration";
import { loadTrainingWeek } from "@/app/actions/training-week";

const STATE_META: Record<DayState, { label: string; Icon: typeof Check }> = {
  done: { label: "done", Icon: Check },
  missed: { label: "missed", Icon: X },
  planned: { label: "planned", Icon: CalendarClock },
  rest: { label: "rest", Icon: Minus },
};

export function TrainingWeek({ initial }: { initial: TrainingWeekData }) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();

  const go = (weekStartYmd: string) => {
    startTransition(async () => {
      setData(await loadTrainingWeek(weekStartYmd));
    });
  };

  // Spec confines the prompt to the new-user "no workouts and no plan" case.
  // The plan recurs weekly, so any plan yields planned/missed rows — an
  // all-rest week is exactly that case.
  const isEmptyWeek = data.days.every((d) => d.state === "rest");

  return (
    <div style={{ opacity: pending ? 0.6 : 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--ds-space-2)",
          marginBottom: "var(--ds-space-3)",
        }}
      >
        <button
          className="ds-btn ds-btn-ghost"
          onClick={() => go(data.prevWeekYmd)}
          disabled={pending}
          aria-label="previous week"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="ds-mono-note" style={{ minWidth: "9ch" }}>
          {data.label}
        </span>
        <button
          className="ds-btn ds-btn-ghost"
          onClick={() => go(data.nextWeekYmd)}
          disabled={pending || data.nextDisabled}
          aria-label="next week"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {data.days.map((d) => {
          const meta = STATE_META[d.state];
          const Icon = meta.Icon;
          return (
            <li
              key={d.ymd}
              style={{
                borderBottom: "var(--ds-border-width) solid var(--ds-border)",
                borderLeft: d.isToday
                  ? "var(--ds-border-width) solid var(--ds-primary)"
                  : "var(--ds-border-width) solid transparent",
                paddingLeft: "var(--ds-space-2)",
                paddingTop: "var(--ds-space-2)",
                paddingBottom: "var(--ds-space-2)",
              }}
            >
              <div
                className="ds-mono-note"
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--ds-space-2)",
                }}
              >
                <span style={{ minWidth: "6ch", fontWeight: 600 }}>
                  {d.label}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--ds-space-1)",
                    minWidth: "8ch",
                  }}
                >
                  <Icon size={14} aria-hidden="true" />
                  {meta.label}
                  {d.isToday ? " · today" : ""}
                </span>
                {d.state === "rest" && <span>no plan</span>}
                {(d.state === "missed" || d.state === "planned") && (
                  <span>{d.plannedTitle}</span>
                )}
              </div>

              {d.state === "done" && (
                <div
                  style={{
                    marginTop: "var(--ds-space-2)",
                    marginLeft: "var(--ds-space-5)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--ds-space-3)",
                  }}
                >
                  {d.workouts.map((w) => (
                    <div key={w.id}>
                      <div
                        className="ds-mono-note"
                        style={{
                          color: "var(--ds-muted-foreground)",
                          marginBottom: "var(--ds-space-1)",
                        }}
                      >
                        {w.title}
                      </div>
                      <table
                        className="ds-mono-note"
                        style={{ borderCollapse: "collapse" }}
                      >
                        <tbody>
                          {w.exercises.map((ex) => (
                            <tr key={ex.name}>
                              <td
                                style={{
                                  width: "22ch",
                                  paddingRight: "var(--ds-space-3)",
                                  paddingTop: "var(--ds-space-1)",
                                  paddingBottom: "var(--ds-space-1)",
                                  verticalAlign: "baseline",
                                }}
                              >
                                {ex.name}
                              </td>
                              {ex.sets.map((s, i) => (
                                <td
                                  key={i}
                                  style={{
                                    width: "9ch",
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                    paddingTop: "var(--ds-space-1)",
                                    paddingBottom: "var(--ds-space-1)",
                                    color: s.isTop
                                      ? "var(--ds-primary)"
                                      : "var(--ds-muted-foreground)",
                                    fontWeight: s.isTop ? 600 : 400,
                                  }}
                                >
                                  {s.weight}×{s.reps}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  {d.endurance.map((e, i) => (
                    <div className="ds-mono-note" key={`end-${i}`}>
                      {e.activityType}
                      {e.distanceMi === null
                        ? ""
                        : ` ${e.distanceMi.toFixed(1)}mi`}{" "}
                      · {formatDuration(e.durationSec)}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {isEmptyWeek && (
        <p className="ds-mono-note" style={{ marginTop: "var(--ds-space-3)" }}>
          no workouts this week.{" "}
          <Link href="/log" style={{ color: "var(--ds-link)" }}>
            log a workout
          </Link>
          .
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Verify the `--ds-*` tokens used exist**

Run: `grep -o -- '--ds-muted-foreground\|--ds-primary\|--ds-link\|--ds-border-width\|--ds-space-[1-5]' node_modules/@dustin-riley/design/tailwind.css | sort -u`
Expected: every token used above appears. If `--ds-muted-foreground` or `--ds-link` is not present, substitute the nearest existing muted/link token from that file (check the vendored skill at `.claude/skills/dustinriley-design/SKILL.md` for the curated token names) and keep the heaviest-set distinction via weight + an existing accent token (never color alone).

- [ ] **Step 3: Type-check, lint, format, build**

Run: `npx tsc --noEmit && npm run lint && npm run format:check && npm run build`
Expected: all PASS. (If `format:check` flags this file, run `npm run format` and re-stage.)

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/dashboard/training-week.tsx"
git commit -m "feat(training-week): vertical day stack with tabular set grid, no accordion"
```

---

### Task 6: Update the integration test for seq-ordered grouping

**Files:**
- Modify: `tests/training-week.integration.test.ts`

- [ ] **Step 1: Add a multi-exercise, multi-set workout with explicit `seq`**

In `tests/training-week.integration.test.ts`, the `beforeAll` currently inserts
a single set:

```ts
  await db.insert(workoutSet).values({
    workoutId: w1.id,
    userId: U,
    exerciseName: "Bench",
    setNumber: 1,
    weight: "185",
    reps: 5,
  });
```

Replace that single insert with an interleaved-by-setNumber but seq-ordered
fixture (Squat started first, then Bench, then a second Squat set — the exact
shape that the old `setNumber` ordering scrambled):

```ts
  await db.insert(workoutSet).values([
    { workoutId: w1.id, userId: U, exerciseName: "Squat", setNumber: 1, seq: 0, weight: "225", reps: 5 },
    { workoutId: w1.id, userId: U, exerciseName: "Bench", setNumber: 1, seq: 1, weight: "185", reps: 5 },
    { workoutId: w1.id, userId: U, exerciseName: "Squat", setNumber: 2, seq: 2, weight: "245", reps: 3 },
  ]);
```

- [ ] **Step 2: Update assertions in the first `it`**

The first test asserts `expect(mon.summary).toBe("Bench 185×5")`. With the new
fixture, `summarize` (unchanged logic: one entry per exercise at its top set,
first-seen order) yields Squat then Bench. Replace the summary assertion and
add a grouped-order assertion:

```ts
    const mon = data.days[0]; // 2026-05-11
    expect(mon.state).toBe("done");
    expect(mon.summary).toBe("Squat 245×3 · Bench 185×5");
    const ex = mon.workouts[0].exercises;
    expect(ex.map((e) => e.name)).toEqual(["Squat", "Bench"]); // seq order, grouped
    expect(ex[0].sets).toEqual([
      { weight: 225, reps: 5, isTop: false },
      { weight: 245, reps: 3, isTop: true },
    ]);
```

(The `titles` assertion later in that test — `expect(titles).toEqual(["Push A"])`
— is unaffected and stays.)

- [ ] **Step 3: Run the integration test**

Run: `npm run test:integration -- tests/training-week.integration.test.ts`
Expected: PASS (requires the schema pushed — see Task 7 Step 1; if you reach this before pushing, run Task 7 Step 1 first, since `seq` must exist on the live DB).

- [ ] **Step 4: Commit**

```bash
git add tests/training-week.integration.test.ts
git commit -m "test(training-week): assert seq-ordered exercise grouping"
```

---

### Task 7: Apply schema, data reset runbook, docs, full verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-17-training-week-redesign-design.md` (status line)
- Modify: `docs/superpowers/plans/2026-05-17-training-week-redesign.md` (this file — status note)

- [ ] **Step 1: Push the schema to live Neon**

Run: `node --env-file=.env.local ./node_modules/.bin/drizzle-kit push`
Expected: applies `workout_set.seq` (`NOT NULL DEFAULT 0`). Safe with existing rows present (they get `seq = 0`); no interactive backfill.

- [ ] **Step 2: One-time data reset (operator action, destructive — confirm with the user before running)**

This restores correct ordering for already-imported data, which is otherwise
unrecoverable. It also deletes any manually logged strength workouts (re-enter
by hand). `endurance_activity` is untouched.

Run (only after explicit user confirmation):
```bash
node --env-file=.env.local -e "import('./src/db/index.ts').then(async(m)=>{const{sql}=await import('drizzle-orm');await m.db.execute(sql\`DELETE FROM workout\`);console.log('workout + workout_set cleared');process.exit(0)})"
```
Then sign in and re-upload the Strong CSV at `/import`. Verify the training
week now shows exercises grouped in performed order.

- [ ] **Step 3: Full verification gate**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run format:check && npm run build && npm run test:integration`
Expected: all green.

- [ ] **Step 4: Mark spec + plan implemented**

In `docs/superpowers/specs/2026-05-17-training-week-redesign-design.md` change
`Status: designed` to `Status: implemented (2026-05-17)`. Add a one-line note
at the top of this plan file: `Status: implemented (2026-05-17)`. In
`docs/superpowers/specs/2026-05-17-weekly-training-view-design.md`, add under
its `Status:` line: `UI superseded by 2026-05-17-training-week-redesign-design.md (2026-05-17).`

- [ ] **Step 5: Commit**

```bash
git add docs/superpowers/
git commit -m "docs(training-week): mark redesign implemented; annotate superseded spec"
```

---

## Self-Review

**1. Spec coverage:**
- Data model `seq` column → Task 1. ✓
- Write path stamps order (import-persist, manual-log; parser unchanged) → Task 4. ✓
- Read path orders by `seq` → Task 3. ✓
- Grouped-by-exercise, first-appearance order, heaviest-set marker, `summarize` kept → Task 2. ✓
- UI: no accordion, vertical stack, per-workout tabular grid, show-everything, rest/missed/planned one-liners, endurance lines, today indicator, nav unchanged, empty-week → `/log` → Task 5. ✓
- Design-system compliance (`--ds-*`, sentence case, no hex/px, dustinriley-design skill) → Task 5 Steps 1–2. ✓
- Rollout: schema-push decoupled from data wipe (`DEFAULT 0`) → Task 7 Steps 1–2. ✓
- Tests: week-view unit (grouping/order/top/multi-workout), integration seq order; manual-log/strong-parser unchanged (covered — `seq` derived at insert, not in their types) → Tasks 2, 6; rationale stated in Task 4 Step 2. ✓
- Non-goals (no unit shown, no backfill, no interleaved view, no setNumber change, readiness untouched) → respected; readiness/trailing-load not modified by any task. ✓

**2. Placeholder scan:** No TBD/TODO; every code step shows full code; every command has expected output. ✓

**3. Type consistency:** `ExerciseGroup = { name; sets: {weight;reps;isTop}[] }` defined in Task 2 and consumed identically in Task 5 (`w.exercises[].name`, `ex.sets[].isTop/weight/reps`) and asserted identically in Tasks 2 & 6. `groupByExercise(sets: SetView[])` signature consistent. `seq` column name consistent across Tasks 1, 3, 4, 6. `DayCell.workouts` retains `sets` (Task 2) so the pre-existing `mon.workouts[0].sets` assertion stays valid. ✓
