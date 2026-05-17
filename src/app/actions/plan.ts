"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { upsertPlanWeekForUser, type PlanDayInput } from "@/lib/plan-store";

export async function savePlanWeek(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const days: PlanDayInput[] = [];
  for (let dow = 0; dow < 7; dow++) {
    days.push({
      dayOfWeek: dow,
      title: String(formData.get(`title-${dow}`) ?? ""),
      description: String(formData.get(`description-${dow}`) ?? ""),
      modality: String(formData.get(`modality-${dow}`) ?? "strength"),
    });
  }
  await upsertPlanWeekForUser(session.user.id, days);
  revalidatePath("/plan");
}
