import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { resolveDeviceUser } from "@/lib/device-auth";
import { logStrengthWorkout, sequenceStrengthSets } from "@/lib/manual-log";

export const runtime = "nodejs";

const SetBody = z.object({
  exerciseName: z.string().trim().min(1).max(200),
  weight: z.number().finite().min(0),
  reps: z.number().int().min(1),
});

const Body = z.object({
  performedAt: z.string().datetime(),
  title: z.string().trim().min(1).max(200),
  sets: z.array(SetBody).min(1).max(500),
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

  const raw = parsed.data.sets.map((s) => ({
    exerciseName: s.exerciseName,
    weight: s.weight,
    reps: s.reps,
  }));

  let res;
  try {
    res = await logStrengthWorkout(
      device.userId,
      {
        performedAt: new Date(parsed.data.performedAt),
        title: parsed.data.title,
        sets: sequenceStrengthSets(raw),
      },
      "ios_live"
    );
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }

  if (!res.ok) {
    return NextResponse.json(
      { error: res.error ?? "invalid_payload" },
      { status: 400 }
    );
  }
  return NextResponse.json({
    ok: true,
    added: res.added,
    skipped: res.skipped,
  });
}
