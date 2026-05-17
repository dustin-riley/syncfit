import { createHash } from "node:crypto";

export const ACTIVITY_TYPES = ["run", "ride", "swim", "other"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type ManualStrengthInput = {
  performedAt: Date;
  title: string;
  sets: {
    exerciseName: string;
    weight: number;
    reps: number;
    setNumber: number;
  }[];
};
export type ManualEnduranceInput = {
  performedAt: Date;
  activityType: string;
  distanceMi: number | null;
  durationSec: number;
  notes: string;
};

export type Validation = { fieldErrors: Record<string, string> };

function dateValid(d: Date): boolean {
  return d instanceof Date && Number.isFinite(d.getTime());
}

export function validateStrengthInput(i: ManualStrengthInput): Validation {
  const fieldErrors: Record<string, string> = {};
  if (!dateValid(i.performedAt))
    fieldErrors.performedAt = "Enter a valid date and time.";
  if (!i.sets || i.sets.length === 0) {
    fieldErrors.sets = "Add at least one set.";
  } else {
    const bad = i.sets.some(
      (s) =>
        !s.exerciseName.trim() ||
        !Number.isFinite(s.weight) ||
        s.weight < 0 ||
        !Number.isInteger(s.reps) ||
        s.reps < 1
    );
    if (bad)
      fieldErrors.sets =
        "Each set needs an exercise name, weight ≥ 0 and reps ≥ 1.";
  }
  return { fieldErrors };
}

export function validateEnduranceInput(i: ManualEnduranceInput): Validation {
  const fieldErrors: Record<string, string> = {};
  if (!dateValid(i.performedAt))
    fieldErrors.performedAt = "Enter a valid date and time.";
  if (!(ACTIVITY_TYPES as readonly string[]).includes(i.activityType))
    fieldErrors.activityType = "Choose run, ride, swim or other.";
  if (!Number.isInteger(i.durationSec) || i.durationSec <= 0)
    fieldErrors.durationSec = "Enter a positive duration.";
  if (
    i.distanceMi !== null &&
    (!Number.isFinite(i.distanceMi) || i.distanceMi < 0)
  )
    fieldErrors.distance = "Distance must be 0 or more (or left blank).";
  return { fieldErrors };
}

const sha = (obj: unknown) =>
  createHash("sha256").update(JSON.stringify(obj)).digest("hex");

// Identity = what makes a logged item "the same" for dedupe. Notes excluded.
export function strengthContentHash(i: ManualStrengthInput): string {
  return sha({
    performedAt: i.performedAt.toISOString(),
    title: i.title,
    sets: i.sets,
  });
}
export function enduranceContentHash(i: ManualEnduranceInput): string {
  return sha({
    performedAt: i.performedAt.toISOString(),
    activityType: i.activityType,
    distanceMi: i.distanceMi,
    durationSec: i.durationSec,
  });
}
