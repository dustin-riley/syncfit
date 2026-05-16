import { txDb } from "@/db/tx";
import { workout, workoutSet } from "@/db/schema";
import { parseStrongCsv } from "@/lib/strong-parser";

export type ImportResult = {
  added: number;
  skipped: number;
  warnings: string[];
  error?: string;
};

export async function importStrongCsvForUser(
  userId: string,
  csvText: string
): Promise<ImportResult> {
  const { workouts, warnings, error } = parseStrongCsv(csvText);
  if (error) return { added: 0, skipped: 0, warnings, error };

  let added = 0,
    skipped = 0;
  for (const w of workouts) {
    try {
      const inserted = await txDb.transaction(async (tx) => {
        const [row] = await tx
          .insert(workout)
          .values({
            userId,
            performedAt: w.performedAt,
            title: w.title,
            source: "strong_csv",
            contentHash: w.contentHash,
          })
          .onConflictDoNothing({
            target: [workout.userId, workout.contentHash],
          })
          .returning();
        if (!row) return false; // duplicate: nothing inserted
        const sets = w.exercises.flatMap((e) =>
          e.sets.map((s) => ({
            workoutId: row.id,
            userId,
            exerciseName: e.name,
            equipment: e.equipment,
            setNumber: s.setNumber,
            weight: String(s.weight),
            reps: s.reps,
          }))
        );
        if (sets.length) await tx.insert(workoutSet).values(sets);
        return true;
      });
      if (inserted) added++;
      else skipped++;
    } catch {
      // FIX 2: a real failure is NOT a duplicate-skip. Do not increment skipped;
      // surface it so the user knows this workout was NOT saved and should retry.
      warnings.push(
        `Workout "${w.title}" failed to import and was not saved — please retry.`
      );
    }
  }
  return { added, skipped, warnings };
}
