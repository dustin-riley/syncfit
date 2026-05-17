"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  upsertPlanWeekForUser,
  applyProgressionDecision,
  type PlanDayInput,
  type PlanExerciseInput,
} from "@/lib/plan-store";

// Form numbers arrive as strings; coerce defensively so a blank/garbled field
// can never send NaN into the numeric plan columns (plan-store assumes clean
// numbers — see its non-atomicity/precondition notes).
function num(v: FormDataEntryValue | null): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? Math.max(0, n) : 0;
}

// target_sets / target_reps are integer columns — Postgres rejects a float
// like 3.5, so truncate (and floor at 0) before it reaches plan-store.
function int(v: FormDataEntryValue | null): number {
  return Math.trunc(num(v));
}

// Exercise rows are named ex-{day}-{row}-{field}; rowCount-{day} carries the
// number of rows the editor rendered for that day. Blank-name rows are dropped
// (an empty trailing row is not an exercise).
function readExercises(fd: FormData, dow: number): PlanExerciseInput[] {
  const count = Math.min(int(fd.get(`rowCount-${dow}`)), 50);
  const out: PlanExerciseInput[] = [];
  for (let r = 0; r < count; r++) {
    const name = String(fd.get(`ex-${dow}-${r}-name`) ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      targetSets: int(fd.get(`ex-${dow}-${r}-sets`)),
      targetReps: int(fd.get(`ex-${dow}-${r}-reps`)),
      targetWeight: num(fd.get(`ex-${dow}-${r}-weight`)),
    });
  }
  return out;
}

export async function savePlanWeek(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const days: PlanDayInput[] = [];
  for (let dow = 0; dow < 7; dow++) {
    days.push({
      dayOfWeek: dow,
      title: String(formData.get(`title-${dow}`) ?? ""),
      notes: String(formData.get(`notes-${dow}`) ?? ""),
      modality: String(formData.get(`modality-${dow}`) ?? "strength"),
      exercises: readExercises(formData, dow),
    });
  }
  await upsertPlanWeekForUser(session.user.id, days);
  revalidatePath("/plan");
  revalidatePath("/");
}

export async function applyProgression(input: {
  analysisId: string;
  exercise: string;
  decision: "accept" | "dismiss";
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false as const, error: "Not authenticated." };
  const r = await applyProgressionDecision({
    userId: session.user.id,
    ...input,
  });
  if (r.ok) {
    revalidatePath("/");
    revalidatePath("/plan");
  }
  return r;
}
