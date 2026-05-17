import { describe, it, expect, afterAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import { workout, workoutSet, enduranceActivity } from "@/db/schema";
import { logStrengthWorkout, logEnduranceActivity } from "@/lib/manual-log";

const SU = "itest-log-strength-" + Date.now();
const EU = "itest-log-endurance-" + Date.now();
const ALL = [SU, EU];
const when = new Date("2026-05-15T16:00:00Z");

afterAll(async () => {
  await db.delete(workout).where(inArray(workout.userId, ALL));
  await db
    .delete(enduranceActivity)
    .where(inArray(enduranceActivity.userId, ALL));
  const w = await db
    .select({ id: workout.id })
    .from(workout)
    .where(inArray(workout.userId, ALL));
  const e = await db
    .select({ id: enduranceActivity.id })
    .from(enduranceActivity)
    .where(inArray(enduranceActivity.userId, ALL));
  expect(w.length).toBe(0);
  expect(e.length).toBe(0);
});

describe("logStrengthWorkout (live Neon)", () => {
  const input = {
    performedAt: when,
    title: "Lower",
    sets: [
      { exerciseName: "Squat", weight: 245, reps: 5, setNumber: 1 },
      { exerciseName: "Squat", weight: 245, reps: 5, setNumber: 2 },
    ],
  };
  it("adds a workout + its sets, then dedupes a re-submit", async () => {
    const a = await logStrengthWorkout(SU, input);
    expect(a).toMatchObject({ ok: true, added: 1, skipped: 0 });
    const rows = await db.select().from(workout).where(eq(workout.userId, SU));
    expect(rows.length).toBe(1);
    const sets = await db
      .select()
      .from(workoutSet)
      .where(eq(workoutSet.workoutId, rows[0].id));
    expect(sets.length).toBe(2);

    const b = await logStrengthWorkout(SU, input);
    expect(b).toMatchObject({ ok: true, added: 0, skipped: 1 });
  });
  it("rejects invalid input with field errors and writes nothing", async () => {
    const r = await logStrengthWorkout(SU, {
      performedAt: when,
      title: "Bad",
      sets: [],
    });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.sets).toBeTruthy();
  });
});

describe("logEnduranceActivity (live Neon)", () => {
  const input = {
    performedAt: when,
    activityType: "run",
    distanceMi: 6.2,
    durationSec: 2880,
    notes: "easy",
  };
  it("adds an activity then dedupes a re-submit (notes ignored for identity)", async () => {
    const a = await logEnduranceActivity(EU, input);
    expect(a).toMatchObject({ ok: true, added: 1, skipped: 0 });
    const b = await logEnduranceActivity(EU, {
      ...input,
      notes: "totally different note",
    });
    expect(b).toMatchObject({ ok: true, added: 0, skipped: 1 });
    const rows = await db
      .select()
      .from(enduranceActivity)
      .where(eq(enduranceActivity.userId, EU));
    expect(rows.length).toBe(1);
    expect(rows[0].activityType).toBe("run");
  });
  it("rejects an unknown activity type", async () => {
    const r = await logEnduranceActivity(EU, {
      ...input,
      activityType: "yoga",
    });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.activityType).toBeTruthy();
  });
});
