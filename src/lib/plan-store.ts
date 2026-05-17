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
// Read shape is structurally identical to the write input today; alias so the
// two cannot silently drift.
export type PlanDay = PlanDayInput;

export async function getPlanForUser(userId: string): Promise<PlanDay[]> {
  const sessions = await db
    .select()
    .from(plannedSession)
    .where(eq(plannedSession.userId, userId));
  const exercises = await db
    .select()
    .from(plannedExercise)
    .where(eq(plannedExercise.userId, userId));
  const sessionIds = new Set(sessions.map((s) => s.id));
  const orphans = exercises.filter((e) => !sessionIds.has(e.plannedSessionId));
  if (orphans.length > 0) {
    console.warn(
      `plan-store: ${orphans.length} orphan planned_exercise row(s) for user ${userId} silently dropped`
    );
  }
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

  // NOTE: session upsert + delete + re-insert are 3 separate neon-http
  // statements (not a transaction). Accepted: the delete is scoped to one
  // user's one weekday, write order is session→delete→insert, so the worst
  // failure leaves that single day with no exercises until the user clicks
  // Save again (the controlled editor still holds their input). Do NOT wire
  // txDb here — it is reserved for CSV import by design (see CLAUDE.md).
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
