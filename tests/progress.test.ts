import { describe, it, expect } from "vitest";
import {
  computeProgress,
  sortSeries,
  type ProgressInputRow,
} from "@/lib/progress";

const NOW = new Date("2026-05-24T16:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

describe("computeProgress — grouping", () => {
  it("returns an empty series list for empty input", () => {
    const out = computeProgress([]);
    expect(out.series).toEqual([]);
  });

  it("groups by (exerciseName, equipment) exactly as stored", () => {
    const rows: ProgressInputRow[] = [
      {
        performedAt: day(2),
        exerciseName: "Bench Press",
        equipment: "Barbell",
        weight: 185,
        reps: 5,
      },
      {
        performedAt: day(2),
        exerciseName: "Bench Press",
        equipment: "Dumbbell",
        weight: 60,
        reps: 8,
      },
      {
        performedAt: day(1),
        exerciseName: "Bench Press",
        equipment: "Barbell",
        weight: 195,
        reps: 5,
      },
    ];
    const out = computeProgress(rows);
    const keys = out.series.map((s) => s.exerciseKey).sort();
    expect(keys).toEqual(["Bench Press|Barbell", "Bench Press|Dumbbell"]);
  });

  it("collapses null equipment and empty-string equipment into one series", () => {
    const rows: ProgressInputRow[] = [
      {
        performedAt: day(2),
        exerciseName: "Pull Up",
        equipment: null,
        weight: 0,
        reps: 10,
      },
      {
        performedAt: day(1),
        exerciseName: "Pull Up",
        equipment: "",
        weight: 0,
        reps: 12,
      },
    ];
    const out = computeProgress(rows);
    expect(out.series).toHaveLength(1);
    expect(out.series[0].exerciseKey).toBe("Pull Up|");
    expect(out.series[0].points).toHaveLength(2);
  });
});

describe("computeProgress — per-day collapse", () => {
  it("collapses two same-day sessions into one point; picks highest weight", () => {
    const morning = new Date("2026-05-23T13:00:00Z"); // 09:00 ET
    const evening = new Date("2026-05-23T23:00:00Z"); // 19:00 ET, same APP_TZ day
    const rows: ProgressInputRow[] = [
      {
        performedAt: morning,
        exerciseName: "Squat",
        equipment: "Barbell",
        weight: 225,
        reps: 5,
      },
      {
        performedAt: evening,
        exerciseName: "Squat",
        equipment: "Barbell",
        weight: 245,
        reps: 3,
      },
    ];
    const out = computeProgress(rows);
    expect(out.series[0].points).toHaveLength(1);
    expect(out.series[0].points[0].topSetWeight).toBe(245);
    expect(out.series[0].points[0].topSetReps).toBe(3);
  });

  it("ties on weight → picks the higher-reps set", () => {
    const t1 = new Date("2026-05-23T13:00:00Z");
    const t2 = new Date("2026-05-23T15:00:00Z");
    const rows: ProgressInputRow[] = [
      {
        performedAt: t1,
        exerciseName: "Squat",
        equipment: "Barbell",
        weight: 225,
        reps: 3,
      },
      {
        performedAt: t2,
        exerciseName: "Squat",
        equipment: "Barbell",
        weight: 225,
        reps: 5,
      },
    ];
    const out = computeProgress(rows);
    expect(out.series[0].points[0].topSetReps).toBe(5);
  });
});

describe("computeProgress — e1RM and derived stats", () => {
  it("computes e1RM via Epley (weight * (1 + reps/30))", () => {
    const rows: ProgressInputRow[] = [
      {
        performedAt: day(0),
        exerciseName: "Bench",
        equipment: "Barbell",
        weight: 185,
        reps: 5,
      },
    ];
    const out = computeProgress(rows);
    expect(out.series[0].points[0].e1RM).toBeCloseTo(185 * (1 + 5 / 30), 5);
  });

  it("derives firstTopSetWeight / currentTopSetWeight from oldest and newest points", () => {
    const rows: ProgressInputRow[] = [
      {
        performedAt: day(10),
        exerciseName: "Bench",
        equipment: "Barbell",
        weight: 155,
        reps: 5,
      },
      {
        performedAt: day(5),
        exerciseName: "Bench",
        equipment: "Barbell",
        weight: 175,
        reps: 5,
      },
      {
        performedAt: day(1),
        exerciseName: "Bench",
        equipment: "Barbell",
        weight: 195,
        reps: 5,
      },
    ];
    const out = computeProgress(rows);
    const s = out.series[0];
    expect(s.totalSessions).toBe(3);
    expect(s.firstTopSetWeight).toBe(155);
    expect(s.currentTopSetWeight).toBe(195);
    expect(s.firstE1RM).toBeCloseTo(155 * (1 + 5 / 30), 5);
    expect(s.currentE1RM).toBeCloseTo(195 * (1 + 5 / 30), 5);
    expect(s.lastPerformedAt.getTime()).toBe(day(1).getTime());
  });

  it("default series order is most-recent first", () => {
    const rows: ProgressInputRow[] = [
      {
        performedAt: day(20),
        exerciseName: "Old Lift",
        equipment: "Barbell",
        weight: 100,
        reps: 5,
      },
      {
        performedAt: day(1),
        exerciseName: "New Lift",
        equipment: "Barbell",
        weight: 100,
        reps: 5,
      },
      {
        performedAt: day(5),
        exerciseName: "Mid Lift",
        equipment: "Barbell",
        weight: 100,
        reps: 5,
      },
    ];
    const out = computeProgress(rows);
    expect(out.series.map((s) => s.exerciseName)).toEqual([
      "New Lift",
      "Mid Lift",
      "Old Lift",
    ]);
  });
});

describe("sortSeries", () => {
  const NOW2 = new Date("2026-05-24T16:00:00Z");
  const dayAt = (n: number) => new Date(NOW2.getTime() - n * 86_400_000);
  const rows: ProgressInputRow[] = [
    // 5 sessions, most-recent 10d ago
    ...Array.from({ length: 5 }, (_, i) => ({
      performedAt: dayAt(10 + i * 7),
      exerciseName: "Stale Staple",
      equipment: "Barbell" as string | null,
      weight: 100,
      reps: 5,
    })),
    // 1 session, today
    {
      performedAt: dayAt(0),
      exerciseName: "Brand New",
      equipment: "Barbell",
      weight: 100,
      reps: 5,
    },
    // 2 sessions, mid-recency
    {
      performedAt: dayAt(3),
      exerciseName: "Mid",
      equipment: "Barbell",
      weight: 100,
      reps: 5,
    },
    {
      performedAt: dayAt(20),
      exerciseName: "Mid",
      equipment: "Barbell",
      weight: 100,
      reps: 5,
    },
  ];

  it("'recent' returns input order (already most-recent-first from computeProgress)", () => {
    const out = computeProgress(rows);
    const sorted = sortSeries(out.series, "recent");
    expect(sorted.map((s) => s.exerciseName)).toEqual([
      "Brand New",
      "Mid",
      "Stale Staple",
    ]);
  });

  it("'frequent' orders by totalSessions desc", () => {
    const out = computeProgress(rows);
    const sorted = sortSeries(out.series, "frequent");
    expect(sorted.map((s) => s.exerciseName)).toEqual([
      "Stale Staple", // 5
      "Mid", // 2
      "Brand New", // 1
    ]);
  });

  it("'az' orders alphabetically on exerciseName, tie-break on equipment", () => {
    const extra: ProgressInputRow[] = [
      ...rows,
      {
        performedAt: dayAt(2),
        exerciseName: "Mid",
        equipment: "Dumbbell",
        weight: 50,
        reps: 8,
      },
    ];
    const out = computeProgress(extra);
    const sorted = sortSeries(out.series, "az");
    expect(sorted.map((s) => `${s.exerciseName}|${s.equipment}`)).toEqual([
      "Brand New|Barbell",
      "Mid|Barbell",
      "Mid|Dumbbell",
      "Stale Staple|Barbell",
    ]);
  });

  it("does not mutate the input array", () => {
    const out = computeProgress(rows);
    const before = out.series.map((s) => s.exerciseKey);
    sortSeries(out.series, "frequent");
    const after = out.series.map((s) => s.exerciseKey);
    expect(after).toEqual(before);
  });
});
