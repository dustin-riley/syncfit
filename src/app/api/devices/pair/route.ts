import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { devicePairing, deviceToken } from "@/db/schema";
import {
  hashToken,
  isPairingExpired,
  mintRandomToken,
  PAIRING_CODE_REGEX,
} from "@/lib/health-pairing";

export const runtime = "nodejs";

const Body = z.object({
  // Tolerate whitespace and lowercase from iOS auto-correct/keyboards.
  code: z.preprocess(
    (v) => (typeof v === "string" ? v.trim().toUpperCase() : v),
    z.string().regex(PAIRING_CODE_REGEX)
  ),
  deviceName: z.string().min(1).max(120),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "invalid_or_expired_code" },
      { status: 400 }
    );
  }
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_or_expired_code" },
      { status: 400 }
    );
  }
  const { code, deviceName } = parsed.data;

  const rows = await db
    .select()
    .from(devicePairing)
    .where(eq(devicePairing.code, code));
  if (rows.length === 0) {
    return NextResponse.json(
      { error: "invalid_or_expired_code" },
      { status: 400 }
    );
  }
  const row = rows[0];
  if (isPairingExpired(row.expiresAt, new Date())) {
    // Leave the row in place (per spec; expired rows are reaped elsewhere).
    return NextResponse.json(
      { error: "invalid_or_expired_code" },
      { status: 400 }
    );
  }

  const plaintext = mintRandomToken();
  const tokenHash = hashToken(plaintext);

  // Delete the pairing row first so a duplicate redeem attempt can't race
  // through, then insert the token. `.returning()` lets us detect the
  // race where two concurrent requests pass the SELECT — only one delete
  // returns the row; the loser bails with 400.
  const deleted = await db
    .delete(devicePairing)
    .where(and(eq(devicePairing.id, row.id), eq(devicePairing.code, code)))
    .returning({ id: devicePairing.id });
  if (deleted.length === 0) {
    return NextResponse.json(
      { error: "invalid_or_expired_code" },
      { status: 400 }
    );
  }
  await db.insert(deviceToken).values({
    userId: row.userId,
    tokenHash,
    deviceName,
    platform: "ios",
  });

  return NextResponse.json({ token: plaintext });
}
