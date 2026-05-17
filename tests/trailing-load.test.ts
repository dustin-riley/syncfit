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

  it("top set: heavier weight beats more reps", () => {
    const sets: SetRow[] = [
      {
        exerciseName: "Row",
        performedAt: new Date("2026-05-13T10:00:00Z"),
        weight: 95,
        reps: 20,
      },
      {
        exerciseName: "Row",
        performedAt: new Date("2026-05-13T11:00:00Z"),
        weight: 100,
        reps: 8,
      },
    ];
    const row = computeTrailingLoad(sets, now, 72).perExercise.find(
      (e) => e.exerciseName === "Row"
    );
    expect(row?.topSetWeight).toBe(100);
    expect(row?.topSetReps).toBe(8);
  });

  it("top set: equal weight → more reps wins", () => {
    const sets: SetRow[] = [
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
    const row = computeTrailingLoad(sets, now, 72).perExercise.find(
      (e) => e.exerciseName === "Row"
    );
    expect(row?.topSetReps).toBe(8);
  });

  it("top set: equal weight and reps → most recent wins; bodyweight (0) supported", () => {
    const sets: SetRow[] = [
      {
        exerciseName: "Pull Up",
        performedAt: new Date("2026-05-13T10:00:00Z"),
        weight: 0,
        reps: 8,
      },
      {
        exerciseName: "Pull Up",
        performedAt: new Date("2026-05-13T11:00:00Z"),
        weight: 0,
        reps: 8,
      },
      {
        exerciseName: "Pull Up",
        performedAt: new Date("2026-05-13T09:00:00Z"),
        weight: 0,
        reps: 12,
      },
    ];
    const pu = computeTrailingLoad(sets, now, 72).perExercise.find(
      (e) => e.exerciseName === "Pull Up"
    );
    expect(pu?.topSetWeight).toBe(0);
    expect(pu?.topSetReps).toBe(12);
    const tied: SetRow[] = [
      {
        exerciseName: "Press",
        performedAt: new Date("2026-05-13T10:00:00Z"),
        weight: 100,
        reps: 5,
      },
      {
        exerciseName: "Press",
        performedAt: new Date("2026-05-13T11:00:00Z"),
        weight: 100,
        reps: 5,
      },
    ];
    const press = computeTrailingLoad(tied, now, 72).perExercise.find(
      (e) => e.exerciseName === "Press"
    );
    expect(press?.topSetAt.toISOString()).toBe("2026-05-13T11:00:00.000Z");
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
