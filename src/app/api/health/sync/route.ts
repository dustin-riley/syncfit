import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { healthMetric } from "@/db/schema";
import { resolveDeviceUser } from "@/lib/device-auth";
import { isMetricDateWithinWindow } from "@/lib/health-window";

export const runtime = "nodejs";

const Upload = z.object({
  metricDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  type: z.enum(["hrv", "rhr", "sleep_duration_seconds"]),
  value: z.number().finite(),
  source: z.string().min(1).max(64),
  freshness: z.enum(["fresh", "stale_24h", "stale_48h"]),
  recordedAt: z.string().datetime(),
});

const Body = z.object({
  uploads: z.array(Upload).max(500),
});

export async function POST(req: NextRequest) {
  const device = await resolveDeviceUser(req);
  if (!device) return new NextResponse(null, { status: 401 });

  let parsed;
  try {
    parsed = Body.safeParse(await req.json());
  } catch {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
  }

  const now = new Date();
  for (const u of parsed.data.uploads) {
    if (!isMetricDateWithinWindow(u.metricDate, now)) {
      return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
    }
  }

  if (parsed.data.uploads.length === 0) {
    return NextResponse.json({ accepted: 0, updated: 0 });
  }

  const values = parsed.data.uploads.map((u) => ({
    userId: device.userId,
    metricDate: u.metricDate,
    type: u.type,
    value: String(u.value),
    source: u.source,
    freshness: u.freshness,
    recordedAt: new Date(u.recordedAt),
  }));

  // Single-statement upsert. Drizzle's onConflictDoUpdate gives us
  // last-write-wins on (userId, metricDate, type).
  await db
    .insert(healthMetric)
    .values(values)
    .onConflictDoUpdate({
      target: [healthMetric.userId, healthMetric.metricDate, healthMetric.type],
      set: {
        value: sql`excluded.value`,
        source: sql`excluded.source`,
        freshness: sql`excluded.freshness`,
        recordedAt: sql`excluded.recorded_at`,
      },
    });

  return NextResponse.json({
    accepted: values.length,
    updated: values.length,
  });
}
