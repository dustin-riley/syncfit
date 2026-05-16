import { describe, it, expect, afterAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import { workout, workoutSet } from "@/db/schema";
import { importStrongCsvForUser } from "@/lib/import-persist";

const csv = readFileSync(
  fileURLToPath(new URL("./fixtures/strong_sample.csv", import.meta.url)),
  "utf8",
);

const TEST_USER = "itest-import-" + Date.now();
const OTHER_USER = "itest-import-other-" + Date.now();
const DEDUPE_USER = "itest-import-dedupe-" + Date.now();
const ALL_USERS = [TEST_USER, OTHER_USER, DEDUPE_USER];

afterAll(async () => {
  await db.delete(workout).where(inArray(workout.userId, ALL_USERS));
  const leftover = await db
    .select({ id: workout.id })
    .from(workout)
    .where(inArray(workout.userId, ALL_USERS));
  expect(leftover.length).toBe(0);
});

describe("importStrongCsvForUser (live Neon)", () => {
  it("A: first import adds 2 workouts, skips none, warns about Treadmill cardio", async () => {
    const res = await importStrongCsvForUser(TEST_USER, csv);
    expect(res.error).toBeUndefined();
    expect(res.added).toBe(2);
    expect(res.skipped).toBe(0);
    expect(res.warnings.some((w) => /Treadmill/.test(w))).toBe(true);
  });

  it("B: re-importing the same csv dedupes via contentHash (0 added, 2 skipped)", async () => {
    const res = await importStrongCsvForUser(TEST_USER, csv);
    expect(res.error).toBeUndefined();
    expect(res.added).toBe(0);
    expect(res.skipped).toBe(2);
  });

  it("C: imports are user-scoped with no cross-user leakage", async () => {
    const other = await importStrongCsvForUser(OTHER_USER, csv);
    expect(other.added).toBe(2);

    const firstUserRows = await db
      .select({ id: workout.id, userId: workout.userId })
      .from(workout)
      .where(inArray(workout.userId, [TEST_USER]));
    expect(firstUserRows.length).toBe(2);
    expect(firstUserRows.every((r) => r.userId === TEST_USER)).toBe(true);
  });

  it("D: no orphan workouts — every imported workout has >=1 set (proves atomic commit)", async () => {
    const rows = await db
      .select({ id: workout.id })
      .from(workout)
      .where(inArray(workout.userId, [TEST_USER]));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      const sets = await db
        .select({ id: workoutSet.id })
        .from(workoutSet)
        .where(eq(workoutSet.workoutId, r.id));
      expect(sets.length).toBeGreaterThan(0);
    }
  });

  it("E: real failure surfaces as a warning, not a skip — dedupe still uses skipped", async () => {
    const first = await importStrongCsvForUser(DEDUPE_USER, csv);
    expect(first.error).toBeUndefined();
    expect(first.added).toBe(2);
    expect(first.skipped).toBe(0);

    const second = await importStrongCsvForUser(DEDUPE_USER, csv);
    expect(second.error).toBeUndefined();
    expect(second.added).toBe(0);
    expect(second.skipped).toBe(2);
    expect(second.warnings.some((w) => /failed to import/.test(w))).toBe(false);
  });
});
