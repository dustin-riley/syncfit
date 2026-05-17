import { db } from "@/db";
import { plannedSession, plannedExercise } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type PlanExerciseInput = {
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
};
export type PlanDayInput = {
  dayOfWeek: number;
  title: string;
  notes: string;
  modality: string;
  exercises: PlanExerciseInput[];
};
export type PlanDay = {
  dayOfWeek: number;
  title: string;
  notes: string;
  modality: string;
  exercises: PlanExerciseInput[];
};

export async function getPlanForUser(userId: string): Promise<PlanDay[]> {
  const sessions = await db
    .select()
    .from(plannedSession)
    .where(eq(plannedSession.userId, userId));
  const exercises = await db
    .select()
    .from(plannedExercise)
    .where(eq(plannedExercise.userId, userId));
  return sessions.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    title: s.title,
    notes: s.notes,
    modality: s.modality,
    exercises: exercises
      .filter((e) => e.plannedSessionId === s.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((e) => ({
        name: e.name,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeight: Number(e.targetWeight),
      })),
  }));
}

export async function upsertPlanDayForUser(userId: string, v: PlanDayInput) {
  const [row] = await db
    .insert(plannedSession)
    .values({
      userId,
      dayOfWeek: v.dayOfWeek,
      title: v.title,
      notes: v.notes,
      modality: v.modality,
    })
    .onConflictDoUpdate({
      target: [plannedSession.userId, plannedSession.dayOfWeek],
      set: { title: v.title, notes: v.notes, modality: v.modality },
    })
    .returning({ id: plannedSession.id });

  // replace-on-save: this day's exercise rows are fully authoritative
  await db
    .delete(plannedExercise)
    .where(
      and(
        eq(plannedExercise.userId, userId),
        eq(plannedExercise.plannedSessionId, row.id)
      )
    );
  if (v.exercises.length > 0) {
    await db.insert(plannedExercise).values(
      v.exercises.map((e, idx) => ({
        plannedSessionId: row.id,
        userId,
        name: e.name,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeight: String(e.targetWeight),
        orderIndex: idx,
      }))
    );
  }
}

export async function upsertPlanWeekForUser(
  userId: string,
  days: PlanDayInput[]
) {
  for (const d of days) await upsertPlanDayForUser(userId, d);
}
