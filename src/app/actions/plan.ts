"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getPlanForUser, upsertPlanDayForUser } from "@/lib/plan-store";

export async function getPlan() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  return getPlanForUser(session.user.id);
}

export async function savePlanDay(fd: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  // Session expired after page load: send to login instead of silently dropping the save.
  if (!session) redirect("/login");
  await upsertPlanDayForUser(session.user.id, {
    dayOfWeek: Number(fd.get("dayOfWeek")),
    title: String(fd.get("title") ?? ""),
    description: String(fd.get("description") ?? ""),
    modality: String(fd.get("modality") ?? "strength"),
  });
  revalidatePath("/plan");
}
