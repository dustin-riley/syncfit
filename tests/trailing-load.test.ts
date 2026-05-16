import { describe, it, expect } from "vitest";
import { computeTrailingLoad, type SetRow } from "@/lib/trailing-load";

const now = new Date("2026-05-14T12:00:00Z");
const rows: SetRow[] = [
  { exerciseName: "Bench Press", performedAt: new Date("2026-05-13T12:35:00Z"), weight: 115, reps: 8 },
  { exerciseName: "Bench Press", performedAt: new Date("2026-05-13T12:35:00Z"), weight: 135, reps: 8 },
  { exerciseName: "Squat", performedAt: new Date("2026-05-13T12:35:00Z"), weight: 185, reps: 5 },
  { exerciseName: "Old", performedAt: new Date("2026-05-01T12:00:00Z"), weight: 100, reps: 5 },
];

describe("computeTrailingLoad", () => {
  it("aggregates only sets inside the window", () => {
    const r = computeTrailingLoad(rows, now, 72);
    expect(r.windowHours).toBe(72);
    expect(r.setCount).toBe(3);
    expect(r.sessions).toBe(1);
    expect(r.totalVolume).toBe(115 * 8 + 135 * 8 + 185 * 5); // 2925
  });
  it("breaks volume down per exercise", () => {
    const r = computeTrailingLoad(rows, now, 72);
    expect(r.perExercise).toContainEqual({ exerciseName: "Bench Press", volume: 2000, setCount: 2 });
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
    expect(r.lastSessionAt).toBeNull();
  });
});
