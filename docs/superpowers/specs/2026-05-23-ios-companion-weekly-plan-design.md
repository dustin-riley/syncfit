# iOS Companion — Weekly Plan on Home Screen — Design Spec

**Date:** 2026-05-23
**Status:** Approved (brainstorming) — pending implementation plan
**Related:** [`2026-05-23-ios-companion-app-design.md`](2026-05-23-ios-companion-app-design.md) (parent / v1 iOS spec)

## 1. Goal & Scope

Replace the current minimal iOS `HomeView` (just "Sync now" + last-synced + "Unpair") with a **plan-first home screen**: the user's weekly training plan is the primary content, with the existing sync controls demoted to the toolbar. The user opens the app and immediately sees what they're doing today plus a 7-day-week overview.

**Audience:** You + TestFlight testers. Single-user-flavored multi-user, like the rest of SyncFit. Plan data has been editable on the web at `/plan` since v1; this spec brings it to the phone, read-only.

### In scope

- New `GET /api/plan/week` endpoint, device-token bearer auth, returns the same `PlanDay[]` shape `getPlanForUser` already produces.
- iOS `HomeView` rewrite: toolbar + "This week" strip + selected-day detail card. Layout B from the design mockup (strip-first).
- Tap a day in the strip to swap the detail card (read-only).
- Persistent on-device cache of the last successful plan response; stale-banner UX on fetch failure.
- 401 from the plan endpoint clears the cache and bounces the user back to `PairingView` (same path `syncNow` already uses).
- Sync controls (`Sync now`, `Last synced`) move into a compact toolbar; `Unpair this device` moves into a toolbar overflow `⋮` menu.

### Out of scope (deferred)

- AI readiness verdict / `analyzeReadiness` output on iOS — stays web-only.
- Logging a workout from iOS — would need new write endpoints and conflicts with the structured Strong-CSV import flow.
- `Sync now` triggering a plan refetch — sync and plan stay independent concerns.
- Foreground / `scenePhase` auto-refetch — launch + pull-to-refresh only.
- HealthKit-flipped gating (showing the plan before HealthKit auth). Existing `PermissionView → PairingView → HomeView` gate is preserved.
- Full design-system token sync into iOS. Only the eight colors actually used here are hand-mirrored as Swift constants in a new `DesignTokens.swift`. A complete cross-platform token pipeline is its own spec.
- Endurance-specific session prescriptions (`durationMinutes`, `zone`, etc.) — the schema doesn't have them today; for now an endurance day renders title + notes only, no exercise list.

## 2. UX

### 2.1 Layout (B · strip-first)

Top to bottom on the home screen, when paired and HealthKit-authorized:

1. **Toolbar** — brand mark ("SyncFit" in burnt orange) on the left; on the right a compact "↻" sync button + last-synced text ("synced 9:42a") + overflow `⋮` menu containing "Unpair this device" (destructive role).
2. **"This week" section label.**
3. **Week strip** — 7 chips, Sun→Sat, today highlighted with the burnt-orange primary fill (white text). Non-today chips show a modality letter ("S" / "E" / "M") on a faint matching tint, or a centered "·" for rest. Tapping a chip selects it and swaps the detail card below.
4. **"<Weekday> · today" / "<Weekday>" section label** — labels the selected day; says "today" when the selected day equals the resolved today, otherwise just the weekday name.
5. **Detail card** — `Heavy lifts` (title, 16px bold), `strength · focus on back squat` (meta, 10px muted), ordered exercise list with right-aligned `4×5 · 245lb` columns. For a rest day, replaces exercise list with "No exercises planned" (italic, muted); when the row is fully blank, the title itself shows "Rest day."
6. **Spacer** fills remaining vertical room (the strip stays anchored to the upper third, the detail card breathes).

### 2.2 Variants

- **Loading, no cache** (first launch ever, no cached plan, network in-flight): centered progress spinner where the strip + detail would render; toolbar still shown.
- **Failed first load, no cache:** "Couldn't load your plan. Pull to refresh." centered. No retry button (pull-to-refresh + toolbar sync button cover it).
- **Stale (cache shown, last fetch failed):** a single warm-tinted banner line between the toolbar and the section label: "⚠ offline — last updated 3h ago." Plan still interactive underneath.
- **Empty plan** (`response.days.isEmpty`): replaces the strip + detail with a single message — "No plan yet. Open the web app at syncfit-chi.vercel.app to create one." (no strip rendered since there's nothing to show).

### 2.3 Interaction

- Pull-to-refresh anywhere on the home screen triggers `fetchPlan()`.
- Toolbar `↻` sync button still triggers HealthKit sync (`syncNow()`) — it does NOT refetch the plan. The two stay independent.
- Toolbar `⋮` overflow contains a single destructive item, "Unpair this device," routed to the existing `session.unpair()`.
- Tapping a strip chip is non-destructive view-only — no network call, no persistence, just updates `selectedDow` state.

### 2.4 Visual language

Native SwiftUI structure with design-system warm-neutral palette: `--ds-bg`, `--ds-surface`, `--ds-surface-sunken`, `--ds-border`, `--ds-text`, `--ds-text-muted`, `--ds-primary` (burnt orange), `--ds-accent-teal`, `--ds-accent-ochre`. Three radii (8 / 16 / 999) and `--ds-shadow-sm`/`md` are mirrored into `DesignTokens.swift` as constants (`Color` for colors, `CGFloat` for radii, `ShadowStyle` struct for shadow tuples). Sentence-case copy, no emoji.

## 3. Server

### 3.1 Endpoint

`GET /api/plan/week`

- **Auth:** `Authorization: Bearer <device-token>`, validated via the existing `resolveDeviceUser(req)` in `src/lib/device-auth.ts`. Identical pattern to `/api/health/sync`.
- **Response 200** (`Content-Type: application/json`):
  ```json
  {
    "days": [
      {
        "dayOfWeek": 3,
        "title": "Heavy lifts",
        "notes": "focus on back squat",
        "modality": "strength",
        "exercises": [
          { "id": "uuid-1", "name": "Back squat", "targetSets": 4, "targetReps": 5, "targetWeight": 245 }
        ]
      }
    ]
  }
  ```
- **Response 401:** missing or invalid bearer. JSON body `{ "error": "unauthorized" }`.
- **Response 500:** any unexpected error. JSON body `{ "error": "couldn't load plan" }` — driver messages are NOT leaked (same shape as `runReadinessAnalysis` error handling).
- The response is **sparse** — only days the user actually saved appear. iOS fills the gaps with synthetic "rest" entries client-side.

### 3.2 Architecture

The route follows the project's existing pure-compute / DB-loader split. A new pure module `src/lib/plan-week-handler.ts` exports:

```ts
export async function handlePlanWeek(
  req: Request,
  load: (userId: string) => Promise<PlanDay[]>
): Promise<NextResponse>
```

The handler:
1. Calls `resolveDeviceUser(req)` → 401 on null.
2. Calls `load(userId)` inside try/catch → 500 with generic body on throw.
3. Returns `NextResponse.json({ days })` with status 200.

The thin route handler at `src/app/api/plan/week/route.ts` is one line:
```ts
export const GET = (req: Request) => handlePlanWeek(req, getPlanForUser);
```

This keeps `handlePlanWeek` unit-testable (stub `load`, stub the request) and the route file free of business logic, matching the established pattern from `readiness.ts` (`loadRecentTraining` DB ↔ `recent-training.ts` pure) and the existing `devices/pair` + `health/sync` routes.

### 3.3 Server tests

`tests/plan-week-handler.test.ts` (unit, Vitest, offline):

- 401 when `resolveDeviceUser` returns null (mocked).
- 200 + correct JSON body when `load` resolves with a fixture.
- 500 + generic error body when `load` throws; driver-shaped messages must not appear in the response.
- 200 with `{ "days": [] }` when `load` resolves with an empty array.

No integration test for this route. `getPlanForUser` is already exercised by every readiness/plan integration test transitively; adding a dedicated integration test would only re-prove Drizzle works against Neon.

## 4. iOS

### 4.1 New files

- `SyncFit/Models/PlanWeek.swift` — `PlanWeek`, `PlanDay`, `PlanExercise`. All `Codable`, `Equatable`, `Sendable`. `targetWeight` decoded as `Double` (matches server `number`); preserved as `Double` end-to-end (no `Decimal` precision games — the source of truth is `numeric` in Postgres but the unit on iOS is "render lbs to one decimal max").
- `SyncFit/Plan/PlanResolver.swift` (pure, no UIKit/SwiftUI imports) — exports:
  ```swift
  enum ResolvedDay {
      case session(PlanDay)
      case rest(dayOfWeek: Int, title: String?, notes: String?)
  }
  struct ResolvedWeek {
      let todayDow: Int            // 0..6, Sun=0, computed from `now` in `tz`
      let days: [ResolvedDay]      // exactly 7 entries, dow 0..6 in order
  }
  enum ChipGlyph: Equatable {
      case letter(String)          // "S" / "E" / "M" / first-char fallback
      case rest                    // renders as centered "·"
  }
  func resolveWeek(_ response: PlanWeek, now: Date, tz: TimeZone) -> ResolvedWeek
  func modalityChip(_ day: ResolvedDay) -> ChipGlyph
  ```
  Folding rules:
  - For each dow 0..6: if `response.days` contains a row for that dow **and** at least one of (`exercises.count > 0`, `title.isEmpty == false`, `notes.isEmpty == false`) is true, emit `.session(row)`. Otherwise emit `.rest(dayOfWeek: dow, title: row?.title, notes: row?.notes)` — preserving any user-typed title/notes from a row that happened to have no exercises.
  - `modalityChip` lowercases `modality.trimmingCharacters(in: .whitespaces)`; switches on `strength`/`endurance`/`mixed` → `S`/`E`/`M`; falls back to `String(first).uppercased()` for any other non-empty string; `.rest` glyph for rest entries.
- `SyncFit/Plan/PlanCache.swift` — small struct wrapping a `UserDefaultsStore` protocol (injectable):
  ```swift
  protocol UserDefaultsStore { ... get/set Data, get/set Date, removeObject(forKey:) ... }
  struct PlanCache {
      let store: UserDefaultsStore
      func load() -> (week: PlanWeek, fetchedAt: Date)?
      func save(_ week: PlanWeek, fetchedAt: Date)
      func clear()
  }
  ```
  Keys: `"plan.week.json"` and `"plan.week.fetchedAt"`. Corrupt JSON returns `nil` and clears both keys.
- `SyncFit/Views/Home/WeekStrip.swift` — 7-chip horizontal layout, `@Binding var selectedDow: Int`. Today's chip ignores modality tint and uses primary fill.
- `SyncFit/Views/Home/PlanDetailCard.swift` — renders one `ResolvedDay`. `.session` shows title + meta + exercise list; `.rest` shows the rest variant.
- `SyncFit/DesignTokens.swift` — hand-mirrored constants (Colors, radii, shadows). Source-of-truth comment points to `node_modules/@dustin-riley/design/src/tokens.css`. Re-sync on package version bumps (manual).
- `SyncFit/SyncFitTests/PlanResolverTests.swift` — fold rules across dow 0..6; chip mapping for all modality strings (case-insensitive, trimmed, fallback, rest); today selection across timezones.
- `SyncFit/SyncFitTests/PlanWeekDecodingTests.swift` — happy-path JSON; numeric `targetWeight`; empty `exercises[]`; missing days; round-trip stability.
- `SyncFit/SyncFitTests/PlanCacheTests.swift` — round-trip through in-memory `UserDefaultsStore`; nil on corrupt; `clear()` removes both keys.

### 4.2 Changed files

- `SyncFit/Net/APIClient.swift` — add:
  ```swift
  func getPlanWeek() async throws -> PlanWeek
  ```
  `GET` request, same `Bearer` header and same `APIClientError` mapping switch as `healthSync` (200 → decode, 401 → `.unauthorized`, 400 → `.badRequest`, other → `.server(code)`). No request body.
- `SyncFit/AppSession.swift` — new published state:
  ```swift
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
  func fetchPlan() async  // non-throwing — folds all errors into planFetchStatus
  ```
  `init` synchronously loads `PlanCache` (so first paint shows last-known plan with no flash). `fetchPlan()`:
  - sets `.loading`
  - calls `APIClient.getPlanWeek()`
  - on success: updates `planWeek`, `planFetchedAt = Date()`, `planFetchStatus = .ok`, writes to `PlanCache`.
  - on `APIClientError.unauthorized`: clears the cache, sets `planWeek = nil` and `planFetchedAt = nil`, sets `deviceToken = nil` (existing path) so `RootView` flips back to `PairingView`.
  - on any other error: keeps existing `planWeek` (if any), sets `.stale(reason)` if cache exists, else `.failed(reason)`.
- `SyncFit/Views/HomeView.swift` — full rewrite per §2.1 / §2.2. Composes `WeekStrip` + `PlanDetailCard`. Owns `@State var selectedDow: Int` (initialized to `resolvedWeek.todayDow` whenever the resolver runs; user taps override). `.task { await session.fetchPlan() }` on appear; `.refreshable { await session.fetchPlan() }` for pull-to-refresh.
- `ios/SyncFit/project.yml` — no manual edit needed; the existing recursive `sources:` globs pick up new files. Workflow change: `xcodegen generate` must be run after adding any of the new Swift files.

### 4.3 iOS error & cache flow

| Network outcome | `planFetchStatus` | UI shown |
|---|---|---|
| 200, first load ever | `.ok` | strip + detail (live data), cache written |
| 200, refresh | `.ok` | strip + detail (live data), cache updated |
| Transport / 5xx, no cache | `.failed(reason)` | "Couldn't load your plan. Pull to refresh." |
| Transport / 5xx, cache present | `.stale(reason)` | strip + detail (cached) + warm banner "⚠ offline — last updated Xh ago" |
| 401 (any time) | (token cleared) | `RootView` flips to `PairingView`; cache cleared |
| 200, `days: []` | `.ok` | empty-state banner; no strip |

### 4.4 Refresh model

- **App launch:** `HomeView.task` fires `fetchPlan()` once. `AppSession.init` already loaded cache synchronously so the user sees something during the network call.
- **Pull-to-refresh:** standard SwiftUI `.refreshable`, calls `fetchPlan()`.
- **Sync now:** unchanged — calls `syncNow()` (HealthKit upload only), does NOT call `fetchPlan()`.
- **`scenePhase` foreground:** no auto-refetch in v2.1.

## 5. Testing strategy

| Layer | Tests | Location |
|---|---|---|
| Server | 4 unit tests on `handlePlanWeek` (401, 200, 500, empty days) | `tests/plan-week-handler.test.ts` |
| Server | None new — `getPlanForUser` is already covered transitively | — |
| iOS | PlanResolver fold + chip mapping + today selection across TZs | `SyncFitTests/PlanResolverTests.swift` |
| iOS | PlanWeek JSON decoding round-trip + edge cases | `SyncFitTests/PlanWeekDecodingTests.swift` |
| iOS | PlanCache round-trip + corrupt + clear | `SyncFitTests/PlanCacheTests.swift` |
| iOS | `APIClient.getPlanWeek` error mapping (extends existing pattern) | `SyncFitTests/APIClientTests.swift` |

Pre-merge gates unchanged: `npm test` + `npx tsc --noEmit` + `npm run lint` + `npm run format:check` + `npm run build`; `xcodebuild test` from `ios/SyncFit/` for iOS changes. No new integration-test class.

## 6. Rollout

Purely additive. No schema migration. No breaking change to `/api/health/sync` or `/api/devices/pair`. Existing iOS builds keep working (they just don't see a plan); rebuilt iOS gets the new home screen on first launch.

Sequence:
1. Land server changes (`handlePlanWeek` + route + unit tests). Ship to production.
2. Land iOS changes; regenerate `SyncFit.xcodeproj`; run `xcodebuild test`; ship via TestFlight.

No flag, no staging, no fallback toggle — the new home screen is the home screen.
