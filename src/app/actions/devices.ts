"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { devicePairing, deviceToken } from "@/db/schema";
import {
  PAIRING_CODE_TTL_MS,
  generatePairingCode,
  isPairingExpired,
} from "@/lib/health-pairing";

type DeviceRow = {
  id: string;
  deviceName: string;
  platform: string;
  createdAt: Date;
  lastUsedAt: Date | null;
};

async function getUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

// Server-only — called from page.tsx (server component). The (app)
// layout's auth gate should already have redirected, but redirect again
// defensively rather than crash if reached directly.
export async function listDevices(): Promise<DeviceRow[]> {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  return db
    .select({
      id: deviceToken.id,
      deviceName: deviceToken.deviceName,
      platform: deviceToken.platform,
      createdAt: deviceToken.createdAt,
      lastUsedAt: deviceToken.lastUsedAt,
    })
    .from(deviceToken)
    .where(and(eq(deviceToken.userId, userId), isNull(deviceToken.revokedAt)))
    .orderBy(desc(deviceToken.createdAt));
}

export type CreatePairingResult =
  | { code: string; expiresAt: string }
  | { error: string };

// Creates (or replaces) the user's single outstanding pairing code.
export async function createPairingCode(): Promise<CreatePairingResult> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated." };
  // One outstanding code per user — wipe prior rows first.
  await db.delete(devicePairing).where(eq(devicePairing.userId, userId));
  const code = generatePairingCode();
  const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
  await db.insert(devicePairing).values({ userId, code, expiresAt });
  return { code, expiresAt: expiresAt.toISOString() };
}

export type PollResult = { redeemed: boolean } | { error: string };

// Polled by the web page.
export async function pollPairingRedeemed(
  sinceIso: string
): Promise<PollResult> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated." };
  const since = new Date(sinceIso);
  const rows = await db
    .select({ id: deviceToken.id, createdAt: deviceToken.createdAt })
    .from(deviceToken)
    .where(
      and(eq(deviceToken.userId, userId), isNull(deviceToken.revokedAt))
    );
  return {
    redeemed: rows.some((r) => r.createdAt.getTime() >= since.getTime()),
  };
}

export async function revokeDevice(
  id: string
): Promise<{ ok: true } | { error: string }> {
  const userId = await getUserId();
  if (!userId) return { error: "Not authenticated." };
  await db
    .update(deviceToken)
    .set({ revokedAt: new Date() })
    .where(and(eq(deviceToken.id, id), eq(deviceToken.userId, userId)));
  return { ok: true };
}

// Defensive cleanup invoked opportunistically; not on a schedule in v1.
export async function reapExpiredPairings(): Promise<void> {
  const now = new Date();
  const rows = await db.select().from(devicePairing);
  for (const r of rows) {
    if (isPairingExpired(r.expiresAt, now)) {
      await db.delete(devicePairing).where(eq(devicePairing.id, r.id));
    }
  }
}
