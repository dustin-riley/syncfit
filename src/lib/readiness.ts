import { db } from "@/db";
import {
  plannedSession,
  workout,
  workoutSet,
  readinessAnalysis,
} from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { computeTrailingLoad, type SetRow } from "@/lib/trailing-load";
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

  const cutoff = new Date(now.getTime() - 72 * 3600_000);
  const rows = await db
    .select({
      exerciseName: workoutSet.exerciseName,
      performedAt: workout.performedAt,
      weight: workoutSet.weight,
      reps: workoutSet.reps,
    })
    .from(workoutSet)
    .innerJoin(workout, eq(workoutSet.workoutId, workout.id))
    .where(
      and(eq(workoutSet.userId, opts.userId), gte(workout.performedAt, cutoff))
    );
  const setRows: SetRow[] = rows.map((r) => ({
    exerciseName: r.exerciseName,
    performedAt: r.performedAt,
    weight: Number(r.weight),
    reps: r.reps,
  }));

  const load = computeTrailingLoad(setRows, now, 72);
  try {
    const result = await analyzeReadiness(
      {
        plannedSession: {
          title: planned.title,
          description: planned.description,
          modality: planned.modality,
        },
        trailingLoad: load,
      },
      { generate: opts.generate }
    );
    await db.insert(readinessAnalysis).values({
      userId: opts.userId,
      analysisDate: date,
      planSnapshot: planned,
      loadSnapshot: load,
      verdict: result.verdict,
      headline: result.headline,
      rationale: result.rationale,
      modifications: result.modifications,
      model: MODEL_ID,
    });
    return { result };
  } catch (e: any) {
    return { error: e?.message ?? "Analysis failed." };
  }
}
