import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { plannedSession } from "@/db/schema";
import {
  getPlanForUser,
  upsertPlanDayForUser,
  upsertPlanWeekForUser,
} from "@/lib/plan-store";

const U = "itest-plan-" + Date.now();
const U2 = "itest-plan-other-" + Date.now();
const W = "itest-planweek-" + Date.now();
const W2 = "itest-planweek-other-" + Date.now();
const ALL_USERS = [U, U2, W, W2];

afterAll(async () => {
  await db
    .delete(plannedSession)
    .where(inArray(plannedSession.userId, ALL_USERS));
  const leftover = await db
    .select({ id: plannedSession.id })
    .from(plannedSession)
    .where(inArray(plannedSession.userId, ALL_USERS));
  expect(leftover.length).toBe(0);
});

describe("plan-store (live Neon)", () => {
  it("A: insert creates exactly one row with matching fields", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 3,
      title: "Heavy Lower",
      description: "Squat 5x5",
      modality: "strength",
    });
    const rows = await getPlanForUser(U);
    expect(rows.length).toBe(1);
    expect(rows[0].dayOfWeek).toBe(3);
    expect(rows[0].title).toBe("Heavy Lower");
    expect(rows[0].description).toBe("Squat 5x5");
    expect(rows[0].modality).toBe("strength");
  });

  it("B: upsert on same user+day updates in place (no duplicate row)", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 3,
      title: "Heavy Lower v2",
      description: "Squat 3x3",
      modality: "strength",
    });
    const rows = await getPlanForUser(U);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("Heavy Lower v2");
    expect(rows[0].description).toBe("Squat 3x3");
  });

  it("C: multiple distinct days produce distinct rows", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 1,
      title: "Easy Run",
      description: "5k Z2",
      modality: "endurance",
    });
    await upsertPlanDayForUser(U, {
      dayOfWeek: 5,
      title: "Upper",
      description: "Bench 5x5",
      modality: "strength",
    });
    const rows = await getPlanForUser(U);
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.dayOfWeek).sort((a, b) => a - b)).toEqual([
      1, 3, 5,
    ]);
  });

  it("D: plans are user-scoped with no cross-user bleed", async () => {
    await upsertPlanDayForUser(U2, {
      dayOfWeek: 3,
      title: "U2 Day 3",
      description: "different",
      modality: "rest",
    });
    const rows = await getPlanForUser(U);
    expect(rows.length).toBe(3);
    const day3 = rows.find((r) => r.dayOfWeek === 3);
    expect(day3?.title).toBe("Heavy Lower v2");
  });
});

describe("upsertPlanWeekForUser (live Neon)", () => {
  const week = (titleSuffix: string) =>
    Array.from({ length: 7 }, (_, dow) => {
      const modality =
        dow === 0 ? "rest" : dow === 2 || dow === 4 ? "endurance" : "strength";
      return {
        dayOfWeek: dow,
        title: `Day ${dow} ${titleSuffix}`,
        description: `desc ${dow} ${titleSuffix}`,
        modality,
      };
    });

  it("E: saves all 7 days, getPlanForUser returns exactly 7 rows with right per-day modality/title", async () => {
    await upsertPlanWeekForUser(W, week("v1"));
    const rows = await getPlanForUser(W);
    expect(rows.length).toBe(7);
    const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
    expect([...byDay.keys()].sort((a, b) => a - b)).toEqual([
      0, 1, 2, 3, 4, 5, 6,
    ]);
    expect(byDay.get(0)?.modality).toBe("rest");
    expect(byDay.get(2)?.modality).toBe("endurance");
    expect(byDay.get(4)?.modality).toBe("endurance");
    expect(byDay.get(1)?.modality).toBe("strength");
    expect(byDay.get(3)?.title).toBe("Day 3 v1");
    expect(byDay.get(6)?.title).toBe("Day 6 v1");
  });

  it("F: re-saving the same week updates in place (still 7 rows, not 14)", async () => {
    await upsertPlanWeekForUser(W, week("v2"));
    const rows = await getPlanForUser(W);
    expect(rows.length).toBe(7);
    const byDay = new Map(rows.map((r) => [r.dayOfWeek, r]));
    expect(byDay.get(3)?.title).toBe("Day 3 v2");
    expect(byDay.get(0)?.description).toBe("desc 0 v2");
  });

  it("G: a second user's week does not affect the first (scoping)", async () => {
    await upsertPlanWeekForUser(W2, week("other"));
    const rowsW2 = await getPlanForUser(W2);
    expect(rowsW2.length).toBe(7);
    const rowsW = await getPlanForUser(W);
    expect(rowsW.length).toBe(7);
    const byDayW = new Map(rowsW.map((r) => [r.dayOfWeek, r]));
    expect(byDayW.get(3)?.title).toBe("Day 3 v2");
  });
});
