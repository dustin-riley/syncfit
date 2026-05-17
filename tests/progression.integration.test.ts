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
    if (!r.ok) expect(r.error).toMatch(/no longer pending/i);
    // plan weight must not have been re-applied/changed by the rejected accept
    const days = await getPlanForUser(U);
    expect(days[0].exercises[0].targetWeight).toBe(255);
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

  it("D: cross-user analysis id is not found and writes nothing", async () => {
    const before = await getPlanForUser(U);
    const r = await applyProgressionDecision({
      userId: "itest-prog-other",
      analysisId,
      exercise: "Squat",
      decision: "accept",
    });
    expect(r.ok).toBe(false);
    const after = await getPlanForUser(U);
    expect(after[0].exercises[0].targetWeight).toBe(
      before[0].exercises[0].targetWeight
    );
  });

  it("E: suggestedSets/Reps override lands on the planned exercise", async () => {
    const [a2] = await db
      .insert(readinessAnalysis)
      .values({
        userId: U,
        analysisDate: "2026-05-16",
        planSnapshot: { session: { id: sessionId, dayOfWeek: 3 } },
        loadSnapshot: {},
        verdict: "push_harder",
        headline: "Up",
        rationale: "ready",
        todayAdjustments: [],
        progressionSuggestions: [
          {
            exercise: "Squat",
            currentWeight: 255,
            suggestedWeight: 265,
            suggestedSets: 3,
            suggestedReps: 3,
            rationale: "peak",
            status: "pending",
          },
        ],
        model: "test",
      })
      .returning({ id: readinessAnalysis.id });
    const r = await applyProgressionDecision({
      userId: U,
      analysisId: a2.id,
      exercise: "Squat",
      decision: "accept",
    });
    expect(r.ok).toBe(true);
    const days = await getPlanForUser(U);
    const sq = days[0].exercises[0];
    expect(sq.targetWeight).toBe(265);
    expect(sq.targetSets).toBe(3);
    expect(sq.targetReps).toBe(3);
  });

  it("F: accept with no matching plan exercise fails and does not flip status", async () => {
    const [a3] = await db
      .insert(readinessAnalysis)
      .values({
        userId: U,
        analysisDate: "2026-05-16",
        planSnapshot: { session: { id: sessionId, dayOfWeek: 3 } },
        loadSnapshot: {},
        verdict: "proceed_as_planned",
        headline: "x",
        rationale: "y",
        todayAdjustments: [],
        progressionSuggestions: [
          {
            exercise: "Overhead Press",
            currentWeight: 95,
            suggestedWeight: 100,
            rationale: "not in plan",
            status: "pending",
          },
        ],
        model: "test",
      })
      .returning({ id: readinessAnalysis.id });
    const r = await applyProgressionDecision({
      userId: U,
      analysisId: a3.id,
      exercise: "Overhead Press",
      decision: "accept",
    });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/couldn't find that exercise/i);
    const [row] = await db
      .select()
      .from(readinessAnalysis)
      .where(eq(readinessAnalysis.id, a3.id));
    expect(row.progressionSuggestions[0].status).toBe("pending");
  });
});
