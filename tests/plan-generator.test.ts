import { describe, it, expect, vi } from "vitest";
import {
  buildPlanSystem,
  proposePlanTurn,
  PlanTurnSchema,
  type PlanContext,
} from "@/lib/plan-generator";

const ctx: PlanContext = {
  goal: "lean bulk",
  currentPlan: [
    {
      dayOfWeek: 1,
      title: "Lower",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Squat", targetSets: 5, targetReps: 5, targetWeight: 245 },
      ],
    },
  ],
  recentTraining: {
    windowDays: 7,
    strengthSessions: [
      {
        workoutId: "w1",
        performedAt: new Date("2026-05-13T12:00:00Z"),
        title: "Lower A",
        sets: [{ exerciseName: "Squat", weight: 245, reps: 5 }],
      },
    ],
    enduranceActivities: [],
  },
};

describe("plan-generator", () => {
  it("buildPlanSystem is deterministic and includes goal + current plan + recent facts", () => {
    const s = buildPlanSystem(ctx);
    expect(s).toBe(buildPlanSystem(ctx));
    expect(s).toContain("lean bulk");
    expect(s).toContain("Squat");
    expect(s).toContain("245");
  });

  it("returns a clarifying-question turn (no plan)", async () => {
    const fake = vi.fn().mockResolvedValue({
      reply: "How many days a week can you train?",
      proposedPlan: null,
      proposedGoal: null,
    });
    const r = await proposePlanTurn(
      ctx,
      [{ role: "user", content: "make me a plan" }],
      { generate: fake }
    );
    expect(r.reply).toMatch(/how many days/i);
    expect(r.proposedPlan).toBeNull();
  });

  it("returns a committed 7-day plan + goal", async () => {
    const week = Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d,
      title: d % 2 ? "Lift" : "Rest",
      notes: "",
      modality: d % 2 ? "strength" : "rest",
      exercises:
        d % 2
          ? [{ name: "Bench", targetSets: 5, targetReps: 5, targetWeight: 185 }]
          : [],
    }));
    const fake = vi.fn().mockResolvedValue({
      reply: "Here's a 4-day plan.",
      proposedPlan: week,
      proposedGoal: "lean bulk, 4 days/wk",
    });
    const r = await proposePlanTurn(ctx, [{ role: "user", content: "go" }], {
      generate: fake,
    });
    expect(r.proposedPlan).toHaveLength(7);
    expect(r.proposedGoal).toBe("lean bulk, 4 days/wk");
    expect(PlanTurnSchema.safeParse(r).success).toBe(true);
  });

  it("retries once then throws a friendly error on invalid output", async () => {
    const bad = vi.fn().mockResolvedValue({ nope: true });
    await expect(
      proposePlanTurn(ctx, [{ role: "user", content: "go" }], { generate: bad })
    ).rejects.toThrow(/couldn't build/i);
    expect(bad).toHaveBeenCalledTimes(2);
  });

  it("buildPlanSystem includes recent endurance activity", () => {
    const s = buildPlanSystem({
      ...ctx,
      recentTraining: {
        ...ctx.recentTraining,
        enduranceActivities: [
          {
            performedAt: new Date("2026-05-14T11:00:00Z"),
            activityType: "run",
            distanceMi: 6.2,
            durationSec: 2880,
            pacePerMiSec: 2880 / 6.2,
            mph: 6.2 / (2880 / 3600),
          },
        ],
      },
    });
    expect(s).toContain("Recent endurance");
    expect(s).toContain("run");
    expect(s).toContain("6.2");
  });
});
