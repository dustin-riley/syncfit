// Pure progress-page compute. No DB, no HTTP — unit-tested offline.
// Mirrors recent-training.ts (pure) ↔ readiness.ts (loader) split.

import { appDate } from "@/lib/week";

export type ProgressInputRow = {
  performedAt: Date;
  exerciseName: string;
  /** May be null (older rows) or "" (manual log with no equipment). Treated as the same series. */
  equipment: string | null;
  weight: number;
  reps: number;
};

export type ProgressPoint = {
  /** UTC instant of the day's best set. */
  performedAt: Date;
  /** APP_TZ calendar day key ("YYYY-MM-DD") used to dedupe multi-session days. */
  day: string;
  topSetWeight: number;
  topSetReps: number;
  /** Epley: weight * (1 + reps/30). */
  e1RM: number;
};

export type ProgressSeries = {
  /** Stable React key: `${exerciseName}|${equipment}` exactly as stored (null → ""). */
  exerciseKey: string;
  /** As-stored exercise name (no normalization). */
  exerciseName: string;
  /** As-stored equipment, "" when missing. */
  equipment: string;
  /** Newest-last so a line chart reads left-to-right. */
  points: ProgressPoint[];
  totalSessions: number;
  lastPerformedAt: Date;
  firstTopSetWeight: number;
  currentTopSetWeight: number;
  firstE1RM: number;
  currentE1RM: number;
};

export type ProgressData = { series: ProgressSeries[] };

function epley(weight: number, reps: number): number {
  return weight * (1 + reps / 30);
}

function keyOf(name: string, equipment: string | null): string {
  return `${name}|${equipment ?? ""}`;
}

export function computeProgress(
  rows: ProgressInputRow[],
  _now: Date
): ProgressData {
  // Group rows by exerciseKey, then collapse each (key, day) into the best set
  // (highest weight; tie-break on higher reps).
  type Bucket = {
    exerciseName: string;
    equipment: string;
    /** day "YYYY-MM-DD" → chosen point */
    byDay: Map<string, ProgressPoint>;
  };
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const key = keyOf(r.exerciseName, r.equipment);
    let b = buckets.get(key);
    if (!b) {
      b = {
        exerciseName: r.exerciseName,
        equipment: r.equipment ?? "",
        byDay: new Map(),
      };
      buckets.set(key, b);
    }
    const day = appDate(r.performedAt);
    const candidate: ProgressPoint = {
      performedAt: r.performedAt,
      day,
      topSetWeight: r.weight,
      topSetReps: r.reps,
      e1RM: epley(r.weight, r.reps),
    };
    const existing = b.byDay.get(day);
    if (!existing) {
      b.byDay.set(day, candidate);
    } else {
      const better =
        candidate.topSetWeight > existing.topSetWeight ||
        (candidate.topSetWeight === existing.topSetWeight &&
          candidate.topSetReps > existing.topSetReps);
      if (better) b.byDay.set(day, candidate);
    }
  }

  const series: ProgressSeries[] = [];
  for (const [exerciseKey, b] of buckets) {
    const points = [...b.byDay.values()].sort(
      (a, c) => a.performedAt.getTime() - c.performedAt.getTime()
    );
    const first = points[0];
    const last = points[points.length - 1];
    series.push({
      exerciseKey,
      exerciseName: b.exerciseName,
      equipment: b.equipment,
      points,
      totalSessions: points.length,
      lastPerformedAt: last.performedAt,
      firstTopSetWeight: first.topSetWeight,
      currentTopSetWeight: last.topSetWeight,
      firstE1RM: first.e1RM,
      currentE1RM: last.e1RM,
    });
  }

  // Default order: most-recent first.
  series.sort(
    (a, b) => b.lastPerformedAt.getTime() - a.lastPerformedAt.getTime()
  );
  return { series };
}

export type ProgressSort = "recent" | "frequent" | "az";

// Generic over the series shape so the client can pass a hydrated variant
// (Date-typed lastPerformedAt / points[].performedAt) without casts.
type Sortable = {
  totalSessions: number;
  exerciseName: string;
  equipment: string;
};

export function sortSeries<T extends Sortable>(
  series: T[],
  mode: ProgressSort
): T[] {
  const copy = series.slice();
  if (mode === "recent") return copy;
  if (mode === "frequent") {
    return copy.sort((a, b) => b.totalSessions - a.totalSessions);
  }
  // "az"
  return copy.sort((a, b) => {
    if (a.exerciseName !== b.exerciseName) {
      return a.exerciseName.localeCompare(b.exerciseName);
    }
    return a.equipment.localeCompare(b.equipment);
  });
}
