import { describe, it, expect } from "vitest";
import {
  normalizeExerciseName,
  exerciseMatches,
  findExerciseMatch,
} from "@/lib/exercise-match";

describe("exercise-match", () => {
  it("normalizes case and punctuation/equipment noise", () => {
    expect(normalizeExerciseName("Incline Bench Press (Barbell)")).toBe(
      "incline bench press barbell"
    );
    expect(normalizeExerciseName("  Pull-Up  ")).toBe("pull up");
  });

  it("matches exact, containment either direction, case-insensitive", () => {
    expect(exerciseMatches("Bench", "Bench Press")).toBe(true);
    expect(exerciseMatches("bench press", "Bench")).toBe(true);
    expect(exerciseMatches("Squat", "Bench Press")).toBe(false);
    expect(exerciseMatches("", "Bench")).toBe(false);
  });

  it("findExerciseMatch prefers an exact normalized hit over containment", () => {
    const items = [{ n: "Bench Press" }, { n: "Bench" }];
    expect(findExerciseMatch("bench", items, (i) => i.n)?.n).toBe("Bench");
    expect(findExerciseMatch("Incline", items, (i) => i.n)).toBeUndefined();
  });
});
