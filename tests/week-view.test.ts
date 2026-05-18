import { describe, it, expect } from "vitest";
import { buildTrainingWeek, type WorkoutInput } from "@/lib/week-view";

const NOW = new Date("2026-05-13T16:00:00Z"); // APP_TZ Wed 2026-05-13
const WEEK = "2026-05-11";

function wk(
  id: string,
  ymdNoonUtc: string,
  title: string,
  sets: WorkoutInput["sets"]
): WorkoutInput {
  return { id, performedAt: new Date(`${ymdNoonUtc}T16:00:00Z`), title, sets };
}

describe("buildTrainingWeek", () => {
  it("derives the four states including the today edge", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [
        wk("w1", "2026-05-11", "Push A", [
          { exerciseName: "Bench", weight: 185, reps: 5 },
          { exerciseName: "OHP", weight: 115, reps: 6 },
          { exerciseName: "Dip", weight: 0, reps: 12 },
        ]),
      ],
      // plan: Mon(1) logged, Tue(2) skipped+past, Wed(3)=today no workout,
      // Fri(5) future. Sun(0) / others no plan.
      planDays: [
        { dayOfWeek: 1, title: "Push A" },
        { dayOfWeek: 2, title: "Pull A" },
        { dayOfWeek: 3, title: "Legs" },
        { dayOfWeek: 5, title: "Push B" },
      ],
    });

    expect(data.weekStartYmd).toBe(WEEK);
    expect(data.label).toBe("may 11–17");
    expect(data.nextDisabled).toBe(true);
    expect(data.days).toHaveLength(7);

    const [mon, tue, wed, thu, fri, sat, sun] = data.days;
    expect(mon.state).toBe("done");
    expect(mon.label).toBe("mon 11");
    expect(mon.summary).toBe("Bench 185×5 · OHP 115×6 · +1 more");
    expect(mon.workouts[0].sets).toHaveLength(3);

    expect(tue.state).toBe("missed"); // planned, strictly before today
    expect(tue.plannedTitle).toBe("Pull A");

    expect(wed.state).toBe("planned"); // planned, today, no workout
    expect(wed.isToday).toBe(true);
    expect(wed.plannedTitle).toBe("Legs");

    expect(thu.state).toBe("rest"); // no plan, no workout
    expect(fri.state).toBe("planned"); // planned, future
    expect(sat.state).toBe("rest");
    expect(sun.state).toBe("rest");
  });

  it("counts an unplanned logged workout as done, not rest", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [
        wk("w1", "2026-05-14", "Surprise", [
          { exerciseName: "Row", weight: 135, reps: 8 },
        ]),
      ],
      planDays: [],
    });
    const thu = data.days[3]; // 2026-05-14
    expect(thu.state).toBe("done");
    expect(thu.summary).toBe("Row 135×8");
  });

  it("merges multiple workouts on one day and stays done", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [
        wk("a", "2026-05-12", "AM", [
          { exerciseName: "Squat", weight: 225, reps: 5 },
        ]),
        wk("b", "2026-05-12", "PM", [
          { exerciseName: "Curl", weight: 30, reps: 12 },
        ]),
      ],
      planDays: [{ dayOfWeek: 2, title: "Legs" }],
    });
    const tue = data.days[1];
    expect(tue.state).toBe("done");
    expect(tue.workouts).toHaveLength(2);
    expect(tue.summary).toBe("Squat 225×5 · Curl 30×12");
  });

  it("summarizes one entry per exercise using the top set, not per raw set", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [
        wk("w1", "2026-05-11", "Push A", [
          { exerciseName: "Bench", weight: 175, reps: 5 },
          { exerciseName: "Bench", weight: 185, reps: 5 },
          { exerciseName: "Bench", weight: 185, reps: 6 },
          { exerciseName: "OHP", weight: 115, reps: 6 },
          { exerciseName: "OHP", weight: 115, reps: 4 },
          { exerciseName: "Incline", weight: 60, reps: 10 },
          { exerciseName: "Fly", weight: 30, reps: 12 },
        ]),
      ],
      planDays: [],
    });
    const mon = data.days[0];
    // 4 distinct exercises; one entry each at its top set (heaviest, tie ->
    // more reps); first 2 shown + "+2 more" (not "+5 more" off set count).
    expect(mon.summary).toBe("Bench 185×6 · OHP 115×6 · +2 more");
  });

  it("all-rest week when no plan and no workouts", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [],
      planDays: [],
    });
    expect(data.days.every((d) => d.state === "rest")).toBe(true);
  });

  it("counts an endurance-only day as done and summarizes it", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [],
      planDays: [],
      enduranceActivities: [
        {
          performedAt: new Date("2026-05-12T16:00:00Z"), // Tue 2026-05-12
          activityType: "run",
          distanceMi: 6.2,
          durationSec: 2880,
        },
      ],
    });
    const tue = data.days.find((d) => d.ymd === "2026-05-12")!;
    expect(tue.state).toBe("done");
    expect(tue.endurance).toEqual([
      { activityType: "run", distanceMi: 6.2, durationSec: 2880 },
    ]);
    expect(tue.summary).toContain("run 6.2mi · 48:00");
  });

  it("groups a workout's sets by exercise, preserving first-appearance order", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [
        wk("w1", "2026-05-11", "Full", [
          { exerciseName: "Squat", weight: 225, reps: 5 },
          { exerciseName: "Bench", weight: 185, reps: 5 },
          { exerciseName: "Squat", weight: 245, reps: 3 },
          { exerciseName: "Bench", weight: 185, reps: 4 },
        ]),
      ],
      planDays: [],
    });
    const mon = data.days[0];
    const ex = mon.workouts[0].exercises;
    expect(ex.map((e) => e.name)).toEqual(["Squat", "Bench"]);
    expect(ex[0].sets).toEqual([
      { weight: 225, reps: 5, isTop: false },
      { weight: 245, reps: 3, isTop: true },
    ]);
    expect(ex[1].sets).toEqual([
      { weight: 185, reps: 5, isTop: true },
      { weight: 185, reps: 4, isTop: false },
    ]);
  });

  it("marks the heaviest set as top, tie broken by more reps; single set is top", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [
        wk("w1", "2026-05-11", "Tie", [
          { exerciseName: "Curl", weight: 30, reps: 8 },
          { exerciseName: "Curl", weight: 30, reps: 10 },
          { exerciseName: "Row", weight: 95, reps: 8 },
        ]),
      ],
      planDays: [],
    });
    const ex = data.days[0].workouts[0].exercises;
    expect(ex[0].sets.map((s) => s.isTop)).toEqual([false, true]); // 30×10 wins tie
    expect(ex[1].sets).toEqual([{ weight: 95, reps: 8, isTop: true }]); // lone set
  });

  it("keeps exercise groups per-workout for a multi-workout day", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [
        wk("a", "2026-05-12", "AM", [
          { exerciseName: "Squat", weight: 225, reps: 5 },
        ]),
        wk("b", "2026-05-12", "PM", [
          { exerciseName: "Curl", weight: 30, reps: 12 },
        ]),
      ],
      planDays: [],
    });
    const tue = data.days[1];
    expect(tue.workouts).toHaveLength(2);
    expect(tue.workouts[0].exercises.map((e) => e.name)).toEqual(["Squat"]);
    expect(tue.workouts[1].exercises.map((e) => e.name)).toEqual(["Curl"]);
  });
});
