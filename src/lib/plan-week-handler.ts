import { NextResponse } from "next/server";
import type { PlanDay } from "@/lib/plan-store";

export type PlanWeekAuth = (
  req: Request
) => Promise<{ userId: string } | null>;
export type PlanWeekLoad = (userId: string) => Promise<PlanDay[]>;

export async function handlePlanWeek(
  req: Request,
  deps: { auth: PlanWeekAuth; load: PlanWeekLoad }
): Promise<NextResponse> {
  const session = await deps.auth(req);
  if (!session) return new NextResponse(null, { status: 401 });
  try {
    const days = await deps.load(session.userId);
    return NextResponse.json({ days });
  } catch (e) {
    console.error("plan-week handler load failed", e);
    return NextResponse.json({ error: "couldn't load plan" }, { status: 500 });
  }
}
