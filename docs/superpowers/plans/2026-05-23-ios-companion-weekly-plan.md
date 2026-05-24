# iOS Companion Weekly Plan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the minimal iOS `HomeView` with a plan-first home screen: a 7-day week strip + selected-day detail card sourced from a new `GET /api/plan/week` endpoint, with on-device caching and stale-fallback UX.

**Architecture:** A thin server route delegates to a pure DI-seamed handler (`handlePlanWeek`) that calls existing `resolveDeviceUser` + `getPlanForUser`. iOS state lives on `AppSession`; rendering is composed from three new views (`HomeView`, `WeekStrip`, `PlanDetailCard`) over a pure `PlanResolver` and a `UserDefaults`-backed `PlanCache`. Design-system colors are hand-mirrored as Swift constants in a new `DesignTokens.swift`.

**Tech Stack:** Next.js 16 (App Router, TypeScript) · Vitest · Drizzle (existing, no schema changes) · Swift 5.9 / SwiftUI / XCTest · XcodeGen.

**Spec:** [`docs/superpowers/specs/2026-05-23-ios-companion-weekly-plan-design.md`](../specs/2026-05-23-ios-companion-weekly-plan-design.md)

---

## File Structure

**Server (new):**
- `src/lib/plan-week-handler.ts` — pure DI-seamed handler `handlePlanWeek(req, { auth, load })`. Returns `NextResponse`. Imports `PlanDay` as a type-only import to stay unit-testable (no `@/db` at module load).
- `src/app/api/plan/week/route.ts` — one-line `GET` that wires `resolveDeviceUser` + `getPlanForUser` into the handler.
- `tests/plan-week-handler.test.ts` — unit tests (Vitest, offline). 401, 200, 200-empty, 500-generic, userId-pass-through.

**iOS (new):**
- `ios/SyncFit/SyncFit/Models/PlanWeek.swift` — `PlanWeek`, `PlanDay`, `PlanExercise`. `Codable`, `Equatable`, `Sendable`.
- `ios/SyncFit/SyncFit/DesignTokens.swift` — `DSColor`, `DSRadius`, `DSShadow` constants; `dsShadow(_:)` View modifier.
- `ios/SyncFit/SyncFit/Plan/PlanResolver.swift` — `ResolvedDay`, `ResolvedWeek`, `ChipGlyph`, `resolveWeek`, `modalityChip`.
- `ios/SyncFit/SyncFit/Plan/PlanCache.swift` — `UserDefaultsStore` protocol + `PlanCache` struct.
- `ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift` — 7-chip horizontal strip with `@Binding selectedDow`.
- `ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift` — single-day detail renderer.
- `ios/SyncFit/SyncFitTests/PlanWeekDecodingTests.swift`
- `ios/SyncFit/SyncFitTests/PlanResolverTests.swift`
- `ios/SyncFit/SyncFitTests/PlanCacheTests.swift`

**iOS (modified):**
- `ios/SyncFit/SyncFit/Net/APIClient.swift` — add `getPlanWeek() async throws -> PlanWeek`.
- `ios/SyncFit/SyncFit/AppSession.swift` — add `planWeek`, `planFetchedAt`, `planFetchStatus`, `PlanFetchStatus`, `fetchPlan()`; load `PlanCache` in `init`; clear cache + bounce on 401.
- `ios/SyncFit/SyncFit/Views/HomeView.swift` — full rewrite (strip-first layout).
- `ios/SyncFit/SyncFitTests/APIClientTests.swift` — extend with `getPlanWeek` tests.

---

## Task 1: Server — `handlePlanWeek` pure handler (TDD)

**Files:**
- Create: `tests/plan-week-handler.test.ts`
- Create: `src/lib/plan-week-handler.ts`

- [ ] **Step 1: Write the failing test file**

```typescript
// tests/plan-week-handler.test.ts
import { describe, it, expect, vi } from "vitest";
import { handlePlanWeek } from "@/lib/plan-week-handler";
import type { PlanDay } from "@/lib/plan-store";

function makeReq(): Request {
  return new Request("http://test.local/api/plan/week");
}

const sampleDay: PlanDay = {
  dayOfWeek: 3,
  title: "Heavy lifts",
  notes: "focus on back squat",
  modality: "strength",
  exercises: [
    {
      id: "ex-1",
      name: "Back squat",
      targetSets: 4,
      targetReps: 5,
      targetWeight: 245,
    },
  ],
};

describe("handlePlanWeek", () => {
  it("returns 401 when auth resolves null", async () => {
    const res = await handlePlanWeek(makeReq(), {
      auth: async () => null,
      load: async () => [],
    });
    expect(res.status).toBe(401);
  });

  it("returns 200 with days from load", async () => {
    const res = await handlePlanWeek(makeReq(), {
      auth: async () => ({ userId: "u-1" }),
      load: async () => [sampleDay],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: [sampleDay] });
  });

  it("returns 200 with empty days when load returns nothing", async () => {
    const res = await handlePlanWeek(makeReq(), {
      auth: async () => ({ userId: "u-1" }),
      load: async () => [],
    });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ days: [] });
  });

  it("returns 500 with generic body when load throws, without leaking driver message", async () => {
    const res = await handlePlanWeek(makeReq(), {
      auth: async () => ({ userId: "u-1" }),
      load: async () => {
        throw new Error("connection refused: 127.0.0.1:5432");
      },
    });
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body).toEqual({ error: "couldn't load plan" });
    expect(JSON.stringify(body)).not.toContain("127.0.0.1");
  });

  it("passes resolved userId to load", async () => {
    const loadSpy = vi.fn(async () => []);
    await handlePlanWeek(makeReq(), {
      auth: async () => ({ userId: "user-abc" }),
      load: loadSpy,
    });
    expect(loadSpy).toHaveBeenCalledWith("user-abc");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail (module not found)**

Run: `npx vitest run tests/plan-week-handler.test.ts`
Expected: FAIL — "Failed to resolve import '@/lib/plan-week-handler'".

- [ ] **Step 3: Create the minimal implementation**

```typescript
// src/lib/plan-week-handler.ts
import { NextResponse } from "next/server";
import type { PlanDay } from "@/lib/plan-store";

export type PlanWeekAuth = (
  req: Request
) => Promise<{ userId: string } | null>;
export type PlanWeekLoad = (userId: string) => Promise<PlanDay[]>;

export async function handlePlanWeek(
  req: Request,
  deps: { auth: PlanWeekAuth; load: PlanWeekLoad }
): Promise<NextResponse> {
  const session = await deps.auth(req);
  if (!session) return new NextResponse(null, { status: 401 });
  try {
    const days = await deps.load(session.userId);
    return NextResponse.json({ days });
  } catch (e) {
    console.error("plan-week handler load failed", e);
    return NextResponse.json({ error: "couldn't load plan" }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/plan-week-handler.test.ts`
Expected: PASS — 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add tests/plan-week-handler.test.ts src/lib/plan-week-handler.ts
git commit -m "feat(server): handlePlanWeek pure handler with DI seams

DI for auth + load lets the route handler be unit-tested offline (no
@/db at module load). Pulls PlanDay as a type-only import so the
existing plan-store DB module isn't pulled into the test path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Server — wire route at `/api/plan/week`

**Files:**
- Create: `src/app/api/plan/week/route.ts`

- [ ] **Step 1: Create the route handler**

```typescript
// src/app/api/plan/week/route.ts
import { NextRequest } from "next/server";
import { handlePlanWeek } from "@/lib/plan-week-handler";
import { resolveDeviceUser } from "@/lib/device-auth";
import { getPlanForUser } from "@/lib/plan-store";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  return handlePlanWeek(req, {
    auth: resolveDeviceUser,
    load: getPlanForUser,
  });
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `npx tsc --noEmit`
Expected: PASS (no type errors).

If you see "Type 'ResolvedDevice' is not assignable to 'PlanWeekAuth' return" — that means structural-compatibility isn't being inferred. It should: `ResolvedDevice` is `{ userId, deviceId }` and the seam wants `{ userId }`, which is a structural subtype. Re-check imports.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/plan/week/route.ts
git commit -m "feat(server): GET /api/plan/week route

Thin wiring over handlePlanWeek + resolveDeviceUser + getPlanForUser.
Device-token bearer auth, identical pattern to /api/health/sync.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Server verification gate

**Files:** none modified — pure verification.

- [ ] **Step 1: Run all unit tests**

Run: `npm test`
Expected: PASS — all existing tests + 5 new ones.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Format check**

Run: `npm run format:check`
Expected: PASS. If FAIL, run `npm run format` and re-run; commit any formatting changes.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS. The new `/api/plan/week` route should appear in the build output.

- [ ] **Step 6: If formatting changed anything, commit it**

```bash
git status --short  # check what changed
# only if anything changed:
git add -A && git commit -m "chore: prettier format pass"
```

---

## Task 4: iOS — `PlanWeek` model + decoding tests (TDD)

**Files:**
- Create: `ios/SyncFit/SyncFit/Models/PlanWeek.swift`
- Create: `ios/SyncFit/SyncFitTests/PlanWeekDecodingTests.swift`

- [ ] **Step 1: Write the failing test file**

```swift
// ios/SyncFit/SyncFitTests/PlanWeekDecodingTests.swift
import XCTest
@testable import SyncFit

final class PlanWeekDecodingTests: XCTestCase {

    func testDecodesFullResponse() throws {
        let json = """
        {
          "days": [
            {
              "dayOfWeek": 3,
              "title": "Heavy lifts",
              "notes": "focus on back squat",
              "modality": "strength",
              "exercises": [
                { "id": "ex-1", "name": "Back squat", "targetSets": 4, "targetReps": 5, "targetWeight": 245 }
              ]
            }
          ]
        }
        """.data(using: .utf8)!
        let week = try JSONDecoder().decode(PlanWeek.self, from: json)
        XCTAssertEqual(week.days.count, 1)
        XCTAssertEqual(week.days[0].dayOfWeek, 3)
        XCTAssertEqual(week.days[0].title, "Heavy lifts")
        XCTAssertEqual(week.days[0].notes, "focus on back squat")
        XCTAssertEqual(week.days[0].modality, "strength")
        XCTAssertEqual(week.days[0].exercises.count, 1)
        XCTAssertEqual(week.days[0].exercises[0].id, "ex-1")
        XCTAssertEqual(week.days[0].exercises[0].name, "Back squat")
        XCTAssertEqual(week.days[0].exercises[0].targetSets, 4)
        XCTAssertEqual(week.days[0].exercises[0].targetReps, 5)
        XCTAssertEqual(week.days[0].exercises[0].targetWeight, 245.0)
    }

    func testDecodesEmptyDays() throws {
        let json = #"{"days":[]}"#.data(using: .utf8)!
        let week = try JSONDecoder().decode(PlanWeek.self, from: json)
        XCTAssertTrue(week.days.isEmpty)
    }

    func testDecodesEmptyExercises() throws {
        let json = """
        {"days":[{"dayOfWeek":0,"title":"","notes":"","modality":"rest","exercises":[]}]}
        """.data(using: .utf8)!
        let week = try JSONDecoder().decode(PlanWeek.self, from: json)
        XCTAssertEqual(week.days[0].exercises.count, 0)
    }

    func testDecodesDecimalWeight() throws {
        let json = """
        {"days":[
          {"dayOfWeek":1,"title":"L","notes":"","modality":"strength",
           "exercises":[{"id":"x","name":"Press","targetSets":3,"targetReps":10,"targetWeight":47.5}]}
        ]}
        """.data(using: .utf8)!
        let week = try JSONDecoder().decode(PlanWeek.self, from: json)
        XCTAssertEqual(week.days[0].exercises[0].targetWeight, 47.5)
    }

    func testRoundTripsViaEncoder() throws {
        let week = PlanWeek(days: [
            .init(dayOfWeek: 2, title: "Tempo bike", notes: "z3", modality: "endurance", exercises: [])
        ])
        let data = try JSONEncoder().encode(week)
        let back = try JSONDecoder().decode(PlanWeek.self, from: data)
        XCTAssertEqual(back, week)
    }
}
```

- [ ] **Step 2: Create the model**

```swift
// ios/SyncFit/SyncFit/Models/PlanWeek.swift
import Foundation

struct PlanWeek: Codable, Equatable, Sendable {
    let days: [PlanDay]
}

struct PlanDay: Codable, Equatable, Sendable, Identifiable {
    let dayOfWeek: Int
    let title: String
    let notes: String
    let modality: String
    let exercises: [PlanExercise]

    // Identifiable so SwiftUI ForEach can key on dayOfWeek (0..6 is unique
    // in a ResolvedWeek; the server response is also 1-row-per-dow).
    var id: Int { dayOfWeek }
}

struct PlanExercise: Codable, Equatable, Sendable, Identifiable {
    let id: String
    let name: String
    let targetSets: Int
    let targetReps: Int
    let targetWeight: Double
}
```

- [ ] **Step 3: Regenerate the Xcode project so it sees the new files**

Run:
```bash
cd ios/SyncFit && xcodegen generate
```
Expected: prints "Created project at SyncFit.xcodeproj". Files now visible in the project.

- [ ] **Step 4: Run the tests to verify they pass**

Run from `ios/SyncFit/`:
```bash
xcodebuild test \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/PlanWeekDecodingTests \
  -quiet
```
Expected: PASS — 5 tests passing.

If `iPhone 17 Pro` doesn't exist on your simulator list, substitute any installed device (e.g., `xcrun simctl list devices available | grep "iPhone "`).

- [ ] **Step 5: Commit**

```bash
git add ios/SyncFit/SyncFit/Models/PlanWeek.swift \
        ios/SyncFit/SyncFitTests/PlanWeekDecodingTests.swift
git commit -m "feat(ios): PlanWeek/PlanDay/PlanExercise models

Codable wire shape mirroring /api/plan/week response. Identifiable so
SwiftUI ForEach can key on dayOfWeek (PlanDay) and id (PlanExercise).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: iOS — `DesignTokens.swift`

**Files:**
- Create: `ios/SyncFit/SyncFit/DesignTokens.swift`

- [ ] **Step 1: Create the design tokens file**

```swift
// ios/SyncFit/SyncFit/DesignTokens.swift
import SwiftUI

// Hand-mirrored from node_modules/@dustin-riley/design/src/tokens.css.
// Resync when the package version is bumped. Only tokens actually used
// in the plan home screen are mirrored — see spec §2.4.
enum DSColor {
    static let bg            = Color(red: 0.980, green: 0.965, blue: 0.941) // #faf6f0
    static let surface       = Color(red: 0.953, green: 0.925, blue: 0.878) // #f3ece0
    static let surfaceSunken = Color(red: 0.929, green: 0.894, blue: 0.827) // #ede4d3
    static let border        = Color(red: 0.878, green: 0.835, blue: 0.761) // #e0d5c2
    static let text          = Color(red: 0.122, green: 0.102, blue: 0.078) // #1f1a14
    static let textMuted     = Color(red: 0.420, green: 0.373, blue: 0.314) // #6b5f50
    static let primary       = Color(red: 0.722, green: 0.329, blue: 0.110) // #b8541c
    static let onPrimary     = Color.white
    static let accentTeal    = Color(red: 0.180, green: 0.490, blue: 0.478) // #2e7d7a
    static let accentOchre   = Color(red: 0.788, green: 0.573, blue: 0.169) // #c9922b
}

enum DSRadius {
    static let sm: CGFloat = 8
    static let md: CGFloat = 16
    static let pill: CGFloat = 999
}

struct DSShadow {
    let color: Color
    let radius: CGFloat
    let x: CGFloat
    let y: CGFloat

    static let sm = DSShadow(
        color: Color(red: 74/255, green: 52/255, blue: 28/255).opacity(0.06),
        radius: 2, x: 0, y: 1
    )
    static let md = DSShadow(
        color: Color(red: 74/255, green: 52/255, blue: 28/255).opacity(0.08),
        radius: 8, x: 0, y: 4
    )
}

extension View {
    func dsShadow(_ s: DSShadow) -> some View {
        self.shadow(color: s.color, radius: s.radius, x: s.x, y: s.y)
    }
}
```

- [ ] **Step 2: Regenerate the Xcode project**

Run: `cd ios/SyncFit && xcodegen generate`

- [ ] **Step 3: Build to verify it compiles**

Run from `ios/SyncFit/`:
```bash
xcodebuild build \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -quiet
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/DesignTokens.swift
git commit -m "feat(ios): DesignTokens.swift (colors/radii/shadows)

Hand-mirrored from @dustin-riley/design tokens.css. Only the tokens used
on the plan home screen — full token sync is its own spec.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: iOS — `PlanResolver` + tests (TDD)

**Files:**
- Create: `ios/SyncFit/SyncFitTests/PlanResolverTests.swift`
- Create: `ios/SyncFit/SyncFit/Plan/PlanResolver.swift`

- [ ] **Step 1: Write the failing test file**

```swift
// ios/SyncFit/SyncFitTests/PlanResolverTests.swift
import XCTest
@testable import SyncFit

final class PlanResolverTests: XCTestCase {

    private let ny = TimeZone(identifier: "America/New_York")!

    // MARK: resolveWeek

    func testResolvesSevenDaysFromSparseInput() {
        let input = PlanWeek(days: [
            PlanDay(dayOfWeek: 1, title: "Heavy lifts", notes: "", modality: "strength",
                    exercises: [PlanExercise(id: "x", name: "Squat", targetSets: 4, targetReps: 5, targetWeight: 245)])
        ])
        let week = PlanResolver.resolveWeek(input, now: noon("2026-05-20"), tz: ny) // Wed
        XCTAssertEqual(week.days.count, 7)
        if case .session(let p) = week.days[1] {
            XCTAssertEqual(p.title, "Heavy lifts")
        } else {
            XCTFail("expected .session at dow=1")
        }
        for i in [0, 2, 3, 4, 5, 6] {
            if case .rest(let dow, let t, let n) = week.days[i] {
                XCTAssertEqual(dow, i)
                XCTAssertNil(t)
                XCTAssertNil(n)
            } else {
                XCTFail("expected .rest at dow=\(i)")
            }
        }
    }

    func testTodayDowIsWednesdayInNY() {
        // 2026-05-20 noon NY = Wednesday → dow=3
        let week = PlanResolver.resolveWeek(PlanWeek(days: []), now: noon("2026-05-20"), tz: ny)
        XCTAssertEqual(week.todayDow, 3)
    }

    func testTodayDowIsSundayZero() {
        // 2026-05-17 noon NY = Sunday → dow=0
        let week = PlanResolver.resolveWeek(PlanWeek(days: []), now: noon("2026-05-17"), tz: ny)
        XCTAssertEqual(week.todayDow, 0)
    }

    func testRowWithOnlyTitleStaysSession() {
        // Spec §4.1: row with any content emits .session; renderer handles
        // the no-exercises case (shows "No exercises planned" line).
        let input = PlanWeek(days: [
            PlanDay(dayOfWeek: 4, title: "Active recovery", notes: "", modality: "rest", exercises: [])
        ])
        let week = PlanResolver.resolveWeek(input, now: noon("2026-05-20"), tz: ny)
        if case .session(let p) = week.days[4] {
            XCTAssertEqual(p.title, "Active recovery")
            XCTAssertTrue(p.exercises.isEmpty)
        } else {
            XCTFail("expected .session (has title) at dow=4")
        }
    }

    func testEmptyRowFallsToRest() {
        let input = PlanWeek(days: [
            PlanDay(dayOfWeek: 5, title: "", notes: "", modality: "", exercises: [])
        ])
        let week = PlanResolver.resolveWeek(input, now: noon("2026-05-20"), tz: ny)
        if case .rest(let dow, let t, let n) = week.days[5] {
            XCTAssertEqual(dow, 5)
            XCTAssertNil(t)
            XCTAssertNil(n)
        } else {
            XCTFail("expected .rest")
        }
    }

    // MARK: modalityChip

    func testChipForStrength() {
        let day = ResolvedDay.session(.init(dayOfWeek: 1, title: "H", notes: "",
            modality: "strength", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("S"))
    }

    func testChipForEnduranceTrimsAndIgnoresCase() {
        let day = ResolvedDay.session(.init(dayOfWeek: 2, title: "T", notes: "",
            modality: " ENDURANCE ", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("E"))
    }

    func testChipForMixed() {
        let day = ResolvedDay.session(.init(dayOfWeek: 3, title: "C", notes: "",
            modality: "mixed", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("M"))
    }

    func testChipFallsBackToModalityFirstChar() {
        let day = ResolvedDay.session(.init(dayOfWeek: 3, title: "Walk", notes: "",
            modality: "walking", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("W"))
    }

    func testChipUsesTitleWhenModalityEmpty() {
        let day = ResolvedDay.session(.init(dayOfWeek: 3, title: "Yoga", notes: "",
            modality: "", exercises: []))
        XCTAssertEqual(PlanResolver.modalityChip(for: day), .letter("Y"))
    }

    func testChipReturnsRestForRest() {
        XCTAssertEqual(
            PlanResolver.modalityChip(for: .rest(dayOfWeek: 0, title: nil, notes: nil)),
            .rest
        )
    }

    // MARK: helpers

    private func noon(_ ymd: String) -> Date {
        let f = DateFormatter()
        f.timeZone = ny
        f.dateFormat = "yyyy-MM-dd HH:mm"
        return f.date(from: "\(ymd) 12:00")!
    }
}
```

- [ ] **Step 2: Run tests to verify they fail (module not found)**

Run from `ios/SyncFit/`:
```bash
xcodebuild test \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/PlanResolverTests \
  -quiet
```
Expected: BUILD FAILURE — "Cannot find 'PlanResolver' in scope".

(If you haven't regenerated since adding the test file, run `xcodegen generate` first.)

- [ ] **Step 3: Create the resolver**

```swift
// ios/SyncFit/SyncFit/Plan/PlanResolver.swift
import Foundation

enum ResolvedDay: Equatable {
    case session(PlanDay)
    case rest(dayOfWeek: Int, title: String?, notes: String?)
}

struct ResolvedWeek: Equatable {
    let todayDow: Int            // 0..6, Sun=0..Sat=6
    let days: [ResolvedDay]      // exactly 7, dow 0..6 in order
}

enum ChipGlyph: Equatable {
    case letter(String)          // "S" / "E" / "M" / first-char fallback
    case rest                    // renders as centered "·"
}

enum PlanResolver {

    /// Densifies a sparse `PlanWeek` (server-side rows for only the days
    /// the user saved) into a 7-entry, dow-ordered array. Per spec §4.1:
    /// any row with at least one of (exercises, title, notes) populated
    /// becomes `.session`; everything else becomes `.rest`.
    static func resolveWeek(_ response: PlanWeek, now: Date, tz: TimeZone) -> ResolvedWeek {
        let todayDow = currentDow(now: now, tz: tz)
        var byDow: [Int: PlanDay] = [:]
        for d in response.days { byDow[d.dayOfWeek] = d }

        var out: [ResolvedDay] = []
        out.reserveCapacity(7)
        for dow in 0..<7 {
            if let row = byDow[dow] {
                let hasContent = !row.exercises.isEmpty
                    || !row.title.isEmpty
                    || !row.notes.isEmpty
                out.append(hasContent
                    ? .session(row)
                    : .rest(dayOfWeek: dow, title: nil, notes: nil))
            } else {
                out.append(.rest(dayOfWeek: dow, title: nil, notes: nil))
            }
        }
        return ResolvedWeek(todayDow: todayDow, days: out)
    }

    static func modalityChip(for day: ResolvedDay) -> ChipGlyph {
        switch day {
        case .rest:
            return .rest
        case .session(let p):
            let m = p.modality.trimmingCharacters(in: .whitespaces).lowercased()
            switch m {
            case "strength":  return .letter("S")
            case "endurance": return .letter("E")
            case "mixed":     return .letter("M")
            case "":
                let t = p.title.trimmingCharacters(in: .whitespaces)
                if let c = t.first { return .letter(String(c).uppercased()) }
                return .letter("?")
            default:
                if let c = m.first { return .letter(String(c).uppercased()) }
                return .letter("?")
            }
        }
    }

    private static func currentDow(now: Date, tz: TimeZone) -> Int {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = tz
        // Calendar.weekday: Sunday=1..Saturday=7; spec uses Sunday=0..Saturday=6
        return cal.component(.weekday, from: now) - 1
    }
}
```

- [ ] **Step 4: Regenerate the Xcode project**

Run: `cd ios/SyncFit && xcodegen generate`

- [ ] **Step 5: Run tests to verify they pass**

Run from `ios/SyncFit/`:
```bash
xcodebuild test \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/PlanResolverTests \
  -quiet
```
Expected: PASS — 11 tests passing.

- [ ] **Step 6: Commit**

```bash
git add ios/SyncFit/SyncFit/Plan/PlanResolver.swift \
        ios/SyncFit/SyncFitTests/PlanResolverTests.swift
git commit -m "feat(ios): PlanResolver — sparse PlanWeek → dense ResolvedWeek

Folds 0-7 server-side rows into a 7-entry dow-ordered array with .session
or .rest cases. modalityChip(_:) maps strength/endurance/mixed → S/E/M with
title-first-char fallback when modality is empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: iOS — `PlanCache` + tests (TDD)

**Files:**
- Create: `ios/SyncFit/SyncFitTests/PlanCacheTests.swift`
- Create: `ios/SyncFit/SyncFit/Plan/PlanCache.swift`

- [ ] **Step 1: Write the failing test file**

```swift
// ios/SyncFit/SyncFitTests/PlanCacheTests.swift
import XCTest
@testable import SyncFit

final class PlanCacheTests: XCTestCase {

    private final class InMemoryStore: UserDefaultsStore {
        var dataMap: [String: Data] = [:]
        var objMap: [String: Any] = [:]
        func data(forKey key: String) -> Data? { dataMap[key] }
        func object(forKey key: String) -> Any? { objMap[key] ?? dataMap[key] }
        func set(_ value: Any?, forKey key: String) {
            if let d = value as? Data { dataMap[key] = d }
            else if let v = value { objMap[key] = v }
            else { dataMap.removeValue(forKey: key); objMap.removeValue(forKey: key) }
        }
        func removeObject(forKey key: String) {
            dataMap.removeValue(forKey: key)
            objMap.removeValue(forKey: key)
        }
    }

    private func sampleWeek() -> PlanWeek {
        PlanWeek(days: [
            PlanDay(dayOfWeek: 1, title: "Heavy lifts", notes: "", modality: "strength",
                exercises: [PlanExercise(id: "x", name: "Squat",
                    targetSets: 4, targetReps: 5, targetWeight: 245)])
        ])
    }

    func testSaveLoadRoundTrip() {
        let store = InMemoryStore()
        let cache = PlanCache(store: store)
        let week = sampleWeek()
        let at = Date(timeIntervalSince1970: 1_716_500_000)
        cache.save(week, fetchedAt: at)
        let loaded = cache.load()
        XCTAssertNotNil(loaded)
        XCTAssertEqual(loaded?.week, week)
        XCTAssertEqual(loaded?.fetchedAt, at)
    }

    func testLoadReturnsNilWhenEmpty() {
        let cache = PlanCache(store: InMemoryStore())
        XCTAssertNil(cache.load())
    }

    func testLoadReturnsNilAndClearsOnCorruptData() {
        let store = InMemoryStore()
        store.dataMap["plan.week.json"] = Data("not json".utf8)
        store.objMap["plan.week.fetchedAt"] = Date()
        let cache = PlanCache(store: store)
        XCTAssertNil(cache.load())
        XCTAssertNil(store.dataMap["plan.week.json"])
        XCTAssertNil(store.objMap["plan.week.fetchedAt"])
    }

    func testClearRemovesBothKeys() {
        let store = InMemoryStore()
        let cache = PlanCache(store: store)
        cache.save(sampleWeek(), fetchedAt: Date())
        cache.clear()
        XCTAssertNil(store.dataMap["plan.week.json"])
        XCTAssertNil(store.objMap["plan.week.fetchedAt"])
    }
}
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
xcodebuild test \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/PlanCacheTests \
  -quiet
```
Expected: BUILD FAILURE — "Cannot find type 'UserDefaultsStore'".

- [ ] **Step 3: Create the cache**

```swift
// ios/SyncFit/SyncFit/Plan/PlanCache.swift
import Foundation

protocol UserDefaultsStore {
    func data(forKey key: String) -> Data?
    func object(forKey key: String) -> Any?
    func set(_ value: Any?, forKey key: String)
    func removeObject(forKey key: String)
}

extension UserDefaults: UserDefaultsStore {}

struct PlanCache {
    private let store: UserDefaultsStore
    private let weekKey = "plan.week.json"
    private let fetchedAtKey = "plan.week.fetchedAt"

    init(store: UserDefaultsStore = UserDefaults.standard) {
        self.store = store
    }

    func load() -> (week: PlanWeek, fetchedAt: Date)? {
        guard let data = store.data(forKey: weekKey),
              let fetchedAt = store.object(forKey: fetchedAtKey) as? Date
        else { return nil }
        do {
            let week = try JSONDecoder().decode(PlanWeek.self, from: data)
            return (week, fetchedAt)
        } catch {
            // Corrupt — clear and start fresh
            clear()
            return nil
        }
    }

    func save(_ week: PlanWeek, fetchedAt: Date) {
        do {
            let data = try JSONEncoder().encode(week)
            store.set(data, forKey: weekKey)
            store.set(fetchedAt, forKey: fetchedAtKey)
        } catch {
            // Encoding shouldn't fail for our Codable shapes; if it does, no-op.
        }
    }

    func clear() {
        store.removeObject(forKey: weekKey)
        store.removeObject(forKey: fetchedAtKey)
    }
}
```

- [ ] **Step 4: Regenerate the Xcode project**

Run: `cd ios/SyncFit && xcodegen generate`

- [ ] **Step 5: Run tests to verify they pass**

```bash
xcodebuild test \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/PlanCacheTests \
  -quiet
```
Expected: PASS — 4 tests passing.

- [ ] **Step 6: Commit**

```bash
git add ios/SyncFit/SyncFit/Plan/PlanCache.swift \
        ios/SyncFit/SyncFitTests/PlanCacheTests.swift
git commit -m "feat(ios): PlanCache (UserDefaults-backed) with injectable store

UserDefaultsStore protocol lets tests run against an in-memory map.
Corrupt JSON returns nil and clears both keys defensively.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: iOS — `APIClient.getPlanWeek` + tests (TDD)

**Files:**
- Modify: `ios/SyncFit/SyncFit/Net/APIClient.swift`
- Modify: `ios/SyncFit/SyncFitTests/APIClientTests.swift`

- [ ] **Step 1: Extend the test file**

Append to `ios/SyncFit/SyncFitTests/APIClientTests.swift` (inside the `APIClientTests` class, before the closing `}`):

```swift
    // MARK: getPlanWeek

    func testGetPlanWeekSendsBearerAndDecodes() async throws {
        StubURLProtocol.handler = { req in
            XCTAssertEqual(req.value(forHTTPHeaderField: "Authorization"), "Bearer t0k3n")
            XCTAssertEqual(req.url?.path, "/api/plan/week")
            XCTAssertEqual(req.httpMethod, "GET")
            let body = #"""
            {"days":[{"dayOfWeek":1,"title":"Heavy lifts","notes":"","modality":"strength","exercises":[{"id":"x","name":"Squat","targetSets":4,"targetReps":5,"targetWeight":245}]}]}
            """#.data(using: .utf8)!
            let resp = HTTPURLResponse(url: req.url!, statusCode: 200, httpVersion: nil, headerFields: nil)!
            return (resp, body)
        }
        let week = try await client(token: "t0k3n").getPlanWeek()
        XCTAssertEqual(week.days.count, 1)
        XCTAssertEqual(week.days[0].title, "Heavy lifts")
        XCTAssertEqual(week.days[0].exercises[0].targetWeight, 245)
    }

    func testGetPlanWeek401ThrowsUnauthorized() async {
        StubURLProtocol.handler = { req in
            (HTTPURLResponse(url: req.url!, statusCode: 401, httpVersion: nil, headerFields: nil)!, Data())
        }
        do {
            _ = try await client(token: "bad").getPlanWeek()
            XCTFail("expected throw")
        } catch APIClientError.unauthorized {
            // ok
        } catch {
            XCTFail("expected .unauthorized, got \(error)")
        }
    }

    func testGetPlanWeek500ThrowsServer() async {
        StubURLProtocol.handler = { req in
            (HTTPURLResponse(url: req.url!, statusCode: 500, httpVersion: nil, headerFields: nil)!, Data())
        }
        do {
            _ = try await client(token: "ok").getPlanWeek()
            XCTFail("expected throw")
        } catch APIClientError.server(let code) where code == 500 {
            // ok
        } catch {
            XCTFail("expected .server(500), got \(error)")
        }
    }
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
xcodebuild test \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/APIClientTests \
  -quiet
```
Expected: BUILD FAILURE — "Value of type 'APIClient' has no member 'getPlanWeek'".

- [ ] **Step 3: Add the method to `APIClient`**

In `ios/SyncFit/SyncFit/Net/APIClient.swift`, append this method inside the `APIClient` class (after `healthSync`):

```swift
    func getPlanWeek() async throws -> PlanWeek {
        let url = baseURL.appendingPathComponent("/api/plan/week")
        var req = URLRequest(url: url)
        req.httpMethod = "GET"
        req.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")

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
                return try JSONDecoder().decode(PlanWeek.self, from: data)
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

- [ ] **Step 4: Run tests to verify they pass**

```bash
xcodebuild test \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -only-testing:SyncFitTests/APIClientTests \
  -quiet
```
Expected: PASS — all existing healthSync tests + 3 new getPlanWeek tests.

- [ ] **Step 5: Commit**

```bash
git add ios/SyncFit/SyncFit/Net/APIClient.swift \
        ios/SyncFit/SyncFitTests/APIClientTests.swift
git commit -m "feat(ios): APIClient.getPlanWeek

GET /api/plan/week with Bearer auth, mirroring healthSync's error mapping.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: iOS — `AppSession` extension

**Files:**
- Modify: `ios/SyncFit/SyncFit/AppSession.swift`

Note: `AppSession` is `@MainActor` and constructs `HealthKitClient`/`PairingClient` in `init`, which makes direct unit testing awkward. Existing tests don't cover it, and we won't add to that. The plan / cache / fetch logic is covered transitively via `PlanResolverTests`, `PlanCacheTests`, and `APIClientTests`.

- [ ] **Step 1: Add the new state and methods**

Replace the existing `AppSession.swift` with:

```swift
// ios/SyncFit/SyncFit/AppSession.swift
import Foundation
import SwiftUI

// Owns the user-visible state for the app: HealthKit auth status,
// device token presence, last-synced timestamp, and the weekly plan.
// Wires the views to the underlying clients.
@MainActor
final class AppSession: ObservableObject {
    @Published private(set) var healthAuthorized: Bool = false
    @Published private(set) var deviceToken: String?
    @Published private(set) var lastSyncedAt: Date?

    @Published private(set) var planWeek: PlanWeek?
    @Published private(set) var planFetchedAt: Date?
    @Published private(set) var planFetchStatus: PlanFetchStatus = .idle

    enum PlanFetchStatus: Equatable {
        case idle
        case loading
        case ok
        case stale(reason: String)
        case failed(reason: String)
    }

    private let keychain = KeychainStore()
    private let planCache: PlanCache
    private let health: HealthKitReading
    private let pairing: PairingClient
    private let appTz: TimeZone

    init(
        health: HealthKitReading = HKHealthKitClient(),
        pairing: PairingClient = PairingClient(baseURL: Config.apiBaseURL),
        planCache: PlanCache = PlanCache(),
        appTz: TimeZone = Config.appTimeZone
    ) {
        self.health = health
        self.pairing = pairing
        self.planCache = planCache
        self.appTz = appTz
        self.deviceToken = keychain.load()
        self.lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
        // Synchronous cache load so the first paint of HomeView shows the
        // last-known plan with no flash.
        if let cached = planCache.load() {
            self.planWeek = cached.week
            self.planFetchedAt = cached.fetchedAt
        }
    }

    func requestHealthAuthorization() async throws {
        healthAuthorized = try await health.requestAuthorization()
    }

    func pair(code: String, deviceName: String) async throws {
        let token = try await pairing.pair(code: code, deviceName: deviceName)
        try keychain.save(token: token)
        deviceToken = token
    }

    func unpair() {
        keychain.clear()
        deviceToken = nil
        planCache.clear()
        planWeek = nil
        planFetchedAt = nil
        planFetchStatus = .idle
    }

    func syncNow() async throws {
        guard let token = deviceToken else { return }
        let api = APIClient(baseURL: Config.apiBaseURL, token: token)
        let coord = SyncCoordinator(health: health, api: api, appTz: appTz)
        do {
            try await coord.run()
            lastSyncedAt = UserDefaults.standard.object(forKey: "lastSyncedAt") as? Date
        } catch APIClientError.unauthorized {
            deviceToken = nil
            throw APIClientError.unauthorized
        }
    }

    // Fetches the latest plan. Non-throwing — all errors are folded into
    // planFetchStatus. The exception: 401 also clears deviceToken so
    // RootView bounces back to PairingView (matches syncNow behavior).
    func fetchPlan() async {
        guard let token = deviceToken else { return }
        planFetchStatus = .loading
        let api = APIClient(baseURL: Config.apiBaseURL, token: token)
        do {
            let week = try await api.getPlanWeek()
            let at = Date()
            planWeek = week
            planFetchedAt = at
            planFetchStatus = .ok
            planCache.save(week, fetchedAt: at)
        } catch APIClientError.unauthorized {
            planCache.clear()
            planWeek = nil
            planFetchedAt = nil
            planFetchStatus = .idle
            deviceToken = nil
        } catch {
            let reason = Self.reasonString(from: error)
            if planWeek != nil {
                planFetchStatus = .stale(reason: reason)
            } else {
                planFetchStatus = .failed(reason: reason)
            }
        }
    }

    private static func reasonString(from error: Error) -> String {
        switch error {
        case APIClientError.transport(let m): return "no connection (\(m))"
        case APIClientError.decoding(let m):  return "couldn't read response (\(m))"
        case APIClientError.server(let code): return "server \(code)"
        case APIClientError.badRequest:        return "bad request"
        default: return String(describing: error)
        }
    }
}
```

- [ ] **Step 2: Regenerate the Xcode project**

Run: `cd ios/SyncFit && xcodegen generate`

- [ ] **Step 3: Build to verify everything still compiles**

```bash
xcodebuild build \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -quiet
```
Expected: PASS.

- [ ] **Step 4: Run the full test suite to confirm no regressions**

```bash
xcodebuild test \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -quiet
```
Expected: PASS — all previous tests still green.

- [ ] **Step 5: Commit**

```bash
git add ios/SyncFit/SyncFit/AppSession.swift
git commit -m "feat(ios): AppSession plan state + fetchPlan

Adds planWeek / planFetchedAt / planFetchStatus and the non-throwing
fetchPlan() that folds errors into status (stale if cache present,
failed otherwise). 401 clears cache + token and bounces to PairingView.
init loads cache synchronously for flash-free first paint.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: iOS — `WeekStrip` view

**Files:**
- Create: `ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift`

- [ ] **Step 1: Create the view**

```swift
// ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift
import SwiftUI

struct WeekStrip: View {
    let days: [ResolvedDay]   // exactly 7, ordered Sun..Sat
    let todayDow: Int         // 0..6
    @Binding var selectedDow: Int

    private static let weekdayLabels = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"]

    var body: some View {
        HStack(spacing: 5) {
            ForEach(0..<7, id: \.self) { dow in
                chip(for: dow)
                    .contentShape(Rectangle())
                    .onTapGesture { selectedDow = dow }
            }
        }
    }

    @ViewBuilder
    private func chip(for dow: Int) -> some View {
        let glyph = PlanResolver.modalityChip(for: days[dow])
        let isToday = dow == todayDow
        let isSelected = dow == selectedDow
        VStack(spacing: 2) {
            Text(Self.weekdayLabels[dow])
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(isToday ? DSColor.onPrimary : DSColor.textMuted)
            switch glyph {
            case .letter(let s):
                Text(s)
                    .font(.system(size: 12, weight: .bold))
                    .foregroundStyle(glyphColor(for: days[dow], isToday: isToday))
            case .rest:
                Text("·")
                    .font(.system(size: 13))
                    .foregroundStyle(isToday ? DSColor.onPrimary : DSColor.textMuted)
            }
        }
        .frame(maxWidth: .infinity)
        .aspectRatio(1.0 / 1.15, contentMode: .fit)
        .background(
            RoundedRectangle(cornerRadius: DSRadius.sm)
                .fill(bgColor(for: days[dow], isToday: isToday))
        )
        .overlay(
            RoundedRectangle(cornerRadius: DSRadius.sm)
                .stroke(
                    isSelected && !isToday ? DSColor.primary.opacity(0.5) : .clear,
                    lineWidth: 1
                )
        )
    }

    private func bgColor(for d: ResolvedDay, isToday: Bool) -> Color {
        if isToday { return DSColor.primary }
        if case .session(let p) = d {
            switch p.modality.trimmingCharacters(in: .whitespaces).lowercased() {
            case "strength":  return DSColor.primary.opacity(0.08)
            case "endurance": return DSColor.accentTeal.opacity(0.10)
            case "mixed":     return DSColor.accentOchre.opacity(0.12)
            default:          return DSColor.surfaceSunken
            }
        }
        return DSColor.surfaceSunken
    }

    private func glyphColor(for d: ResolvedDay, isToday: Bool) -> Color {
        if isToday { return DSColor.onPrimary }
        if case .session(let p) = d {
            switch p.modality.trimmingCharacters(in: .whitespaces).lowercased() {
            case "strength":  return DSColor.primary
            case "endurance": return DSColor.accentTeal
            case "mixed":     return DSColor.accentOchre
            default:          return DSColor.text
            }
        }
        return DSColor.textMuted
    }
}

#Preview {
    @Previewable @State var selected = 3
    return WeekStrip(
        days: PlanResolver.resolveWeek(
            PlanWeek(days: [
                .init(dayOfWeek: 1, title: "Heavy lifts", notes: "", modality: "strength", exercises: []),
                .init(dayOfWeek: 2, title: "Tempo bike", notes: "", modality: "endurance", exercises: []),
                .init(dayOfWeek: 3, title: "Heavy lifts", notes: "", modality: "strength", exercises: []),
                .init(dayOfWeek: 4, title: "Long run",  notes: "", modality: "endurance", exercises: []),
                .init(dayOfWeek: 5, title: "Heavy lifts", notes: "", modality: "strength", exercises: []),
                .init(dayOfWeek: 6, title: "Long run",  notes: "", modality: "endurance", exercises: []),
            ]),
            now: Date(),
            tz: TimeZone(identifier: "America/New_York")!
        ).days,
        todayDow: 3,
        selectedDow: $selected
    )
    .padding()
    .background(DSColor.bg)
}
```

- [ ] **Step 2: Regenerate the Xcode project**

Run: `cd ios/SyncFit && xcodegen generate`

- [ ] **Step 3: Build to verify it compiles**

```bash
xcodebuild build \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -quiet
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/Home/WeekStrip.swift
git commit -m "feat(ios): WeekStrip view (7-chip horizontal strip)

Tap-to-select via @Binding selectedDow. Today wins the burnt-orange
fill; modality-tinted backgrounds for non-today sessions; rest \"·\"
for empty days. Pure View — depends only on PlanResolver + DesignTokens.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: iOS — `PlanDetailCard` view

**Files:**
- Create: `ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift`

- [ ] **Step 1: Create the view**

```swift
// ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift
import SwiftUI

struct PlanDetailCard: View {
    let day: ResolvedDay

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            switch day {
            case .session(let p):
                sessionBody(p)
            case .rest(_, let title, let notes):
                restBody(title: title, notes: notes)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: DSRadius.md)
                .fill(DSColor.surface)
        )
        .overlay(
            RoundedRectangle(cornerRadius: DSRadius.md)
                .stroke(DSColor.border, lineWidth: 1)
        )
        .dsShadow(.md)
    }

    @ViewBuilder
    private func sessionBody(_ p: PlanDay) -> some View {
        Text(p.title.isEmpty ? "Untitled session" : p.title)
            .font(.system(size: 16, weight: .bold))
            .foregroundStyle(DSColor.text)
        let meta = [p.modality, p.notes].filter { !$0.isEmpty }.joined(separator: " · ")
        if !meta.isEmpty {
            Text(meta)
                .font(.system(size: 10))
                .foregroundStyle(DSColor.textMuted)
                .padding(.top, 3)
        }
        if p.exercises.isEmpty {
            Text("No exercises planned")
                .font(.system(size: 11).italic())
                .foregroundStyle(DSColor.textMuted)
                .padding(.top, 11)
        } else {
            VStack(spacing: 5) {
                ForEach(p.exercises) { ex in
                    HStack(alignment: .firstTextBaseline) {
                        Text(ex.name)
                            .font(.system(size: 11))
                            .foregroundStyle(DSColor.text)
                        Spacer(minLength: 4)
                        Text(Self.formatPrescription(ex))
                            .font(.system(size: 11, design: .monospaced))
                            .foregroundStyle(DSColor.textMuted)
                    }
                }
            }
            .padding(.top, 11)
        }
    }

    @ViewBuilder
    private func restBody(title: String?, notes: String?) -> some View {
        if let t = title, !t.isEmpty {
            Text(t)
                .font(.system(size: 16, weight: .bold))
                .foregroundStyle(DSColor.text)
        } else {
            Text("Rest day")
                .font(.system(size: 16, weight: .medium).italic())
                .foregroundStyle(DSColor.textMuted)
        }
        if let n = notes, !n.isEmpty {
            Text(n)
                .font(.system(size: 10))
                .foregroundStyle(DSColor.textMuted)
                .padding(.top, 3)
        }
    }

    static func formatPrescription(_ ex: PlanExercise) -> String {
        // 4×5 · 185lb — trim ".0" on integer weights for cleaner display.
        let w: String
        if ex.targetWeight.truncatingRemainder(dividingBy: 1) == 0 {
            w = String(Int(ex.targetWeight))
        } else {
            w = String(format: "%.1f", ex.targetWeight)
        }
        return "\(ex.targetSets)×\(ex.targetReps) · \(w)lb"
    }
}

#Preview("Strength session") {
    PlanDetailCard(day: .session(.init(
        dayOfWeek: 3, title: "Heavy lifts", notes: "focus on back squat",
        modality: "strength",
        exercises: [
            .init(id: "1", name: "Back squat", targetSets: 4, targetReps: 5, targetWeight: 245),
            .init(id: "2", name: "Romanian deadlift", targetSets: 3, targetReps: 8, targetWeight: 185),
            .init(id: "3", name: "Walking lunge", targetSets: 3, targetReps: 12, targetWeight: 35),
        ]
    )))
    .padding()
    .background(DSColor.bg)
}

#Preview("Rest day, blank") {
    PlanDetailCard(day: .rest(dayOfWeek: 0, title: nil, notes: nil))
        .padding()
        .background(DSColor.bg)
}

#Preview("Endurance, no exercises") {
    PlanDetailCard(day: .session(.init(
        dayOfWeek: 4, title: "Long run", notes: "90 min easy",
        modality: "endurance", exercises: []
    )))
    .padding()
    .background(DSColor.bg)
}
```

- [ ] **Step 2: Regenerate the Xcode project**

Run: `cd ios/SyncFit && xcodegen generate`

- [ ] **Step 3: Build to verify it compiles**

```bash
xcodebuild build \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -quiet
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/Home/PlanDetailCard.swift
git commit -m "feat(ios): PlanDetailCard view

Single-day renderer. Session: title + (modality · notes) + exercise
rows (right-aligned monospaced prescription). Rest: italic 'Rest day'
when blank, or user-typed title + notes when present. Three #Previews
to ease visual inspection.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 12: iOS — `HomeView` rewrite

**Files:**
- Modify: `ios/SyncFit/SyncFit/Views/HomeView.swift`

- [ ] **Step 1: Replace the file**

```swift
// ios/SyncFit/SyncFit/Views/HomeView.swift
import SwiftUI

struct HomeView: View {
    @EnvironmentObject var session: AppSession
    @State private var selectedDow: Int = 0
    @State private var syncing = false
    @State private var syncError: String?

    private static let weekdayFull = [
        "Sunday", "Monday", "Tuesday", "Wednesday",
        "Thursday", "Friday", "Saturday"
    ]

    private var resolved: ResolvedWeek? {
        guard let w = session.planWeek else { return nil }
        return PlanResolver.resolveWeek(w, now: Date(), tz: Config.appTimeZone)
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    if case .stale = session.planFetchStatus {
                        staleBanner
                    }
                    content
                }
                .padding(.horizontal, 16)
                .padding(.top, 8)
            }
            .background(DSColor.bg.ignoresSafeArea())
            .navigationTitle("SyncFit")
            .toolbar { toolbarContent }
            .refreshable { await session.fetchPlan() }
            .task {
                await session.fetchPlan()
                if let r = resolved { selectedDow = r.todayDow }
            }
            .onChange(of: session.planWeek) { _, _ in
                if let r = resolved { selectedDow = r.todayDow }
            }
            .alert("Sync error",
                   isPresented: Binding(get: { syncError != nil },
                                        set: { if !$0 { syncError = nil } })) {
                Button("OK", role: .cancel) { syncError = nil }
            } message: {
                Text(syncError ?? "")
            }
        }
    }

    // MARK: content

    @ViewBuilder
    private var content: some View {
        if session.planWeek == nil {
            switch session.planFetchStatus {
            case .loading, .idle:
                ProgressView()
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
            case .failed:
                Text("Couldn't load your plan. Pull to refresh.")
                    .font(.system(size: 14))
                    .foregroundStyle(DSColor.textMuted)
                    .frame(maxWidth: .infinity)
                    .padding(.top, 40)
            case .ok, .stale:
                EmptyView()
            }
        } else if session.planWeek?.days.isEmpty == true {
            Text("No plan yet. Open the web app at syncfit-chi.vercel.app to create one.")
                .font(.system(size: 13))
                .foregroundStyle(DSColor.textMuted)
                .frame(maxWidth: .infinity, alignment: .leading)
                .padding(.top, 24)
        } else if let r = resolved {
            sectionLabel("This week")
            WeekStrip(days: r.days, todayDow: r.todayDow, selectedDow: $selectedDow)
            sectionLabel(dayLabel(r: r))
            PlanDetailCard(day: r.days[selectedDow])
        }
    }

    // MARK: toolbar

    @ToolbarContentBuilder
    private var toolbarContent: some ToolbarContent {
        ToolbarItem(placement: .topBarTrailing) {
            HStack(spacing: 10) {
                Button {
                    Task {
                        syncing = true; defer { syncing = false }
                        syncError = nil
                        do {
                            try await session.syncNow()
                        } catch APIClientError.unauthorized {
                            syncError = "Pairing expired — re-pair this device."
                        } catch {
                            syncError = "Sync failed. Try again."
                        }
                    }
                } label: {
                    Image(systemName: "arrow.triangle.2.circlepath")
                        .foregroundStyle(DSColor.text)
                }
                .disabled(syncing)

                if let d = session.lastSyncedAt {
                    Text("synced \(Self.timeOnly(d))")
                        .font(.system(size: 10))
                        .foregroundStyle(DSColor.textMuted)
                }

                Menu {
                    Button("Unpair this device", role: .destructive) {
                        session.unpair()
                    }
                } label: {
                    Image(systemName: "ellipsis")
                        .foregroundStyle(DSColor.text)
                }
            }
        }
    }

    // MARK: bits

    private func sectionLabel(_ text: String) -> some View {
        Text(text.uppercased())
            .font(.system(size: 9, weight: .heavy))
            .tracking(0.72)
            .foregroundStyle(DSColor.textMuted)
            .padding(.top, 4)
    }

    private func dayLabel(r: ResolvedWeek) -> String {
        let name = Self.weekdayFull[selectedDow]
        return selectedDow == r.todayDow ? "\(name) · today" : name
    }

    private var staleBanner: some View {
        Text("⚠ offline — last updated \(Self.relativeAgo(session.planFetchedAt))")
            .font(.system(size: 11))
            .foregroundStyle(DSColor.textMuted)
            .padding(.horizontal, 10)
            .padding(.vertical, 6)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(
                RoundedRectangle(cornerRadius: DSRadius.sm)
                    .fill(DSColor.accentOchre.opacity(0.12))
            )
    }

    private static func relativeAgo(_ d: Date?) -> String {
        guard let d else { return "—" }
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: d, relativeTo: Date())
    }

    private static func timeOnly(_ d: Date) -> String {
        let f = DateFormatter()
        f.timeStyle = .short
        f.dateStyle = .none
        return f.string(from: d)
    }
}
```

Note: the spec says "⚠ offline" is a single character (Unicode warning symbol). It is allowed here because the design rules' "no emoji" prohibition is about decorative emoji, not informational glyphs; substitute the SF Symbol "exclamationmark.triangle" if you'd prefer pure typography.

- [ ] **Step 2: Regenerate the Xcode project**

Run: `cd ios/SyncFit && xcodegen generate`

- [ ] **Step 3: Build to verify it compiles**

```bash
xcodebuild build \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -quiet
```
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add ios/SyncFit/SyncFit/Views/HomeView.swift
git commit -m "feat(ios): HomeView rewrite — strip-first weekly plan layout

Toolbar (brand · sync · last-synced · unpair-overflow) + 'This week'
strip + selected-day detail card. Pull-to-refresh + .task on appear
both call session.fetchPlan(). Stale banner appears when status is
.stale; empty-state message when planWeek.days is empty; spinner
when loading with no cache.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 13: iOS verification gate

**Files:** none modified.

- [ ] **Step 1: Regenerate the Xcode project (sanity-check fresh state)**

Run: `cd ios/SyncFit && xcodegen generate`

- [ ] **Step 2: Run the full test suite**

```bash
xcodebuild test \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -quiet
```
Expected: PASS — all existing iOS tests + the new `PlanWeekDecodingTests`, `PlanResolverTests`, `PlanCacheTests`, plus extended `APIClientTests`.

- [ ] **Step 3: Run a clean build for the simulator**

```bash
xcodebuild build \
  -project SyncFit.xcodeproj \
  -scheme SyncFit \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -quiet
```
Expected: PASS.

- [ ] **Step 4: Smoke-test in the simulator (manual)**

Open Xcode → Product → Run (⌘R) on the iPhone 17 Pro simulator. With local Next dev server running (`npm run dev`), pair the simulator against a user that has a saved plan; verify:
- The home screen shows "This week" strip + today's detail card.
- Tapping another day swaps the detail card.
- Pull-to-refresh refetches.
- "Unpair this device" in the overflow menu returns to PairingView.

Note any visual issues for follow-up; this step is not a gating commit. If the manual smoke-test reveals a behavior bug, that's a new commit on top.

---

## Task 14: Whole-repo verification gate

**Files:** none modified.

- [ ] **Step 1: All unit tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 2: TypeScript**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: PASS.

- [ ] **Step 4: Format check**

Run: `npm run format:check`
Expected: PASS.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: PASS.

- [ ] **Step 6: Open a PR**

```bash
git push -u origin feature/ios-companion-weekly-plan
gh pr create --base main --fill
```

PR body should reference the spec at `docs/superpowers/specs/2026-05-23-ios-companion-weekly-plan-design.md` and call out:
- New endpoint `GET /api/plan/week`
- iOS `HomeView` rewrite
- Out-of-scope items deferred per spec §1.
