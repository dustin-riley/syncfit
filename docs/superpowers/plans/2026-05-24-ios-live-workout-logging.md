# iOS live workout logging — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add in-gym live strength-workout logging to the iOS companion: start from one of the planned weekday sessions (or blank), record sets as they happen with full mid-session editability, and commit the workout to the same `workout` / `workout_set` rows the web flows already write.

**Architecture:** Local-buffered draft in `Documents/live-workout.json` (single in-progress slot; 6h age-out; schema-versioned). Pure-Swift model + helpers (unit-testable); thin `@MainActor` `LiveWorkoutStore` wraps them and syncs the on-disk JSON on every mutation. Single atomic `POST /api/workouts` on Finish; route delegates to the existing `logStrengthWorkout` so live-logged workouts share rows, dedup, and downstream consumers (dashboard, AI readiness loader, progression suggester) with web manual entry. Sheet over a new TabView (Home + Log).

**Tech Stack:** Next.js 16 App Router + zod + Drizzle (server); SwiftUI + XCTest + XcodeGen (iOS). Spec: `docs/superpowers/specs/2026-05-24-ios-live-workout-logging-design.md`.

---

## File structure

### Server (web)

- **Create** `src/app/api/workouts/route.ts` — POST handler, zod schema, bearer auth, delegates to `logStrengthWorkout`.
- **Modify** `src/lib/manual-log.ts` — widen `logStrengthWorkout` signature to accept an optional `source` parameter (default `"manual"`).
- **Create** `tests/api-workouts.integration.test.ts` — direct invocation of the route handler against live Neon (matches the existing `tests/device-pair.integration.test.ts` pattern).

### iOS — pure model layer

- **Create** `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft.swift` — `LiveWorkoutDraft` (top-level Codable struct).
- **Create** `ios/SyncFit/SyncFit/LiveWorkout/DraftExercise.swift` — `DraftExercise`, `LoggedSet`, `PendingSet`.
- **Create** `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Builders.swift` — static factories `startFromPlan(planDay:now:)`, `startBlank(now:)`.
- **Create** `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+CurrentExercise.swift` — computed `currentExerciseIndex` (topmost not-done).
- **Create** `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Mutations.swift` — `appendLoggedSet`, `promotePending`, pending edits, `autoCommitDirty`, structural exercise mutations, logged-set edits.
- **Create** `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Payload.swift` — `flattenForPost()` (auto-commit dirty+valid pendings; drop dirty-invalid; return `[PostWorkoutSet]`).

### iOS — persistence + network + store

- **Create** `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutPersistence.swift` — file I/O against an injectable directory `URL`; load with age-out + schema-version guard.
- **Create** `ios/SyncFit/SyncFit/Models/PostWorkout.swift` — `PostWorkoutRequest`, `PostWorkoutSet`, `PostWorkoutResponse`.
- **Modify** `ios/SyncFit/SyncFit/Net/APIClient.swift` — add `postWorkout(_:) async throws -> PostWorkoutResponse`.
- **Create** `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutStore.swift` — `@MainActor ObservableObject` wrapping draft + persistence + API.

### iOS — UI

- **Create** `ios/SyncFit/SyncFit/Views/LiveWorkout/ActiveSetEntry.swift` — stepper block (weight ±5/±2.5, reps ±1, tap-to-type, Log set CTA).
- **Create** `ios/SyncFit/SyncFit/Views/LiveWorkout/ExerciseCard.swift` — done / current / upcoming variants.
- **Create** `ios/SyncFit/SyncFit/Views/LiveWorkout/FinishWorkoutSheet.swift` — title edit + Submit + result handling.
- **Create** `ios/SyncFit/SyncFit/Views/LiveWorkout/LiveWorkoutView.swift` — sheet root.
- **Create** `ios/SyncFit/SyncFit/Views/Log/LogView.swift` — Log tab chooser.
- **Modify** `ios/SyncFit/SyncFit/AppSession.swift` — own `LiveWorkoutStore`; expose `liveDraft`, `liveDraftAvailable`.
- **Modify** `ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift` — add Start CTA.
- **Modify** `ios/SyncFit/SyncFit/Views/HomeView.swift` — add resume banner.
- **Modify** `ios/SyncFit/SyncFit/Views/RootView.swift` — TabView (Home + Log) + `.sheet(item:)`.

### iOS — tests

- **Create** `ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift` — builders, current-exercise, mutations, payload.
- **Create** `ios/SyncFit/SyncFitTests/LiveWorkoutPersistenceTests.swift` — round-trip, age-out, schema mismatch, corrupted JSON, missing file.
- **Create** `ios/SyncFit/SyncFitTests/LiveWorkoutStoreTests.swift` — observable mutations, navigation auto-commit, discard, double-start guard.
- **Create** `ios/SyncFit/SyncFitTests/PostWorkoutCodableTests.swift` — wire-format JSON match.

---

## Task 1: `logStrengthWorkout` accepts `source` parameter

**Files:**
- Modify: `src/lib/manual-log.ts:117-165`
- Test: `tests/manual-log.test.ts` (append new `describe`)

- [ ] **Step 1: Write the failing test**

Append to `tests/manual-log.test.ts`:

```typescript
import { strengthContentHash } from "@/lib/manual-log";

describe("strengthContentHash", () => {
  it("is stable for the same input", () => {
    const a = strengthContentHash(goodStrength);
    const b = strengthContentHash(goodStrength);
    expect(a).toBe(b);
    expect(a).toHaveLength(64);
  });
});

// New test: signature accepts an optional source string.
// The function dynamically imports @/db, so a unit test can only assert the
// signature compiles and validation runs. The DB write path is asserted in
// the integration test (Task 3). This test just locks the signature.
describe("logStrengthWorkout signature", () => {
  it("accepts a third source argument without breaking the type", () => {
    // Compile-only check: the import below would fail to type-check if the
    // optional third arg were removed or renamed. We don't actually invoke
    // the function (it would need a DB) — the assignment is enough.
    const fn: (
      userId: string,
      input: ManualStrengthInput,
      source?: string
    ) => Promise<unknown> = logStrengthWorkout;
    expect(typeof fn).toBe("function");
  });
});
```

Add `logStrengthWorkout` to the imports at the top of the file.

- [ ] **Step 2: Run tests to verify the signature test fails**

```bash
npm test -- tests/manual-log.test.ts
```

Expected: type-check error on the signature test (function takes 2 args, not 3) — Vitest reports a TS error before running.

- [ ] **Step 3: Widen the signature**

In `src/lib/manual-log.ts`, change:

```typescript
export async function logStrengthWorkout(
  userId: string,
  input: ManualStrengthInput
): Promise<LogResult> {
```

to:

```typescript
export async function logStrengthWorkout(
  userId: string,
  input: ManualStrengthInput,
  source: string = "manual"
): Promise<LogResult> {
```

Then in the same function, change the `source: "manual"` literal in the insert payload to use the parameter:

Find:
```typescript
      .values({
        userId,
        performedAt: input.performedAt,
        title: input.title.trim() || "Workout",
        source: "manual",
        contentHash: strengthContentHash(input),
      })
```

Replace with:
```typescript
      .values({
        userId,
        performedAt: input.performedAt,
        title: input.title.trim() || "Workout",
        source,
        contentHash: strengthContentHash(input),
      })
```

- [ ] **Step 4: Run tests to verify pass**

```bash
npm test -- tests/manual-log.test.ts
```

Expected: PASS.

- [ ] **Step 5: Run the full unit suite + type check**

```bash
npm test && npx tsc --noEmit
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/manual-log.ts tests/manual-log.test.ts
git commit -m "feat(manual-log): logStrengthWorkout accepts optional source param"
```

---

## Task 2: `POST /api/workouts` — happy path

**Files:**
- Create: `src/app/api/workouts/route.ts`
- Test: `tests/api-workouts.integration.test.ts`

- [ ] **Step 1: Write the failing integration test (happy path)**

Create `tests/api-workouts.integration.test.ts`:

```typescript
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
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
npm run test:integration -- tests/api-workouts.integration.test.ts
```

Expected: FAIL — `POST` import resolves to undefined / module not found, because the route doesn't exist yet.

- [ ] **Step 3: Create the route**

Create `src/app/api/workouts/route.ts`:

```typescript
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

  const res = await logStrengthWorkout(
    device.userId,
    {
      performedAt: new Date(parsed.data.performedAt),
      title: parsed.data.title,
      sets: sequenceStrengthSets(raw),
    },
    "ios_live"
  );

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
```

- [ ] **Step 4: Run the test to verify pass**

```bash
npm run test:integration -- tests/api-workouts.integration.test.ts
```

Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add src/app/api/workouts/route.ts tests/api-workouts.integration.test.ts
git commit -m "feat(api): POST /api/workouts — happy path"
```

---

## Task 3: `POST /api/workouts` — error paths (auth, validation, dedup, scoping)

**Files:**
- Test: `tests/api-workouts.integration.test.ts` (append)

- [ ] **Step 1: Add the failing tests for auth + validation + dedup + scoping**

Append to `tests/api-workouts.integration.test.ts`:

```typescript
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
      headers: { "content-type": "application/json", authorization: "Bearer not_a_token!!" },
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
    const sb = (await second.json()) as { ok: boolean; added: number; skipped: number };
    expect(sb).toEqual({ ok: true, added: 0, skipped: 1 });

    // Still exactly one row.
    const ws = await db.select().from(workout).where(eq(workout.userId, dupUser));
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
```

- [ ] **Step 2: Run the tests to verify they pass**

```bash
npm run test:integration -- tests/api-workouts.integration.test.ts
```

Expected: PASS (all describe blocks). The route from Task 2 already handles these cases — these tests *lock the behavior in*.

- [ ] **Step 3: Run the full standard gate**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run format:check && npm run build
```

Expected: all PASS. (Integration tests are excluded from `npm test`.)

- [ ] **Step 4: Commit**

```bash
git add tests/api-workouts.integration.test.ts
git commit -m "test(api-workouts): auth / validation / dedup / scoping"
```

---

## Task 4: iOS — pure model types (`LiveWorkoutDraft`, `DraftExercise`, `LoggedSet`, `PendingSet`)

**Files:**
- Create: `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft.swift`
- Create: `ios/SyncFit/SyncFit/LiveWorkout/DraftExercise.swift`

- [ ] **Step 1: Create the model files**

Create `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft.swift`:

```swift
import Foundation

// The single in-progress workout. Persisted as Documents/live-workout.json.
// Bump LiveWorkoutDraft.currentSchemaVersion any time the on-disk shape changes;
// persistence discards files with a mismatched version on load (no migrations
// for a single-row local cache — single in-progress slot, low cost to lose).
struct LiveWorkoutDraft: Codable, Equatable, Identifiable {
    static let currentSchemaVersion: Int = 1

    let id: UUID
    let startedAt: Date
    var title: String
    var exercises: [DraftExercise]
    let schemaVersion: Int
}
```

Create `ios/SyncFit/SyncFit/LiveWorkout/DraftExercise.swift`:

```swift
import Foundation

struct DraftExercise: Codable, Equatable, Identifiable {
    let id: UUID
    var name: String
    var targetSets: Int?
    var targetReps: Int?
    var targetWeight: Double?
    var loggedSets: [LoggedSet]
    var pendingSet: PendingSet?
}

struct LoggedSet: Codable, Equatable, Identifiable {
    let id: UUID
    var weight: Double
    var reps: Int
    let loggedAt: Date
}

struct PendingSet: Codable, Equatable {
    var weight: Double
    var reps: Int
    // Flipped true by any user-driven mutation (stepper / tap-to-type). Gates
    // auto-commit on navigate / Finish. Untouched pendings are never persisted
    // as logged sets (no fabrication).
    var dirty: Bool
}
```

- [ ] **Step 2: Regenerate the Xcode project so XcodeGen picks up the new files**

```bash
cd ios/SyncFit && xcodegen generate
```

Expected: "Loaded project" + "Generated project successfully".

- [ ] **Step 3: Build to verify it compiles**

```bash
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD SUCCEEDED. (Tip: if you don't have the iPhone 17 Pro simulator, swap to any name from `xcrun simctl list devices available`.)

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft.swift \
        ios/SyncFit/SyncFit/LiveWorkout/DraftExercise.swift
git commit -m "feat(ios): LiveWorkoutDraft + DraftExercise model types"
```

---

## Task 5: iOS — `startFromPlan` + `startBlank` builders

**Files:**
- Create: `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Builders.swift`
- Test: `ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift`

- [ ] **Step 1: Write the failing tests**

Create `ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift`:

```swift
import XCTest
@testable import SyncFit

final class LiveWorkoutDraftTests: XCTestCase {

    private func plan(_ exercises: [(String, Int, Int, Double)]) -> PlanDay {
        PlanDay(
            dayOfWeek: 1,
            title: "Pull Day",
            notes: "",
            modality: "strength",
            exercises: exercises.map { (name, s, r, w) in
                PlanExercise(id: UUID().uuidString, name: name,
                             targetSets: s, targetReps: r, targetWeight: w)
            }
        )
    }

    private let now = Date(timeIntervalSince1970: 1_716_500_000)

    // MARK: builders

    func testStartFromPlanCopiesExercisesAndTitle() {
        let d = LiveWorkoutDraft.startFromPlan(
            planDay: plan([
                ("Pull-ups", 4, 8, 0),
                ("Barbell Row", 4, 8, 135),
            ]),
            now: now
        )
        XCTAssertEqual(d.title, "Pull Day")
        XCTAssertEqual(d.startedAt, now)
        XCTAssertEqual(d.schemaVersion, LiveWorkoutDraft.currentSchemaVersion)
        XCTAssertEqual(d.exercises.count, 2)
        XCTAssertEqual(d.exercises[0].name, "Pull-ups")
        XCTAssertEqual(d.exercises[0].targetSets, 4)
        XCTAssertEqual(d.exercises[0].targetReps, 8)
        XCTAssertEqual(d.exercises[0].targetWeight, 0)
        XCTAssertTrue(d.exercises[0].loggedSets.isEmpty)
        XCTAssertNil(d.exercises[0].pendingSet)
        XCTAssertEqual(d.exercises[1].targetWeight, 135)
    }

    func testStartFromPlanFallsBackToWorkoutTitleWhenPlanTitleIsEmpty() {
        let day = PlanDay(dayOfWeek: 0, title: "  ", notes: "", modality: "rest", exercises: [])
        let d = LiveWorkoutDraft.startFromPlan(planDay: day, now: now)
        XCTAssertEqual(d.title, "Workout")
        XCTAssertTrue(d.exercises.isEmpty)
    }

    func testStartBlankYieldsEmptyDraftWithDefaultTitle() {
        let d = LiveWorkoutDraft.startBlank(now: now)
        XCTAssertEqual(d.title, "Workout")
        XCTAssertEqual(d.startedAt, now)
        XCTAssertEqual(d.schemaVersion, LiveWorkoutDraft.currentSchemaVersion)
        XCTAssertTrue(d.exercises.isEmpty)
    }
}
```

- [ ] **Step 2: Add the test source path and regenerate**

The test target's `sources: - path: SyncFitTests` already picks up new files in that directory — no `project.yml` change needed, but the project must be regenerated:

```bash
cd ios/SyncFit && xcodegen generate
```

- [ ] **Step 3: Run the tests to verify they fail**

```bash
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -20
```

Expected: compile error — `startFromPlan` and `startBlank` don't exist yet.

- [ ] **Step 4: Add the builders**

Create `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Builders.swift`:

```swift
import Foundation

extension LiveWorkoutDraft {
    static func startFromPlan(planDay: PlanDay, now: Date = Date()) -> LiveWorkoutDraft {
        let title = planDay.title.trimmingCharacters(in: .whitespacesAndNewlines)
        return LiveWorkoutDraft(
            id: UUID(),
            startedAt: now,
            title: title.isEmpty ? "Workout" : title,
            exercises: planDay.exercises.map { p in
                DraftExercise(
                    id: UUID(),
                    name: p.name,
                    targetSets: p.targetSets,
                    targetReps: p.targetReps,
                    targetWeight: p.targetWeight,
                    loggedSets: [],
                    pendingSet: nil
                )
            },
            schemaVersion: LiveWorkoutDraft.currentSchemaVersion
        )
    }

    static func startBlank(now: Date = Date()) -> LiveWorkoutDraft {
        LiveWorkoutDraft(
            id: UUID(),
            startedAt: now,
            title: "Workout",
            exercises: [],
            schemaVersion: LiveWorkoutDraft.currentSchemaVersion
        )
    }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutDraftTests 2>&1 | tail -10
```

Expected: `Test Suite 'LiveWorkoutDraftTests' passed`.

- [ ] **Step 6: Commit**

```bash
git add ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Builders.swift \
        ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift
git commit -m "feat(ios): LiveWorkoutDraft startFromPlan + startBlank builders"
```

---

## Task 6: iOS — `currentExerciseIndex` computation

**Files:**
- Create: `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+CurrentExercise.swift`
- Test: `ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift` (append)

- [ ] **Step 1: Write the failing tests (append to `LiveWorkoutDraftTests.swift`)**

```swift
    // MARK: current-exercise

    private func draft(_ exercises: [DraftExercise]) -> LiveWorkoutDraft {
        LiveWorkoutDraft(
            id: UUID(), startedAt: now, title: "t",
            exercises: exercises,
            schemaVersion: LiveWorkoutDraft.currentSchemaVersion
        )
    }

    private func ex(target: Int?, logged: Int) -> DraftExercise {
        DraftExercise(
            id: UUID(), name: "Ex", targetSets: target,
            targetReps: 8, targetWeight: 100,
            loggedSets: (0..<logged).map { _ in
                LoggedSet(id: UUID(), weight: 100, reps: 8, loggedAt: now)
            },
            pendingSet: nil
        )
    }

    func testCurrentIsFirstExerciseWithNothingLogged() {
        let d = draft([ex(target: 4, logged: 0), ex(target: 4, logged: 0)])
        XCTAssertEqual(d.currentExerciseIndex, 0)
    }

    func testCurrentAdvancesPastFinishedExercise() {
        let d = draft([ex(target: 4, logged: 4), ex(target: 4, logged: 1)])
        XCTAssertEqual(d.currentExerciseIndex, 1)
    }

    func testUnplannedExerciseNeverAutoFinishes() {
        // target=nil means "no planned set count"; treated as infinite.
        let d = draft([ex(target: nil, logged: 99)])
        XCTAssertEqual(d.currentExerciseIndex, 0)
    }

    func testCurrentReturnsNilWhenAllPlannedDone() {
        let d = draft([ex(target: 4, logged: 4), ex(target: 3, logged: 3)])
        XCTAssertNil(d.currentExerciseIndex)
    }

    func testCurrentReturnsNilOnEmptyDraft() {
        XCTAssertNil(draft([]).currentExerciseIndex)
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutDraftTests 2>&1 | tail -10
```

Expected: compile error — `currentExerciseIndex` doesn't exist.

- [ ] **Step 3: Add the computed property**

Create `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+CurrentExercise.swift`:

```swift
import Foundation

extension LiveWorkoutDraft {
    // The topmost exercise where loggedSets.count < (targetSets ?? Int.max).
    // Auto-advances when an exercise hits its planned set count. Tapping an
    // upcoming exercise overrides this — see LiveWorkoutStore for the override
    // path; this computed property is the default.
    var currentExerciseIndex: Int? {
        exercises.firstIndex { e in
            e.loggedSets.count < (e.targetSets ?? Int.max)
        }
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutDraftTests 2>&1 | tail -10
```

Expected: all `LiveWorkoutDraftTests` PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+CurrentExercise.swift \
        ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift
git commit -m "feat(ios): LiveWorkoutDraft currentExerciseIndex"
```

---

## Task 7: iOS — pending-set + structural mutations

**Files:**
- Create: `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Mutations.swift`
- Test: `ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift` (append)

- [ ] **Step 1: Write the failing tests (append to `LiveWorkoutDraftTests.swift`)**

```swift
    // MARK: mutations — pending

    func testPreparePendingForUnplannedExerciseUsesZeros() {
        var d = draft([ex(target: nil, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, false)
    }

    func testPreparePendingUsesPlanTargetOnFirstSet() {
        var d = draft([ex(target: 4, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 100) // from ex() fixture
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 8)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, false)
    }

    func testPreparePendingUsesLastLoggedSetOnSubsequentSets() {
        var e = ex(target: 4, logged: 0)
        e.loggedSets = [LoggedSet(id: UUID(), weight: 142.5, reps: 7, loggedAt: now)]
        var d = draft([e])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 142.5)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 7)
    }

    func testPreparePendingDoesNotOverwriteAnExistingPending() {
        var e = ex(target: 4, logged: 0)
        e.pendingSet = PendingSet(weight: 200, reps: 3, dirty: true)
        var d = draft([e])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 200)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 3)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, true)
    }

    func testSetPendingWeightFlipsDirty() {
        var d = draft([ex(target: 4, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, false)
        d.setPendingWeight(140, forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 140)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, true)
    }

    func testSetPendingRepsFlipsDirty() {
        var d = draft([ex(target: 4, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        d.setPendingReps(7, forExerciseIndex: 0)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 7)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, true)
    }

    func testPromotePendingAppendsLoggedAndResetsPending() {
        var d = draft([ex(target: 4, logged: 0)])
        d.preparePendingIfNeeded(forExerciseIndex: 0)
        d.setPendingWeight(135, forExerciseIndex: 0)
        d.setPendingReps(8, forExerciseIndex: 0)
        d.promotePending(forExerciseIndex: 0, now: now)
        XCTAssertEqual(d.exercises[0].loggedSets.count, 1)
        XCTAssertEqual(d.exercises[0].loggedSets[0].weight, 135)
        XCTAssertEqual(d.exercises[0].loggedSets[0].reps, 8)
        // Pending was reset, pre-filled from the just-logged values, dirty=false.
        XCTAssertEqual(d.exercises[0].pendingSet?.weight, 135)
        XCTAssertEqual(d.exercises[0].pendingSet?.reps, 8)
        XCTAssertEqual(d.exercises[0].pendingSet?.dirty, false)
    }

    func testAutoCommitDirtyOnlyFiresWhenDirtyAndValid() {
        // dirty + valid → committed
        var d1 = draft([ex(target: 4, logged: 0)])
        d1.preparePendingIfNeeded(forExerciseIndex: 0)
        d1.setPendingReps(8, forExerciseIndex: 0)
        d1.autoCommitDirty(forExerciseIndex: 0, now: now)
        XCTAssertEqual(d1.exercises[0].loggedSets.count, 1)

        // dirty + invalid (reps == 0) → preserved on exercise, NOT logged
        var d2 = draft([ex(target: 4, logged: 0)])
        d2.exercises[0].pendingSet = PendingSet(weight: 135, reps: 0, dirty: true)
        d2.autoCommitDirty(forExerciseIndex: 0, now: now)
        XCTAssertEqual(d2.exercises[0].loggedSets.count, 0)
        XCTAssertEqual(d2.exercises[0].pendingSet?.weight, 135) // preserved

        // not dirty → never committed (no fabrication)
        var d3 = draft([ex(target: 4, logged: 0)])
        d3.preparePendingIfNeeded(forExerciseIndex: 0)
        d3.autoCommitDirty(forExerciseIndex: 0, now: now)
        XCTAssertEqual(d3.exercises[0].loggedSets.count, 0)
    }

    // MARK: mutations — structural

    func testAddExerciseAppendsAtTheBottom() {
        var d = draft([ex(target: 4, logged: 0)])
        d.addExercise(name: "Curl")
        XCTAssertEqual(d.exercises.count, 2)
        XCTAssertEqual(d.exercises[1].name, "Curl")
        XCTAssertNil(d.exercises[1].targetSets) // unplanned
        XCTAssertTrue(d.exercises[1].loggedSets.isEmpty)
    }

    func testRemoveExercise() {
        var d = draft([ex(target: 4, logged: 0), ex(target: 3, logged: 0)])
        d.removeExercise(at: 0)
        XCTAssertEqual(d.exercises.count, 1)
    }

    func testMoveExercise() {
        var d = draft([
            { var e = ex(target: 4, logged: 0); e.name = "A"; return e }(),
            { var e = ex(target: 4, logged: 0); e.name = "B"; return e }(),
        ])
        d.moveExercise(from: 0, to: 2) // SwiftUI move semantics: to = insertion index
        XCTAssertEqual(d.exercises.map(\.name), ["B", "A"])
    }

    func testRenameExercise() {
        var d = draft([ex(target: 4, logged: 0)])
        d.renameExercise(at: 0, to: "  Pull-ups  ")
        XCTAssertEqual(d.exercises[0].name, "Pull-ups")
    }

    func testEditLoggedSet() {
        var e = ex(target: 4, logged: 1)
        let setId = e.loggedSets[0].id
        var d = draft([e])
        d.editLoggedSet(exerciseIndex: 0, setId: setId, weight: 140, reps: 6)
        XCTAssertEqual(d.exercises[0].loggedSets[0].weight, 140)
        XCTAssertEqual(d.exercises[0].loggedSets[0].reps, 6)
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutDraftTests 2>&1 | tail -20
```

Expected: compile errors — none of the mutation functions exist.

- [ ] **Step 3: Add the mutations**

Create `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Mutations.swift`:

```swift
import Foundation

extension LiveWorkoutDraft {

    // MARK: pending-set lifecycle

    mutating func preparePendingIfNeeded(forExerciseIndex i: Int) {
        guard exercises.indices.contains(i),
              exercises[i].pendingSet == nil else { return }
        let e = exercises[i]
        let pre: PendingSet
        if let last = e.loggedSets.last {
            pre = PendingSet(weight: last.weight, reps: last.reps, dirty: false)
        } else {
            pre = PendingSet(
                weight: e.targetWeight ?? 0,
                reps: e.targetReps ?? 0,
                dirty: false
            )
        }
        exercises[i].pendingSet = pre
    }

    mutating func setPendingWeight(_ w: Double, forExerciseIndex i: Int) {
        guard exercises.indices.contains(i) else { return }
        preparePendingIfNeeded(forExerciseIndex: i)
        exercises[i].pendingSet?.weight = w
        exercises[i].pendingSet?.dirty = true
    }

    mutating func setPendingReps(_ r: Int, forExerciseIndex i: Int) {
        guard exercises.indices.contains(i) else { return }
        preparePendingIfNeeded(forExerciseIndex: i)
        exercises[i].pendingSet?.reps = r
        exercises[i].pendingSet?.dirty = true
    }

    // Append current pending → loggedSets, reset pending pre-filled from the
    // just-logged values (dirty=false).
    mutating func promotePending(forExerciseIndex i: Int, now: Date = Date()) {
        guard exercises.indices.contains(i),
              let p = exercises[i].pendingSet else { return }
        let logged = LoggedSet(id: UUID(), weight: p.weight, reps: p.reps, loggedAt: now)
        exercises[i].loggedSets.append(logged)
        exercises[i].pendingSet = PendingSet(weight: p.weight, reps: p.reps, dirty: false)
    }

    // Promote only if dirty AND valid (reps >= 1). Dirty-but-invalid pendings
    // survive on the exercise so the user keeps any values they entered.
    mutating func autoCommitDirty(forExerciseIndex i: Int, now: Date = Date()) {
        guard exercises.indices.contains(i),
              let p = exercises[i].pendingSet,
              p.dirty, p.reps >= 1 else { return }
        promotePending(forExerciseIndex: i, now: now)
    }

    // MARK: structural — exercises

    mutating func addExercise(name: String, now: Date = Date()) {
        let trimmed = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        exercises.append(
            DraftExercise(
                id: UUID(), name: trimmed,
                targetSets: nil, targetReps: nil, targetWeight: nil,
                loggedSets: [], pendingSet: nil
            )
        )
    }

    mutating func removeExercise(at i: Int) {
        guard exercises.indices.contains(i) else { return }
        exercises.remove(at: i)
    }

    // SwiftUI's onMove semantics: `to` is the destination index in the array
    // AFTER the source has been removed. Forward `IndexSet`/destination as-is.
    mutating func moveExercise(from source: Int, to destination: Int) {
        guard exercises.indices.contains(source) else { return }
        exercises.move(fromOffsets: IndexSet(integer: source), toOffset: destination)
    }

    mutating func renameExercise(at i: Int, to newName: String) {
        guard exercises.indices.contains(i) else { return }
        let trimmed = newName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        exercises[i].name = trimmed
    }

    // MARK: structural — logged sets

    mutating func editLoggedSet(exerciseIndex i: Int, setId: UUID, weight: Double, reps: Int) {
        guard exercises.indices.contains(i),
              let s = exercises[i].loggedSets.firstIndex(where: { $0.id == setId }) else { return }
        exercises[i].loggedSets[s].weight = weight
        exercises[i].loggedSets[s].reps = reps
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutDraftTests 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Mutations.swift \
        ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift
git commit -m "feat(ios): LiveWorkoutDraft pending + structural mutations"
```

---

## Task 8: iOS — `flattenForPost()` payload builder

**Files:**
- Create: `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Payload.swift`
- Test: `ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift` (append)

- [ ] **Step 1: Write the failing tests (append to `LiveWorkoutDraftTests.swift`)**

```swift
    // MARK: payload

    func testFlattenForPostIncludesAllLoggedSetsInOrder() {
        var e1 = ex(target: 4, logged: 0)
        e1.name = "Pull-ups"
        e1.loggedSets = [
            LoggedSet(id: UUID(), weight: 0, reps: 10, loggedAt: now),
            LoggedSet(id: UUID(), weight: 0, reps: 9, loggedAt: now),
        ]
        var e2 = ex(target: 4, logged: 0)
        e2.name = "Barbell Row"
        e2.loggedSets = [
            LoggedSet(id: UUID(), weight: 135, reps: 8, loggedAt: now),
        ]
        let d = draft([e1, e2])
        let (payload, _) = d.flattenForPost(now: now)
        XCTAssertEqual(payload.count, 3)
        XCTAssertEqual(payload[0].exerciseName, "Pull-ups")
        XCTAssertEqual(payload[0].reps, 10)
        XCTAssertEqual(payload[2].exerciseName, "Barbell Row")
    }

    func testFlattenForPostAutoCommitsDirtyValidPendings() {
        var d = draft([ex(target: 4, logged: 0)])
        d.exercises[0].pendingSet = PendingSet(weight: 135, reps: 8, dirty: true)
        let (payload, mutated) = d.flattenForPost(now: now)
        XCTAssertEqual(payload.count, 1)
        XCTAssertEqual(payload[0].weight, 135)
        // The returned mutated draft reflects the promotion (caller persists it).
        XCTAssertEqual(mutated.exercises[0].loggedSets.count, 1)
    }

    func testFlattenForPostSkipsDirtyButInvalidPendings() {
        var d = draft([ex(target: 4, logged: 0)])
        d.exercises[0].pendingSet = PendingSet(weight: 135, reps: 0, dirty: true)
        let (payload, mutated) = d.flattenForPost(now: now)
        XCTAssertTrue(payload.isEmpty)
        XCTAssertTrue(mutated.exercises[0].loggedSets.isEmpty)
        // Pending preserved so the user can fix on Resume.
        XCTAssertEqual(mutated.exercises[0].pendingSet?.weight, 135)
    }

    func testFlattenForPostSkipsUntouchedPendings() {
        var d = draft([ex(target: 4, logged: 0)])
        d.exercises[0].pendingSet = PendingSet(weight: 135, reps: 8, dirty: false)
        let (payload, _) = d.flattenForPost(now: now)
        XCTAssertTrue(payload.isEmpty)
    }

    func testFlattenForPostIsEmptyForEmptyDraft() {
        let (payload, _) = draft([]).flattenForPost(now: now)
        XCTAssertTrue(payload.isEmpty)
    }
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutDraftTests 2>&1 | tail -10
```

Expected: compile error — `flattenForPost` and `PostWorkoutSet` don't exist.

- [ ] **Step 3: Add `PostWorkoutSet` and `flattenForPost`**

Create `ios/SyncFit/SyncFit/Models/PostWorkout.swift` (placeholder for now; full models come in Task 10):

```swift
import Foundation

struct PostWorkoutSet: Codable, Equatable {
    let exerciseName: String
    let weight: Double
    let reps: Int
}
```

Create `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Payload.swift`:

```swift
import Foundation

extension LiveWorkoutDraft {
    // Returns the flat `[PostWorkoutSet]` payload (in exercise order, then
    // per-exercise insertion order) AND the mutated draft after auto-committing
    // dirty+valid pendings. The caller (LiveWorkoutStore.finish) persists the
    // mutated draft to disk before the POST so that a crash mid-POST doesn't
    // lose the auto-committed sets.
    func flattenForPost(now: Date = Date()) -> (payload: [PostWorkoutSet], mutated: LiveWorkoutDraft) {
        var copy = self
        for i in copy.exercises.indices {
            copy.autoCommitDirty(forExerciseIndex: i, now: now)
        }
        var out: [PostWorkoutSet] = []
        for e in copy.exercises {
            for s in e.loggedSets {
                out.append(PostWorkoutSet(exerciseName: e.name, weight: s.weight, reps: s.reps))
            }
        }
        return (out, copy)
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutDraftTests 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/SyncFit/SyncFit/Models/PostWorkout.swift \
        ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutDraft+Payload.swift \
        ios/SyncFit/SyncFitTests/LiveWorkoutDraftTests.swift
git commit -m "feat(ios): LiveWorkoutDraft flattenForPost payload builder"
```

---

## Task 9: iOS — `LiveWorkoutPersistence`

**Files:**
- Create: `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutPersistence.swift`
- Create: `ios/SyncFit/SyncFitTests/LiveWorkoutPersistenceTests.swift`

- [ ] **Step 1: Write the failing tests**

Create `ios/SyncFit/SyncFitTests/LiveWorkoutPersistenceTests.swift`:

```swift
import XCTest
@testable import SyncFit

final class LiveWorkoutPersistenceTests: XCTestCase {

    private var tmpDir: URL!
    private var persistence: LiveWorkoutPersistence!

    override func setUp() {
        super.setUp()
        tmpDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("live-workout-tests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        persistence = LiveWorkoutPersistence(directory: tmpDir, maxAge: 6 * 60 * 60)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tmpDir)
        super.tearDown()
    }

    private func sample(startedAt: Date = Date()) -> LiveWorkoutDraft {
        LiveWorkoutDraft(
            id: UUID(),
            startedAt: startedAt,
            title: "T",
            exercises: [],
            schemaVersion: LiveWorkoutDraft.currentSchemaVersion
        )
    }

    func testLoadReturnsNilForMissingFile() {
        XCTAssertNil(persistence.load(now: Date()))
    }

    func testSaveLoadRoundTrip() {
        let d = sample()
        persistence.save(d)
        let loaded = persistence.load(now: Date())
        XCTAssertEqual(loaded, d)
    }

    func testLoadDeletesAndReturnsNilOnExpiredDraft() {
        let stale = sample(startedAt: Date(timeIntervalSinceNow: -7 * 60 * 60))
        persistence.save(stale)
        XCTAssertNil(persistence.load(now: Date()))
        // File was deleted.
        XCTAssertFalse(FileManager.default.fileExists(atPath: persistence.fileURL.path))
    }

    func testLoadDeletesAndReturnsNilOnSchemaMismatch() {
        let weirdJSON = """
        {"id":"\(UUID().uuidString)","startedAt":\(Date().timeIntervalSinceReferenceDate),"title":"T","exercises":[],"schemaVersion":99}
        """.data(using: .utf8)!
        try! weirdJSON.write(to: persistence.fileURL)
        XCTAssertNil(persistence.load(now: Date()))
        XCTAssertFalse(FileManager.default.fileExists(atPath: persistence.fileURL.path))
    }

    func testLoadDeletesAndReturnsNilOnCorruptedJSON() {
        try! Data("not-json".utf8).write(to: persistence.fileURL)
        XCTAssertNil(persistence.load(now: Date()))
        XCTAssertFalse(FileManager.default.fileExists(atPath: persistence.fileURL.path))
    }

    func testClearRemovesTheFile() {
        persistence.save(sample())
        XCTAssertTrue(FileManager.default.fileExists(atPath: persistence.fileURL.path))
        persistence.clear()
        XCTAssertFalse(FileManager.default.fileExists(atPath: persistence.fileURL.path))
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutPersistenceTests 2>&1 | tail -10
```

Expected: compile error — `LiveWorkoutPersistence` doesn't exist.

- [ ] **Step 3: Implement persistence**

Create `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutPersistence.swift`:

```swift
import Foundation

struct LiveWorkoutPersistence {
    let directory: URL
    let maxAge: TimeInterval

    init(
        directory: URL = LiveWorkoutPersistence.defaultDirectory(),
        maxAge: TimeInterval = 6 * 60 * 60
    ) {
        self.directory = directory
        self.maxAge = maxAge
    }

    static func defaultDirectory() -> URL {
        // Documents/. Safe in app sandbox; survives launches; NOT in caches
        // (we never want the OS to evict an in-progress workout).
        FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0]
    }

    var fileURL: URL { directory.appendingPathComponent("live-workout.json") }

    private static let encoder: JSONEncoder = {
        let e = JSONEncoder()
        e.dateEncodingStrategy = .iso8601
        return e
    }()

    private static let decoder: JSONDecoder = {
        let d = JSONDecoder()
        d.dateDecodingStrategy = .iso8601
        return d
    }()

    func load(now: Date = Date()) -> LiveWorkoutDraft? {
        guard FileManager.default.fileExists(atPath: fileURL.path) else { return nil }
        do {
            let data = try Data(contentsOf: fileURL)
            let draft = try Self.decoder.decode(LiveWorkoutDraft.self, from: data)
            if draft.schemaVersion != LiveWorkoutDraft.currentSchemaVersion {
                clear(); return nil
            }
            if now.timeIntervalSince(draft.startedAt) > maxAge {
                clear(); return nil
            }
            return draft
        } catch {
            // Corrupted JSON, key mismatch, etc. — discard and start fresh.
            clear()
            return nil
        }
    }

    func save(_ draft: LiveWorkoutDraft) {
        do {
            let data = try Self.encoder.encode(draft)
            try data.write(to: fileURL, options: .atomic)
        } catch {
            // Write failure is non-fatal — in-memory state continues.
            // Next successful write recovers.
            print("LiveWorkoutPersistence.save failed: \(error)")
        }
    }

    func clear() {
        try? FileManager.default.removeItem(at: fileURL)
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutPersistenceTests 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutPersistence.swift \
        ios/SyncFit/SyncFitTests/LiveWorkoutPersistenceTests.swift
git commit -m "feat(ios): LiveWorkoutPersistence (Documents JSON, age-out, schema guard)"
```

---

## Task 10: iOS — `PostWorkout` models + `APIClient.postWorkout`

**Files:**
- Modify: `ios/SyncFit/SyncFit/Models/PostWorkout.swift` (created in Task 8, extend here)
- Modify: `ios/SyncFit/SyncFit/Net/APIClient.swift:1-88`
- Create: `ios/SyncFit/SyncFitTests/PostWorkoutCodableTests.swift`

- [ ] **Step 1: Write the failing Codable wire-format tests**

Create `ios/SyncFit/SyncFitTests/PostWorkoutCodableTests.swift`:

```swift
import XCTest
@testable import SyncFit

final class PostWorkoutCodableTests: XCTestCase {

    func testRequestEncodesAsServerExpects() throws {
        let req = PostWorkoutRequest(
            performedAt: Date(timeIntervalSince1970: 1_716_500_000),
            title: "Pull Day",
            sets: [
                PostWorkoutSet(exerciseName: "Pull-ups", weight: 0, reps: 10),
                PostWorkoutSet(exerciseName: "Barbell Row", weight: 135, reps: 8),
            ]
        )
        let enc = JSONEncoder()
        enc.dateEncodingStrategy = .iso8601
        enc.outputFormatting = [.sortedKeys]
        let data = try enc.encode(req)
        let s = String(data: data, encoding: .utf8)!
        XCTAssertTrue(s.contains("\"performedAt\":\"2024-05-23T22:53:20Z\""))
        XCTAssertTrue(s.contains("\"title\":\"Pull Day\""))
        XCTAssertTrue(s.contains("\"exerciseName\":\"Pull-ups\""))
        XCTAssertTrue(s.contains("\"weight\":0"))
        XCTAssertTrue(s.contains("\"reps\":10"))
    }

    func testResponseDecodesHappyPath() throws {
        let json = #"{"ok":true,"added":1,"skipped":0}"#.data(using: .utf8)!
        let resp = try JSONDecoder().decode(PostWorkoutResponse.self, from: json)
        XCTAssertTrue(resp.ok)
        XCTAssertEqual(resp.added, 1)
        XCTAssertEqual(resp.skipped, 0)
        XCTAssertNil(resp.error)
    }

    func testResponseDecodesSkippedDuplicate() throws {
        let json = #"{"ok":true,"added":0,"skipped":1}"#.data(using: .utf8)!
        let resp = try JSONDecoder().decode(PostWorkoutResponse.self, from: json)
        XCTAssertEqual(resp.added, 0)
        XCTAssertEqual(resp.skipped, 1)
    }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/PostWorkoutCodableTests 2>&1 | tail -10
```

Expected: compile errors — `PostWorkoutRequest` / `PostWorkoutResponse` don't exist.

- [ ] **Step 3: Extend `Models/PostWorkout.swift`**

Replace the contents of `ios/SyncFit/SyncFit/Models/PostWorkout.swift` with:

```swift
import Foundation

struct PostWorkoutSet: Codable, Equatable {
    let exerciseName: String
    let weight: Double
    let reps: Int
}

struct PostWorkoutRequest: Codable, Equatable {
    let performedAt: Date
    let title: String
    let sets: [PostWorkoutSet]
}

struct PostWorkoutResponse: Codable, Equatable {
    let ok: Bool
    let added: Int
    let skipped: Int
    let error: String?
}
```

- [ ] **Step 4: Add `APIClient.postWorkout`**

In `ios/SyncFit/SyncFit/Net/APIClient.swift`, append a new method inside the `APIClient` class (after `getPlanWeek()`):

```swift
    func postWorkout(_ request: PostWorkoutRequest) async throws -> PostWorkoutResponse {
        let url = baseURL.appendingPathComponent("/api/workouts")
        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        req.httpBody = try encoder.encode(request)

        let (data, resp): (Data, URLResponse)
        do {
            (data, resp) = try await session.data(for: req)
        } catch {
            throw APIClientError.transport(error.localizedDescription)
        }
        guard let http = resp as? HTTPURLResponse else {
            throw APIClientError.transport("non-HTTP response")
        }
        switch http.statusCode {
        case 200:
            do {
                return try JSONDecoder().decode(PostWorkoutResponse.self, from: data)
            } catch {
                throw APIClientError.decoding(error.localizedDescription)
            }
        case 401:
            throw APIClientError.unauthorized
        case 400:
            throw APIClientError.badRequest
        default:
            throw APIClientError.server(http.statusCode)
        }
    }
```

- [ ] **Step 5: Run the tests to verify they pass + build the app**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/PostWorkoutCodableTests 2>&1 | tail -10
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: tests PASS + BUILD SUCCEEDED.

- [ ] **Step 6: Commit**

```bash
git add ios/SyncFit/SyncFit/Models/PostWorkout.swift \
        ios/SyncFit/SyncFit/Net/APIClient.swift \
        ios/SyncFit/SyncFitTests/PostWorkoutCodableTests.swift
git commit -m "feat(ios): PostWorkout models + APIClient.postWorkout"
```

---

## Task 11: iOS — `LiveWorkoutStore` (`@MainActor ObservableObject`)

**Files:**
- Create: `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutStore.swift`
- Create: `ios/SyncFit/SyncFitTests/LiveWorkoutStoreTests.swift`

- [ ] **Step 1: Write the failing tests**

Create `ios/SyncFit/SyncFitTests/LiveWorkoutStoreTests.swift`:

```swift
import XCTest
@testable import SyncFit

@MainActor
final class LiveWorkoutStoreTests: XCTestCase {

    private var tmpDir: URL!
    private var persistence: LiveWorkoutPersistence!

    override func setUp() {
        super.setUp()
        tmpDir = FileManager.default.temporaryDirectory
            .appendingPathComponent("live-workout-store-tests-\(UUID().uuidString)")
        try! FileManager.default.createDirectory(at: tmpDir, withIntermediateDirectories: true)
        persistence = LiveWorkoutPersistence(directory: tmpDir, maxAge: 6 * 60 * 60)
    }

    override func tearDown() {
        try? FileManager.default.removeItem(at: tmpDir)
        super.tearDown()
    }

    private func planDay(_ exs: [(String, Int, Int, Double)]) -> PlanDay {
        PlanDay(dayOfWeek: 1, title: "Pull Day", notes: "", modality: "strength",
            exercises: exs.map { (n, s, r, w) in
                PlanExercise(id: UUID().uuidString, name: n,
                             targetSets: s, targetReps: r, targetWeight: w)
            })
    }

    func testStartFromPlanPopulatesDraftAndPersists() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        XCTAssertNotNil(store.draft)
        XCTAssertEqual(store.draft?.exercises.count, 1)
        // Persisted on disk.
        XCTAssertNotNil(persistence.load(now: Date()))
    }

    func testStartBlankPopulatesEmptyDraft() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startBlank()
        XCTAssertEqual(store.draft?.exercises.count, 0)
    }

    func testStartWhileInProgressDoesNotOverwrite() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        let firstId = store.draft!.id
        // Attempting to start blank while in-progress is a no-op.
        store.startBlank()
        XCTAssertEqual(store.draft?.id, firstId)
    }

    func testNavigationAutoCommitsDirtyPending() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0), ("Row", 4, 8, 135)]))
        store.preparePending(forExerciseIndex: 0)
        store.setPendingReps(8, forExerciseIndex: 0)
        store.navigate(toExerciseIndex: 1)
        XCTAssertEqual(store.draft?.exercises[0].loggedSets.count, 1)
    }

    func testFinishSuccessClearsLocalState() async {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        store.preparePending(forExerciseIndex: 0)
        store.setPendingReps(8, forExerciseIndex: 0)
        let result = await store.finish()
        XCTAssertTrue(result.isSuccess)
        XCTAssertNil(store.draft)
        XCTAssertNil(persistence.load(now: Date()))
    }

    func testFinishSkippedTreatedAsSuccess() async {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 0, skipped: 1, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        store.preparePending(forExerciseIndex: 0)
        store.setPendingReps(8, forExerciseIndex: 0)
        let result = await store.finish()
        XCTAssertTrue(result.isSuccess)
        XCTAssertNil(store.draft)
    }

    func testFinishFailurePreservesLocalState() async {
        struct Boom: Error {}
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in throw Boom() })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        store.preparePending(forExerciseIndex: 0)
        store.setPendingReps(8, forExerciseIndex: 0)
        let result = await store.finish()
        XCTAssertFalse(result.isSuccess)
        XCTAssertNotNil(store.draft)
        XCTAssertNotNil(persistence.load(now: Date()))
    }

    func testDiscardClearsLocalState() {
        let store = LiveWorkoutStore(persistence: persistence,
                                     postWorkout: { _ in .init(ok: true, added: 1, skipped: 0, error: nil) })
        store.startFromPlan(planDay([("Pull-ups", 4, 8, 0)]))
        store.discard()
        XCTAssertNil(store.draft)
        XCTAssertNil(persistence.load(now: Date()))
    }
}

private extension LiveWorkoutFinishResult {
    var isSuccess: Bool { if case .success = self { return true } else { return false } }
}
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutStoreTests 2>&1 | tail -20
```

Expected: compile error — `LiveWorkoutStore`, `LiveWorkoutFinishResult` don't exist.

- [ ] **Step 3: Implement the store**

Create `ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutStore.swift`:

```swift
import Foundation
import SwiftUI

enum LiveWorkoutFinishResult {
    case success
    case unauthorized
    case transport(String)
    case server(Int)
    case decoding(String)
    case empty           // nothing to submit (defensive — UI prevents this)
}

@MainActor
final class LiveWorkoutStore: ObservableObject {
    @Published private(set) var draft: LiveWorkoutDraft?

    private let persistence: LiveWorkoutPersistence
    private let postWorkout: (PostWorkoutRequest) async throws -> PostWorkoutResponse

    init(
        persistence: LiveWorkoutPersistence = LiveWorkoutPersistence(),
        postWorkout: @escaping (PostWorkoutRequest) async throws -> PostWorkoutResponse
    ) {
        self.persistence = persistence
        self.postWorkout = postWorkout
    }

    // MARK: load on launch

    // Restores an in-progress draft from disk (or returns nil if missing /
    // expired / mismatched schema / corrupted). Does NOT auto-present the
    // sheet — the caller (AppSession) exposes a separate
    // `liveDraftAvailable` for the Home banner.
    func restoreFromDisk(now: Date = Date()) -> LiveWorkoutDraft? {
        return persistence.load(now: now)
    }

    // MARK: lifecycle

    func startFromPlan(_ planDay: PlanDay, now: Date = Date()) {
        guard draft == nil else { return }
        let d = LiveWorkoutDraft.startFromPlan(planDay: planDay, now: now)
        draft = d
        persistence.save(d)
    }

    func startBlank(now: Date = Date()) {
        guard draft == nil else { return }
        let d = LiveWorkoutDraft.startBlank(now: now)
        draft = d
        persistence.save(d)
    }

    // Re-attach an existing on-disk draft (the Resume path).
    func resume(_ d: LiveWorkoutDraft) {
        guard draft == nil else { return }
        draft = d
        persistence.save(d) // touch
    }

    func discard() {
        draft = nil
        persistence.clear()
    }

    // MARK: edits

    private func mutate(_ block: (inout LiveWorkoutDraft) -> Void) {
        guard var d = draft else { return }
        block(&d)
        draft = d
        persistence.save(d)
    }

    func setTitle(_ s: String) { mutate { $0.title = s } }

    func preparePending(forExerciseIndex i: Int) {
        mutate { $0.preparePendingIfNeeded(forExerciseIndex: i) }
    }
    func setPendingWeight(_ w: Double, forExerciseIndex i: Int) {
        mutate { $0.setPendingWeight(w, forExerciseIndex: i) }
    }
    func setPendingReps(_ r: Int, forExerciseIndex i: Int) {
        mutate { $0.setPendingReps(r, forExerciseIndex: i) }
    }
    func logPending(forExerciseIndex i: Int, now: Date = Date()) {
        mutate { $0.promotePending(forExerciseIndex: i, now: now) }
    }
    func navigate(toExerciseIndex i: Int, now: Date = Date()) {
        // Auto-commit dirty pending on the currently-current exercise before
        // moving. We auto-commit on ALL exercises to be safe (idempotent on
        // not-dirty), since navigation can jump non-adjacently.
        mutate { d in
            for j in d.exercises.indices {
                d.autoCommitDirty(forExerciseIndex: j, now: now)
            }
            d.preparePendingIfNeeded(forExerciseIndex: i)
        }
    }
    func addExercise(name: String) { mutate { $0.addExercise(name: name) } }
    func removeExercise(at i: Int) { mutate { $0.removeExercise(at: i) } }
    func moveExercise(from src: Int, to dst: Int) { mutate { $0.moveExercise(from: src, to: dst) } }
    func renameExercise(at i: Int, to s: String) { mutate { $0.renameExercise(at: i, to: s) } }
    func editLoggedSet(exerciseIndex i: Int, setId: UUID, weight: Double, reps: Int) {
        mutate { $0.editLoggedSet(exerciseIndex: i, setId: setId, weight: weight, reps: reps) }
    }

    // MARK: finish

    // Persists the auto-committed payload to disk BEFORE the POST so a crash
    // mid-POST doesn't lose the pending sets we just promoted.
    func finish(now: Date = Date()) async -> LiveWorkoutFinishResult {
        guard let d = draft else { return .empty }
        let (payload, mutated) = d.flattenForPost(now: now)
        guard !payload.isEmpty else { return .empty }
        draft = mutated
        persistence.save(mutated)

        let req = PostWorkoutRequest(
            performedAt: mutated.startedAt,
            title: mutated.title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
                ? "Workout"
                : mutated.title,
            sets: payload
        )
        do {
            let resp = try await postWorkout(req)
            if resp.ok && (resp.added >= 1 || resp.skipped >= 1) {
                draft = nil
                persistence.clear()
                return .success
            }
            return .server(0)
        } catch APIClientError.unauthorized {
            return .unauthorized
        } catch APIClientError.transport(let m) {
            return .transport(m)
        } catch APIClientError.server(let code) {
            return .server(code)
        } catch APIClientError.decoding(let m) {
            return .decoding(m)
        } catch {
            return .transport(String(describing: error))
        }
    }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/LiveWorkoutStoreTests 2>&1 | tail -10
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add ios/SyncFit/SyncFit/LiveWorkout/LiveWorkoutStore.swift \
        ios/SyncFit/SyncFitTests/LiveWorkoutStoreTests.swift
git commit -m "feat(ios): LiveWorkoutStore (observable wrapper + finish flow)"
```

---

## Task 12: iOS — `AppSession` integration

**Files:**
- Modify: `ios/SyncFit/SyncFit/AppSession.swift`

- [ ] **Step 1: Add `LiveWorkoutStore` ownership + restore-on-init**

At the top of `AppSession.swift`, after the existing `@Published` declarations, add:

```swift
    // Drives sheet presentation in RootView when non-nil.
    @Published var liveDraft: LiveWorkoutDraft?
    // Survives across launches; signals "Resume workout" banner on Home.
    @Published private(set) var liveDraftAvailable: LiveWorkoutDraft?
    let liveWorkoutStore: LiveWorkoutStore
```

Replace the `init(...)` with the version below (only the additions are the `liveWorkoutStore` parameter, the store wiring, and the restore-on-launch block at the bottom):

```swift
    init(
        health: HealthKitReading = HKHealthKitClient(),
        pairing: PairingClient = PairingClient(baseURL: Config.apiBaseURL),
        planCache: PlanCache = PlanCache(),
        appTz: TimeZone = Config.appTimeZone,
        liveWorkoutStore: LiveWorkoutStore? = nil
    ) {
        self.health = health
        self.pairing = pairing
        self.planCache = planCache
        self.appTz = appTz
        self.deviceToken = keychain.load()
        self.lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
        if let cached = planCache.load() {
            self.planWeek = cached.week
            self.planFetchedAt = cached.fetchedAt
        }
        // Live workout store: a default instance wires to the live APIClient
        // lazily (per-call) so it can pick up a freshly-paired token. Tests
        // inject their own.
        let token = self.deviceToken
        self.liveWorkoutStore = liveWorkoutStore ?? LiveWorkoutStore(
            postWorkout: { req in
                guard let t = token ?? KeychainStore().load() else {
                    throw APIClientError.unauthorized
                }
                let api = APIClient(baseURL: Config.apiBaseURL, token: t)
                return try await api.postWorkout(req)
            }
        )
        // Restore on launch: if an in-progress draft exists on disk (and isn't
        // aged-out), surface it as available-to-resume. Does NOT auto-present
        // the sheet — the user taps Resume on Home (or Log tab).
        self.liveDraftAvailable = self.liveWorkoutStore.restoreFromDisk()
    }
```

After `unpair()`, ensure live state is also cleared. Modify `unpair()`:

```swift
    func unpair() {
        keychain.clear()
        deviceToken = nil
        planCache.clear()
        planWeek = nil
        planFetchedAt = nil
        planFetchStatus = .idle
        liveDraft = nil
        liveDraftAvailable = nil
        liveWorkoutStore.discard()
    }
```

Add a Resume helper on `AppSession`:

```swift
    func resumeLiveWorkout() {
        guard let d = liveDraftAvailable else { return }
        liveWorkoutStore.resume(d)
        liveDraft = liveWorkoutStore.draft
        liveDraftAvailable = nil
    }

    // Called by views after Start CTA (Home or Log tab).
    func presentLiveWorkoutSheet() {
        liveDraft = liveWorkoutStore.draft
    }

    // Called by sheet-dismiss handlers (Close or Finish/Discard).
    func dismissLiveWorkoutSheet() {
        liveDraft = nil
        // After dismiss, expose the (still in-progress) draft as resumable
        // so the Home banner appears.
        liveDraftAvailable = liveWorkoutStore.draft
    }
```

- [ ] **Step 2: Build to verify it compiles**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Run all existing tests to make sure nothing broke**

```bash
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -15
```

Expected: all PASS.

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/AppSession.swift
git commit -m "feat(ios): AppSession owns LiveWorkoutStore + draft-available signal"
```

---

## Task 13: iOS — `ActiveSetEntry` view

**Files:**
- Create: `ios/SyncFit/SyncFit/Views/LiveWorkout/ActiveSetEntry.swift`

- [ ] **Step 1: Create the view**

Create `ios/SyncFit/SyncFit/Views/LiveWorkout/ActiveSetEntry.swift`:

```swift
import SwiftUI

// Stepper block (set-entry B from the brainstorming session). Binds directly
// to the store's pending-set values; any change persists immediately (Section
// 5.4 of the spec). The Log set CTA is disabled when reps < 1.
struct ActiveSetEntry: View {
    let setNumber: Int
    let pendingWeight: Double
    let pendingReps: Int
    let onSetWeight: (Double) -> Void
    let onSetReps: (Int) -> Void
    let onLogSet: () -> Void

    @State private var weightEditMode: Bool = false
    @State private var weightText: String = ""

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            label("WEIGHT (lb)")
            HStack(spacing: 6) {
                stepButton("−5") { onSetWeight(max(0, pendingWeight - 5)) }
                stepButton("−2.5") { onSetWeight(max(0, pendingWeight - 2.5)) }
                weightField
                stepButton("+2.5") { onSetWeight(pendingWeight + 2.5) }
                stepButton("+5") { onSetWeight(pendingWeight + 5) }
            }

            label("REPS")
            HStack(spacing: 6) {
                stepButton("−1") { onSetReps(max(0, pendingReps - 1)) }
                Text("\(pendingReps)")
                    .font(.system(size: 18, weight: .bold))
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: DSRadius.sm).fill(Color.white))
                    .overlay(RoundedRectangle(cornerRadius: DSRadius.sm).stroke(DSColor.divider))
                stepButton("+1") { onSetReps(pendingReps + 1) }
            }

            Button(action: onLogSet) {
                Text("Log set \(setNumber)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
                    .background(RoundedRectangle(cornerRadius: DSRadius.pill).fill(DSColor.primary))
            }
            .disabled(pendingReps < 1)
            .opacity(pendingReps < 1 ? 0.5 : 1)
        }
    }

    private func label(_ s: String) -> some View {
        Text(s)
            .font(.system(size: 9, weight: .bold))
            .tracking(0.06 * 9)
            .foregroundStyle(DSColor.textMuted)
    }

    private func stepButton(_ s: String, _ action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Text(s)
                .font(.system(size: 13, weight: .bold))
                .foregroundStyle(DSColor.text)
                .padding(.horizontal, 10)
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: DSRadius.sm).fill(DSColor.accentSand))
        }
    }

    @ViewBuilder
    private var weightField: some View {
        if weightEditMode {
            TextField("", text: $weightText)
                .keyboardType(.decimalPad)
                .multilineTextAlignment(.center)
                .font(.system(size: 18, weight: .bold))
                .padding(.vertical, 8)
                .background(RoundedRectangle(cornerRadius: DSRadius.sm).fill(Color.white))
                .overlay(RoundedRectangle(cornerRadius: DSRadius.sm).stroke(DSColor.primary))
                .onSubmit {
                    if let v = Double(weightText), v >= 0 { onSetWeight(v) }
                    weightEditMode = false
                }
                .frame(maxWidth: .infinity)
        } else {
            Button {
                weightText = String(format: pendingWeight.truncatingRemainder(dividingBy: 1) == 0
                                    ? "%.0f" : "%.1f", pendingWeight)
                weightEditMode = true
            } label: {
                Text(formatWeight(pendingWeight))
                    .font(.system(size: 18, weight: .bold))
                    .foregroundStyle(DSColor.text)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 8)
                    .background(RoundedRectangle(cornerRadius: DSRadius.sm).fill(Color.white))
                    .overlay(RoundedRectangle(cornerRadius: DSRadius.sm).stroke(DSColor.divider))
            }
        }
    }

    private func formatWeight(_ w: Double) -> String {
        if w == 0 { return "BW" }
        if w.truncatingRemainder(dividingBy: 1) == 0 { return String(format: "%.0f", w) }
        return String(format: "%.1f", w)
    }
}
```

> Note: `DSColor.accentSand` / `DSColor.divider` / `DSRadius.sm` / `DSRadius.pill` must already exist in `DesignTokens.swift`. If any names differ in your repo, swap to the closest existing token rather than adding new ones.

- [ ] **Step 2: Verify it compiles**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD SUCCEEDED. If a token name doesn't exist, the error will be a missing `DSColor.x` — replace with the closest existing token.

- [ ] **Step 3: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/LiveWorkout/ActiveSetEntry.swift
git commit -m "feat(ios): ActiveSetEntry view (stepper block with tap-to-type)"
```

---

## Task 14: iOS — `ExerciseCard` view

**Files:**
- Create: `ios/SyncFit/SyncFit/Views/LiveWorkout/ExerciseCard.swift`

- [ ] **Step 1: Create the view**

Create `ios/SyncFit/SyncFit/Views/LiveWorkout/ExerciseCard.swift`:

```swift
import SwiftUI

// Three variants (done / current / upcoming) per layout C in the spec.
struct ExerciseCard: View {
    enum State { case done, current, upcoming }

    let exercise: DraftExercise
    let state: State
    let onTap: () -> Void                  // tap-to-make-current (upcoming or re-expand done)
    let onLogSet: () -> Void
    let onSetPendingWeight: (Double) -> Void
    let onSetPendingReps: (Int) -> Void
    let onDelete: () -> Void
    let onRename: (String) -> Void

    @State private var renaming = false
    @State private var renameText = ""

    var body: some View {
        switch state {
        case .done:    doneRow
        case .current: currentExpanded
        case .upcoming: upcomingPreview
        }
    }

    private var doneRow: some View {
        Button(action: onTap) {
            HStack {
                Text("✓ \(exercise.name)")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(DSColor.textMuted)
                Spacer()
                Text(doneSummary)
                    .font(.system(size: 10))
                    .foregroundStyle(DSColor.textMuted)
            }
            .padding(.horizontal, 12).padding(.vertical, 8)
            .background(RoundedRectangle(cornerRadius: DSRadius.md).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: DSRadius.md).stroke(DSColor.divider))
            .opacity(0.7)
        }
        .buttonStyle(.plain)
    }

    // "✓ Name · N sets · top-set weight × reps" (per spec 5.3 Done card).
    private var doneSummary: String {
        let n = exercise.loggedSets.count
        guard let top = exercise.loggedSets.max(by: { $0.weight < $1.weight }) else {
            return "\(n) sets"
        }
        let w = top.weight == 0 ? "BW"
            : (top.weight.truncatingRemainder(dividingBy: 1) == 0
               ? String(format: "%.0f", top.weight)
               : String(format: "%.1f", top.weight))
        return "\(n) sets · \(w) × \(top.reps)"
    }

    private var upcomingPreview: some View {
        Button(action: onTap) {
            HStack {
                Text(exercise.name)
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundStyle(DSColor.text)
                Spacer()
                if let s = exercise.targetSets, let r = exercise.targetReps {
                    let w = exercise.targetWeight ?? 0
                    let weightStr = w == 0 ? "BW" : (w.truncatingRemainder(dividingBy: 1) == 0
                                                    ? String(format: "%.0f", w)
                                                    : String(format: "%.1f", w))
                    Text("\(s) × \(r) · \(weightStr)")
                        .font(.system(size: 10))
                        .foregroundStyle(DSColor.textMuted)
                }
            }
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: DSRadius.md).fill(Color.white))
            .overlay(RoundedRectangle(cornerRadius: DSRadius.md).stroke(DSColor.divider))
        }
        .buttonStyle(.plain)
    }

    private var currentExpanded: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                if renaming {
                    TextField(exercise.name, text: $renameText)
                        .font(.system(size: 14, weight: .bold))
                        .onSubmit {
                            onRename(renameText)
                            renaming = false
                        }
                } else {
                    Text(exercise.name)
                        .font(.system(size: 14, weight: .bold))
                        .foregroundStyle(DSColor.text)
                        .onTapGesture {
                            renameText = exercise.name
                            renaming = true
                        }
                }
                Spacer()
                Menu {
                    Button("Rename") { renameText = exercise.name; renaming = true }
                    Button("Delete", role: .destructive, action: onDelete)
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(DSColor.textMuted)
                }
            }
            if let s = exercise.targetSets, let r = exercise.targetReps {
                Text("Target: \(s) × \(r) · \(targetWeightStr)")
                    .font(.system(size: 10))
                    .foregroundStyle(DSColor.textMuted)
            }
            ForEach(Array(exercise.loggedSets.enumerated()), id: \.element.id) { (i, s) in
                loggedRow(setNumber: i + 1, set: s)
            }
            ActiveSetEntry(
                setNumber: exercise.loggedSets.count + 1,
                pendingWeight: exercise.pendingSet?.weight ?? exercise.targetWeight ?? 0,
                pendingReps: exercise.pendingSet?.reps ?? exercise.targetReps ?? 0,
                onSetWeight: onSetPendingWeight,
                onSetReps: onSetPendingReps,
                onLogSet: onLogSet
            )
        }
        .padding(12)
        .background(RoundedRectangle(cornerRadius: DSRadius.md).fill(Color.white))
        .overlay(RoundedRectangle(cornerRadius: DSRadius.md)
                    .stroke(DSColor.primary, lineWidth: 1.5))
    }

    private var targetWeightStr: String {
        let w = exercise.targetWeight ?? 0
        if w == 0 { return "BW" }
        return w.truncatingRemainder(dividingBy: 1) == 0
            ? String(format: "%.0f lb", w)
            : String(format: "%.1f lb", w)
    }

    private func loggedRow(setNumber: Int, set: LoggedSet) -> some View {
        HStack {
            Text("\(setNumber)")
                .font(.system(size: 11))
                .foregroundStyle(DSColor.textMuted)
                .frame(width: 18, alignment: .leading)
            Text(set.weight == 0 ? "BW" : String(format: "%.0f", set.weight))
                .font(.system(size: 11, weight: .semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
            Text("\(set.reps)")
                .font(.system(size: 11, weight: .semibold))
                .frame(maxWidth: .infinity, alignment: .leading)
            Image(systemName: "checkmark.square.fill")
                .font(.system(size: 12))
                .foregroundStyle(DSColor.success)
        }
        .padding(.vertical, 4)
    }
}
```

> Note: `DSColor.success` — if your tokens use a different name (e.g. `DSColor.accentForest`), substitute it. Same fallback rule as Task 13.

- [ ] **Step 2: Verify it compiles**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/LiveWorkout/ExerciseCard.swift
git commit -m "feat(ios): ExerciseCard view (done / current / upcoming)"
```

---

## Task 15: iOS — `FinishWorkoutSheet` view

**Files:**
- Create: `ios/SyncFit/SyncFit/Views/LiveWorkout/FinishWorkoutSheet.swift`

- [ ] **Step 1: Create the view**

Create `ios/SyncFit/SyncFit/Views/LiveWorkout/FinishWorkoutSheet.swift`:

```swift
import SwiftUI

struct FinishWorkoutSheet: View {
    @EnvironmentObject var session: AppSession
    @Environment(\.dismiss) private var dismiss

    let initialTitle: String
    let exerciseCount: Int
    let setCount: Int
    let onSuccess: () -> Void

    @State private var title: String = ""
    @State private var submitting = false
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            Form {
                Section("Workout") {
                    TextField("Title", text: $title)
                }
                Section {
                    HStack {
                        Text("Exercises").foregroundStyle(DSColor.textMuted)
                        Spacer()
                        Text("\(exerciseCount)")
                    }
                    HStack {
                        Text("Sets").foregroundStyle(DSColor.textMuted)
                        Spacer()
                        Text("\(setCount)")
                    }
                }
                if let m = errorMessage {
                    Section { Text(m).foregroundStyle(.red).font(.system(size: 13)) }
                }
            }
            .navigationTitle("Finish workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button(submitting ? "Saving…" : "Submit") {
                        submit()
                    }
                    .disabled(submitting || title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
            .onAppear { title = initialTitle }
        }
    }

    private func submit() {
        guard !submitting else { return }
        submitting = true
        errorMessage = nil
        session.liveWorkoutStore.setTitle(title)
        Task {
            let result = await session.liveWorkoutStore.finish()
            submitting = false
            switch result {
            case .success:
                onSuccess()
                dismiss()
            case .unauthorized:
                session.unpair()
                errorMessage = "Pairing expired — re-pair this device."
            case .transport(let m):
                errorMessage = "Couldn't sync workout (\(m)). Try again."
            case .server(let code):
                errorMessage = "Server error \(code). Try again."
            case .decoding(let m):
                errorMessage = "Couldn't read server response (\(m))."
            case .empty:
                errorMessage = "No sets to submit."
            }
        }
    }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/LiveWorkout/FinishWorkoutSheet.swift
git commit -m "feat(ios): FinishWorkoutSheet (title edit + Submit + result handling)"
```

---

## Task 16: iOS — `LiveWorkoutView` (sheet root)

**Files:**
- Create: `ios/SyncFit/SyncFit/Views/LiveWorkout/LiveWorkoutView.swift`

- [ ] **Step 1: Create the view**

Create `ios/SyncFit/SyncFit/Views/LiveWorkout/LiveWorkoutView.swift`:

```swift
import SwiftUI

struct LiveWorkoutView: View {
    @EnvironmentObject var session: AppSession
    @Environment(\.dismiss) private var dismiss

    @State private var addingExercise = false
    @State private var newExerciseName = ""
    @State private var showingFinish = false
    @State private var confirmingDiscard = false

    var body: some View {
        NavigationStack {
            ScrollView {
                LazyVStack(spacing: 8) {
                    if let draft = session.liveWorkoutStore.draft {
                        ForEach(Array(draft.exercises.enumerated()), id: \.element.id) { (i, ex) in
                            ExerciseCard(
                                exercise: ex,
                                state: cardState(forExerciseIndex: i, draft: draft),
                                onTap: { session.liveWorkoutStore.navigate(toExerciseIndex: i) },
                                onLogSet: { session.liveWorkoutStore.logPending(forExerciseIndex: i) },
                                onSetPendingWeight: { session.liveWorkoutStore.setPendingWeight($0, forExerciseIndex: i) },
                                onSetPendingReps: { session.liveWorkoutStore.setPendingReps($0, forExerciseIndex: i) },
                                onDelete: { session.liveWorkoutStore.removeExercise(at: i) },
                                onRename: { session.liveWorkoutStore.renameExercise(at: i, to: $0) }
                            )
                        }
                        Button {
                            newExerciseName = ""
                            addingExercise = true
                        } label: {
                            Label("Add exercise", systemImage: "plus.circle")
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                        }
                    }
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
            }
            .background(DSColor.bg.ignoresSafeArea())
            .navigationTitle(session.liveWorkoutStore.draft?.title ?? "Workout")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button {
                        session.dismissLiveWorkoutSheet()
                        dismiss()
                    } label: { Image(systemName: "chevron.down") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button("Discard workout", role: .destructive) { confirmingDiscard = true }
                    } label: { Image(systemName: "ellipsis") }
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Button("Finish") { showingFinish = true }
                        .bold()
                        .disabled(!canFinish)
                }
            }
            .alert("Discard workout?", isPresented: $confirmingDiscard) {
                Button("Discard", role: .destructive) {
                    session.liveWorkoutStore.discard()
                    session.dismissLiveWorkoutSheet()
                    dismiss()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text("All logged sets will be lost.")
            }
            .sheet(isPresented: $addingExercise) {
                NavigationStack {
                    Form {
                        TextField("Exercise name", text: $newExerciseName)
                    }
                    .navigationTitle("Add exercise")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { addingExercise = false }
                        }
                        ToolbarItem(placement: .confirmationAction) {
                            Button("Add") {
                                session.liveWorkoutStore.addExercise(name: newExerciseName)
                                addingExercise = false
                            }
                            .disabled(newExerciseName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                        }
                    }
                }
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $showingFinish) {
                if let draft = session.liveWorkoutStore.draft {
                    let (payload, _) = draft.flattenForPost()
                    FinishWorkoutSheet(
                        initialTitle: draft.title,
                        exerciseCount: draft.exercises.count,
                        setCount: payload.count,
                        onSuccess: {
                            session.dismissLiveWorkoutSheet()
                            dismiss()
                        }
                    )
                    .environmentObject(session)
                }
            }
        }
    }

    private var canFinish: Bool {
        guard let draft = session.liveWorkoutStore.draft else { return false }
        let (payload, _) = draft.flattenForPost()
        return !payload.isEmpty
    }

    private func cardState(forExerciseIndex i: Int, draft: LiveWorkoutDraft) -> ExerciseCard.State {
        guard let current = draft.currentExerciseIndex else {
            // All planned exercises done; default the topmost unfinished
            // (which is none) to current → just mark everything done.
            return .done
        }
        if i < current { return .done }
        if i == current { return .current }
        return .upcoming
    }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/LiveWorkout/LiveWorkoutView.swift
git commit -m "feat(ios): LiveWorkoutView sheet root (list + add/finish/discard)"
```

---

## Task 17: iOS — `LogView` (Log tab chooser)

**Files:**
- Create: `ios/SyncFit/SyncFit/Views/Log/LogView.swift`

- [ ] **Step 1: Create the view**

Create `ios/SyncFit/SyncFit/Views/Log/LogView.swift`:

```swift
import SwiftUI

struct LogView: View {
    @EnvironmentObject var session: AppSession
    @State private var pickingDay = false

    private static let weekdayFull = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday"
    ]

    var body: some View {
        NavigationStack {
            List {
                if session.liveDraftAvailable != nil {
                    Section {
                        Button {
                            session.resumeLiveWorkout()
                        } label: {
                            HStack {
                                Image(systemName: "play.circle.fill")
                                    .foregroundStyle(DSColor.primary)
                                Text("Resume in-progress workout")
                                    .foregroundStyle(DSColor.text)
                            }
                        }
                    }
                }
                Section("Start a workout") {
                    Button {
                        if let today = todayPlanDay() {
                            session.liveWorkoutStore.startFromPlan(today)
                            session.presentLiveWorkoutSheet()
                        }
                    } label: {
                        Text("Start today's workout")
                    }
                    .disabled(todayPlanDay()?.exercises.isEmpty ?? true)

                    Button {
                        pickingDay = true
                    } label: {
                        Text("Pick another day's plan")
                    }
                    .disabled(session.planWeek == nil)

                    Button {
                        session.liveWorkoutStore.startBlank()
                        session.presentLiveWorkoutSheet()
                    } label: {
                        Text("Start blank workout")
                    }
                }
            }
            .navigationTitle("Log")
            .sheet(isPresented: $pickingDay) {
                NavigationStack {
                    List {
                        if let week = session.planWeek {
                            ForEach(week.days, id: \.dayOfWeek) { day in
                                Button {
                                    session.liveWorkoutStore.startFromPlan(day)
                                    session.presentLiveWorkoutSheet()
                                    pickingDay = false
                                } label: {
                                    VStack(alignment: .leading) {
                                        Text(Self.weekdayFull[day.dayOfWeek])
                                            .font(.system(size: 14, weight: .bold))
                                        if !day.title.isEmpty {
                                            Text(day.title)
                                                .font(.system(size: 12))
                                                .foregroundStyle(DSColor.textMuted)
                                        }
                                    }
                                }
                                .disabled(day.exercises.isEmpty)
                            }
                        }
                    }
                    .navigationTitle("Pick a day")
                    .navigationBarTitleDisplayMode(.inline)
                    .toolbar {
                        ToolbarItem(placement: .cancellationAction) {
                            Button("Cancel") { pickingDay = false }
                        }
                    }
                }
                .presentationDetents([.medium, .large])
            }
        }
    }

    private func todayPlanDay() -> PlanDay? {
        guard let w = session.planWeek else { return nil }
        let cal = Calendar(identifier: .gregorian)
        var c = cal; c.timeZone = Config.appTimeZone
        let dow = c.component(.weekday, from: Date()) - 1 // 0..6
        return w.days.first(where: { $0.dayOfWeek == dow })
    }
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/Log/LogView.swift
git commit -m "feat(ios): LogView (tab chooser — today / pick day / blank / resume)"
```

---

## Task 18: iOS — `PlanDetailCard` Start CTA

**Files:**
- Modify: `ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift`

- [ ] **Step 1: Read the current PlanDetailCard to find the right insertion point**

```bash
sed -n '1,80p' ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift
```

Note the existing `body` shape — the Start CTA should appear inside the card after the existing content (exercise list / notes), as a prominent primary button.

- [ ] **Step 2: Add an `onStart` closure parameter and the CTA**

Modify `ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift`. Add to the struct (right under the existing `let day: PlanDay` declaration):

```swift
    let onStart: () -> Void
```

At the end of the `body`'s main `VStack` content (right before the closing `}` of the outermost `VStack`), insert:

```swift
            Button(action: onStart) {
                Text(day.exercises.isEmpty ? "Start blank workout" : "Start workout")
                    .font(.system(size: 14, weight: .bold))
                    .foregroundStyle(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 12)
                    .background(RoundedRectangle(cornerRadius: DSRadius.pill).fill(DSColor.primary))
            }
            .padding(.top, 8)
```

> If there's an existing preview block in this file, update it with a no-op closure: `onStart: {}`.

- [ ] **Step 3: Verify it compiles**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD will fail — `PlanDetailCard(day:)` is called from `HomeView` without `onStart`. That's wired in Task 19.

- [ ] **Step 4: Commit (with the build still red — Task 19 closes it)**

```bash
git add ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift
git commit -m "feat(ios): PlanDetailCard exposes onStart CTA"
```

---

## Task 19: iOS — `HomeView` resume banner + wire `onStart`

**Files:**
- Modify: `ios/SyncFit/SyncFit/Views/HomeView.swift`

- [ ] **Step 1: Wire `PlanDetailCard`'s new `onStart` parameter**

In `HomeView.swift`, find the `PlanDetailCard(day: r.days[selectedDow])` call inside the `content` view-builder. Replace it with:

```swift
            PlanDetailCard(day: r.days[selectedDow], onStart: {
                let dayToStart = r.days[selectedDow]
                if dayToStart.exercises.isEmpty {
                    session.liveWorkoutStore.startBlank()
                } else {
                    session.liveWorkoutStore.startFromPlan(dayToStart)
                }
                session.presentLiveWorkoutSheet()
            })
```

- [ ] **Step 2: Add the resume banner**

In `HomeView.swift`'s `content` view-builder, at the very top — before the stale-banner / week-strip block — add:

```swift
        if let avail = session.liveDraftAvailable {
            resumeBanner(avail)
        }
```

Then add this private helper alongside `staleBanner`:

```swift
    private func resumeBanner(_ draft: LiveWorkoutDraft) -> some View {
        Button {
            session.resumeLiveWorkout()
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 14, weight: .semibold))
                Text("Resume workout — started \(Self.relativeAgo(draft.startedAt))")
                    .font(.system(size: 12, weight: .semibold))
                Spacer()
                Image(systemName: "chevron.right")
                    .font(.system(size: 11, weight: .semibold))
            }
            .foregroundStyle(DSColor.primary)
            .padding(.horizontal, 12).padding(.vertical, 10)
            .background(RoundedRectangle(cornerRadius: DSRadius.sm)
                            .fill(DSColor.primary.opacity(0.10)))
        }
        .buttonStyle(.plain)
    }
```

- [ ] **Step 3: Verify it compiles**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD SUCCEEDED. (`PlanDetailCard` is now satisfied; resume banner compiles.)

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/HomeView.swift
git commit -m "feat(ios): HomeView wires Start CTA + Resume banner"
```

---

## Task 20: iOS — `RootView` TabView + sheet binding

**Files:**
- Modify: `ios/SyncFit/SyncFit/Views/RootView.swift`

- [ ] **Step 1: Replace `RootView` with the TabView + sheet binding**

Replace the entire contents of `ios/SyncFit/SyncFit/Views/RootView.swift` with:

```swift
import SwiftUI

struct RootView: View {
    @EnvironmentObject var session: AppSession

    var body: some View {
        Group {
            if !session.healthAuthorized {
                PermissionView()
            } else if session.deviceToken == nil {
                PairingView()
            } else {
                signedIn
            }
        }
    }

    private var signedIn: some View {
        TabView {
            HomeView()
                .tabItem { Label("Home", systemImage: "house") }
            LogView()
                .tabItem { Label("Log", systemImage: "plus.circle") }
        }
        .sheet(item: $session.liveDraft) { _ in
            LiveWorkoutView()
                .environmentObject(session)
                .interactiveDismissDisabled(false)
        }
    }
}
```

`LiveWorkoutDraft` already conforms to `Identifiable` via its `let id: UUID` from Task 4, so the `.sheet(item:)` binding works directly.

- [ ] **Step 2: Verify it compiles**

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild build -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' -quiet
```

Expected: BUILD SUCCEEDED.

- [ ] **Step 3: Run the full iOS test suite**

```bash
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -15
```

Expected: all PASS (LiveWorkoutDraftTests, LiveWorkoutPersistenceTests, LiveWorkoutStoreTests, PostWorkoutCodableTests, plus all existing tests).

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/RootView.swift
git commit -m "feat(ios): RootView TabView (Home + Log) + live-workout sheet binding"
```

---

## Task 21: Ship gate (full automated + manual smoke)

**Files:** none (verification only)

- [ ] **Step 1: Run the web standard gate**

```bash
npm test && npx tsc --noEmit && npm run lint && npm run format:check && npm run build
```

Expected: all PASS.

- [ ] **Step 2: Run the web integration tests** (touches DB paths the new route uses)

```bash
npm run test:integration
```

Expected: all PASS (including the new `api-workouts.integration.test.ts` from Tasks 2–3). If a flake appears in an unrelated existing test, re-run that one file alone to verify.

- [ ] **Step 3: Run the iOS gate via the ios-build-checker subagent**

In Claude Code, dispatch:

> Run the iOS build + test pipeline (xcodegen + xcodebuild test). Report failing tests and build errors only.

Or run manually:

```bash
cd ios/SyncFit && xcodegen generate && cd ../..
xcodebuild test -project ios/SyncFit/SyncFit.xcodeproj -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' 2>&1 | tail -20
```

Expected: all PASS.

- [ ] **Step 4: Manual smoke — Simulator, run from Xcode (Debug)**

With `npm run dev` running locally (Config.swift Debug branch targets http://localhost:3000):

  1. **Start from plan.** On Home, select Tuesday (or any day with planned exercises) → tap "Start workout" → sheet opens with that day's exercises pre-populated. Verify the current exercise is expanded and others are upcoming.
  2. **Log sets.** Adjust steppers, tap "Log set" — verify the row appears above the active entry block with a green check, and the pending pre-fills from the just-logged values.
  3. **Tap a number to type.** Tap the weight number → keyboard appears → type `137.5` → hit return → field shows 137.5.
  4. **Auto-commit on navigate.** Adjust weight + reps without tapping "Log set" → tap an upcoming exercise → verify the previous exercise has the values committed as a logged set.
  5. **Add unplanned exercise.** Tap "+ Add exercise" → enter "Bicep curl" → confirm. Verify it appears at the bottom as the new current exercise with no targets shown.
  6. **Rename, delete.** Long-press / tap menu on an exercise → Rename → confirm. Then Delete (with confirmation).
  7. **Dismiss = pause.** Tap the chevron-down → sheet closes → Home shows "Resume workout — started Nm ago" banner.
  8. **Resume.** Tap banner → sheet reappears with full state.
  9. **Log tab.** Switch to Log tab → tap "Resume in-progress workout" → same sheet appears.
  10. **Finish.** Tap "Finish" → confirm sheet appears with editable title + counts → Submit → toast appears (or sheet just dismisses), banner is gone, draft cleared.
  11. **Verify on web.** Open `http://localhost:3000/dashboard` (or wherever workouts are listed) → confirm the workout shows up with `source = "ios_live"`.
  12. **Age-out smoke (optional).** Edit `Documents/live-workout.json` in the simulator container, set `"startedAt"` 7 hours in the past, relaunch the app → verify the banner is gone (silent discard).
  13. **Finish-failure smoke (optional).** Temporarily point Debug `Config.swift` at `http://localhost:9999` (bad host) → start a workout, log a set, hit Finish → verify alert "Couldn't sync workout (…). Try again." → local draft preserved → fix Config.swift back → Resume → Finish → succeeds.
  14. **Discard.** Start a fresh workout → log a set → menu → "Discard workout" → confirm → sheet dismisses → banner gone.

- [ ] **Step 5: Commit any incidental polish from manual smoke**

If you tweak labels, spacing, or a token name during smoke, commit those changes as a final polish commit:

```bash
git add -p ios/SyncFit/SyncFit/
git commit -m "polish(ios): live-workout UX adjustments from smoke testing"
```

- [ ] **Step 6: Final summary**

Confirm in the conversation: "Live workout logging shipped. Web standard gate green, integration tests green, iOS XCTest green, manual smoke passed."

---

## Self-review

**Spec coverage** — walking section by section:

- §2 In scope: strength only ✓ (Task 2 zod schema, Task 5+ Swift types), single in-progress slot ✓ (Tasks 9, 11), local-buffered + single POST on Finish ✓ (Tasks 8, 11), two entry points ✓ (Tasks 17, 18+19), 6h age-out ✓ (Task 9), full editability ✓ (Task 7).
- §3 Architecture: server route + reused `logStrengthWorkout` ✓ (Tasks 1, 2); `LiveWorkout/` module split ✓ (Tasks 4–9, 11); `Views/LiveWorkout/` ✓ (Tasks 13–16); `LogView` ✓ (Task 17); RootView TabView + sheet ✓ (Task 20); AppSession ownership ✓ (Task 12); PlanDetailCard CTA + HomeView banner ✓ (Tasks 18–19); APIClient.postWorkout ✓ (Task 10).
- §4 Data model: `LiveWorkoutDraft` / `DraftExercise` / `LoggedSet` / `PendingSet` ✓ (Task 4); `currentExerciseIndex` ✓ (Task 6); flatten payload ✓ (Task 8); dedup + source=ios_live ✓ (Tasks 1, 2, 3).
- §5 Screens & flows: every flow has a wiring task (entry → 17/18/19; sheet binding → 20; in-workout → 16; set entry → 13; finish → 15; discard → 16; resume → 12/19); the navigation auto-commit lives in the store (Task 11).
- §6 Error handling: 401 → Task 15 + 12; network/5xx → Task 15 (alert); 400 → Task 15; 200 skipped:1 → Task 11 (`isSuccess` branch in `finish()`); file I/O → Task 9 (print + clear-on-corrupt); double-start guard → Task 11; double-tap Finish → Task 15 (`submitting` flag); age-out + schema mismatch → Task 9; input gating → Task 13 (Log set disabled), Task 16 (Finish disabled when payload empty).
- §7 Testing: web unit (Task 1), web integration (Tasks 2, 3), iOS unit (Tasks 5–11), build verification per UI task (Tasks 13–16, 18–20), full gate + manual smoke (Task 21).

No gaps.

**Placeholder scan:** no TBDs / TODOs / "implement later" / "add validation" / "similar to Task N" without repeated content. Every code-bearing step shows the full code. One soft caveat in Tasks 13–14 ("if your token names differ, substitute the closest existing token") — acceptable because `DesignTokens.swift` already exists in the repo and the names are project-stable; the worst case is a one-line rename in the same commit.

**Type consistency:**
- `LiveWorkoutDraft` / `DraftExercise` / `LoggedSet` / `PendingSet` defined in Tasks 4 and used unchanged in 5–11.
- `currentExerciseIndex` (computed property name) used in Task 6 and Task 16 — consistent.
- Mutation method names: `preparePendingIfNeeded`, `setPendingWeight`, `setPendingReps`, `promotePending`, `autoCommitDirty`, `addExercise`, `removeExercise`, `moveExercise`, `renameExercise`, `editLoggedSet` — defined in Task 7, exposed on store in Task 11 (with thin wrappers like `preparePending` / `logPending`), called from views in Tasks 13–16. Consistent.
- `PostWorkoutSet` introduced as a stub in Task 8 (just the shape needed by `flattenForPost`), extended in Task 10 with `PostWorkoutRequest` / `PostWorkoutResponse`. The shape doesn't change.
- `LiveWorkoutFinishResult` defined in Task 11, used in Task 15. Cases match.
- `liveDraft` (binding) and `liveDraftAvailable` (signal) on `AppSession` defined in Task 12, used in Tasks 17, 19, 20. Consistent.
- Server-side: `logStrengthWorkout` widened in Task 1 with `source: string = "manual"` — Task 2 calls it with `"ios_live"` as the third arg. Consistent.
