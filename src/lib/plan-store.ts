import { db } from "@/db";
import {
  plannedSession,
  plannedExercise,
  readinessAnalysis,
  planProfile,
} from "@/db/schema";
import { eq, and, asc } from "drizzle-orm";
import {
  findExerciseMatch,
  exerciseMatches,
  normalizeExerciseName,
} from "@/lib/exercise-match";

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
// Read shape differs from the write input by exactly one field: reads carry
// the durable plannedExercise.id (used as a stable React key by consumers);
// writes don't supply it (the DB generates it). Keep the rest in lockstep.
export type PlanExerciseRead = PlanExerciseInput & { id: string };
export type PlanDay = Omit<PlanDayInput, "exercises"> & {
  exercises: PlanExerciseRead[];
};

export async function getPlanForUser(userId: string): Promise<PlanDay[]> {
  const sessions = await db
    .select()
    .from(plannedSession)
    .where(eq(plannedSession.userId, userId))
    .orderBy(asc(plannedSession.dayOfWeek));
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
        id: e.id,
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

export async function getPlanProfile(userId: string): Promise<string> {
  const [row] = await db
    .select({ goal: planProfile.goal })
    .from(planProfile)
    .where(eq(planProfile.userId, userId));
  return row?.goal ?? "";
}

// Single-statement upsert on `db` (NOT txDb). Consistent with plan-store's
// deliberately non-transactional, single-user-blast-radius design.
export async function upsertPlanProfile(
  userId: string,
  goal: string
): Promise<void> {
  await db
    .insert(planProfile)
    .values({ userId, goal })
    .onConflictDoUpdate({
      target: planProfile.userId,
      set: { goal, updatedAt: new Date() },
    });
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

  // NOTE: this read-modify-writes the whole progression_suggestions jsonb and
  // the plannedExercise row as separate non-transactional statements. Accepted
  // for this single-user MVP: the status==="pending" guard makes a sequential
  // re-accept a no-op, and accepted weights are absolute (re-applying is
  // idempotent). The one residual race — two concurrent decisions on the SAME
  // analysis row — is mitigated UI-side by serializing the progression inbox
  // (one decision in flight at a time). Do NOT wire txDb here (CSV-import only,
  // see CLAUDE.md).
  const list = row.progressionSuggestions;
  const idx = list.findIndex(
    (s) => s.exercise === opts.exercise && s.status === "pending"
  );
  if (idx === -1)
    return { ok: false, error: "That suggestion is no longer pending." };

  if (opts.decision === "accept") {
    // planSnapshot is historical jsonb; cast is deliberately permissive — we
    // only need session.id, and a stale/missing one fails safe below.
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
      )
      .orderBy(plannedExercise.orderIndex);
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
    // If the match was only a fuzzy (substring) hit and more than one live
    // exercise fuzzily matches, refuse rather than risk bumping the wrong lift.
    const norm = normalizeExerciseName(list[idx].exercise);
    const hasExact = liveExercises.some(
      (e) => normalizeExerciseName(e.name) === norm
    );
    if (!hasExact) {
      const fuzzy = liveExercises.filter((e) =>
        exerciseMatches(list[idx].exercise, e.name)
      );
      if (fuzzy.length > 1)
        return {
          ok: false,
          error:
            "That exercise is ambiguous in your current plan — open the plan to confirm.",
        };
    }
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
          status: (opts.decision === "accept" ? "accepted" : "dismissed") as
            | "accepted"
            | "dismissed",
        }
      : s
  );
  await db
    .update(readinessAnalysis)
    .set({ progressionSuggestions: updated })
    .where(eq(readinessAnalysis.id, opts.analysisId));
  return { ok: true };
}
