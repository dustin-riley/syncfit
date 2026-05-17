import { describe, it, expect, afterAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  plannedSession,
  plannedExercise,
  workout,
  workoutSet,
  readinessAnalysis,
} from "@/db/schema";
import { runReadinessAnalysis } from "@/lib/readiness";
import { MODEL_ID } from "@/lib/ai-engine";

// NOW: 2026-05-13T16:00:00Z => America/New_York Wed 2026-05-13 12:00 EDT => dow 3, date "2026-05-13"
const NOW = new Date("2026-05-13T16:00:00Z");

const U = "itest-readiness-" + Date.now();
const U3 = "itest-readiness-fail-" + Date.now();
const ALL_USERS = [U, U3];

const goodGenerate = async () => ({
  verdict: "reduce_intensity",
  headline: "Ease off",
  rationale: "High volume, one rest day.",
  todayAdjustments: [{ exercise: "Squat", change: "stop 1 rep short" }],
  progressionSuggestions: [],
});
const badGenerate = async () => ({ verdict: "nonsense" });

afterAll(async () => {
  await db
    .delete(readinessAnalysis)
    .where(inArray(readinessAnalysis.userId, ALL_USERS));
  await db.delete(workout).where(inArray(workout.userId, ALL_USERS));
  await db
    .delete(plannedExercise)
    .where(inArray(plannedExercise.userId, ALL_USERS));
  await db
    .delete(plannedSession)
    .where(inArray(plannedSession.userId, ALL_USERS));

  const ra = await db
    .select({ id: readinessAnalysis.id })
    .from(readinessAnalysis)
    .where(inArray(readinessAnalysis.userId, ALL_USERS));
  expect(ra.length).toBe(0);
  const w = await db
    .select({ id: workout.id })
    .from(workout)
    .where(inArray(workout.userId, ALL_USERS));
  expect(w.length).toBe(0);
  const ws = await db
    .select({ id: workoutSet.id })
    .from(workoutSet)
    .where(inArray(workoutSet.userId, ALL_USERS));
  expect(ws.length).toBe(0);
  const ps = await db
    .select({ id: plannedSession.id })
    .from(plannedSession)
    .where(inArray(plannedSession.userId, ALL_USERS));
  expect(ps.length).toBe(0);
});

describe("runReadinessAnalysis (live Neon, LLM injected)", () => {
  it("A: no planned session returns friendly error and persists nothing", async () => {
    const out = await runReadinessAnalysis({
      userId: U,
      now: NOW,
      generate: goodGenerate,
    });
    expect(out.result).toBeUndefined();
    expect(out.error).toMatch(/No planned session/);
    const rows = await db
      .select({ id: readinessAnalysis.id })
      .from(readinessAnalysis)
      .where(eq(readinessAnalysis.userId, U));
    expect(rows.length).toBe(0);
  });

  it("B: happy path persists analysis with correct snapshot math", async () => {
    const [ps] = await db
      .insert(plannedSession)
      .values({
        userId: U,
        dayOfWeek: 3,
        title: "Heavy Lower",
        notes: "knee ok",
        modality: "strength",
      })
      .returning({ id: plannedSession.id });
    await db.insert(plannedExercise).values({
      plannedSessionId: ps.id,
      userId: U,
      name: "Squat",
      targetSets: 5,
      targetReps: 5,
      targetWeight: "245",
      orderIndex: 0,
    });
    const [w] = await db
      .insert(workout)
      .values({
        userId: U,
        performedAt: new Date("2026-05-12T16:00:00Z"),
        title: "Prev",
        source: "strong_csv",
        contentHash: "itest-readiness-hash-" + Date.now(),
      })
      .returning();
    await db.insert(workoutSet).values([
      {
        workoutId: w.id,
        userId: U,
        exerciseName: "Squat",
        setNumber: 1,
        weight: String(185),
        reps: 5,
      },
      {
        workoutId: w.id,
        userId: U,
        exerciseName: "Bench",
        setNumber: 1,
        weight: String(135),
        reps: 8,
      },
    ]);

    const out = await runReadinessAnalysis({
      userId: U,
      now: NOW,
      generate: goodGenerate,
    });
    expect(out.error).toBeUndefined();
    expect(out.result?.verdict).toBe("reduce_intensity");

    const rows = await db
      .select()
      .from(readinessAnalysis)
      .where(eq(readinessAnalysis.userId, U));
    expect(rows.length).toBe(1);
    const row = rows[0];
    expect(row.verdict).toBe("reduce_intensity");
    expect(row.headline).toBe("Ease off");
    expect(row.analysisDate).toBe("2026-05-13");
    expect(row.model).toBe(MODEL_ID);
    const load = row.loadSnapshot as Record<string, unknown>;
    expect(load.setCount).toBe(2);
    expect(load.totalVolume).toBe(185 * 5 + 135 * 8);
    expect(row.todayAdjustments).toEqual([
      { exercise: "Squat", change: "stop 1 rep short" },
    ]);
    expect(row.progressionSuggestions).toEqual([]);
    const snap = row.planSnapshot as { exercises: unknown[] };
    expect(snap.exercises.length).toBe(1);
  });

  it("C: AI failure returns friendly error and persists nothing", async () => {
    await db.insert(plannedSession).values({
      userId: U3,
      dayOfWeek: 3,
      title: "Heavy Lower",
      notes: "Squat 5x5",
      modality: "strength",
    });
    const out = await runReadinessAnalysis({
      userId: U3,
      now: NOW,
      generate: badGenerate,
    });
    expect(out.result).toBeUndefined();
    expect(out.error).toMatch(/couldn't analyze/i);
    const rows = await db
      .select({ id: readinessAnalysis.id })
      .from(readinessAnalysis)
      .where(eq(readinessAnalysis.userId, U3));
    expect(rows.length).toBe(0);
  });
});
