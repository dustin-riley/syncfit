import { describe, it, expect, afterAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  plannedSession,
  plannedExercise,
  workout,
  workoutSet,
  readinessAnalysis,
  planProfile,
} from "@/db/schema";
import { runReadinessAnalysis, todayInfo } from "@/lib/readiness";
import { upsertPlanProfile } from "@/lib/plan-store";
import { MODEL_ID } from "@/lib/ai-engine";

// NOW: 2026-05-13T16:00:00Z => America/New_York Wed 2026-05-13 12:00 EDT => dow 3, date "2026-05-13"
const NOW = new Date("2026-05-13T16:00:00Z");

const U = "itest-readiness-" + Date.now();
const U3 = "itest-readiness-fail-" + Date.now();
const U4 = "itest-readiness-prog-" + Date.now();
const GOAL_USER = "itest-rgoal-" + Date.now();
const GOAL_NOW = new Date("2026-05-18T15:00:00Z"); // 2026-05-18T15:00Z => America/New_York Mon 2026-05-18 11:00 EDT => dow 1
const ALL_USERS = [U, U3, U4];

const goodGenerate = async () => ({
  verdict: "reduce_intensity",
  headline: "Ease off",
  rationale: "High volume, one rest day.",
  todayAdjustments: [{ exercise: "Squat", change: "stop 1 rep short" }],
  progressionSuggestions: [],
});
const badGenerate = async () => ({ verdict: "nonsense" });
const progressingGenerate = async () => ({
  verdict: "proceed_as_planned",
  headline: "Solid",
  rationale: "Clean reps at target.",
  todayAdjustments: [],
  progressionSuggestions: [
    {
      exercise: "Squat",
      currentWeight: 245,
      suggestedWeight: 250,
      rationale: "stalled-clear",
    },
  ],
});

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
  await db.delete(planProfile).where(inArray(planProfile.userId, [GOAL_USER]));
  await db
    .delete(plannedSession)
    .where(inArray(plannedSession.userId, [GOAL_USER]));
  await db
    .delete(readinessAnalysis)
    .where(inArray(readinessAnalysis.userId, [GOAL_USER]));

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
    const load = row.loadSnapshot as {
      windowDays: number;
      strengthSessions: { sets: unknown[] }[];
    };
    expect(load.windowDays).toBe(7);
    expect(load.strengthSessions.length).toBe(1);
    expect(load.strengthSessions[0].sets.length).toBe(2);
    expect(row.todayAdjustments).toEqual([
      { exercise: "Squat", change: "stop 1 rep short" },
    ]);
    expect(row.progressionSuggestions).toEqual([]);
    const snap = row.planSnapshot as {
      session: { id: string };
      exercises: unknown[];
    };
    expect(snap.exercises.length).toBe(1);
    expect(snap.session.id).toBe(ps.id);
  });

  it("B2: progression suggestions are stamped status 'pending' server-side", async () => {
    const [ps2] = await db
      .insert(plannedSession)
      .values({
        userId: U4,
        dayOfWeek: 3,
        title: "Lower",
        notes: "",
        modality: "strength",
      })
      .returning({ id: plannedSession.id });
    await db.insert(plannedExercise).values({
      plannedSessionId: ps2.id,
      userId: U4,
      name: "Squat",
      targetSets: 5,
      targetReps: 5,
      targetWeight: "245",
      orderIndex: 0,
    });
    const out = await runReadinessAnalysis({
      userId: U4,
      now: NOW,
      generate: progressingGenerate,
    });
    expect(out.error).toBeUndefined();
    const [row] = await db
      .select()
      .from(readinessAnalysis)
      .where(eq(readinessAnalysis.userId, U4));
    expect(row.progressionSuggestions.length).toBe(1);
    expect(row.progressionSuggestions[0].status).toBe("pending");
    expect(row.progressionSuggestions[0].suggestedWeight).toBe(250);
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

  it("D: threads the user's plan goal into the AI prompt", async () => {
    const { dow } = todayInfo(GOAL_NOW);
    await db.insert(plannedSession).values({
      userId: GOAL_USER,
      dayOfWeek: dow,
      title: "Lower",
      notes: "",
      modality: "strength",
    });
    await upsertPlanProfile(GOAL_USER, "cutting for summer");

    let seenPrompt = "";
    const res = await runReadinessAnalysis({
      userId: GOAL_USER,
      now: GOAL_NOW,
      generate: async (p: string) => {
        seenPrompt = p;
        return { verdict: "proceed_as_planned", headline: "ok", rationale: "ok" };
      },
    });
    expect(res.result).toBeDefined();
    expect(seenPrompt).toContain("User's stated goal: cutting for summer");
  });
});
