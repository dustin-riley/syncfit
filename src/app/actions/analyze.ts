"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { runReadinessAnalysis } from "@/lib/readiness";

export async function analyzeToday() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  return runReadinessAnalysis({ userId: session.user.id });
}
