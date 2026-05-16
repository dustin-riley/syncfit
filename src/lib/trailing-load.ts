export type SetRow = { exerciseName: string; performedAt: Date; weight: number; reps: number };
export type PerExercise = { exerciseName: string; volume: number; setCount: number };
export type TrailingLoad = {
  windowHours: number; sessions: number; setCount: number; totalVolume: number;
  perExercise: PerExercise[]; lastSessionAt: Date | null; restDays: number;
};

export function computeTrailingLoad(rows: SetRow[], now: Date, windowHours: number): TrailingLoad {
  const cutoff = now.getTime() - windowHours * 3600_000;
  const inWin = rows.filter(r => r.performedAt.getTime() >= cutoff && r.performedAt.getTime() <= now.getTime());
  const perMap = new Map<string, PerExercise>();
  let totalVolume = 0;
  for (const r of inWin) {
    const v = r.weight * r.reps; totalVolume += v;
    const e = perMap.get(r.exerciseName) ?? { exerciseName: r.exerciseName, volume: 0, setCount: 0 };
    e.volume += v; e.setCount += 1; perMap.set(r.exerciseName, e);
  }
  const sessionKeys = new Set(inWin.map(r => r.performedAt.toISOString()));
  const lastSessionAt = inWin.length
    ? new Date(Math.max(...inWin.map(r => r.performedAt.getTime()))) : null;
  const restDays = lastSessionAt
    ? Math.floor((now.getTime() - lastSessionAt.getTime()) / 86_400_000) : 0;
  return {
    windowHours, sessions: sessionKeys.size, setCount: inWin.length, totalVolume,
    perExercise: [...perMap.values()], lastSessionAt, restDays,
  };
}
