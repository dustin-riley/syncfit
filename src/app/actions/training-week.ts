"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getTrainingWeek } from "@/lib/training-week-data";
import type { TrainingWeekData } from "@/lib/week-view";

export async function loadTrainingWeek(
  weekStartYmd: string
): Promise<TrainingWeekData> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  return getTrainingWeek(session.user.id, weekStartYmd, new Date());
}
