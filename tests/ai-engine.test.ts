import { describe, it, expect, vi } from "vitest";
import {
  buildPrompt,
  analyzeReadiness,
  ReadinessSchema,
  MODEL_LABEL,
  type AnalyzeInput,
} from "@/lib/ai-engine";

const input: AnalyzeInput = {
  goal: "",
  plannedSession: {
    title: "Heavy Lower",
    notes: "deload-ish, knee a bit cranky",
    modality: "strength",
    exercises: [
      { name: "Squat", targetSets: 5, targetReps: 5, targetWeight: 245 },
    ],
  },
  recentTraining: {
    windowDays: 7,
    strengthSessions: [
      {
        workoutId: "w1",
        performedAt: new Date("2026-05-13T12:35:00Z"),
        title: "Lower A",
        sets: [
          { exerciseName: "Squat", weight: 245, reps: 5 },
          { exerciseName: "Squat", weight: 245, reps: 5 },
        ],
      },
    ],
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
};

describe("ai-engine", () => {
  it("exposes a short human model label", () => {
    expect(typeof MODEL_LABEL).toBe("string");
    expect(MODEL_LABEL.length).toBeGreaterThan(0);
    expect(MODEL_LABEL).toBe("sonnet");
  });

  it("buildPrompt is deterministic and includes plan + load + actual facts", () => {
    const a = buildPrompt(input);
    expect(a).toBe(buildPrompt(input));
    expect(a).toContain("Heavy Lower");
    expect(a).toContain("Squat");
    expect(a).toContain("245");
    expect(a).toContain("Squat 245×5");
    expect(a).toContain("run");
    expect(a).toContain("6.2");
    expect(a).toContain("knee a bit cranky");
    expect(a).toContain("todayAdjustments");
    expect(a).toContain("progressionSuggestions");
  });

  it("validates split output and defaults both lists to []", async () => {
    const fake = vi.fn().mockResolvedValue({
      verdict: "reduce_intensity",
      headline: "Ease off today",
      rationale: "High trailing volume with one rest day.",
    });
    const r = await analyzeReadiness(input, { generate: fake });
    expect(r.verdict).toBe("reduce_intensity");
    expect(r.todayAdjustments).toEqual([]);
    expect(r.progressionSuggestions).toEqual([]);
    expect(ReadinessSchema.safeParse(r).success).toBe(true);
  });

  it("parses populated progression suggestions (no status from model)", async () => {
    const fake = vi.fn().mockResolvedValue({
      verdict: "proceed_as_planned",
      headline: "Good to go",
      rationale: "Clean reps at target.",
      todayAdjustments: [{ exercise: "Squat", change: "warm up extra" }],
      progressionSuggestions: [
        {
          exercise: "Squat",
          currentWeight: 245,
          suggestedWeight: 255,
          suggestedSets: 5,
          suggestedReps: 3,
          rationale: "5x5 at 245 clean for two sessions.",
        },
      ],
    });
    const r = await analyzeReadiness(input, { generate: fake });
    expect(r.progressionSuggestions[0].suggestedWeight).toBe(255);
    expect(r.progressionSuggestions[0]).not.toHaveProperty("status");
    expect(r.progressionSuggestions[0].suggestedSets).toBe(5);
    expect(r.progressionSuggestions[0].suggestedReps).toBe(3);
  });

  it("retries once then throws a friendly error on persistent failure", async () => {
    const bad = vi.fn().mockResolvedValue({ verdict: "nonsense" });
    await expect(analyzeReadiness(input, { generate: bad })).rejects.toThrow(
      /couldn't analyze/i
    );
    expect(bad).toHaveBeenCalledTimes(2);
  });

  it("retries then throws a friendly error when the model call throws", async () => {
    const throwing = vi
      .fn()
      .mockRejectedValue(new Error("NoObjectGeneratedError: bad output"));
    await expect(
      analyzeReadiness(input, { generate: throwing })
    ).rejects.toThrow(/couldn't analyze/i);
    expect(throwing).toHaveBeenCalledTimes(2);
  });

  it("buildPrompt includes the goal line when goal is set", () => {
    const p = buildPrompt({ ...input, goal: "lean bulk, add size" });
    expect(p).toContain("User's stated goal: lean bulk, add size");
  });

  it("buildPrompt omits the goal line when goal is empty", () => {
    const p = buildPrompt({ ...input, goal: "" });
    expect(p).not.toContain("User's stated goal:");
  });
});
