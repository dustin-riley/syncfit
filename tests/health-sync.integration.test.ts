import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { deviceToken, healthMetric } from "@/db/schema";
import { hashToken, mintRandomToken } from "@/lib/health-pairing";
import { POST as syncPOST } from "@/app/api/health/sync/route";

const U = "itest-sync-" + Date.now();

let TOKEN = "";
let REVOKED_TOKEN = "";

function syncRequest(
  body: unknown,
  auth?: string
): Request {
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
  if (auth) headers.authorization = `Bearer ${auth}`;
  return new Request("http://test.local/api/health/sync", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

beforeAll(async () => {
  TOKEN = mintRandomToken();
  await db.insert(deviceToken).values({
    userId: U,
    tokenHash: hashToken(TOKEN),
    deviceName: "itest iPhone",
    platform: "ios",
  });
  REVOKED_TOKEN = mintRandomToken();
  await db.insert(deviceToken).values({
    userId: U,
    tokenHash: hashToken(REVOKED_TOKEN),
    deviceName: "itest revoked",
    platform: "ios",
    revokedAt: new Date(),
  });
});

afterAll(async () => {
  await db.delete(healthMetric).where(eq(healthMetric.userId, U));
  await db.delete(deviceToken).where(inArray(deviceToken.userId, [U]));
});

describe("POST /api/health/sync", () => {
  it("401 with no Authorization header", async () => {
    const resp = await syncPOST(syncRequest({ uploads: [] }) as never);
    expect(resp.status).toBe(401);
  });

  it("401 with a revoked token", async () => {
    const resp = await syncPOST(
      syncRequest({ uploads: [] }, REVOKED_TOKEN) as never
    );
    expect(resp.status).toBe(401);
  });

  it("200 with empty uploads returns counts 0/0", async () => {
    const resp = await syncPOST(syncRequest({ uploads: [] }, TOKEN) as never);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { accepted: number; updated: number };
    expect(body).toEqual({ accepted: 0, updated: 0 });
  });

  it("upserts three metrics and re-posting with new value overwrites", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const payload = {
      uploads: [
        {
          metricDate: today,
          type: "hrv",
          value: 42.5,
          source: "primary",
          freshness: "fresh",
          recordedAt: new Date().toISOString(),
        },
        {
          metricDate: today,
          type: "rhr",
          value: 58,
          source: "primary",
          freshness: "fresh",
          recordedAt: new Date().toISOString(),
        },
        {
          metricDate: today,
          type: "sleep_duration_seconds",
          value: 22320,
          source: "primary",
          freshness: "fresh",
          recordedAt: new Date().toISOString(),
        },
      ],
    };
    const first = await syncPOST(syncRequest(payload, TOKEN) as never);
    expect(first.status).toBe(200);
    const b1 = (await first.json()) as { accepted: number };
    expect(b1.accepted).toBe(3);

    // Re-post with a different HRV value → upsert overwrites.
    payload.uploads[0].value = 50;
    const second = await syncPOST(syncRequest(payload, TOKEN) as never);
    expect(second.status).toBe(200);

    const rows = await db
      .select()
      .from(healthMetric)
      .where(eq(healthMetric.userId, U));
    expect(rows.length).toBe(3);
    const hrv = rows.find((r) => r.type === "hrv")!;
    expect(Number(hrv.value)).toBe(50);
  });

  it("400 on malformed payload (no rows written)", async () => {
    const resp = await syncPOST(
      syncRequest({ uploads: [{ type: "hrv" }] }, TOKEN) as never
    );
    expect(resp.status).toBe(400);
  });

  it("400 on metricDate outside the allowed window", async () => {
    const tooOld = new Date(Date.now() - 60 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const resp = await syncPOST(
      syncRequest(
        {
          uploads: [
            {
              metricDate: tooOld,
              type: "hrv",
              value: 40,
              source: "primary",
              freshness: "fresh",
              recordedAt: new Date().toISOString(),
            },
          ],
        },
        TOKEN
      ) as never
    );
    expect(resp.status).toBe(400);
  });
});
