// Pure "recent training" builder: raw recent strength sessions + endurance
// activities over an N-day window. Replaces the old trailing-load aggregator.
// No DB, no HTTP — unit-tested offline.

export type StrengthRow = {
  workoutId: string;
  performedAt: Date;
  title: string;
  exerciseName: string;
  weight: number;
  reps: number;
};
export type EnduranceRow = {
  performedAt: Date;
  activityType: string;
  distanceMi: number | null;
  durationSec: number;
};
export type StrengthSetView = {
  exerciseName: string;
  weight: number;
  reps: number;
};
export type StrengthSession = {
  workoutId: string;
  performedAt: Date;
  title: string;
  sets: StrengthSetView[];
};
export type EnduranceView = {
  performedAt: Date;
  activityType: string;
  distanceMi: number | null;
  durationSec: number;
  pacePerMiSec: number | null; // sec per mile; null when no usable distance
  mph: number | null; // null when no usable distance
};
export type RecentTraining = {
  windowDays: number;
  strengthSessions: StrengthSession[]; // newest-first
  enduranceActivities: EnduranceView[]; // newest-first
};

export function computeRecentTraining(
  strengthRows: StrengthRow[],
  enduranceRows: EnduranceRow[],
  now: Date,
  windowDays: number
): RecentTraining {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const inWin = (t: Date) =>
    t.getTime() >= cutoff && t.getTime() <= now.getTime();

  const byWorkout = new Map<string, StrengthSession>();
  for (const r of strengthRows) {
    if (!inWin(r.performedAt)) continue;
    let s = byWorkout.get(r.workoutId);
    if (!s) {
      s = {
        workoutId: r.workoutId,
        performedAt: r.performedAt,
        title: r.title,
        sets: [],
      };
      byWorkout.set(r.workoutId, s);
    }
    s.sets.push({
      exerciseName: r.exerciseName,
      weight: r.weight,
      reps: r.reps,
    });
  }
  const strengthSessions = [...byWorkout.values()].sort(
    (a, b) => b.performedAt.getTime() - a.performedAt.getTime()
  );

  const enduranceActivities = enduranceRows
    .filter((e) => inWin(e.performedAt))
    .map((e) => {
      const usable =
        e.distanceMi !== null && e.distanceMi > 0 && e.durationSec > 0;
      return {
        performedAt: e.performedAt,
        activityType: e.activityType,
        distanceMi: e.distanceMi,
        durationSec: e.durationSec,
        pacePerMiSec: usable ? e.durationSec / (e.distanceMi as number) : null,
        mph: usable ? (e.distanceMi as number) / (e.durationSec / 3600) : null,
      };
    })
    .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime());

  return { windowDays, strengthSessions, enduranceActivities };
}

/**
 * For each exercise, the set list from its most recent session in the window
 * (sessions are newest-first, so the first occurrence wins).
 */
export function lastSessionSetsByExercise(
  rt: RecentTraining,
  now: Date
): { exerciseName: string; agoDays: number; sets: Omit<StrengthSetView, 'exerciseName'>[] }[] {
  const seen = new Map<
    string,
    { exerciseName: string; agoDays: number; sets: Omit<StrengthSetView, 'exerciseName'>[] }
  >();
  for (const s of rt.strengthSessions) {
    const byEx = new Map<string, Omit<StrengthSetView, 'exerciseName'>[]>();
    for (const set of s.sets) {
      if (!byEx.has(set.exerciseName)) byEx.set(set.exerciseName, []);
      byEx.get(set.exerciseName)!.push({
        weight: set.weight,
        reps: set.reps,
      });
    }
    const agoDays = Math.floor(
      (now.getTime() - s.performedAt.getTime()) / 86_400_000
    );
    for (const [exerciseName, sets] of byEx) {
      if (seen.has(exerciseName)) continue;
      seen.set(exerciseName, { exerciseName, agoDays, sets });
    }
  }
  return [...seen.values()];
}
