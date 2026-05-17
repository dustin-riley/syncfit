import { describe, it, expect } from "vitest";
import { computeTrailingLoad, type SetRow } from "@/lib/trailing-load";

const now = new Date("2026-05-14T12:00:00Z");
const rows: SetRow[] = [
  {
    exerciseName: "Bench Press",
    performedAt: new Date("2026-05-13T12:35:00Z"),
    weight: 115,
    reps: 8,
  },
  {
    exerciseName: "Bench Press",
    performedAt: new Date("2026-05-13T12:35:00Z"),
    weight: 135,
    reps: 8,
  },
  {
    exerciseName: "Squat",
    performedAt: new Date("2026-05-13T12:35:00Z"),
    weight: 185,
    reps: 5,
  },
  {
    exerciseName: "Old",
    performedAt: new Date("2026-05-01T12:00:00Z"),
    weight: 100,
    reps: 5,
  },
];

describe("computeTrailingLoad", () => {
  it("aggregates only sets inside the window", () => {
    const r = computeTrailingLoad(rows, now, 72);
    expect(r.windowHours).toBe(72);
    expect(r.setCount).toBe(3);
    expect(r.sessions).toBe(1);
    expect(r.totalVolume).toBe(115 * 8 + 135 * 8 + 185 * 5);
  });

  it("breaks volume down per exercise with the recent top set", () => {
    const r = computeTrailingLoad(rows, now, 72);
    const bench = r.perExercise.find((e) => e.exerciseName === "Bench Press");
    expect(bench).toMatchObject({ volume: 2000, setCount: 2 });
    expect(bench?.topSetWeight).toBe(135);
    expect(bench?.topSetReps).toBe(8);
    expect(bench?.topSetAt.toISOString()).toBe("2026-05-13T12:35:00.000Z");
  });

  it("top set tie-breaks heavier weight, then more reps, then most recent", () => {
    const tie: SetRow[] = [
      {
        exerciseName: "Row",
        performedAt: new Date("2026-05-13T10:00:00Z"),
        weight: 100,
        reps: 5,
      },
      {
        exerciseName: "Row",
        performedAt: new Date("2026-05-13T11:00:00Z"),
        weight: 100,
        reps: 8,
      },
    ];
    const r = computeTrailingLoad(tie, now, 72);
    const row = r.perExercise.find((e) => e.exerciseName === "Row");
    expect(row?.topSetReps).toBe(8);
  });

  it("reports rest days and last session", () => {
    const r = computeTrailingLoad(rows, now, 72);
    expect(r.lastSessionAt?.toISOString()).toBe("2026-05-13T12:35:00.000Z");
    expect(r.restDays).toBe(0);
  });

  it("returns empty summary when no rows in window", () => {
    const r = computeTrailingLoad([], now, 72);
    expect(r.setCount).toBe(0);
    expect(r.sessions).toBe(0);
    expect(r.perExercise).toEqual([]);
    expect(r.lastSessionAt).toBeNull();
    expect(r.restDays).toBe(0);
  });
});
