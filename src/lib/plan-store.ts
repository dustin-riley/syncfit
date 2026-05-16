import { db } from "@/db";
import { plannedSession } from "@/db/schema";
import { eq } from "drizzle-orm";

export type PlanDayInput = { dayOfWeek: number; title: string; description: string; modality: string };

export async function getPlanForUser(userId: string) {
  return db.select().from(plannedSession).where(eq(plannedSession.userId, userId));
}

export async function upsertPlanDayForUser(userId: string, v: PlanDayInput) {
  await db.insert(plannedSession)
    .values({ userId, dayOfWeek: v.dayOfWeek, title: v.title, description: v.description, modality: v.modality })
    .onConflictDoUpdate({
      target: [plannedSession.userId, plannedSession.dayOfWeek],
      set: { title: v.title, description: v.description, modality: v.modality },
    });
}
