# iOS live workout logging — design

**Status:** approved (brainstorming complete; ready for implementation plan)
**Date:** 2026-05-24
**Companion plan:** `docs/superpowers/plans/2026-05-24-ios-live-workout-logging.md` (to be written next)

## 1. Motivation

Today a user logs strength workouts after the fact, either by exporting from the
Strong app and importing the CSV (`/import` web flow → `src/lib/strong-parser.ts`)
or by typing the workout into the web `/log` form (`src/lib/manual-log.ts`).
Neither path is usable from the gym floor while a workout is happening, and the
iOS companion currently has no logging surface at all — it pairs, shows the
weekly plan, and syncs Apple Health.

This spec adds a live logging surface to the iOS app: the user can start from
one of their planned workouts (today's plan, another day's plan) or start blank,
fill in sets as they happen, and finish to commit the workout to the same
`workout` / `workout_set` rows the web flows already write. The dashboard,
trailing-load aggregator, AI readiness loader, and progression suggester see
live-logged workouts the same way they see imported / web-entered ones — no
per-source branching.

## 2. Scope

**In scope.**

- Strength workouts only (the plan model has no endurance entries).
- A single in-progress workout slot, persisted locally on the device.
- Local-buffered entry: every value the user touches is persisted to disk
  immediately; one atomic POST to a new `/api/workouts` endpoint on Finish.
- Two entry points: a "Start workout" CTA on `PlanDetailCard` and a new Log tab
  with a chooser (today's plan / another day's plan / blank).
- Time-bounded resume: an in-progress workout older than six hours is silently
  discarded on app launch.
- Full mid-session flexibility: add / delete / reorder exercises, edit any
  target, edit any logged set, log extra sets beyond the planned count.

**Out of scope (deferred).**

- Endurance live logging (run / ride / swim with a timer). The plan model has no
  endurance entries, so there is no "start from plan" path; revisit when the
  plan model gains endurance.
- Rest timer between sets. Significant UX scope, real complexity (haptics,
  background-audio behavior); revisit when the rest of live logging is in use.
- Workout history in the iOS app. Web `/dashboard` already shows logged
  workouts; the iOS app gains live entry but not history.
- Background sync of unfinished workouts (no `HKObserverQuery` /
  `BGAppRefreshTask` for workouts; matches the v1 HealthKit decision).
- Multi-device concurrent live sessions. Single in-progress slot, single
  device.
- Editing or deleting finished workouts. Matches the existing web `/log`
  scope (`docs/superpowers/specs/2026-05-17-endurance-and-manual-logging-design.md`).

## 3. Architecture

Mirrors the existing "thin actions / routes over pure libs" split.

**Server.** One new route `src/app/api/workouts/route.ts`. Bearer-token auth via
the existing `resolveDeviceUser(req)` in `src/lib/device-auth.ts` (same model as
`/api/health/sync`). The handler validates a zod payload and delegates to
`logStrengthWorkout` in `src/lib/manual-log.ts` — the same `txDb` atomic insert,
the same `unique(userId, contentHash)` dedup, the same `sequenceStrengthSets`
helper that computes per-exercise `setNumber`. One small change to
`manual-log.ts`: `logStrengthWorkout` accepts an optional `source` argument
(default `"manual"`), so the iOS route can pass `"ios_live"` and the dashboard
can distinguish entry channels later. No schema change, no migration.

**iOS structure.** Two new directories under `ios/SyncFit/SyncFit/`:

- `LiveWorkout/` — pure-Swift module.
  - `LiveWorkoutDraft.swift` — `Codable` model (workout-in-progress, draft
    exercises, logged sets, per-exercise `pendingSet`).
  - `LiveWorkoutPersistence.swift` — pure file I/O: round-trip Codable to
    `Documents/live-workout.json`, age-out check, schema-version guard.
  - `LiveWorkoutStore.swift` — `@MainActor ObservableObject` wrapping the model
    + persistence: start-from-plan / start-blank / append-set / edit / delete /
    reorder / promote-pending / auto-commit-dirty / finish / discard. Saves to
    disk on every mutation.
- `Views/LiveWorkout/`.
  - `LiveWorkoutView.swift` — sheet root, vertical exercise list, header CTAs.
  - `ExerciseCard.swift` — done / current / upcoming variants (layout C from
    brainstorming).
  - `ActiveSetEntry.swift` — stepper block (±5/±2.5 lb on weight, ±1 on reps)
    with tap-to-type fallback (set-entry B from brainstorming).
  - `FinishWorkoutSheet.swift` — title edit + Submit + POST result handling.
- `Views/Log/LogView.swift` — Log tab root (chooser).
- `Models/PostWorkout.swift` — request/response Codable for the new endpoint.

**Existing files modified.**

- `RootView.swift` — wrap the signed-in branch in a `TabView` (Home + Log) and
  add a `.sheet(item: $session.liveDraft)` for the live workout.
- `AppSession.swift` — own a `LiveWorkoutStore`; expose `liveDraft` (binding
  for sheet presentation) and `liveDraftAvailable` (signal for resume banner).
- `PlanDetailCard.swift` — add the "Start workout" CTA (reads "Start blank
  workout" when the selected day has zero exercises).
- `HomeView.swift` — show a "Resume workout — started Nm ago" banner above
  the week strip when `liveDraftAvailable != nil`.
- `Net/APIClient.swift` — add `postWorkout(_:) async throws -> PostWorkoutResponse`.

**Design system.** All new SwiftUI views use `DesignTokens.swift` (`DSColor`,
`DSRadius`, etc.) — no hard-coded hex/px. Three radii / warm palette per the
existing iOS conventions.

## 4. Data model

**iOS local draft** (`LiveWorkoutDraft`, persisted as
`Documents/live-workout.json`).

```swift
struct LiveWorkoutDraft: Codable, Equatable {
    let id: UUID                  // local-only; not sent to server
    let startedAt: Date           // also serves as performedAt on POST
    var title: String             // pre-filled from plan day title or "Workout"
    var exercises: [DraftExercise]
    let schemaVersion: Int        // = 1; bump + discard-on-mismatch
}

struct DraftExercise: Codable, Equatable, Identifiable {
    let id: UUID
    var name: String
    var targetSets: Int?          // nil for unplanned additions
    var targetReps: Int?
    var targetWeight: Double?
    var loggedSets: [LoggedSet]
    var pendingSet: PendingSet?   // current next-set values for the active block
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
    var dirty: Bool               // true after any user touch; gates auto-commit
}
```

**Computed "current exercise."** Not stored. The active exercise is the
topmost where `loggedSets.count < (targetSets ?? .max)`. Logging the planned
set count auto-advances; logging extras keeps you on the same exercise; tapping
an upcoming exercise overrides (and the auto-commit-on-navigate behavior fires
on the previously-current one first).

**Server payload** (POST `/api/workouts`).

```json
{
  "performedAt": "2026-05-24T17:42:00Z",
  "title": "Pull Day",
  "sets": [
    { "exerciseName": "Pull-ups",    "weight": 0,   "reps": 10 },
    { "exerciseName": "Pull-ups",    "weight": 0,   "reps": 9 },
    { "exerciseName": "Barbell Row", "weight": 135, "reps": 8 }
  ]
}
```

Flattened — exercise grouping is implicit from `exerciseName` plus row order.
`sequenceStrengthSets` computes per-exercise `setNumber`; `seq` is the row
index. Built from the draft by flattening `exercises` → `loggedSets` plus any
dirty `pendingSet` auto-committed first. Response:
`{ ok: bool, added: 0|1, skipped: 0|1, error?: string }`.

**Server schema.** Untouched. `workout.source` becomes `"ios_live"` for these
rows (the `logStrengthWorkout` signature change is the only library edit).

**Dedup.** `contentHash = sha256({ performedAt, title, sets })`. A double-tap
Finish (retry after ambiguous network result) hits `onConflictDoNothing` and
returns `{ skipped: 1 }`; iOS treats that as success and clears local state.

## 5. Screens & user flows

### 5.1 Entry points

**Home CTA.** `PlanDetailCard` gains a primary "Start workout" button. Always
starts from the currently-selected weekday's plan. If the day has zero
exercises (rest day or empty), the label reads "Start blank workout"; pressed,
builds an empty draft.

**Log tab.** New tab next to Home. Root view is a chooser:

- "Start today's workout" (disabled if today's plan is empty).
- "Pick another day's plan" → bottom sheet listing the seven weekday cards;
  tap one to start.
- "Start blank workout".
- "Resume in-progress workout" (only when a draft exists; mirrors the Home
  banner; one tap into the sheet).

### 5.2 Sheet presentation

`RootView` holds the `.sheet(item: $session.liveDraft)` binding. Starting sets
`liveDraft`, presenting the sheet. Swipe-down (or "Cancel" in the header)
dismisses the sheet — the workout is *paused*, not ended. State stays in
`Documents/live-workout.json`; the Home banner appears. Re-presenting
restores full state.

### 5.3 In-workout screen (layout C: hybrid collapsible)

**Header.** `Close` (left, chevron-down icon — pauses the workout without
discarding) · workout title (center, tappable to edit) · `…` overflow menu
and `Finish` (right). Finish is disabled when no value has been touched
anywhere. The overflow menu's only item is **Discard workout** (Section 5.6).

**Body.** Vertical list of exercise cards in three states:

- **Done** — collapsed to one row: `✓ Name · N sets · top-set weight × reps`
  (e.g., `✓ Barbell Row · 4 sets · 135 × 8`). Tap to re-expand for edits.
- **Current** — expanded. Logged-set rows on top (tap any to inline-edit), then
  the `ActiveSetEntry` block (steppers, tap-to-type, `Log set N` CTA).
- **Upcoming** — preview one row: `Name · target Sets×Reps · weight`. Tap to
  jump-to (auto-commits the previous exercise's dirty pending first).

Below the list: `+ Add exercise` button (sheet with a name field; new exercise
appears at the bottom with no targets, becomes current).

**Per-card context menu** (long-press): Edit name · Move (puts the list into
SwiftUI `EditMode` with standard drag handles; tap Done to exit) · Delete (with
confirmation when the card has logged sets, silent otherwise).

### 5.4 Set entry

The active block binds directly to the current exercise's `pendingSet`. Any
stepper tap or tap-to-type write sets `pendingSet.dirty = true` and persists to
disk. Tapping **Log set N** appends `pendingSet → loggedSets`, resets
`pendingSet` (pre-filled from the just-logged values, `dirty = false`).

**Pre-fill rule.** For the first pending set on an exercise: plan target
(or `weight = 0, reps = 0` for unplanned additions). For subsequent pending
sets on the same exercise: the values of the last logged set on that exercise.

**Log set CTA gating.** Disabled when `pendingSet.reps < 1` (prevents the
unplanned-zeros pre-fill from being committed without user input; matches the
server's `validateStrengthInput`).

**Auto-commit-on-navigate.** Jumping to a different exercise (tap-to-jump or
auto-advance) auto-commits the previous exercise's `pendingSet` iff
`dirty == true && reps ≥ 1`. Same on Finish.

**No fabrication.** A pending set that was never touched is never auto-committed.

**Dirty-but-invalid pendings** (e.g., user changed weight but never set reps,
then hit Finish) are not auto-committed; the pending survives on its exercise
so the user keeps the weight value on Resume. On Finish, dirty-but-invalid
pendings are silently excluded from the POST payload (the user has hit Finish
with an incomplete entry — we accept the workout and drop the half-entered
set rather than block Finish or fabricate a `reps = 0` row that fails the
server's `validateStrengthInput`).

### 5.5 Finish flow

Tap **Finish** → `FinishWorkoutSheet`: editable title (default = `draft.title`),
summary count of exercises and sets. Tap **Submit** → store flattens to the
POST payload (auto-committing any dirty pending sets first) →
`APIClient.postWorkout(...)`.

- Success (`added: 1` or `skipped: 1`) — dismiss sheets, clear local file,
  show toast "Workout saved" on Home.
- 401 — clear keychain (existing `AppSession.unpair` pattern), preserve local
  state, alert "Pairing expired — re-pair this device". After re-pair, Resume
  works.
- 400 (validation) — alert with the server message, sheet stays open. Should
  never happen because Finish is disabled on no-touch; the server is the
  source of truth.
- Network / 5xx — preserve local state, alert with **Retry**. User can also
  dismiss the alert and try later via Home → Resume.

### 5.6 Discard flow

Header `…` menu → **Discard workout** → confirm alert ("All logged sets will be
lost") → store clears the local file and dismisses the sheet.

### 5.7 Resume flow

On `AppSession.init`, `LiveWorkoutPersistence.load()` reads the JSON file. If
`startedAt > 6h ago` or `schemaVersion ≠ 1`, the file is deleted and state is
cleared (silent age-out). Otherwise the draft becomes
`session.liveDraftAvailable` (distinct from `liveDraft`, which controls sheet
presentation). The Home banner shows "Resume workout — started Nm ago" with a
Resume button; tapping it sets `liveDraft = liveDraftAvailable` and the sheet
opens with full state.

## 6. Error handling & edge cases

**Network / server (Finish POST).**

- Transport error or 5xx → local state preserved, alert with Retry.
- 401 → clear keychain, preserve state, alert + re-pair flow.
- 400 → alert with server message; sheet stays open.
- 200 `{ skipped: 1 }` → treated as success: clear local file, dismiss sheet,
  toast. (Recovery path for "I hit Finish, network blipped, the row actually
  committed, I tapped Retry.")

**Local file I/O.**

- Read failure on launch → silently clear state.
- Write failure on mutation → log to console, keep in-memory state. Next
  successful write recovers. Not surfaced to the user.
- JSON decode failure on launch → delete the file, clear state, silent.

**Concurrency / state races.**

- "Start" tapped while a draft already exists → don't silently overwrite.
  Alert "Finish or discard the current workout first" with a Resume button.
- Double-tap Finish → the Submit button disables on tap (`isSubmitting` flag).
- App killed during finish-POST → draft is not cleared until success, so
  Resume restores everything; Finish-again → dedup hash → `skipped: 1` →
  cleared.

**Age-out & schema.**

- Draft older than 6h on launch → deleted, no prompt.
- `schemaVersion ≠ 1` → deleted, no prompt. No migrations for a single-row
  local cache.

**Inputs.**

- Finish disabled when the POST payload would be empty — i.e.,
  `Σ loggedSets.count + Σ (pendingSet.dirty && pendingSet.reps ≥ 1 ? 1 : 0)`
  across exercises is zero. (A dirty-but-invalid pending alone does not enable
  Finish, since it would be silently excluded from the payload per Section 5.4.)
- Stepper / tap-to-type enforce `weight ≥ 0`, `reps ≥ 1` on the way in;
  `validateStrengthInput` on the server is authoritative.
- Add Exercise sheet rejects empty/whitespace names.

## 7. Testing

**iOS unit (XCTest, `xcodebuild test`).** New files in
`ios/SyncFit/SyncFitTests/`:

- `LiveWorkoutDraftTests.swift` — pure model: `startFromPlan` builds the right
  exercises; `startBlank` yields empty; appending logged sets / promoting
  pending; current-exercise computation walks past done; auto-commit on Finish
  only includes dirty pending sets; no fabrication of untouched pendings.
- `LiveWorkoutPersistenceTests.swift` — round-trip equality; missing file →
  `nil`; corrupted JSON → `nil` + deletes the file; `startedAt > 6h` → `nil`
  + deletes; `schemaVersion ≠ 1` → `nil` + deletes. Against a temp
  `FileManager` directory.
- `LiveWorkoutStoreTests.swift` — observable mutations persist; navigation
  auto-commits dirty pending; discard clears file + state; starting while
  in-progress doesn't overwrite; finish-success clears, finish-failure
  preserves.
- `PostWorkoutTests.swift` — request/response Codable shapes match the route's
  zod schema (ISO dates, key casing).

**Web unit (Vitest, `npm test`).** No new tests: `tests/manual-log.test.ts`
already covers validation, `sequenceStrengthSets`, `contentHash`. Reuse is
the point.

**Web integration (Vitest, `npm run test:integration`, live Neon).** New
`tests/integration/api-workouts.test.ts`. Directly invokes the route
(`import { POST } from "@/app/api/workouts/route"`); no dev server.

- Happy path — returns `{ ok, added: 1 }`; assert one `workout` row + N
  `workout_set` rows with correct `(setNumber, seq, source: "ios_live")`.
- Dedup — same payload posted twice returns `{ added: 1 }` then
  `{ skipped: 1 }`; one row exists.
- Bearer-token auth — missing/malformed header → 401; a token for user A
  can't write into user B's rows (scoping).
- Validation — empty `sets` → 400; negative reps → 400; bad ISO date → 400.
- Self-cleaning via the existing `itest-*` user convention.

**Standard gate.** `npx tsc --noEmit`, `npm run lint`, `npm run format:check`,
`npm run build`. iOS verified via the `ios-build-checker` subagent.

**Manual smoke (iOS Simulator, after green automated tests).**

- Start from plan / start blank / log sets / navigate exercises.
- Dismiss sheet → Home shows Resume banner → tap → sheet restores state.
- Age-out: override `startedAt` in `Documents/live-workout.json` to >6h,
  relaunch, verify silent discard.
- Finish-success: verify the workout shows up on web `/dashboard`.
- Finish-failure: point `Config.swift` at a bad host, verify Retry preserves
  state.
- Discard with confirmation.

**Explicitly out of scope.** No SwiftUI snapshot tests (no harness in the
project today). No end-to-end iOS↔server tests (manual smoke covers the
seam). No load tests (single-user MVP).
