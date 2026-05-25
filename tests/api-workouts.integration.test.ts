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
  const headers: Record<string, string> = {
    "content-type": "application/json",
  };
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
    await db.delete(workoutSet).where(
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

    const ws = await db.select().from(workout).where(eq(workout.userId, U));
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

describe("POST /api/workouts — auth + validation", () => {
  it("returns 401 with no Authorization header", async () => {
    const resp = await workoutsPOST(
      postRequest(null, {
        performedAt: new Date().toISOString(),
        title: "ignored",
        sets: [{ exerciseName: "X", weight: 1, reps: 1 }],
      }) as never
    );
    expect(resp.status).toBe(401);
  });

  it("returns 401 with a malformed bearer header", async () => {
    const req = new Request("http://test.local/api/workouts", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: "Bearer not_a_token!!",
      },
      body: JSON.stringify({
        performedAt: new Date().toISOString(),
        title: "x",
        sets: [{ exerciseName: "X", weight: 1, reps: 1 }],
      }),
    });
    const resp = await workoutsPOST(req as never);
    expect(resp.status).toBe(401);
  });

  it("returns 400 on empty sets array", async () => {
    await seedDeviceToken(U + "-empty", TOKEN + "-empty");
    const resp = await workoutsPOST(
      postRequest(TOKEN + "-empty", {
        performedAt: new Date().toISOString(),
        title: "x",
        sets: [],
      }) as never
    );
    expect(resp.status).toBe(400);
    await db.delete(deviceToken).where(eq(deviceToken.userId, U + "-empty"));
  });

  it("returns 400 on negative reps", async () => {
    await seedDeviceToken(U + "-neg", TOKEN + "-neg");
    const resp = await workoutsPOST(
      postRequest(TOKEN + "-neg", {
        performedAt: new Date().toISOString(),
        title: "x",
        sets: [{ exerciseName: "X", weight: 1, reps: -1 }],
      }) as never
    );
    expect(resp.status).toBe(400);
    await db.delete(deviceToken).where(eq(deviceToken.userId, U + "-neg"));
  });

  it("returns 400 on a non-ISO performedAt", async () => {
    await seedDeviceToken(U + "-date", TOKEN + "-date");
    const resp = await workoutsPOST(
      postRequest(TOKEN + "-date", {
        performedAt: "tuesday",
        title: "x",
        sets: [{ exerciseName: "X", weight: 1, reps: 1 }],
      }) as never
    );
    expect(resp.status).toBe(400);
    await db.delete(deviceToken).where(eq(deviceToken.userId, U + "-date"));
  });
});

describe("POST /api/workouts — dedup", () => {
  it("returns skipped=1 on a repeat post with the same contentHash", async () => {
    const dupUser = U + "-dup";
    const dupToken = TOKEN + "-dup";
    await seedDeviceToken(dupUser, dupToken);
    const body = {
      performedAt: new Date().toISOString(),
      title: "itest dup",
      sets: [{ exerciseName: "Squat", weight: 245, reps: 5 }],
    };
    const first = await workoutsPOST(postRequest(dupToken, body) as never);
    expect(first.status).toBe(200);
    expect((await first.json()).added).toBe(1);

    const second = await workoutsPOST(postRequest(dupToken, body) as never);
    expect(second.status).toBe(200);
    const sb = (await second.json()) as {
      ok: boolean;
      added: number;
      skipped: number;
    };
    expect(sb).toEqual({ ok: true, added: 0, skipped: 1 });

    // Still exactly one row.
    const ws = await db
      .select()
      .from(workout)
      .where(eq(workout.userId, dupUser));
    expect(ws.length).toBe(1);

    // Cleanup
    await db.delete(workoutSet).where(eq(workoutSet.userId, dupUser));
    await db.delete(workout).where(eq(workout.userId, dupUser));
    await db.delete(deviceToken).where(eq(deviceToken.userId, dupUser));
  });
});

describe("POST /api/workouts — user scoping", () => {
  it("writes rows under the token's userId, not anything in the payload", async () => {
    const scopedUser = U + "-scope";
    const scopedToken = TOKEN + "-scope";
    await seedDeviceToken(scopedUser, scopedToken);

    const resp = await workoutsPOST(
      postRequest(scopedToken, {
        performedAt: new Date().toISOString(),
        title: "scoping check",
        sets: [{ exerciseName: "Z", weight: 1, reps: 1 }],
      }) as never
    );
    expect(resp.status).toBe(200);

    const ws = await db
      .select()
      .from(workout)
      .where(eq(workout.userId, scopedUser));
    expect(ws.length).toBe(1);
    const sets = await db
      .select()
      .from(workoutSet)
      .where(eq(workoutSet.userId, scopedUser));
    expect(sets.length).toBe(1);

    await db.delete(workoutSet).where(eq(workoutSet.userId, scopedUser));
    await db.delete(workout).where(eq(workout.userId, scopedUser));
    await db.delete(deviceToken).where(eq(deviceToken.userId, scopedUser));
  });
});
