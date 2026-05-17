import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  plannedSession,
  plannedExercise,
  readinessAnalysis,
} from "@/db/schema";
import { applyProgressionDecision, getPlanForUser } from "@/lib/plan-store";

const U = "itest-prog-" + Date.now();
let sessionId = "";
let analysisId = "";

beforeAll(async () => {
  const [s] = await db
    .insert(plannedSession)
    .values({
      userId: U,
      dayOfWeek: 3,
      title: "Lower",
      notes: "",
      modality: "strength",
    })
    .returning({ id: plannedSession.id });
  sessionId = s.id;
  await db.insert(plannedExercise).values({
    plannedSessionId: sessionId,
    userId: U,
    name: "Squat",
    targetSets: 5,
    targetReps: 5,
    targetWeight: "245",
    orderIndex: 0,
  });
  const [a] = await db
    .insert(readinessAnalysis)
    .values({
      userId: U,
      analysisDate: "2026-05-16",
      planSnapshot: { session: { id: sessionId, dayOfWeek: 3 } },
      loadSnapshot: {},
      verdict: "proceed_as_planned",
      headline: "Go",
      rationale: "Clean.",
      todayAdjustments: [],
      progressionSuggestions: [
        {
          exercise: "Squat",
          currentWeight: 245,
          suggestedWeight: 255,
          rationale: "5x5 clean twice.",
          status: "pending",
        },
        {
          exercise: "Bench",
          currentWeight: 185,
          suggestedWeight: 190,
          rationale: "stalled? push.",
          status: "pending",
        },
      ],
      model: "test",
    })
    .returning({ id: readinessAnalysis.id });
  analysisId = a.id;
});

afterAll(async () => {
  await db
    .delete(readinessAnalysis)
    .where(inArray(readinessAnalysis.userId, [U]));
  await db.delete(plannedExercise).where(inArray(plannedExercise.userId, [U]));
  await db.delete(plannedSession).where(inArray(plannedSession.userId, [U]));
});

describe("applyProgressionDecision (live Neon)", () => {
  it("A: accept writes suggestedWeight to the matching planned_exercise", async () => {
    const r = await applyProgressionDecision({
      userId: U,
      analysisId,
      exercise: "Squat",
      decision: "accept",
    });
    expect(r.ok).toBe(true);
    const days = await getPlanForUser(U);
    expect(days[0].exercises[0].targetWeight).toBe(255);
    const [row] = await db
      .select()
      .from(readinessAnalysis)
      .where(eq(readinessAnalysis.id, analysisId));
    expect(
      row.progressionSuggestions.find((s) => s.exercise === "Squat")?.status
    ).toBe("accepted");
  });

  it("B: re-accepting the same suggestion is rejected (not pending)", async () => {
    const r = await applyProgressionDecision({
      userId: U,
      analysisId,
      exercise: "Squat",
      decision: "accept",
    });
    expect(r.ok).toBe(false);
  });

  it("C: dismiss only flips status, no plan write", async () => {
    const r = await applyProgressionDecision({
      userId: U,
      analysisId,
      exercise: "Bench",
      decision: "dismiss",
    });
    expect(r.ok).toBe(true);
    const [row] = await db
      .select()
      .from(readinessAnalysis)
      .where(eq(readinessAnalysis.id, analysisId));
    expect(
      row.progressionSuggestions.find((s) => s.exercise === "Bench")?.status
    ).toBe("dismissed");
  });

  it("D: cross-user analysis id is not found", async () => {
    const r = await applyProgressionDecision({
      userId: "itest-prog-other",
      analysisId,
      exercise: "Squat",
      decision: "dismiss",
    });
    expect(r.ok).toBe(false);
  });
});
