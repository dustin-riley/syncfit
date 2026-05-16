import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseStrongCsv } from "@/lib/strong-parser";

const csv = readFileSync("tests/fixtures/strong_sample.csv", "utf8");

describe("parseStrongCsv", () => {
  it("groups rows by Date into workouts", () => {
    const { workouts } = parseStrongCsv(csv);
    expect(workouts).toHaveLength(2);
    const w = workouts.find(x => x.title === "Morning Workout")!;
    expect(w.performedAt.toISOString()).toBe("2026-05-13T12:35:00.000Z"); // 08:35 ET = 12:35 UTC (EDT, -4)
  });

  it("splits equipment from exercise name; null when absent", () => {
    const { workouts } = parseStrongCsv(csv);
    const w = workouts.find(x => x.title === "Morning Workout")!;
    const bench = w.exercises.find(e => e.name === "Bench Press")!;
    expect(bench.equipment).toBe("Barbell");
    expect(bench.sets).toEqual([
      { setNumber: 1, weight: 115, reps: 8 },
      { setNumber: 2, weight: 135, reps: 8 },
    ]);
    const pullup = w.exercises.find(e => e.name === "Pull Up")!;
    expect(pullup.equipment).toBeNull();
    expect(pullup.sets[0]).toEqual({ setNumber: 1, weight: 0, reps: 4 });
  });

  it("skips cardio rows (no reps, distance/seconds present) with a warning", () => {
    const { workouts, warnings } = parseStrongCsv(csv);
    const w = workouts.find(x => x.title === "Morning Workout")!;
    expect(w.exercises.find(e => e.name === "Treadmill")).toBeUndefined();
    expect(warnings.some(s => s.includes("Treadmill"))).toBe(true);
  });

  it("computes a stable contentHash per workout", () => {
    const a = parseStrongCsv(csv).workouts[0].contentHash;
    const b = parseStrongCsv(csv).workouts[0].contentHash;
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("errors when zero valid sets parse", () => {
    const r = parseStrongCsv("Date,Workout Name\n");
    expect(r.workouts).toHaveLength(0);
    expect(r.error).toBeTruthy();
  });
});
