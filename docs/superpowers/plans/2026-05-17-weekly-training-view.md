# Weekly Training View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the dashboard "recent activity" accordion with a Monday→Sunday weekly training agenda showing each day's state (done / missed / planned / rest) plus logged session content, with prev/next week navigation.

**Architecture:** Two pure offline-tested libs (`week.ts` for timezone-aware week math, `week-view.ts` for day-state derivation), one DB lib (`training-week-data.ts`) consumed by a thin server action, and a client component rendering the agenda. The pure libs never import `@/db` so unit tests stay offline; the DB lib follows the existing `loadTrailingLoad` pattern.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle (neon-http `db`), Vitest, `@dustin-riley/design`, lucide-react.

---

## Background the engineer needs

- **Timezone:** all date math uses `APP_TZ` (`America/New_York`) from `src/lib/units.ts`. There is no per-user timezone.
- **Day-of-week convention:** `planned_session.dayOfWeek` is JS `getDay()` style: `Sun=0, Mon=1, … Sat=6` (see `todayInfo` in `src/lib/readiness.ts`).
- **Why a separate `week.ts` instead of reusing `todayInfo`:** `src/lib/readiness.ts` imports `@/db`, and `src/db/index.ts` throws at import time if `DATABASE_URL` is unset. Offline unit tests (`npm test`) must not import `@/db`. So `week.ts` re-derives its small APP_TZ date helper locally rather than importing from `readiness.ts`. This duplication is deliberate and matches how `trailing-load.ts` stays DB-free.
- **Schema (already exists, do not modify):**
  - `workout`: `id` (uuid), `userId` (text), `performedAt` (timestamptz), `title` (text).
  - `workoutSet`: `id`, `workoutId` (uuid), `userId` (text), `exerciseName` (text), `setNumber` (int), `weight` (numeric — comes back as string, wrap with `Number()`), `reps` (int).
  - `plannedSession`: `userId`, `dayOfWeek` (int), `title` (text).
- **`getPlanForUser(userId)`** in `src/lib/plan-store.ts` returns `PlanDay[]` where each has `{ dayOfWeek, title, notes, modality, exercises }`.
- **Padded-window strategy:** querying "workouts whose APP_TZ calendar date is in this week" requires APP_TZ→UTC inversion. To keep all timezone logic in one pure place, the DB lib queries a UTC window padded ±1 day, and `buildTrainingWeek` does the exact bucketing by comparing each workout's APP_TZ date string. ±1 day padding (24h) far exceeds the New York UTC offset (4–5h).
- **Test commands:** offline unit `npx vitest run tests/<file>.test.ts`; integration `npm run test:integration` (needs `node --env-file=.env.local`; the script already does this). Integration tests self-clean synthetic `itest-*` users in `afterAll`.

---

## File Structure

- **Create `src/lib/week.ts`** — pure APP_TZ week math: `appDate`, `weekStartFor`, `addDaysYmd`, `weekDays`, `paddedUtcRange`, `formatWeekLabel`, `weekNav`. No React, no DB.
- **Create `src/lib/week-view.ts`** — pure: `buildTrainingWeek(...)` deriving the 7 `DayCell`s + nav into a serializable `TrainingWeekData`. Imports only `week.ts`. No React, no DB.
- **Create `src/lib/training-week-data.ts`** — `getTrainingWeek(userId, weekStartYmd, now)`: queries `workout`/`workoutSet` in the padded window + plan, delegates to `buildTrainingWeek`. Imports `@/db` (offline tests must NOT import this).
- **Create `src/app/actions/training-week.ts`** — thin `"use server"` wrapper: session → scope → `getTrainingWeek`.
- **Create `src/app/(app)/dashboard/training-week.tsx`** — `"use client"` agenda + `‹ ›` nav + per-day expand.
- **Modify `src/app/(app)/page.tsx`** — drop the 30-workout query / `workoutViews` / `RecentActivity`; server-render the current week; render `<TrainingWeek>`; heading → "training week".
- **Delete `src/app/(app)/dashboard/recent-activity.tsx`**.
- **Create** `tests/week.test.ts`, `tests/week-view.test.ts`, `tests/training-week.integration.test.ts`.

---

## Task 1: Pure week math (`src/lib/week.ts`)

**Files:**
- Create: `src/lib/week.ts`
- Test: `tests/week.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/week.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  appDate,
  addDaysYmd,
  weekStartFor,
  weekDays,
  paddedUtcRange,
  formatWeekLabel,
  weekNav,
} from "@/lib/week";

describe("appDate", () => {
  it("returns the APP_TZ calendar date, not the UTC date", () => {
    // 2026-05-13T03:00:00Z is still 2026-05-12 23:00 in America/New_York
    expect(appDate(new Date("2026-05-13T03:00:00Z"))).toBe("2026-05-12");
  });
});

describe("addDaysYmd", () => {
  it("adds and subtracts whole days across month and year boundaries", () => {
    expect(addDaysYmd("2026-05-13", 4)).toBe("2026-05-17");
    expect(addDaysYmd("2026-05-01", -1)).toBe("2026-04-30");
    expect(addDaysYmd("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("is unaffected by DST transitions (whole-day math at noon UTC)", () => {
    // US spring-forward 2026-03-08, fall-back 2026-11-01
    expect(addDaysYmd("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDaysYmd("2026-10-31", 2)).toBe("2026-11-02");
  });
});

describe("weekStartFor", () => {
  it("returns the Monday of the week (mid-week)", () => {
    // 2026-05-13 is a Wednesday
    expect(weekStartFor(new Date("2026-05-13T16:00:00Z"))).toBe("2026-05-11");
  });
  it("treats Sunday as the last day of the week, not the first", () => {
    // 2026-05-17 is a Sunday -> Monday is 2026-05-11
    expect(weekStartFor(new Date("2026-05-17T16:00:00Z"))).toBe("2026-05-11");
  });
  it("returns the same date when given a Monday", () => {
    expect(weekStartFor(new Date("2026-05-11T16:00:00Z"))).toBe("2026-05-11");
  });
  it("rolls back across a month boundary", () => {
    // 2026-05-01 is a Friday -> Monday is 2026-04-27
    expect(weekStartFor(new Date("2026-05-01T16:00:00Z"))).toBe("2026-04-27");
  });
});

describe("weekDays", () => {
  it("returns 7 days Mon..Sun with plan dayOfWeek (Sun=0..Sat=6)", () => {
    const d = weekDays("2026-05-11");
    expect(d.map((x) => x.ymd)).toEqual([
      "2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14",
      "2026-05-15", "2026-05-16", "2026-05-17",
    ]);
    expect(d.map((x) => x.planDow)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("paddedUtcRange", () => {
  it("brackets the week with ±1 day padding", () => {
    const { gte, lt } = paddedUtcRange("2026-05-11");
    expect(gte.toISOString()).toBe("2026-05-10T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-05-19T00:00:00.000Z");
  });
});

describe("formatWeekLabel", () => {
  it("formats a same-month week", () => {
    expect(formatWeekLabel("2026-05-11")).toBe("may 11–17");
  });
  it("formats a cross-month week", () => {
    expect(formatWeekLabel("2026-04-27")).toBe("apr 27 – may 3");
  });
});

describe("weekNav", () => {
  it("computes prev/next and disables next at the current week", () => {
    const now = new Date("2026-05-13T16:00:00Z"); // current week starts 2026-05-11
    expect(weekNav("2026-05-11", now)).toEqual({
      prevWeekYmd: "2026-05-04",
      nextWeekYmd: "2026-05-18",
      nextDisabled: true,
    });
  });
  it("enables next for a past week", () => {
    const now = new Date("2026-05-13T16:00:00Z");
    expect(weekNav("2026-05-04", now)).toEqual({
      prevWeekYmd: "2026-04-27",
      nextWeekYmd: "2026-05-11",
      nextDisabled: false,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/week.test.ts`
Expected: FAIL — cannot resolve `@/lib/week` / functions not defined.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/week.ts`:

```ts
// Pure APP_TZ (America/New_York) week math. No React, no DB — this module
// MUST NOT import "@/db" (offline unit tests rely on that). Whole-day
// arithmetic is done at noon UTC so DST never shifts the calendar date.
import { APP_TZ } from "@/lib/units";

const MS_DAY = 86_400_000;
const MONTHS = [
  "jan", "feb", "mar", "apr", "may", "jun",
  "jul", "aug", "sep", "oct", "nov", "dec",
];

function appParts(d: Date): { ymd: string; dow: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const map: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    dow: map[get("weekday")],
  };
}

/** APP_TZ calendar date ("YYYY-MM-DD") for an instant. */
export function appDate(d: Date): string {
  return appParts(d).ymd;
}

/** Add (or subtract) whole days to a "YYYY-MM-DD" string. */
export function addDaysYmd(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`) + n * MS_DAY;
  return new Date(t).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" of the Monday of the week containing `d` (APP_TZ). */
export function weekStartFor(d: Date): string {
  const { ymd, dow } = appParts(d);
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysYmd(ymd, -back);
}

/** 7 entries Mon..Sun: calendar date + plan dayOfWeek (Sun=0..Sat=6). */
export function weekDays(
  weekStartYmd: string
): { ymd: string; planDow: number }[] {
  return Array.from({ length: 7 }, (_, i) => ({
    ymd: addDaysYmd(weekStartYmd, i),
    planDow: (i + 1) % 7,
  }));
}

/** UTC window padded ±1 day; exact bucketing happens in buildTrainingWeek. */
export function paddedUtcRange(weekStartYmd: string): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.parse(`${weekStartYmd}T00:00:00Z`) - MS_DAY),
    lt: new Date(
      Date.parse(`${addDaysYmd(weekStartYmd, 7)}T00:00:00Z`) + MS_DAY
    ),
  };
}

/** "may 11–17" (same month) or "apr 27 – may 3" (cross month). */
export function formatWeekLabel(weekStartYmd: string): string {
  const end = addDaysYmd(weekStartYmd, 6);
  const m1 = MONTHS[Number(weekStartYmd.slice(5, 7)) - 1];
  const d1 = Number(weekStartYmd.slice(8, 10));
  const m2 = MONTHS[Number(end.slice(5, 7)) - 1];
  const d2 = Number(end.slice(8, 10));
  return m1 === m2 ? `${m1} ${d1}–${d2}` : `${m1} ${d1} – ${m2} ${d2}`;
}

/** Prev/next week starts; next is disabled once the current week is reached. */
export function weekNav(
  weekStartYmd: string,
  now: Date
): { prevWeekYmd: string; nextWeekYmd: string; nextDisabled: boolean } {
  return {
    prevWeekYmd: addDaysYmd(weekStartYmd, -7),
    nextWeekYmd: addDaysYmd(weekStartYmd, 7),
    nextDisabled: weekStartYmd >= weekStartFor(now),
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/week.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/week.ts tests/week.test.ts
git commit -m "feat(week): pure APP_TZ week-math lib

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure day-state derivation (`src/lib/week-view.ts`)

**Files:**
- Create: `src/lib/week-view.ts`
- Test: `tests/week-view.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/week-view.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { buildTrainingWeek, type WorkoutInput } from "@/lib/week-view";

const NOW = new Date("2026-05-13T16:00:00Z"); // APP_TZ Wed 2026-05-13
const WEEK = "2026-05-11";

function wk(
  id: string,
  ymdNoonUtc: string,
  title: string,
  sets: WorkoutInput["sets"]
): WorkoutInput {
  return { id, performedAt: new Date(`${ymdNoonUtc}T16:00:00Z`), title, sets };
}

describe("buildTrainingWeek", () => {
  it("derives the four states including the today edge", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [
        wk("w1", "2026-05-11", "Push A", [
          { exerciseName: "Bench", weight: 185, reps: 5 },
          { exerciseName: "OHP", weight: 115, reps: 6 },
          { exerciseName: "Dip", weight: 0, reps: 12 },
        ]),
      ],
      // plan: Mon(1) logged, Tue(2) skipped+past, Wed(3)=today no workout,
      // Fri(5) future. Sun(0) / others no plan.
      planDays: [
        { dayOfWeek: 1, title: "Push A" },
        { dayOfWeek: 2, title: "Pull A" },
        { dayOfWeek: 3, title: "Legs" },
        { dayOfWeek: 5, title: "Push B" },
      ],
    });

    expect(data.weekStartYmd).toBe(WEEK);
    expect(data.label).toBe("may 11–17");
    expect(data.nextDisabled).toBe(true);
    expect(data.days).toHaveLength(7);

    const [mon, tue, wed, thu, fri, sat, sun] = data.days;
    expect(mon.state).toBe("done");
    expect(mon.label).toBe("mon 11");
    expect(mon.summary).toBe("Bench 185×5 · OHP 115×6 · +1 more");
    expect(mon.workouts[0].sets).toHaveLength(3);

    expect(tue.state).toBe("missed"); // planned, strictly before today
    expect(tue.plannedTitle).toBe("Pull A");

    expect(wed.state).toBe("planned"); // planned, today, no workout
    expect(wed.isToday).toBe(true);
    expect(wed.plannedTitle).toBe("Legs");

    expect(thu.state).toBe("rest"); // no plan, no workout
    expect(fri.state).toBe("planned"); // planned, future
    expect(sat.state).toBe("rest");
    expect(sun.state).toBe("rest");
  });

  it("counts an unplanned logged workout as done, not rest", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [
        wk("w1", "2026-05-14", "Surprise", [
          { exerciseName: "Row", weight: 135, reps: 8 },
        ]),
      ],
      planDays: [],
    });
    const thu = data.days[3]; // 2026-05-14
    expect(thu.state).toBe("done");
    expect(thu.summary).toBe("Row 135×8");
  });

  it("merges multiple workouts on one day and stays done", () => {
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
      planDays: [{ dayOfWeek: 2, title: "Legs" }],
    });
    const tue = data.days[1];
    expect(tue.state).toBe("done");
    expect(tue.workouts).toHaveLength(2);
    expect(tue.summary).toBe("Squat 225×5 · Curl 30×12");
  });

  it("all-rest week when no plan and no workouts", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [],
      planDays: [],
    });
    expect(data.days.every((d) => d.state === "rest")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/week-view.test.ts`
Expected: FAIL — cannot resolve `@/lib/week-view`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/week-view.ts`:

```ts
// Pure day-state derivation for the weekly training view. Imports only
// "@/lib/week" — no React, no DB. Output is fully serializable (no Date).
import { appDate, weekDays, formatWeekLabel, weekNav } from "@/lib/week";

export type SetView = { exerciseName: string; weight: number; reps: number };
export type WorkoutInput = {
  id: string;
  performedAt: Date;
  title: string;
  sets: SetView[];
};
export type PlanDayLite = { dayOfWeek: number; title: string };
export type DayState = "done" | "missed" | "planned" | "rest";
export type DayCell = {
  ymd: string;
  label: string; // "mon 11"
  isToday: boolean;
  state: DayState;
  workouts: { id: string; title: string; sets: SetView[] }[];
  summary: string | null; // done only
  plannedTitle: string | null; // missed/planned only
};
export type TrainingWeekData = {
  weekStartYmd: string;
  label: string;
  days: DayCell[];
  prevWeekYmd: string;
  nextWeekYmd: string;
  nextDisabled: boolean;
};

const DOW_LABELS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function summarize(sets: SetView[]): string | null {
  if (sets.length === 0) return null;
  const head = sets
    .slice(0, 2)
    .map((s) => `${s.exerciseName} ${s.weight}×${s.reps}`)
    .join(" · ");
  const rest = sets.length - 2;
  return rest > 0 ? `${head} · +${rest} more` : head;
}

export function buildTrainingWeek(args: {
  weekStartYmd: string;
  now: Date;
  workouts: WorkoutInput[];
  planDays: PlanDayLite[];
}): TrainingWeekData {
  const { weekStartYmd, now, workouts, planDays } = args;
  const todayYmd = appDate(now);

  const days: DayCell[] = weekDays(weekStartYmd).map((d, i) => {
    const dayWorkouts = workouts
      .filter((w) => appDate(w.performedAt) === d.ymd)
      .sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime());
    const plan = planDays.find((p) => p.dayOfWeek === d.planDow) ?? null;
    const dayNum = Number(d.ymd.slice(8, 10));
    const label = `${DOW_LABELS[i]} ${dayNum}`;
    const isToday = d.ymd === todayYmd;

    let state: DayState;
    if (dayWorkouts.length > 0) state = "done";
    else if (plan) state = d.ymd < todayYmd ? "missed" : "planned";
    else state = "rest";

    const flatSets = dayWorkouts.flatMap((w) => w.sets);

    return {
      ymd: d.ymd,
      label,
      isToday,
      state,
      workouts: dayWorkouts.map((w) => ({
        id: w.id,
        title: w.title,
        sets: w.sets,
      })),
      summary: state === "done" ? summarize(flatSets) : null,
      plannedTitle:
        state === "missed" || state === "planned" ? (plan?.title ?? "") : null,
    };
  });

  const nav = weekNav(weekStartYmd, now);
  return {
    weekStartYmd,
    label: formatWeekLabel(weekStartYmd),
    days,
    ...nav,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/week-view.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add src/lib/week-view.ts tests/week-view.test.ts
git commit -m "feat(week): pure day-state derivation for the weekly view

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: DB layer (`src/lib/training-week-data.ts`) + integration test

**Files:**
- Create: `src/lib/training-week-data.ts`
- Test: `tests/training-week.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

Create `tests/training-week.integration.test.ts`:

```ts
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { workout, workoutSet, plannedSession } from "@/db/schema";
import { getTrainingWeek } from "@/lib/training-week-data";

const NOW = new Date("2026-05-13T16:00:00Z"); // APP_TZ Wed 2026-05-13
const WEEK = "2026-05-11";
const U = "itest-week-" + Date.now();
const OTHER = "itest-week-other-" + Date.now();
const USERS = [U, OTHER];

beforeAll(async () => {
  // U: Mon logged (in-week), Tue planned+skipped, an out-of-week workout.
  const [w1] = await db
    .insert(workout)
    .values({
      userId: U,
      performedAt: new Date("2026-05-11T16:00:00Z"),
      title: "Push A",
      contentHash: "h-" + U + "-1",
    })
    .returning();
  await db.insert(workoutSet).values({
    workoutId: w1.id,
    userId: U,
    exerciseName: "Bench",
    setNumber: 1,
    weight: "185",
    reps: 5,
  });
  await db.insert(workout).values({
    userId: U,
    performedAt: new Date("2026-05-04T16:00:00Z"), // previous week
    title: "Old",
    contentHash: "h-" + U + "-old",
  });
  await db
    .insert(plannedSession)
    .values({ userId: U, dayOfWeek: 2, title: "Pull A" }); // Tue
  // OTHER user's in-week workout must NOT leak into U's view.
  await db.insert(workout).values({
    userId: OTHER,
    performedAt: new Date("2026-05-12T16:00:00Z"),
    title: "Not mine",
    contentHash: "h-" + OTHER + "-1",
  });
});

afterAll(async () => {
  await db.delete(workoutSet).where(inArray(workoutSet.userId, USERS));
  await db.delete(workout).where(inArray(workout.userId, USERS));
  await db.delete(plannedSession).where(inArray(plannedSession.userId, USERS));
});

describe("getTrainingWeek", () => {
  it("scopes by user, windows by week, and derives states", async () => {
    const data = await getTrainingWeek(U, WEEK, NOW);
    expect(data.weekStartYmd).toBe(WEEK);
    expect(data.days).toHaveLength(7);

    const mon = data.days[0]; // 2026-05-11
    expect(mon.state).toBe("done");
    expect(mon.summary).toBe("Bench 185×5");

    const tue = data.days[1]; // 2026-05-12 — planned, before today (Wed)
    expect(tue.state).toBe("missed");
    expect(tue.plannedTitle).toBe("Pull A");

    // out-of-week + other user's workouts excluded everywhere
    const titles = data.days.flatMap((d) => d.workouts.map((w) => w.title));
    expect(titles).toEqual(["Push A"]);
  });

  it("clamps a future week request to the current week", async () => {
    const data = await getTrainingWeek(U, "2026-06-01", NOW);
    expect(data.weekStartYmd).toBe(WEEK); // snapped back to current week
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- tests/training-week.integration.test.ts`
Expected: FAIL — cannot resolve `@/lib/training-week-data`.

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/training-week-data.ts`:

```ts
// DB layer for the weekly training view. Mirrors the loadTrailingLoad
// pattern: query here, derive in the pure lib. Imports "@/db" — DO NOT
// import this from offline unit tests.
import { db } from "@/db";
import { workout, workoutSet } from "@/db/schema";
import { and, eq, gte, lt, inArray, asc } from "drizzle-orm";
import { getPlanForUser } from "@/lib/plan-store";
import { paddedUtcRange, weekStartFor } from "@/lib/week";
import {
  buildTrainingWeek,
  type TrainingWeekData,
  type WorkoutInput,
} from "@/lib/week-view";

export async function getTrainingWeek(
  userId: string,
  weekStartYmd: string,
  now: Date
): Promise<TrainingWeekData> {
  // Never page into the future: the plan is the same every week and there
  // are no future logged workouts. Clamp to the current week.
  const currentWeek = weekStartFor(now);
  const week = weekStartYmd > currentWeek ? currentWeek : weekStartYmd;

  const { gte: from, lt: to } = paddedUtcRange(week);
  const workouts = await db
    .select()
    .from(workout)
    .where(
      and(
        eq(workout.userId, userId),
        gte(workout.performedAt, from),
        lt(workout.performedAt, to)
      )
    )
    .orderBy(asc(workout.performedAt));

  const ids = workouts.map((w) => w.id);
  const sets = ids.length
    ? await db
        .select()
        .from(workoutSet)
        .where(
          and(
            eq(workoutSet.userId, userId),
            inArray(workoutSet.workoutId, ids)
          )
        )
        .orderBy(asc(workoutSet.setNumber))
    : [];

  const workoutInputs: WorkoutInput[] = workouts.map((w) => ({
    id: w.id,
    performedAt: w.performedAt,
    title: w.title,
    sets: sets
      .filter((s) => s.workoutId === w.id)
      .map((s) => ({
        exerciseName: s.exerciseName,
        weight: Number(s.weight),
        reps: s.reps,
      })),
  }));

  const planDays = (await getPlanForUser(userId)).map((p) => ({
    dayOfWeek: p.dayOfWeek,
    title: p.title,
  }));

  return buildTrainingWeek({
    weekStartYmd: week,
    now,
    workouts: workoutInputs,
    planDays,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:integration -- tests/training-week.integration.test.ts`
Expected: PASS (both cases). The synthetic users self-clean.

- [ ] **Step 5: Commit**

```bash
git add src/lib/training-week-data.ts tests/training-week.integration.test.ts
git commit -m "feat(week): training-week DB layer + integration test

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Server action (`src/app/actions/training-week.ts`)

**Files:**
- Create: `src/app/actions/training-week.ts`

- [ ] **Step 1: Write minimal implementation**

(Thin wrappers follow the existing `src/app/actions/analyze.ts` pattern and are not unit-tested — the logic lives in the integration-tested lib.)

Create `src/app/actions/training-week.ts`:

```ts
"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTrainingWeek } from "@/lib/training-week-data";
import type { TrainingWeekData } from "@/lib/week-view";

export async function loadTrainingWeek(
  weekStartYmd: string
): Promise<TrainingWeekData> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return getTrainingWeek(session.user.id, weekStartYmd, new Date());
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/training-week.ts
git commit -m "feat(week): loadTrainingWeek server action

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Client agenda component (`src/app/(app)/dashboard/training-week.tsx`)

**Files:**
- Create: `src/app/(app)/dashboard/training-week.tsx`

Design-system rules (from CLAUDE.md / dustinriley-design): reference `--ds-*` tokens and `.ds-*` classes only — never hard-code hex/px; color is never the only state signal (always pair an icon **and** a text label); sentence-case copy; no emoji; the 3 radii are 8/16/999. This component mirrors the token/inline-style idiom of the now-deleted `recent-activity.tsx`.

- [ ] **Step 1: Write minimal implementation**

Create `src/app/(app)/dashboard/training-week.tsx`:

```tsx
"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  CalendarClock,
  Minus,
} from "lucide-react";
import type { TrainingWeekData, DayState } from "@/lib/week-view";
import { loadTrainingWeek } from "@/app/actions/training-week";

const STATE_META: Record<
  DayState,
  { label: string; Icon: typeof Check }
> = {
  done: { label: "done", Icon: Check },
  missed: { label: "missed", Icon: X },
  planned: { label: "planned", Icon: CalendarClock },
  rest: { label: "rest", Icon: Minus },
};

export function TrainingWeek({ initial }: { initial: TrainingWeekData }) {
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const go = (weekStartYmd: string) => {
    setOpen(null);
    startTransition(async () => {
      setData(await loadTrainingWeek(weekStartYmd));
    });
  };

  const hasAnyWorkout = data.days.some((d) => d.workouts.length > 0);

  return (
    <div style={{ opacity: pending ? 0.6 : 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--ds-space-2)",
          marginBottom: "var(--ds-space-2)",
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
          const isOpen = open === d.ymd;
          const canExpand = d.state === "done";
          return (
            <li
              key={d.ymd}
              style={{
                borderBottom:
                  "var(--ds-border-width) solid var(--ds-border)",
                borderLeft: d.isToday
                  ? "2px solid var(--ds-primary)"
                  : "2px solid transparent",
                paddingLeft: "var(--ds-space-2)",
              }}
            >
              <button
                onClick={() =>
                  canExpand ? setOpen(isOpen ? null : d.ymd) : undefined
                }
                aria-expanded={canExpand ? isOpen : undefined}
                disabled={!canExpand}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: "var(--ds-space-2)",
                  width: "100%",
                  padding: "var(--ds-space-2) 0",
                  background: "none",
                  border: "none",
                  font: "inherit",
                  color: "var(--ds-text)",
                  textAlign: "left",
                  cursor: canExpand ? "pointer" : "default",
                }}
              >
                <span
                  className="ds-mono-note"
                  style={{ minWidth: "6ch", fontWeight: 600 }}
                >
                  {d.label}
                </span>
                <span
                  className="ds-mono-note"
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
                <span className="ds-mono-note" style={{ flex: 1 }}>
                  {d.state === "done"
                    ? `${d.workouts.map((w) => w.title).join(" · ")} — ${d.summary}`
                    : d.state === "rest"
                      ? "no plan"
                      : d.plannedTitle}
                </span>
                {canExpand && (
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "none",
                      transition: "transform 150ms",
                    }}
                  />
                )}
              </button>
              {isOpen && canExpand && (
                <ul
                  className="ds-mono-note"
                  style={{
                    listStyle: "none",
                    margin:
                      "0 0 var(--ds-space-2) var(--ds-space-5)",
                    padding: 0,
                  }}
                >
                  {d.workouts.flatMap((w) =>
                    w.sets.map((s, i) => (
                      <li key={`${w.id}-${i}`}>
                        {s.exerciseName}: {s.weight} × {s.reps}
                      </li>
                    ))
                  )}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {!hasAnyWorkout && (
        <p className="ds-mono-note" style={{ marginTop: "var(--ds-space-2)" }}>
          no workouts this week.{" "}
          <Link href="/import" style={{ color: "var(--ds-link)" }}>
            import your Strong CSV
          </Link>
          .
        </p>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/dashboard/training-week.tsx"
git commit -m "feat(week): TrainingWeek client agenda component

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Wire into the dashboard; remove the old accordion

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Delete: `src/app/(app)/dashboard/recent-activity.tsx`

- [ ] **Step 1: Edit `src/app/(app)/page.tsx`**

Remove the `RecentActivity` import line:

```ts
import { RecentActivity } from "./dashboard/recent-activity";
```

Add these imports (next to the other dashboard imports):

```ts
import { TrainingWeek } from "./dashboard/training-week";
import { weekStartFor } from "@/lib/week";
import { getTrainingWeek } from "@/lib/training-week-data";
```

Remove the now-unused recent-workouts query block entirely — these lines:

```ts
  const recentWorkouts = await db
    .select()
    .from(workout)
    .where(eq(workout.userId, userId))
    .orderBy(desc(workout.performedAt))
    .limit(30);
  const wIds = recentWorkouts.map((w) => w.id);
  const sets = wIds.length
    ? await db
        .select()
        .from(workoutSet)
        .where(inArray(workoutSet.workoutId, wIds))
    : [];
```

and the `workoutViews` mapping block:

```ts
  const workoutViews = recentWorkouts.map((w) => ({
    id: w.id,
    performedAt: w.performedAt.toDateString(),
    title: w.title,
    sets: sets
      .filter((s) => s.workoutId === w.id)
      .map((s) => ({
        exerciseName: s.exerciseName,
        weight: Number(s.weight),
        reps: s.reps,
      })),
  }));
```

After the `const load = await loadTrailingLoad(userId, now);` line, add:

```ts
  const initialWeek = await getTrainingWeek(userId, weekStartFor(now), now);
```

Replace the recent-activity section:

```tsx
      <section className="my-6">
        <h2 className="h4">recent activity</h2>
        <RecentActivity workouts={workoutViews} />
      </section>
```

with:

```tsx
      <section className="my-6">
        <h2 className="h4">training week</h2>
        <TrainingWeek initial={initialWeek} />
      </section>
```

Now fix the leftover unused imports on the `drizzle-orm` / schema lines. After the edits, `workout`, `workoutSet`, `desc`, and `inArray` may no longer be used (`readinessAnalysis`, `eq`, `desc` are still used by the `pastAnalyses` query — verify). Update the two import lines to exactly what remains referenced:

```ts
import { workout, workoutSet, readinessAnalysis } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
```

→ inspect the file after edits and remove any identifier no longer referenced (the `pastAnalyses` query uses `readinessAnalysis`, `eq`, `desc`; `workout`/`workoutSet`/`inArray` are only removable if nothing else uses them). The type-check and lint steps below will catch a wrong guess.

- [ ] **Step 2: Delete the old component**

```bash
git rm "src/app/(app)/dashboard/recent-activity.tsx"
```

- [ ] **Step 3: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: no errors, no unused-variable warnings. If lint flags an unused import on `page.tsx`, remove that identifier and re-run.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/page.tsx"
git commit -m "feat(week): render TrainingWeek on dashboard, drop recent-activity

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Full verification + docs

**Files:**
- Modify: `docs/superpowers/specs/2026-05-17-weekly-training-view-design.md`
- Modify: this plan file

- [ ] **Step 1: Run the full offline gate**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run format:check && npm run build`
Expected: all green. If `format:check` fails, run `npm run format`, re-run, and amend the relevant commit.

- [ ] **Step 2: Run the integration suite (server-action/DB path touched)**

Run: `npm run test:integration`
Expected: all green, including `training-week.integration.test.ts`. Synthetic `itest-*` users self-clean.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Run: `npm run dev`, sign in, open `/`. Confirm: the week agenda renders Mon→Sun, today is highlighted, `‹` pages back and `›` is disabled on the current week, a `done` day expands to its sets, and a planned-but-past day shows "missed".

- [ ] **Step 4: Mark the spec implemented**

In `docs/superpowers/specs/2026-05-17-weekly-training-view-design.md`, change the `Status:` line to:

```
Status: implemented (2026-05-17)
```

- [ ] **Step 5: Commit docs**

```bash
git add docs/superpowers/specs/2026-05-17-weekly-training-view-design.md docs/superpowers/plans/2026-05-17-weekly-training-view.md
git commit -m "docs(week): mark weekly training view spec implemented

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Self-Review Notes

**Spec coverage:** day-state table → Task 2; week boundaries/Monday-start/APP_TZ → Task 1; nav + next-disabled → Task 1 (`weekNav`) + Task 5; thin-action-over-pure-lib architecture → Tasks 1–4; layout B agenda + design-system rules → Task 5; new-user/empty-week edge cases → Task 2 tests + Task 5 empty prompt; heading rename → Task 6; unit + integration testing → Tasks 1–3, 7. All spec sections map to a task.

**Type consistency:** `TrainingWeekData`/`DayCell`/`WorkoutInput`/`PlanDayLite`/`DayState` defined once in `week-view.ts` and reused verbatim by `training-week-data.ts`, the action, and the client. `weekStartFor`/`paddedUtcRange`/`weekNav`/`formatWeekLabel`/`appDate`/`weekDays`/`addDaysYmd` defined in `week.ts` and consumed with matching signatures. `getTrainingWeek(userId, weekStartYmd, now)` signature identical across lib, action, and integration test.

**Placeholder scan:** no TBD/TODO; every code step has complete code; the one judgement call (which `page.tsx` imports become unused) is explicitly delegated to the tsc+lint gate rather than guessed.
