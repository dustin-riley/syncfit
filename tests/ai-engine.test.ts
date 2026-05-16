import { describe, it, expect, vi } from "vitest";
import { buildPrompt, analyzeReadiness, ReadinessSchema, type AnalyzeInput } from "@/lib/ai-engine";

const input: AnalyzeInput = {
  plannedSession: { title: "Heavy Lower", description: "Squat 5x5, RDL 3x8", modality: "strength" },
  trailingLoad: { windowHours: 72, sessions: 1, setCount: 12, totalVolume: 8200,
    perExercise: [{ exerciseName: "Squat", volume: 4625, setCount: 5 }],
    lastSessionAt: new Date("2026-05-13T12:35:00Z"), restDays: 1 },
};

describe("ai-engine", () => {
  it("buildPrompt is deterministic and includes plan + load facts", () => {
    const a = buildPrompt(input); const b = buildPrompt(input);
    expect(a).toBe(b);
    expect(a).toContain("Heavy Lower");
    expect(a).toContain("8200");
    expect(a).toContain("modifications empty"); // v1 instruction
  });

  it("analyzeReadiness validates model output against the schema", async () => {
    const fakeModel = vi.fn().mockResolvedValue({
      verdict: "reduce_intensity", headline: "Ease off today",
      rationale: "High trailing volume with only one rest day.", modifications: [],
    });
    const r = await analyzeReadiness(input, { generate: fakeModel });
    expect(r.verdict).toBe("reduce_intensity");
    expect(ReadinessSchema.safeParse(r).success).toBe(true);
  });

  it("retries once then throws a friendly error on persistent schema failure", async () => {
    const bad = vi.fn().mockResolvedValue({ verdict: "nonsense" });
    await expect(analyzeReadiness(input, { generate: bad })).rejects.toThrow(/couldn't analyze/i);
    expect(bad).toHaveBeenCalledTimes(2);
  });

  it("retries then throws a friendly error when the model call throws", async () => {
    const throwing = vi.fn().mockRejectedValue(new Error("NoObjectGeneratedError: bad output"));
    await expect(analyzeReadiness(input, { generate: throwing })).rejects.toThrow(/couldn't analyze/i);
    expect(throwing).toHaveBeenCalledTimes(2);
  });
});
