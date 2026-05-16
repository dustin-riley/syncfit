import { db } from "@/db";
import { workout, workoutSet } from "@/db/schema";
import { parseStrongCsv } from "@/lib/strong-parser";

export type ImportResult = { added: number; skipped: number; warnings: string[]; error?: string };

export async function importStrongCsvForUser(userId: string, csvText: string): Promise<ImportResult> {
  const { workouts, warnings, error } = parseStrongCsv(csvText);
  if (error) return { added: 0, skipped: 0, warnings, error };

  let added = 0, skipped = 0;
  for (const w of workouts) {
    try {
      const [row] = await db.insert(workout).values({
        userId, performedAt: w.performedAt, title: w.title,
        source: "strong_csv", contentHash: w.contentHash,
      }).onConflictDoNothing({ target: [workout.userId, workout.contentHash] }).returning();
      if (!row) { skipped++; continue; }
      const sets = w.exercises.flatMap(e =>
        e.sets.map(s => ({
          workoutId: row.id, userId, exerciseName: e.name, equipment: e.equipment,
          setNumber: s.setNumber, weight: String(s.weight), reps: s.reps,
        })));
      if (sets.length) await db.insert(workoutSet).values(sets);
      added++;
    } catch { skipped++; }
  }
  return { added, skipped, warnings };
}
