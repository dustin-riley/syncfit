# iOS Companion App — Design Spec

**Date:** 2026-05-23
**Status:** Approved (brainstorming) — pending implementation plan

## 1. Goal & Scope

Add a native iOS companion app that reads Apple Health data (HRV, resting
heart rate, sleep duration) on-device and uploads daily values to the
SyncFit backend, where they become additional context in the AI readiness
analysis. The web app remains the primary surface; iOS exists to bridge
HealthKit into the readiness prompt.

**Audience:** You + a few testers via TestFlight. Same lightweight multi-user
model as the rest of SyncFit. Not an App Store release yet.

### In scope (v1)

- Native Swift / SwiftUI iOS app distributed via TestFlight.
- HealthKit read access for HRV, resting heart rate, sleep duration.
- Per-metric fallback ladder computed on device, with a `freshness` tag
  attached to every value.
- Device-pairing auth: short code minted by the web app, redeemed by iOS
  for a long-lived bearer token (Keychain on device, hashed in DB).
- Foreground-only sync (app-launch + manual "Sync now"). No background
  delivery, no APNs, no push.
- Backend `health_metric` table + `POST /api/health/sync` endpoint.
- `loadHealthSignals` pure aggregator (today + 7-day baseline) feeding the
  readiness prompt.
- Health-signals block added to `buildPrompt`, omitted entirely when all
  metrics are missing (safe-rollout, mirroring the existing `goal` pattern).

### Explicitly deferred

- **v2 (dashboard card):** Visible HRV / RHR / sleep widget on the
  dashboard alongside trailing-load. Stale-data banner. Background sync via
  `HKObserverQuery` + `BGAppRefreshTask` only if foreground-only proves too
  stale in practice.
- **v3 (full physiological readiness):** Sleep stages (deep / REM),
  30-day trend lines in prompt and UI, combined readiness model replacing
  the strength-load-only verdict, Sign in with Apple as a Better Auth OAuth
  provider, Apple Health active energy / exercise minutes (paired with the
  endurance/Strava v2 work).

### Non-goals

- Android / Health Connect. Apple-only.
- Server-side storage of raw HealthKit samples. The on-device picker is
  the only place raw samples are seen; the server only ever holds the
  chosen daily value.
- Push notifications (readiness reminders, "you didn't sync today").
- App Store submission.

## 2. Tech Stack

- **iOS app:** Native Swift + SwiftUI. Xcode project. Distribution via
  TestFlight (Apple Developer Program required).
- **Backend additions:** Same stack as the rest of SyncFit — Next.js App
  Router, Drizzle, Neon Postgres, Better Auth. No new dependencies on the
  backend beyond a small zod schema for the sync payload.
- **iOS HTTP:** `URLSession` (no third-party HTTP client in v1).
- **iOS storage:** Keychain for the bearer token; `UserDefaults` for
  `lastSyncedAt` only. Nothing else persists on device — the web is the
  source of truth.

## 3. Architecture — Units

Each unit has one purpose, a defined interface, and is independently
testable.

**New units:**

1. **Device pairing** — backend module + `/settings/devices` web page.
   Web mints short-lived pairing codes; iOS redeems for a long-lived
   device token. Custom mini-flow that lives next to Better Auth: Better
   Auth still owns the _user_ session, this owns the _device_ token.
2. **Health ingestion API** — `POST /api/health/sync` (bearer-token auth
   via the device token). Idempotent batched upsert into `health_metric`
   keyed by `(userId, metricDate, type)`. The route validates the payload
   and delegates to a pure persister; no business logic in the handler.
3. **iOS companion app** — reads HealthKit, applies the per-metric
   fallback ladder on device, posts results to the API. Foreground-only
   sync (on launch + manual button).

**Changed units:**

4. **Health-signals aggregator** (`src/lib/health-signals.ts`, _pure_) —
   sibling to `trailing-load`. `loadHealthSignals(userId, now)` returns
   `{ today: {...}, baseline7d: {...}, freshness: {...}, baselineN }`.
   Readiness composes both aggregators in its existing `Promise.all`.
5. **AI engine** (`src/lib/ai-engine.ts`) — `buildPrompt` extended with a
   `## Health signals` block when at least one metric is non-missing.
   Output schema is unchanged.

## 4. Data Model (Postgres / Drizzle)

All three new tables are single-statement writers — they stay on `db`
(neon-http). `txDb` is not needed.

```ts
// One value per (user, day, metric). Scalar only — sleep stages would be
// a separate table when/if added in v3.
healthMetric = pgTable(
  "health_metric",
  {
    id: serial("id").primaryKey(),
    userId: text("user_id").notNull(),
    metricDate: date("metric_date").notNull(), // user's date in APP_TZ
    type: text("type").notNull(), // 'hrv' | 'rhr' | 'sleep_duration_seconds'
    value: numeric("value").notNull(), // ms | bpm | seconds
    source: text("source").notNull(), // which fallback step fired
    freshness: text("freshness").notNull(), // 'fresh' | 'stale_24h' | 'stale_48h'
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(), // original HK sample ts
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    // upsert key; multi-device → last-write-wins. The leading
    // `(user_id, metric_date)` of this unique index also serves the
    // aggregator's (userId, metricDate range) lookups — no separate
    // index needed.
    uniqUserDateType: unique().on(t.userId, t.metricDate, t.type),
  })
);

// One row per paired device. Plaintext token only ever lives on iOS
// Keychain; server stores sha256(token).
deviceToken = pgTable("device_token", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  tokenHash: text("token_hash").notNull().unique(),
  deviceName: text("device_name").notNull(), // "Dustin's iPhone"
  platform: text("platform").notNull().default("ios"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});

// Short-lived (10-min TTL) pairing codes. Deleted on successful redemption.
devicePairing = pgTable("device_pairing", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  code: text("code").notNull().unique(), // 6-digit, displayed on web
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
```

## 5. Auth Model

- **Web routes & server actions** — unchanged; Better Auth session cookie.
- **API routes for the iOS app** (`/api/health/*`, `/api/devices/pair`) —
  bearer token in `Authorization` header. New helper
  `src/lib/device-auth.ts`: `resolveDeviceUser(req) → { userId, deviceId }
| null`. It looks up `tokenHash`, checks `revokedAt`, updates
  `lastUsedAt`. Every API route calls this first; unauth → `401`.
- **Pairing flow** —
  1. Web `/settings/devices` (gated by Better Auth session) →
     `createPairingCode` server action inserts a 6-digit code + 10-min
     `expiresAt`, returns the code. Page polls every ~2s for "code
     redeemed?" so the UI updates without a refresh. One outstanding
     code per user — regenerating deletes the prior row.
  2. iOS `POST /api/devices/pair` with `{ code, deviceName }` → server
     validates code + TTL, deletes the pairing row, mints a 256-bit random
     token, stores `sha256(token)` in `device_token`, returns the
     plaintext token _once_. iOS writes it to Keychain.
- **Revocation** — `/settings/devices` lists paired devices with
  last-used timestamp and a "Revoke" button → sets `revokedAt`. Revoked
  tokens 401 immediately on the next sync.

Sign in with Apple is not added in v1. It can later be introduced as a
new OAuth provider in Better Auth without disturbing the pairing model
— the resulting `account` row links to the same user.

## 6. Per-Metric Fallback Ladder (computed on iOS)

Every uploaded metric carries `{ value, source, freshness, recordedAt }`.
The picker is a pure module on the iOS side and never makes network or
HealthKit calls itself — it operates on pre-fetched samples.

**HRV** (`HKQuantityTypeIdentifier.heartRateVariabilitySDNN`)

1. Latest sample within the previous night's sleep window. The window is
   defined as `[22:00 prior day, end-of-last-asleep-segment]` in `APP_TZ`
   when last night's sleep was tracked; otherwise it falls back to a
   fixed `[22:00 prior day, 09:00 today]` window.
   → `source: "primary"`, `freshness: "fresh"`.
2. Earliest sample today before any `HKWorkout` event.
   → `source: "fallback_morning"`, `freshness: "fresh"`.
3. Most recent sample within trailing 48h.
   → `source: "fallback_48h"`, `freshness: "stale_48h"`.
4. Otherwise: omitted from the upload payload (treated as missing).

**Resting HR** (`HKQuantityTypeIdentifierRestingHeartRate`)

1. Today's Apple-computed daily RHR.
   → `source: "primary"`, `freshness: "fresh"`.
2. Yesterday's daily RHR.
   → `source: "fallback_24h"`, `freshness: "stale_24h"`.
3. Otherwise: omitted.

**Sleep duration** (sum of `HKCategoryValueSleepAnalysis.asleep*` segments)

1. Last night's total asleep time.
   → `source: "primary"`, `freshness: "fresh"`.
2. Otherwise: omitted (no stale fallback; old sleep is not "last night").

The ladder is a closed contract between iOS and backend: backend never
re-tags freshness; it stores what iOS sent. Updating the ladder requires
an iOS app update.

## 7. Data Flow

**(A) First-time setup**

1. User logs into web → opens `/settings/devices` → clicks **Pair iOS app**
   → web shows a 6-digit code + 10-min countdown.
2. User opens iOS app (installed via TestFlight). First-launch flow:
   - HealthKit permission sheet (read access for HRV, RHR, sleep analysis).
   - Pairing screen — single text field for the 6-digit code.
3. iOS posts `{ code, deviceName: UIDevice.current.name }` → backend
   redeems → returns plaintext token once → iOS writes Keychain → UI
   flips to "Paired ✓".
4. Web `/settings/devices` (polling) sees the redemption → shows the new
   device row.

**(B) Daily sync (foreground-only)**

1. User opens iOS app (or taps "Sync now"). App computes today's metrics
   on device via the fallback ladder; metrics whose ladder bottoms out are
   omitted from the payload.
2. iOS also computes _yesterday's_ values and includes them — Apple's
   daily RHR for "today" is often finalized late, so resyncing yesterday
   catches the late-finalized value via the upsert.
3. iOS posts `POST /api/health/sync` with `Authorization: Bearer <token>`:
   ```json
   {
     "uploads": [
       {
         "metricDate": "2026-05-23",
         "type": "hrv",
         "value": 42.5,
         "source": "primary",
         "freshness": "fresh",
         "recordedAt": "2026-05-23T06:14:00-04:00"
       },
       {
         "metricDate": "2026-05-23",
         "type": "rhr",
         "value": 58,
         "source": "primary",
         "freshness": "fresh",
         "recordedAt": "2026-05-23T03:00:00-04:00"
       },
       {
         "metricDate": "2026-05-22",
         "type": "rhr",
         "value": 56,
         "source": "primary",
         "freshness": "fresh",
         "recordedAt": "2026-05-22T03:00:00-04:00"
       }
     ]
   }
   ```
4. Server validates token → upserts on `(userId, metricDate, type)` →
   returns `{ accepted, updated }`. iOS updates `lastSyncedAt`.

**(C) Readiness with health context**

1. User clicks **Analyze readiness** on the web dashboard (unchanged
   button).
2. `runReadinessAnalysis` reads three sources in its existing
   `Promise.all`:
   - `getPlanForUser(userId)` (existing)
   - `loadTrailingLoad(userId, now, 72)` (existing)
   - `loadHealthSignals(userId, now)` (**new**, pure) →
     `{ today, baseline7d, freshness, baselineN }`.
3. `buildPrompt(input)` includes a `## Health signals` block when at
   least one metric is non-missing:
   ```
   ## Health signals
   HRV today: 42.5 ms (fresh) — 7-day avg 46.1 ms
   RHR today: 58 bpm (fresh) — 7-day avg 55 bpm
   Sleep last night: 6h 12m (fresh) — 7-day avg 7h 02m
   ```
   When all three are missing, the block is omitted entirely (safe-rollout,
   same shape as the existing `goal` omission).
4. AI returns the same `{ verdict, headline, rationale, modifications:
[], todayAdjustments, progressionSuggestions }` shape — schema
   unchanged.
5. `readiness_analysis.loadSnapshot` jsonb gains the health-signals
   payload alongside trailing-load, so historical analyses remain
   reproducible.

**(D) Edge cases**

- **No paired device** — `loadHealthSignals` returns all-null;
  prompt omits the block; AI behaves exactly as today.
- **Multiple paired devices** — both iPhone and iPad sync; upserts
  collide on `(userId, metricDate, type)` → last-write-wins. Acceptable
  because both read the same HealthKit store.
- **Travel across time zones** — `metricDate` computed by iOS in
  `APP_TZ` (baked into the iOS app as a build constant). Single-timezone
  limitation from the MVP spec carries forward unchanged.

## 8. iOS App Structure

Module layout under `ios/SyncFit/`:

```
SyncFitApp.swift                  // @main, environment wiring
Models/
  HealthMetricUpload.swift        // Codable payload, matches API contract
  PairResponse.swift              // pairing endpoint response shape
Health/
  HealthKitReading.swift          // protocol-backed wrapper interface
  HealthKitClient.swift           // HKHealthStore-backed impl
  MetricPicker.swift              // pure: HK samples → {value, source, freshness}
Coordinator/
  SyncCoordinator.swift           // orchestrates picker + uploader; owns lastSyncedAt
Net/
  APIClient.swift                 // URLSession + bearer header; one method per endpoint
  PairingClient.swift             // POST /api/devices/pair
Views/
  RootView.swift                  // routes to Pairing or Home based on token presence
  PairingView.swift               // 6-digit input + status
  HomeView.swift                  // "Sync now", last-synced, unpair
  PermissionView.swift            // first-run HealthKit prompt
Keychain/
  KeychainStore.swift             // generic typed Keychain
```

**Key design choices:**

- **`MetricPicker` is pure.** Takes an array of pre-fetched HK samples
  plus a reference `now` and returns the chosen value per metric. No
  HealthKit imports inside the picker module itself. Mirrors the project's
  "pure module, no I/O" pattern from `src/lib/`.
- **`HealthKitClient` is protocol-backed.** Real impl wraps `HKSampleQuery`;
  tests use a fake. Same `inject-the-thing-that-touches-the-world` pattern
  as `ai-engine.ts`'s injected `generate`.
- **`SyncCoordinator.run()`** — fetch trailing 48h of samples → picker →
  POST → on success persist `lastSyncedAt`; on 401 clear Keychain and
  surface "re-pair required".
- **No background entitlements.** Just `NSHealthShareUsageDescription`
  in `Info.plist`.
- **Minimal device state.** `lastSyncedAt` in `UserDefaults`, token in
  Keychain. Nothing else.

**HealthKit permission string** (App Store reviews this verbatim):

- `NSHealthShareUsageDescription`: "SyncFit reads your heart rate
  variability, resting heart rate, and sleep data to gauge your training
  readiness."

## 9. Error Handling

Mostly mirrors existing project conventions — fail closed, never persist
partial state, never leak driver messages.

**Pairing**

- **Invalid / expired code** → `400 { error: "invalid_or_expired_code" }`.
  iOS shows "Code expired — generate a new one in the web app." Failed
  redemption of a still-valid code leaves the row in place (typo-tolerant).
- **Code already redeemed** → same `400`. The pairing row is deleted on
  successful redemption, so replay is indistinguishable from "never
  existed" (no enumeration signal).
- **Web tab closed before redemption** — code expires naturally; nothing
  to do.

**Ingestion**

- **Missing / invalid / revoked bearer token** → `401`. iOS clears
  Keychain and routes back to PairingView.
- **Malformed payload** (zod parse fails) → `400 { error:
"invalid_payload" }`. iOS retains the data and surfaces "sync failed,
  try again." No partial write. The zod schema rejects any `metricDate`
  outside `[serverNow − 30 days, serverNow + 1 day]` to guard against
  device-clock skew and backfill abuse; the +1d upper bound tolerates
  TZ differences without admitting truly future dates.
- **All-or-nothing batch.** Upsert loop runs in a single parameterized
  Drizzle `values([...])`. If it fails, nothing persists; iOS retries on
  next launch. The upsert is idempotent so retries are safe.
- **Empty `uploads` array** → `200 { accepted: 0, updated: 0 }`. Not an
  error.

**Health-signals aggregator**

- Pure module, one `db` read. If the query throws, **the readiness flow
  degrades gracefully** — the error is caught in `runReadinessAnalysis`,
  logged, and the function continues _without_ the health context block.
  Health-signal failure must never break the existing AI flow. This is
  the inverse of "AI failure → no persistence": health is additive
  context, so missing it is acceptable; missing the AI verdict is not.
- Missing / null metrics inside the query result → individually omitted
  from the prompt block per the safe-rollout rule.

**iOS app**

- **HealthKit permission denied** — Settings screen shows "HealthKit
  access required" with a deep-link to Settings.app. Sync button disabled.
- **Network failure** — non-blocking banner; `lastSyncedAt` unchanged.
  Retry is the user tapping "Sync now". No retry loop in v1 — the
  foreground-only model makes the user the retry mechanism.
- **Clock skew / future-dated samples** — picker rejects samples with
  `endDate > now + 5m`. Logged on device.

**Not defended against in v1** (intentional):

- Token theft via jailbroken devices. Keychain is the iOS standard; we
  don't go beyond it.
- Replay attacks on `/api/health/sync`. Bearer over HTTPS, no
  nonce/timestamp signing. Revisit if multi-tenant or untrusted users.
- HealthKit data tampering. Apple has its own provenance model we don't
  audit.

## 10. Testing Strategy

Layered identically to the rest of SyncFit: pure libs unit-tested
offline; server-action / DB paths integration-tested against the real
Neon; AI mocked everywhere.

**Web — unit (`npm test`, must stay offline)**

- **`src/lib/health-signals.ts`** — pure aggregator. Fixture rows →
  `{ today, baseline7d, freshness, baselineN }`. Cases:
  - All three metrics present, all fresh; baseline over exactly the 7
    preceding days.
  - Today missing HRV but history present → `today.hrv = null`,
    baseline still computed.
  - Mixed freshness propagates untouched (aggregator never re-tags).
  - Only 3 days of history → baseline over those 3, `baselineN: 3` so
    the prompt can disclaim.
  - Zero rows for user → all-null output, no throw.
- **`src/lib/ai-engine.ts` `buildPrompt`** — snapshot tests:
  - With health block (all metrics fresh).
  - With partial block (HRV missing, RHR + sleep present).
  - With all metrics missing → block fully omitted (mirrors the `goal`
    omission test).

**Web — integration (`npm run test:integration`, live Neon, LLM still mocked)**

- **Pairing round-trip** — `itest-*` user → `createPairingCode` →
  `POST /api/devices/pair` → assert `device_token` row exists,
  `device_pairing` row deleted, plaintext token only returned in the
  single response. Re-redeem same code → `400`.
- **Pairing expiry** — insert pairing row with past `expiresAt` →
  redeem → `400`.
- **Health sync** — paired itest user → `POST /api/health/sync` with 3
  metrics → assert rows. Re-post with different values → assert
  last-write-wins. Post with revoked token → `401`. Post with malformed
  payload → `400`, no rows written.
- **Readiness with health context** — itest user with seeded
  `workout_set` + `health_metric` rows + planned session →
  `runReadinessAnalysis({ userId, now, generate: mockGenerate })` →
  assert the prompt contains `## Health signals`; assert
  `readiness_analysis.loadSnapshot` includes the health payload.
- **Readiness degrades gracefully** — itest user with no `health_metric`
  rows → prompt does _not_ contain the health block; analysis succeeds.

All integration tests self-clean via the existing `itest-*` user
pattern.

**iOS — unit (XCTest)**

- **`MetricPicker`** — the fallback ladder is the highest-value test
  target. Fixture sample arrays → assert chosen
  `{ value, source, freshness }` for:
  - HRV: sample in last night's window → `primary`, `fresh`.
  - HRV: nothing in sleep window, one this morning → `fallback_morning`,
    `fresh`.
  - HRV: only a sample 40h ago → `fallback_48h`, `stale_48h`.
  - HRV: nothing in 72h → omitted.
  - RHR: today's daily RHR present → `primary`. Only yesterday's →
    `stale_24h`.
  - Sleep: last night present → `primary`. Older only → omitted (no
    stale sleep).
- **`SyncCoordinator`** — fake `HealthKitReading` and fake `APIClient`;
  assert payload composition and that `lastSyncedAt` only updates on
  success.
- **`KeychainStore`** — round-trip a token; `clear()` actually clears.

**iOS — no integration tests in v1.** Manual TestFlight verification
covers the HealthKit / Keychain end-to-end path. Revisit in v2.

**CI:** existing matrix unchanged — `npm test` + `tsc` + `lint` +
`format:check` + `npm run build`, with `npm run test:integration` on
server-action / DB-touching branches. iOS tests run locally / on-device
in v1; no macOS GitHub Actions runner needed yet.

## 11. Open Items for Implementation

- **Apple Developer Program enrollment** ($99/yr) — required before any
  TestFlight build. Backend work can begin without it.
- **iOS code location** — sibling `ios/` directory in this repo vs. a
  separate `syncfit-ios` repo. Default suggestion: sibling for v1, split
  later if it gets noisy.
- **Bundle ID** — e.g., `com.<your-org>.syncfit.companion`. Pick before
  generating the Xcode project (rename later is painful).
- **Pairing-code rate-limit shape** — default: one outstanding code per
  user, regenerating deletes the prior row. Confirm.
- **Token rotation policy** — v1 = non-expiring until revoked. Sliding
  refresh / hard expiry is a v3 question.
- **HealthKit permission strings** — final wording reviewed against App
  Store HIG before TestFlight upload.
- **Cleanup job for expired pairing rows** — needed once the table sees
  real volume; not blocking v1 since rows are tiny and infrequent.
