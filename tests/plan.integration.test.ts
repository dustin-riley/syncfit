import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { plannedSession, plannedExercise, planProfile } from "@/db/schema";
import {
  getPlanForUser,
  upsertPlanDayForUser,
  upsertPlanWeekForUser,
  getPlanProfile,
  upsertPlanProfile,
} from "@/lib/plan-store";

const U = "itest-plan-" + Date.now();
const U2 = "itest-plan-other-" + Date.now();
const W = "itest-planweek-" + Date.now();
const ORD = "itest-planord-" + Date.now();
const ALL = [U, U2, W, ORD];

afterAll(async () => {
  await db.delete(plannedExercise).where(inArray(plannedExercise.userId, ALL));
  await db.delete(plannedSession).where(inArray(plannedSession.userId, ALL));
  await db.delete(planProfile).where(inArray(planProfile.userId, ALL));
  const leftover = await db
    .select({ id: plannedSession.id })
    .from(plannedSession)
    .where(inArray(plannedSession.userId, ALL));
  expect(leftover.length).toBe(0);
  const leftoverProfiles = await db
    .select()
    .from(planProfile)
    .where(inArray(planProfile.userId, ALL));
  expect(leftoverProfiles.length).toBe(0);
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
        {
          name: "Front Squat",
          targetSets: 4,
          targetReps: 6,
          targetWeight: 205,
        },
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

  it("B2: re-saving the same exercises in a new order persists the new order", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 4,
      title: "Order",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Alpha", targetSets: 3, targetReps: 5, targetWeight: 100 },
        { name: "Bravo", targetSets: 3, targetReps: 5, targetWeight: 110 },
      ],
    });
    await upsertPlanDayForUser(U, {
      dayOfWeek: 4,
      title: "Order",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Bravo", targetSets: 3, targetReps: 5, targetWeight: 110 },
        { name: "Alpha", targetSets: 3, targetReps: 5, targetWeight: 100 },
      ],
    });
    const days = await getPlanForUser(U);
    const d4 = days.find((d) => d.dayOfWeek === 4);
    expect(d4?.exercises.map((e) => e.name)).toEqual(["Bravo", "Alpha"]);
  });

  it("B3: saving one day does not clobber a sibling day's exercises (same user)", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 5,
      title: "Day5",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Deadlift", targetSets: 1, targetReps: 5, targetWeight: 315 },
      ],
    });
    await upsertPlanDayForUser(U, {
      dayOfWeek: 6,
      title: "Day6",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "OHP", targetSets: 5, targetReps: 5, targetWeight: 95 },
      ],
    });
    // Re-save day 5 only; day 6 must be untouched.
    await upsertPlanDayForUser(U, {
      dayOfWeek: 5,
      title: "Day5 v2",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Deadlift", targetSets: 1, targetReps: 3, targetWeight: 335 },
      ],
    });
    const days = await getPlanForUser(U);
    expect(
      days.find((d) => d.dayOfWeek === 6)?.exercises.map((e) => e.name)
    ).toEqual(["OHP"]);
    expect(days.find((d) => d.dayOfWeek === 5)?.exercises[0].targetWeight).toBe(
      335
    );
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

  it("F: plan_profile goal upserts and round-trips", async () => {
    expect(await getPlanProfile(U)).toBe("");
    await upsertPlanProfile(U, "lose fat, keep strength");
    expect(await getPlanProfile(U)).toBe("lose fat, keep strength");
    await upsertPlanProfile(U, "lean bulk");
    expect(await getPlanProfile(U)).toBe("lean bulk");
    expect(await getPlanProfile(U2)).toBe("");
  });

  it("H: getPlanForUser returns days ordered by dayOfWeek", async () => {
    // insert intentionally out of weekday order
    await upsertPlanDayForUser(ORD, {
      dayOfWeek: 5,
      title: "Fri",
      notes: "",
      modality: "strength",
      exercises: [],
    });
    await upsertPlanDayForUser(ORD, {
      dayOfWeek: 1,
      title: "Mon",
      notes: "",
      modality: "strength",
      exercises: [],
    });
    await upsertPlanDayForUser(ORD, {
      dayOfWeek: 3,
      title: "Wed",
      notes: "",
      modality: "strength",
      exercises: [],
    });
    const days = await getPlanForUser(ORD);
    expect(days.map((d) => d.dayOfWeek)).toEqual([1, 3, 5]);
  });

  it("G: saving a plan persists the goal alongside the week", async () => {
    await upsertPlanWeekForUser(W, [
      {
        dayOfWeek: 1,
        title: "Lower",
        notes: "",
        modality: "strength",
        exercises: [
          { name: "Squat", targetSets: 5, targetReps: 5, targetWeight: 245 },
        ],
      },
    ]);
    await upsertPlanProfile(W, "recomp");
    expect(await getPlanProfile(W)).toBe("recomp");
    const days = await getPlanForUser(W);
    expect(days.find((d) => d.dayOfWeek === 1)?.exercises[0].name).toBe(
      "Squat"
    );
  });
});
