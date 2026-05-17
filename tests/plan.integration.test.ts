import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { plannedSession, plannedExercise } from "@/db/schema";
import {
  getPlanForUser,
  upsertPlanDayForUser,
  upsertPlanWeekForUser,
} from "@/lib/plan-store";

const U = "itest-plan-" + Date.now();
const U2 = "itest-plan-other-" + Date.now();
const W = "itest-planweek-" + Date.now();
const ALL = [U, U2, W];

afterAll(async () => {
  await db.delete(plannedExercise).where(inArray(plannedExercise.userId, ALL));
  await db.delete(plannedSession).where(inArray(plannedSession.userId, ALL));
  const leftover = await db
    .select({ id: plannedSession.id })
    .from(plannedSession)
    .where(inArray(plannedSession.userId, ALL));
  expect(leftover.length).toBe(0);
});

describe("plan-store structured (live Neon)", () => {
  it("A: insert creates a day with ordered exercises", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 3,
      title: "Heavy Lower",
      notes: "knee ok",
      modality: "strength",
      exercises: [
        { name: "Squat", targetSets: 5, targetReps: 5, targetWeight: 245 },
        { name: "RDL", targetSets: 3, targetReps: 8, targetWeight: 185 },
      ],
    });
    const days = await getPlanForUser(U);
    expect(days.length).toBe(1);
    expect(days[0].notes).toBe("knee ok");
    expect(days[0].exercises.map((e) => e.name)).toEqual(["Squat", "RDL"]);
    expect(days[0].exercises[0].targetWeight).toBe(245);
  });

  it("B: re-saving replaces exercises (removed rows gone, no orphans)", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 3,
      title: "Heavy Lower v2",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Front Squat", targetSets: 4, targetReps: 6, targetWeight: 205 },
      ],
    });
    const days = await getPlanForUser(U);
    expect(days.length).toBe(1);
    expect(days[0].title).toBe("Heavy Lower v2");
    expect(days[0].exercises.map((e) => e.name)).toEqual(["Front Squat"]);
    const allEx = await db
      .select()
      .from(plannedExercise)
      .where(inArray(plannedExercise.userId, [U]));
    expect(allEx.length).toBe(1);
  });

  it("C: a zero-exercise day is valid (rest day)", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 0,
      title: "Rest",
      notes: "",
      modality: "rest",
      exercises: [],
    });
    const days = await getPlanForUser(U);
    const sun = days.find((d) => d.dayOfWeek === 0);
    expect(sun?.exercises).toEqual([]);
  });

  it("D: user-scoped, no cross-user bleed", async () => {
    await upsertPlanDayForUser(U2, {
      dayOfWeek: 3,
      title: "U2",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Bench", targetSets: 5, targetReps: 5, targetWeight: 185 },
      ],
    });
    const days = await getPlanForUser(U);
    expect(days.find((d) => d.dayOfWeek === 3)?.title).toBe("Heavy Lower v2");
  });

  it("E: upsertPlanWeekForUser saves 7 days, re-save stays 7", async () => {
    const week = (s: string) =>
      Array.from({ length: 7 }, (_, dow) => ({
        dayOfWeek: dow,
        title: `Day ${dow} ${s}`,
        notes: "",
        modality: dow === 0 ? "rest" : "strength",
        exercises:
          dow === 0
            ? []
            : [
                {
                  name: "Squat",
                  targetSets: 5,
                  targetReps: 5,
                  targetWeight: 200 + dow,
                },
              ],
      }));
    await upsertPlanWeekForUser(W, week("v1"));
    await upsertPlanWeekForUser(W, week("v2"));
    const days = await getPlanForUser(W);
    expect(days.length).toBe(7);
    expect(days.find((d) => d.dayOfWeek === 3)?.title).toBe("Day 3 v2");
    const ex = await db
      .select()
      .from(plannedExercise)
      .where(inArray(plannedExercise.userId, [W]));
    expect(ex.length).toBe(6); // 6 non-rest days, 1 exercise each
  });
});
