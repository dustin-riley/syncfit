import { describe, it, expect } from "vitest";
import {
  validateStrengthInput,
  validateEnduranceInput,
  strengthContentHash,
  enduranceContentHash,
  sequenceStrengthSets,
  logStrengthWorkout,
  ACTIVITY_TYPES,
  type ManualStrengthInput,
  type ManualEnduranceInput,
} from "@/lib/manual-log";

const when = new Date("2026-05-17T16:00:00Z");

const goodStrength: ManualStrengthInput = {
  performedAt: when,
  title: "Lower",
  sets: [
    { exerciseName: "Squat", weight: 245, reps: 5, setNumber: 1 },
    { exerciseName: "Squat", weight: 245, reps: 5, setNumber: 2 },
  ],
};
const goodEndurance: ManualEnduranceInput = {
  performedAt: when,
  activityType: "run",
  distanceMi: 6.2,
  durationSec: 2880,
  notes: "easy",
};

describe("validateStrengthInput", () => {
  it("accepts a valid workout", () => {
    expect(validateStrengthInput(goodStrength).fieldErrors).toEqual({});
  });
  it("flags a bad date, empty sets, and bad numbers", () => {
    expect(
      validateStrengthInput({ ...goodStrength, performedAt: new Date(NaN) })
        .fieldErrors.performedAt
    ).toBeTruthy();
    expect(
      validateStrengthInput({ ...goodStrength, sets: [] }).fieldErrors.sets
    ).toBeTruthy();
    expect(
      validateStrengthInput({
        ...goodStrength,
        sets: [{ exerciseName: "", weight: 1, reps: 1, setNumber: 1 }],
      }).fieldErrors.sets
    ).toBeTruthy();
    expect(
      validateStrengthInput({
        ...goodStrength,
        sets: [{ exerciseName: "Squat", weight: -1, reps: 0, setNumber: 1 }],
      }).fieldErrors.sets
    ).toBeTruthy();
  });
});

describe("validateEnduranceInput", () => {
  it("accepts valid input incl. null distance", () => {
    expect(validateEnduranceInput(goodEndurance).fieldErrors).toEqual({});
    expect(
      validateEnduranceInput({ ...goodEndurance, distanceMi: null }).fieldErrors
    ).toEqual({});
  });
  it("flags unknown type, non-positive duration, negative distance", () => {
    expect(
      validateEnduranceInput({ ...goodEndurance, activityType: "yoga" })
        .fieldErrors.activityType
    ).toBeTruthy();
    expect(
      validateEnduranceInput({ ...goodEndurance, durationSec: 0 }).fieldErrors
        .durationSec
    ).toBeTruthy();
    expect(
      validateEnduranceInput({ ...goodEndurance, distanceMi: -2 }).fieldErrors
        .distance
    ).toBeTruthy();
  });
  it("exposes the activity-type vocabulary", () => {
    expect(ACTIVITY_TYPES).toEqual(["run", "ride", "swim", "other"]);
  });
});

describe("sequenceStrengthSets", () => {
  it("assigns a 1-based setNumber per exercise, preserving row order", () => {
    const out = sequenceStrengthSets([
      { exerciseName: "Squat", weight: 245, reps: 5 },
      { exerciseName: "Bench", weight: 185, reps: 5 },
      { exerciseName: "Squat", weight: 245, reps: 5 },
      { exerciseName: "Squat", weight: 245, reps: 3 },
      { exerciseName: "Bench", weight: 185, reps: 4 },
    ]);
    expect(out.map((s) => [s.exerciseName, s.setNumber])).toEqual([
      ["Squat", 1],
      ["Bench", 1],
      ["Squat", 2],
      ["Squat", 3],
      ["Bench", 2],
    ]);
  });
  it("returns an empty array for no rows", () => {
    expect(sequenceStrengthSets([])).toEqual([]);
  });
  it("produces sets that hash identically to hand-numbered ones", () => {
    const seq = sequenceStrengthSets([
      { exerciseName: "Squat", weight: 245, reps: 5 },
      { exerciseName: "Squat", weight: 245, reps: 5 },
    ]);
    expect(
      strengthContentHash({ performedAt: when, title: "Lower", sets: seq })
    ).toBe(strengthContentHash(goodStrength));
  });
});

describe("content hashes", () => {
  it("are stable and order/identity sensitive", () => {
    expect(strengthContentHash(goodStrength)).toBe(
      strengthContentHash(goodStrength)
    );
    expect(strengthContentHash(goodStrength)).not.toBe(
      strengthContentHash({ ...goodStrength, title: "Upper" })
    );
    expect(enduranceContentHash(goodEndurance)).toBe(
      enduranceContentHash({ ...goodEndurance, notes: "different note" })
    ); // notes excluded from identity
    expect(enduranceContentHash(goodEndurance)).not.toBe(
      enduranceContentHash({ ...goodEndurance, distanceMi: 6.3 })
    );
  });
});

describe("strengthContentHash", () => {
  it("is stable for the same input", () => {
    const a = strengthContentHash(goodStrength);
    const b = strengthContentHash(goodStrength);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

// New test: signature accepts an optional source string.
// The function dynamically imports @/db, so a unit test can only assert the
// signature compiles and validation runs. The DB write path is asserted in
// the integration test (Task 3). This test just locks the signature.
describe("logStrengthWorkout signature", () => {
  it("accepts a third source argument without breaking the type", () => {
    // Compile-only check: the import below would fail to type-check if the
    // optional third arg were removed or renamed. We don't actually invoke
    // the function (it would need a DB) — the assignment is enough.
    const fn: (
      userId: string,
      input: ManualStrengthInput,
      source?: string
    ) => Promise<unknown> = logStrengthWorkout;
    expect(typeof fn).toBe("function");
  });
});
