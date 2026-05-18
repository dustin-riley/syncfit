import { describe, it, expect } from "vitest";
import {
  computeRecentTraining,
  lastSessionSetsByExercise,
  type StrengthRow,
  type EnduranceRow,
} from "@/lib/recent-training";

const NOW = new Date("2026-05-17T16:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const strength: StrengthRow[] = [
  // newest session (1 day ago): Squat x2 + Bench x1
  {
    workoutId: "w2",
    performedAt: day(1),
    title: "Lower B",
    exerciseName: "Squat",
    weight: 250,
    reps: 3,
  },
  {
    workoutId: "w2",
    performedAt: day(1),
    title: "Lower B",
    exerciseName: "Squat",
    weight: 250,
    reps: 3,
  },
  {
    workoutId: "w2",
    performedAt: day(1),
    title: "Lower B",
    exerciseName: "Bench",
    weight: 185,
    reps: 5,
  },
  // older session (3 days ago): Squat x1
  {
    workoutId: "w1",
    performedAt: day(3),
    title: "Lower A",
    exerciseName: "Squat",
    weight: 245,
    reps: 5,
  },
  // outside the 7-day window: ignored
  {
    workoutId: "w0",
    performedAt: day(9),
    title: "Old",
    exerciseName: "Squat",
    weight: 225,
    reps: 5,
  },
];
const endurance: EnduranceRow[] = [
  {
    performedAt: day(2),
    activityType: "run",
    distanceMi: 6.2,
    durationSec: 2880,
  },
  {
    performedAt: day(10),
    activityType: "ride",
    distanceMi: 30,
    durationSec: 7200,
  }, // out of window
  {
    performedAt: day(4),
    activityType: "swim",
    distanceMi: null,
    durationSec: 1800,
  },
];

describe("computeRecentTraining", () => {
  it("windows to 7 days, groups strength by workout, sorts newest-first", () => {
    const rt = computeRecentTraining(strength, endurance, NOW, 7);
    expect(rt.windowDays).toBe(7);
    expect(rt.strengthSessions.map((s) => s.workoutId)).toEqual(["w2", "w1"]);
    expect(rt.strengthSessions[0].sets).toEqual([
      { exerciseName: "Squat", weight: 250, reps: 3 },
      { exerciseName: "Squat", weight: 250, reps: 3 },
      { exerciseName: "Bench", weight: 185, reps: 5 },
    ]);
  });
  it("derives pace/mph and handles null distance", () => {
    const rt = computeRecentTraining(strength, endurance, NOW, 7);
    // newest-first: run is day(2) (2 days ago), swim is day(4) (4 days ago).
    expect(rt.enduranceActivities.map((e) => e.activityType)).toEqual([
      "run",
      "swim",
    ]);
    const run = rt.enduranceActivities.find((e) => e.activityType === "run")!;
    expect(run.pacePerMiSec).toBeCloseTo(2880 / 6.2, 5);
    expect(run.mph).toBeCloseTo(6.2 / (2880 / 3600), 5);
    const swim = rt.enduranceActivities.find((e) => e.activityType === "swim")!;
    expect(swim.distanceMi).toBeNull();
    expect(swim.pacePerMiSec).toBeNull();
    expect(swim.mph).toBeNull();
  });
  it("returns empty arrays for no input", () => {
    const rt = computeRecentTraining([], [], NOW, 7);
    expect(rt.strengthSessions).toEqual([]);
    expect(rt.enduranceActivities).toEqual([]);
  });
});

describe("lastSessionSetsByExercise", () => {
  it("returns each exercise's most-recent session sets with agoDays", () => {
    const rt = computeRecentTraining(strength, endurance, NOW, 7);
    const out = lastSessionSetsByExercise(rt, NOW);
    const squat = out.find((o) => o.exerciseName === "Squat")!;
    expect(squat.agoDays).toBe(1); // from w2, not the older w1
    expect(squat.sets).toEqual([
      { weight: 250, reps: 3 },
      { weight: 250, reps: 3 },
    ]);
    const bench = out.find((o) => o.exerciseName === "Bench")!;
    expect(bench.sets).toEqual([{ weight: 185, reps: 5 }]);
  });
});
