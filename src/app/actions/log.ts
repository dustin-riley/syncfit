"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseAppDateTime } from "@/lib/units";
import { parseDuration } from "@/lib/duration";
import {
  logStrengthWorkout,
  logEnduranceActivity,
  type LogResult,
} from "@/lib/manual-log";

function num(v: FormDataEntryValue | null): number {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) ? n : NaN;
}

export async function logWorkout(formData: FormData): Promise<LogResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { ok: false, added: 0, skipped: 0, error: "Not authenticated." };
  const userId = session.user.id;

  const kind = String(formData.get("kind") ?? "");
  const performedAt =
    parseAppDateTime(String(formData.get("performedAt") ?? "")) ??
    new Date(NaN);

  if (kind === "strength") {
    const count = Math.min(Math.trunc(num(formData.get("rowCount")) || 0), 100);
    const perExerciseSeq = new Map<string, number>();
    const sets: {
      exerciseName: string;
      weight: number;
      reps: number;
      setNumber: number;
    }[] = [];
    for (let r = 0; r < count; r++) {
      const name = String(formData.get(`set-${r}-name`) ?? "").trim();
      if (!name) continue; // skip blank trailing rows
      const seq = (perExerciseSeq.get(name) ?? 0) + 1;
      perExerciseSeq.set(name, seq);
      sets.push({
        exerciseName: name,
        weight: num(formData.get(`set-${r}-weight`)),
        reps: Math.trunc(num(formData.get(`set-${r}-reps`))),
        setNumber: seq,
      });
    }
    const res = await logStrengthWorkout(userId, {
      performedAt,
      title: String(formData.get("title") ?? ""),
      sets,
    });
    if (res.ok) revalidatePath("/");
    return res;
  }

  if (kind === "endurance") {
    const distRaw = String(formData.get("distance") ?? "").trim();
    const res = await logEnduranceActivity(userId, {
      performedAt,
      activityType: String(formData.get("activityType") ?? ""),
      distanceMi: distRaw === "" ? null : num(formData.get("distance")),
      durationSec: parseDuration(String(formData.get("duration") ?? "")) ?? 0,
      notes: String(formData.get("notes") ?? ""),
    });
    if (res.ok) revalidatePath("/");
    return res;
  }

  return { ok: false, added: 0, skipped: 0, error: "Unknown workout kind." };
}
