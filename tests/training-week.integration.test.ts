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
  await db.insert(workoutSet).values([
    { workoutId: w1.id, userId: U, exerciseName: "Squat", setNumber: 1, seq: 0, weight: "225", reps: 5 },
    { workoutId: w1.id, userId: U, exerciseName: "Bench", setNumber: 1, seq: 1, weight: "185", reps: 5 },
    { workoutId: w1.id, userId: U, exerciseName: "Squat", setNumber: 2, seq: 2, weight: "245", reps: 3 },
  ]);
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
    expect(mon.summary).toBe("Squat 245×3 · Bench 185×5");
    const ex = mon.workouts[0].exercises;
    expect(ex.map((e) => e.name)).toEqual(["Squat", "Bench"]); // seq order, grouped
    expect(ex[0].sets).toEqual([
      { weight: 225, reps: 5, isTop: false },
      { weight: 245, reps: 3, isTop: true },
    ]);

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
