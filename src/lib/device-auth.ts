import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { deviceToken } from "@/db/schema";
import { hashToken } from "@/lib/health-pairing";

export type ResolvedDevice = { userId: string; deviceId: string };

// Reads the `Authorization: Bearer <token>` header, looks up the device,
// and updates lastUsedAt. Returns null on any auth failure. Callers
// translate null → 401 themselves.
export async function resolveDeviceUser(
  req: Request
): Promise<ResolvedDevice | null> {
  const header = req.headers.get("authorization") ?? "";
  const m = header.match(/^Bearer\s+([A-Za-z0-9_-]+)$/);
  if (!m) return null;
  const plaintext = m[1];
  const tokenHash = hashToken(plaintext);

  const rows = await db
    .select({ id: deviceToken.id, userId: deviceToken.userId })
    .from(deviceToken)
    .where(
      and(eq(deviceToken.tokenHash, tokenHash), isNull(deviceToken.revokedAt))
    );

  if (rows.length === 0) return null;
  const row = rows[0];
  // best-effort touch; do not await on failure
  db.update(deviceToken)
    .set({ lastUsedAt: new Date() })
    .where(eq(deviceToken.id, row.id))
    .catch((e) => {
      console.error("device lastUsedAt touch failed", e);
    });
  return { userId: row.userId, deviceId: row.id };
}
