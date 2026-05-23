import { describe, it, expect, afterAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import { devicePairing, deviceToken } from "@/db/schema";
import { hashToken, PAIRING_CODE_TTL_MS } from "@/lib/health-pairing";
import { POST as pairPOST } from "@/app/api/devices/pair/route";

const U = "itest-pair-" + Date.now();

function pairRequest(body: unknown): Request {
  return new Request("http://test.local/api/devices/pair", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

afterAll(async () => {
  await db.delete(devicePairing).where(eq(devicePairing.userId, U));
  await db.delete(deviceToken).where(inArray(deviceToken.userId, [U]));
});

describe("POST /api/devices/pair", () => {
  it("redeems a valid code, returns a one-time token, deletes the pairing row", async () => {
    const code = "424242";
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    await db.insert(devicePairing).values({ userId: U, code, expiresAt });

    // Cast to the Next type the handler expects. Next route handlers
    // accept spec-Request at runtime; the cast is just for TS.
    const resp = await pairPOST(
      pairRequest({ code, deviceName: "itest iPhone" }) as never
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { token: string };
    expect(typeof body.token).toBe("string");
    expect(body.token.length).toBeGreaterThan(40);

    // Pairing row removed.
    const pairs = await db
      .select()
      .from(devicePairing)
      .where(eq(devicePairing.userId, U));
    expect(pairs.length).toBe(0);

    // Token row exists with the right hash + deviceName.
    const toks = await db
      .select()
      .from(deviceToken)
      .where(eq(deviceToken.userId, U));
    expect(toks.length).toBe(1);
    expect(toks[0].tokenHash).toBe(hashToken(body.token));
    expect(toks[0].deviceName).toBe("itest iPhone");
  });

  it("rejects an unknown code with 400", async () => {
    const resp = await pairPOST(
      pairRequest({ code: "999999", deviceName: "itest" }) as never
    );
    expect(resp.status).toBe(400);
  });

  it("rejects an expired code with 400 and leaves the row alone", async () => {
    const code = "313131";
    const expiresAt = new Date(Date.now() - 1000);
    await db.insert(devicePairing).values({ userId: U, code, expiresAt });

    const resp = await pairPOST(
      pairRequest({ code, deviceName: "itest" }) as never
    );
    expect(resp.status).toBe(400);
    // The row is *not* deleted on a failed (expired) redemption — typo
    // tolerance for codes that are still valid; expired rows are reaped
    // by reapExpiredPairings, not by the failed-redeem path.
    const pairs = await db
      .select()
      .from(devicePairing)
      .where(eq(devicePairing.code, code));
    expect(pairs.length).toBe(1);
  });

  it("under concurrent redemption, only one request wins (the other gets 400)", async () => {
    const code = "525252";
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    await db.insert(devicePairing).values({ userId: U, code, expiresAt });

    const [a, b] = await Promise.all([
      pairPOST(pairRequest({ code, deviceName: "race-A" }) as never),
      pairPOST(pairRequest({ code, deviceName: "race-B" }) as never),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 400]);

    // Exactly one deviceToken row created.
    const toks = await db
      .select()
      .from(deviceToken)
      .where(eq(deviceToken.userId, U));
    // The earlier success case for code "424242" already inserted a row,
    // so the total is 2 (one from the first happy-path test + one from this race).
    // To avoid coupling to test ordering, just assert that adding "race-A"
    // OR "race-B" appears exactly once.
    const raceWinners = toks.filter(
      (t) => t.deviceName === "race-A" || t.deviceName === "race-B"
    );
    expect(raceWinners.length).toBe(1);
  });
});
