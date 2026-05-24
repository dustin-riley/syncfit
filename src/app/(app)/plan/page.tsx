import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPlanForUser, getPlanProfile } from "@/lib/plan-store";
import { PlanWorkspace } from "./plan-workspace";
import type { Day } from "./plan-editor";

export default async function PlanPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const [plan, goal] = await Promise.all([
    getPlanForUser(session.user.id),
    getPlanProfile(session.user.id),
  ]);
  const byDay = new Map(plan.map((p) => [p.dayOfWeek, p]));
  const initialDays: Day[] = Array.from({ length: 7 }, (_, dow) => {
    const p = byDay.get(dow);
    return {
      title: p?.title ?? "",
      notes: p?.notes ?? "",
      modality: p?.modality ?? "strength",
      exercises: (p?.exercises ?? []).map((e) => ({
        ...e,
        id: crypto.randomUUID(),
      })),
    };
  });
  return (
    <main className="ds-container p-8">
      <h1 className="h1">weekly plan</h1>
      <PlanWorkspace initialDays={initialDays} initialGoal={goal} />
    </main>
  );
}
