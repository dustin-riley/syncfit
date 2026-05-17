import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPlanForUser } from "@/lib/plan-store";
import { PlanEditor } from "./plan-editor";

export default async function PlanPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const plan = await getPlanForUser(session.user.id);
  const byDay = new Map(plan.map((p) => [p.dayOfWeek, p]));
  const initial = Array.from({ length: 7 }, (_, dow) => {
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
      <h1 className="h2">weekly plan</h1>
      <PlanEditor initial={initial} />
    </main>
  );
}
