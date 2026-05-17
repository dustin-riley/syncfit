// DB layer for the weekly training view. Mirrors the loadTrailingLoad
// pattern: query here, derive in the pure lib. Imports "@/db" — DO NOT
// import this from offline unit tests.
import { db } from "@/db";
import { workout, workoutSet } from "@/db/schema";
import { and, eq, gte, lt, inArray, asc } from "drizzle-orm";
import { getPlanForUser } from "@/lib/plan-store";
import { paddedUtcRange, weekStartFor } from "@/lib/week";
import {
  buildTrainingWeek,
  type TrainingWeekData,
  type WorkoutInput,
} from "@/lib/week-view";

export async function getTrainingWeek(
  userId: string,
  weekStartYmd: string,
  now: Date
): Promise<TrainingWeekData> {
  // Never page into the future: the plan is the same every week and there
  // are no future logged workouts. Clamp to the current week.
  const currentWeek = weekStartFor(now);
  const week = weekStartYmd > currentWeek ? currentWeek : weekStartYmd;

  const { gte: from, lt: to } = paddedUtcRange(week);
  const workouts = await db
    .select()
    .from(workout)
    .where(
      and(
        eq(workout.userId, userId),
        gte(workout.performedAt, from),
        lt(workout.performedAt, to)
      )
    )
    .orderBy(asc(workout.performedAt));

  const ids = workouts.map((w) => w.id);
  const sets = ids.length
    ? await db
        .select()
        .from(workoutSet)
        .where(
          and(
            eq(workoutSet.userId, userId),
            inArray(workoutSet.workoutId, ids)
          )
        )
        .orderBy(asc(workoutSet.setNumber))
    : [];

  const workoutInputs: WorkoutInput[] = workouts.map((w) => ({
    id: w.id,
    performedAt: w.performedAt,
    title: w.title,
    sets: sets
      .filter((s) => s.workoutId === w.id)
      .map((s) => ({
        exerciseName: s.exerciseName,
        weight: Number(s.weight),
        reps: s.reps,
      })),
  }));

  const planDays = (await getPlanForUser(userId)).map((p) => ({
    dayOfWeek: p.dayOfWeek,
    title: p.title,
  }));

  return buildTrainingWeek({
    weekStartYmd: week,
    now,
    workouts: workoutInputs,
    planDays,
  });
}
