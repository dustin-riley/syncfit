import { db } from "@/db";
import {
  plannedSession,
  plannedExercise,
  workout,
  workoutSet,
  readinessAnalysis,
  enduranceActivity,
} from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import {
  computeRecentTraining,
  type RecentTraining,
  type StrengthRow,
  type EnduranceRow,
} from "@/lib/recent-training";
import { analyzeReadiness, MODEL_ID, type Readiness } from "@/lib/ai-engine";
import { APP_TZ } from "@/lib/units";

type GenerateFn = (prompt: string) => Promise<unknown>;

export function todayInfo(now: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return { date, dow: map[get("weekday")] };
}

export type AnalyzeOutcome = { result?: Readiness; error?: string };

export async function loadRecentTraining(
  userId: string,
  now: Date
): Promise<RecentTraining> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000);
  const sRows = await db
    .select({
      workoutId: workout.id,
      performedAt: workout.performedAt,
      title: workout.title,
      exerciseName: workoutSet.exerciseName,
      weight: workoutSet.weight,
      reps: workoutSet.reps,
      setNumber: workoutSet.setNumber,
    })
    .from(workoutSet)
    .innerJoin(workout, eq(workoutSet.workoutId, workout.id))
    .where(and(eq(workoutSet.userId, userId), gte(workout.performedAt, cutoff)))
    .orderBy(workout.performedAt, workoutSet.setNumber);
  const eRows = await db
    .select({
      performedAt: enduranceActivity.performedAt,
      activityType: enduranceActivity.activityType,
      distance: enduranceActivity.distance,
      durationSec: enduranceActivity.durationSec,
    })
    .from(enduranceActivity)
    .where(
      and(
        eq(enduranceActivity.userId, userId),
        gte(enduranceActivity.performedAt, cutoff)
      )
    );

  const strengthRows: StrengthRow[] = sRows.map((r) => ({
    workoutId: r.workoutId,
    performedAt: r.performedAt,
    title: r.title,
    exerciseName: r.exerciseName,
    weight: Number(r.weight),
    reps: r.reps,
  }));
  const enduranceRows: EnduranceRow[] = eRows.map((r) => ({
    performedAt: r.performedAt,
    activityType: r.activityType,
    distanceMi: r.distance === null ? null : Number(r.distance),
    durationSec: r.durationSec,
  }));
  return computeRecentTraining(strengthRows, enduranceRows, now, 7);
}

export async function runReadinessAnalysis(opts: {
  userId: string;
  now?: Date;
  generate?: GenerateFn;
}): Promise<AnalyzeOutcome> {
  const now = opts.now ?? new Date();
  const { date, dow } = todayInfo(now);

  const [planned] = await db
    .select()
    .from(plannedSession)
    .where(
      and(
        eq(plannedSession.userId, opts.userId),
        eq(plannedSession.dayOfWeek, dow)
      )
    );
  if (!planned)
    return {
      error: "No planned session for today. Add one on the Plan page first.",
    };

  const plannedExercises = await db
    .select()
    .from(plannedExercise)
    .where(
      and(
        eq(plannedExercise.userId, opts.userId),
        eq(plannedExercise.plannedSessionId, planned.id)
      )
    );
  const exercises = plannedExercises
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((e) => ({
      name: e.name,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      targetWeight: Number(e.targetWeight),
    }));

  const recentTraining = await loadRecentTraining(opts.userId, now);
  try {
    const result = await analyzeReadiness(
      {
        plannedSession: {
          title: planned.title,
          notes: planned.notes,
          modality: planned.modality,
          exercises,
        },
        recentTraining,
      },
      { generate: opts.generate }
    );
    await db.insert(readinessAnalysis).values({
      userId: opts.userId,
      analysisDate: date,
      planSnapshot: { session: planned, exercises },
      loadSnapshot: recentTraining as unknown as Record<string, unknown>,
      verdict: result.verdict,
      headline: result.headline,
      rationale: result.rationale,
      todayAdjustments: result.todayAdjustments,
      progressionSuggestions: result.progressionSuggestions.map((s) => ({
        ...s,
        status: "pending" as const,
      })),
      model: MODEL_ID,
    });
    return { result };
  } catch (e: unknown) {
    const msg =
      e instanceof Error && typeof e.message === "string" ? e.message : "";
    return { error: /couldn't analyze/i.test(msg) ? msg : "Analysis failed." };
  }
}
