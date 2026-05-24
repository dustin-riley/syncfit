import { NextRequest } from "next/server";
import { handlePlanWeek } from "@/lib/plan-week-handler";
import { resolveDeviceUser } from "@/lib/device-auth";
import { getPlanForUser } from "@/lib/plan-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handlePlanWeek(req, {
    auth: resolveDeviceUser,
    load: getPlanForUser,
  });
}
