import { describe, it, expect, afterAll, vi } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { workout } from "@/db/schema";
import { importStrongCsvForUser } from "@/lib/import-persist";
import { logStrengthWorkout } from "@/lib/manual-log";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The action calls auth.api.getSession via next/headers. We stub both so the
// action believes there's a signed-in user, without booting a real auth flow.
const TEST_USER = "itest-progress-" + Date.now();
const ALL_USERS = [TEST_USER];

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/auth/auth", () => ({
  auth: {
    api: {
      getSession: async () => ({ user: { id: TEST_USER, email: "x@y" } }),
    },
  },
}));

const csv = readFileSync(
  fileURLToPath(new URL("./fixtures/strong_sample.csv", import.meta.url)),
  "utf8"
);

afterAll(async () => {
  await db.delete(workout).where(inArray(workout.userId, ALL_USERS));
  const leftover = await db
    .select({ id: workout.id })
    .from(workout)
    .where(inArray(workout.userId, ALL_USERS));
  expect(leftover.length).toBe(0);
});

describe("loadProgressData (live Neon)", () => {
  it("returns series built from imported CSV plus manual-logged workouts", async () => {
    const imp = await importStrongCsvForUser(TEST_USER, csv);
    expect(imp.error).toBeUndefined();
    expect(imp.added).toBeGreaterThan(0);

    // Add one manual strength workout for a brand-new exercise on a different
    // day so the series count and ordering are observable.
    const manual = await logStrengthWorkout(TEST_USER, {
      performedAt: new Date("2099-01-15T12:00:00Z"),
      title: "Manual session",
      sets: [
        { exerciseName: "Goblet Squat", weight: 50, reps: 10, setNumber: 1 },
        { exerciseName: "Goblet Squat", weight: 55, reps: 8, setNumber: 2 },
      ],
    });
    expect(manual.error).toBeUndefined();

    // Import action under test
    const { loadProgressData } = await import("@/app/actions/progress");
    const result = await loadProgressData();
    if (!("data" in result)) throw new Error("expected data branch");
    expect(result.error).toBeUndefined();
    expect(result.data.series.length).toBeGreaterThan(0);

    // Manual-logged "Goblet Squat" must appear exactly once with our two reps
    // collapsed to a single point (best set wins per day).
    const goblet = result.data.series.find(
      (s) => s.exerciseName === "Goblet Squat" && s.equipment === ""
    );
    expect(goblet).toBeDefined();
    expect(goblet!.points).toHaveLength(1);
    expect(goblet!.points[0].topSetWeight).toBe(55);

    // Default sort is most-recent-first → the far-future manual session
    // (2099) should sit ahead of older imported sessions.
    expect(result.data.series[0].exerciseName).toBe("Goblet Squat");
  });
});
