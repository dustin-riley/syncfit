"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { eq, asc } from "drizzle-orm";
import { db } from "@/db";
import { workout, workoutSet } from "@/db/schema";
import {
  computeProgress,
  type ProgressData,
  type ProgressInputRow,
} from "@/lib/progress";

export async function loadProgressData(): Promise<{
  data: ProgressData;
  error?: string;
}> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { data: { series: [] } };
  const userId = session.user.id;

  try {
    const rows = await db
      .select({
        performedAt: workout.performedAt,
        exerciseName: workoutSet.exerciseName,
        equipment: workoutSet.equipment,
        weight: workoutSet.weight,
        reps: workoutSet.reps,
      })
      .from(workoutSet)
      .innerJoin(workout, eq(workout.id, workoutSet.workoutId))
      .where(eq(workoutSet.userId, userId))
      .orderBy(asc(workout.performedAt));

    // Drizzle returns numeric columns as strings. Coerce at the lib boundary.
    const input: ProgressInputRow[] = rows.map((r) => ({
      performedAt: r.performedAt,
      exerciseName: r.exerciseName,
      equipment: r.equipment,
      weight: Number(r.weight),
      reps: r.reps,
    }));
    return { data: computeProgress(input) };
  } catch {
    // Genericized — matches analyze / plan posture; don't leak driver messages.
    return {
      data: { series: [] },
      error: "Couldn't load your progress. Refresh to try again.",
    };
  }
}
