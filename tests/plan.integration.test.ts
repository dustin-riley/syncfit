import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { plannedSession } from "@/db/schema";
import { getPlanForUser, upsertPlanDayForUser } from "@/lib/plan-store";

const U = "itest-plan-" + Date.now();
const U2 = "itest-plan-other-" + Date.now();
const ALL_USERS = [U, U2];

afterAll(async () => {
  await db.delete(plannedSession).where(inArray(plannedSession.userId, ALL_USERS));
  const leftover = await db
    .select({ id: plannedSession.id })
    .from(plannedSession)
    .where(inArray(plannedSession.userId, ALL_USERS));
  expect(leftover.length).toBe(0);
});

describe("plan-store (live Neon)", () => {
  it("A: insert creates exactly one row with matching fields", async () => {
    await upsertPlanDayForUser(U, { dayOfWeek: 3, title: "Heavy Lower", description: "Squat 5x5", modality: "strength" });
    const rows = await getPlanForUser(U);
    expect(rows.length).toBe(1);
    expect(rows[0].dayOfWeek).toBe(3);
    expect(rows[0].title).toBe("Heavy Lower");
    expect(rows[0].description).toBe("Squat 5x5");
    expect(rows[0].modality).toBe("strength");
  });

  it("B: upsert on same user+day updates in place (no duplicate row)", async () => {
    await upsertPlanDayForUser(U, { dayOfWeek: 3, title: "Heavy Lower v2", description: "Squat 3x3", modality: "strength" });
    const rows = await getPlanForUser(U);
    expect(rows.length).toBe(1);
    expect(rows[0].title).toBe("Heavy Lower v2");
    expect(rows[0].description).toBe("Squat 3x3");
  });

  it("C: multiple distinct days produce distinct rows", async () => {
    await upsertPlanDayForUser(U, { dayOfWeek: 1, title: "Easy Run", description: "5k Z2", modality: "endurance" });
    await upsertPlanDayForUser(U, { dayOfWeek: 5, title: "Upper", description: "Bench 5x5", modality: "strength" });
    const rows = await getPlanForUser(U);
    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.dayOfWeek).sort((a, b) => a - b)).toEqual([1, 3, 5]);
  });

  it("D: plans are user-scoped with no cross-user bleed", async () => {
    await upsertPlanDayForUser(U2, { dayOfWeek: 3, title: "U2 Day 3", description: "different", modality: "rest" });
    const rows = await getPlanForUser(U);
    expect(rows.length).toBe(3);
    const day3 = rows.find((r) => r.dayOfWeek === 3);
    expect(day3?.title).toBe("Heavy Lower v2");
  });
});
