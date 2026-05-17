// DB layer for the weekly training view. Mirrors the loadRecentTraining
// pattern: query here, derive in the pure lib. Imports "@/db" — DO NOT
// import this from offline unit tests.
import { db } from "@/db";
import { workout, workoutSet, plannedSession, enduranceActivity } from "@/db/schema";
import { and, eq, gte, lt, inArray, asc } from "drizzle-orm";
import { paddedUtcRange, weekStartFor } from "@/lib/week";
import {
  buildTrainingWeek,
  type TrainingWeekData,
  type WorkoutInput,
  type EnduranceInput,
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
          and(eq(workoutSet.userId, userId), inArray(workoutSet.workoutId, ids))
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

  const planDays = await db
    .select({
      dayOfWeek: plannedSession.dayOfWeek,
      title: plannedSession.title,
    })
    .from(plannedSession)
    .where(eq(plannedSession.userId, userId));

  const enduranceRows = await db
    .select()
    .from(enduranceActivity)
    .where(
      and(
        eq(enduranceActivity.userId, userId),
        gte(enduranceActivity.performedAt, from),
        lt(enduranceActivity.performedAt, to)
      )
    )
    .orderBy(asc(enduranceActivity.performedAt));
  const enduranceInputs: EnduranceInput[] = enduranceRows.map((e) => ({
    performedAt: e.performedAt,
    activityType: e.activityType,
    distanceMi: e.distance === null ? null : Number(e.distance),
    durationSec: e.durationSec,
  }));

  return buildTrainingWeek({
    weekStartYmd: week,
    now,
    workouts: workoutInputs,
    planDays,
    enduranceActivities: enduranceInputs,
  });
}
