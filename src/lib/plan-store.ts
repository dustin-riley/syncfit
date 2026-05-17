import { db } from "@/db";
import { plannedSession, plannedExercise, readinessAnalysis } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { findExerciseMatch } from "@/lib/exercise-match";

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

export type ProgressionDecision = "accept" | "dismiss";

export async function applyProgressionDecision(opts: {
  userId: string;
  analysisId: string;
  exercise: string;
  decision: ProgressionDecision;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(readinessAnalysis)
    .where(
      and(
        eq(readinessAnalysis.id, opts.analysisId),
        eq(readinessAnalysis.userId, opts.userId)
      )
    );
  if (!row) return { ok: false, error: "Analysis not found." };

  const list = row.progressionSuggestions;
  const idx = list.findIndex(
    (s) => s.exercise === opts.exercise && s.status === "pending"
  );
  if (idx === -1)
    return { ok: false, error: "That suggestion is no longer pending." };

  if (opts.decision === "accept") {
    const snap = row.planSnapshot as {
      session?: { id?: string; dayOfWeek?: number };
    };
    const sessionId = snap.session?.id;
    if (!sessionId)
      return { ok: false, error: "Plan snapshot is missing its session." };
    const liveExercises = await db
      .select()
      .from(plannedExercise)
      .where(
        and(
          eq(plannedExercise.userId, opts.userId),
          eq(plannedExercise.plannedSessionId, sessionId)
        )
      );
    const target = findExerciseMatch(
      list[idx].exercise,
      liveExercises,
      (e) => e.name
    );
    if (!target)
      return {
        ok: false,
        error:
          "Couldn't find that exercise in your current plan — it may have changed.",
      };
    await db
      .update(plannedExercise)
      .set({
        targetWeight: String(list[idx].suggestedWeight),
        targetSets: list[idx].suggestedSets ?? target.targetSets,
        targetReps: list[idx].suggestedReps ?? target.targetReps,
      })
      .where(eq(plannedExercise.id, target.id));
  }

  const updated = list.map((s, i) =>
    i === idx
      ? {
          ...s,
          status: (opts.decision === "accept"
            ? "accepted"
            : "dismissed") as "accepted" | "dismissed",
        }
      : s
  );
  await db
    .update(readinessAnalysis)
    .set({ progressionSuggestions: updated })
    .where(eq(readinessAnalysis.id, opts.analysisId));
  return { ok: true };
}
