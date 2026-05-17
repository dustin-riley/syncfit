import { describe, it, expect } from "vitest";
import {
  validateStrengthInput,
  validateEnduranceInput,
  strengthContentHash,
  enduranceContentHash,
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
