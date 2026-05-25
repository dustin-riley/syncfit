import { describe, it, expect, afterAll } from "vitest";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { workout, workoutSet, deviceToken } from "@/db/schema";
import { hashToken } from "@/lib/health-pairing";
import { POST as workoutsPOST } from "@/app/api/workouts/route";

const U = "itest-workouts-" + Date.now();
const TOKEN = "itest_token_" + Date.now() + "_aaaaaaaaaaaaaaaaaaaaaaaaaaaa";

async function seedDeviceToken(userId: string, plaintext: string) {
  await db.insert(deviceToken).values({
    userId,
    tokenHash: hashToken(plaintext),
    deviceName: "itest device",
  });
}

function postRequest(token: string | null, body: unknown): Request {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;
  return new Request("http://test.local/api/workouts", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
}

afterAll(async () => {
  const ws = await db
    .select({ id: workout.id })
    .from(workout)
    .where(eq(workout.userId, U));
  if (ws.length > 0) {
    await db
      .delete(workoutSet)
      .where(
        inArray(
          workoutSet.workoutId,
          ws.map((w) => w.id)
        )
      );
  }
  await db.delete(workout).where(eq(workout.userId, U));
  await db.delete(deviceToken).where(eq(deviceToken.userId, U));
});

describe("POST /api/workouts — happy path", () => {
  it("persists a workout + sets with source=ios_live", async () => {
    await seedDeviceToken(U, TOKEN);

    const performedAt = new Date().toISOString();
    const resp = await workoutsPOST(
      postRequest(TOKEN, {
        performedAt,
        title: "itest Pull Day",
        sets: [
          { exerciseName: "Pull-ups", weight: 0, reps: 10 },
          { exerciseName: "Pull-ups", weight: 0, reps: 9 },
          { exerciseName: "Barbell Row", weight: 135, reps: 8 },
        ],
      }) as never
    );
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as {
      ok: boolean;
      added: number;
      skipped: number;
    };
    expect(body).toEqual({ ok: true, added: 1, skipped: 0 });

    const ws = await db
      .select()
      .from(workout)
      .where(eq(workout.userId, U));
    expect(ws.length).toBe(1);
    expect(ws[0].title).toBe("itest Pull Day");
    expect(ws[0].source).toBe("ios_live");

    const sets = await db
      .select()
      .from(workoutSet)
      .where(eq(workoutSet.workoutId, ws[0].id));
    expect(sets.length).toBe(3);
    // per-exercise setNumber + row-order seq
    const pullUps = sets
      .filter((s) => s.exerciseName === "Pull-ups")
      .sort((a, b) => a.setNumber - b.setNumber);
    expect(pullUps.map((s) => s.setNumber)).toEqual([1, 2]);
    expect(pullUps.map((s) => s.reps)).toEqual([10, 9]);
    const rows = sets.sort((a, b) => a.seq - b.seq);
    expect(rows.map((s) => s.seq)).toEqual([0, 1, 2]);
  });
});
