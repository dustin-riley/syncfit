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

export type LogResult = {
  ok: boolean;
  added: number;
  skipped: number;
  fieldErrors?: Record<string, string>;
  error?: string;
};

export async function logStrengthWorkout(
  userId: string,
  input: ManualStrengthInput
): Promise<LogResult> {
  const { fieldErrors } = validateStrengthInput(input);
  if (Object.keys(fieldErrors).length)
    return { ok: false, added: 0, skipped: 0, fieldErrors };

  // Dynamic import keeps unit tests offline (same pattern as ai-engine.ts).
  const { db } = await import("@/db");
  const { workout, workoutSet } = await import("@/db/schema");

  const [row] = await db
    .insert(workout)
    .values({
      userId,
      performedAt: input.performedAt,
      title: input.title.trim() || "Workout",
      source: "manual",
      contentHash: strengthContentHash(input),
    })
    .onConflictDoNothing({ target: [workout.userId, workout.contentHash] })
    .returning();
  if (!row) return { ok: true, added: 0, skipped: 1 }; // duplicate

  await db.insert(workoutSet).values(
    input.sets.map((s) => ({
      workoutId: row.id,
      userId,
      exerciseName: s.exerciseName.trim(),
      equipment: null,
      setNumber: s.setNumber,
      weight: String(s.weight),
      reps: s.reps,
    }))
  );
  return { ok: true, added: 1, skipped: 0 };
}

export async function logEnduranceActivity(
  userId: string,
  input: ManualEnduranceInput
): Promise<LogResult> {
  const { fieldErrors } = validateEnduranceInput(input);
  if (Object.keys(fieldErrors).length)
    return { ok: false, added: 0, skipped: 0, fieldErrors };

  // Dynamic import keeps unit tests offline (same pattern as ai-engine.ts).
  const { db } = await import("@/db");
  const { enduranceActivity } = await import("@/db/schema");

  const [row] = await db
    .insert(enduranceActivity)
    .values({
      userId,
      performedAt: input.performedAt,
      activityType: input.activityType,
      distance: input.distanceMi === null ? null : String(input.distanceMi),
      durationSec: input.durationSec,
      notes: input.notes,
      source: "manual",
      contentHash: enduranceContentHash(input),
    })
    .onConflictDoNothing({
      target: [enduranceActivity.userId, enduranceActivity.contentHash],
    })
    .returning();
  return row
    ? { ok: true, added: 1, skipped: 0 }
    : { ok: true, added: 0, skipped: 1 };
}
