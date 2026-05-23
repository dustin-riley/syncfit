# iOS Companion — Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship the backend half of the iOS companion feature — Drizzle schema, device pairing flow, ingestion API, health-signals aggregator, and readiness prompt integration — so the iOS app (Plan B) has working endpoints to call and readiness analyses can already include Apple Health context as soon as data starts flowing.

**Architecture:** Three new tables (`health_metric`, `device_token`, `device_pairing`), two new API routes (`POST /api/devices/pair`, `POST /api/health/sync`) authenticated by bearer device tokens, one web settings page for pairing, and a pure `loadHealthSignals` aggregator that joins the existing `Promise.all` in `runReadinessAnalysis`. `buildPrompt` gains a `## Health signals` block that is omitted entirely when all metrics are missing (same safe-rollout shape as the `goal` line).

**Tech Stack:** Next.js 16 App Router (Node runtime), Drizzle ORM, Neon Postgres (`db` neon-http — no `txDb` needed), Better Auth for the web session on `/settings/devices`, zod for payload validation, Node `crypto` for token + code generation. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-23-ios-companion-app-design.md`

---

## File Structure

**Create:**
- `src/lib/health-signals.ts` — pure aggregator: `loadHealthSignals(userId, now)` returns today + 7-day baseline + freshness per metric.
- `src/lib/device-auth.ts` — `resolveDeviceUser(req)` bearer-token validator + `hashToken(plaintext)` helper.
- `src/lib/health-pairing.ts` — `generatePairingCode()`, `mintDeviceToken()`, plus the small pure validation helpers around expiry.
- `src/app/actions/devices.ts` — `createPairingCode`, `revokeDevice` server actions for the web settings page.
- `src/app/api/devices/pair/route.ts` — `POST /api/devices/pair`.
- `src/app/api/health/sync/route.ts` — `POST /api/health/sync`.
- `src/app/(app)/settings/devices/page.tsx` — server component (renders current devices + pairing UI shell).
- `src/app/(app)/settings/devices/devices-client.tsx` — client component (generate code, poll for redemption, revoke).
- `tests/health-signals.test.ts` — unit tests for the aggregator.
- `tests/health-pairing.test.ts` — unit tests for code/token helpers.
- `tests/device-pair.integration.test.ts` — pairing round-trip integration.
- `tests/health-sync.integration.test.ts` — ingestion endpoint integration.

**Modify:**
- `src/db/schema.ts` — three new tables.
- `src/lib/ai-engine.ts` — `AnalyzeInput` + `buildPrompt` gain optional `healthSignals`.
- `src/lib/readiness.ts` — load health signals in the existing `Promise.all`, include in prompt input + `loadSnapshot`.
- `src/app/(app)/site-nav.tsx` — add "Devices" link in the user-menu dropdown.
- `src/lib/nav.ts` — only if `NAV_ITEMS` is the right place for the settings link; usually settings live under the user-menu, so this is likely untouched. Leave alone if the existing dropdown handling already takes raw `<Link>`s.
- `tests/ai-engine.test.ts` — three new cases (block present, partial block, all-missing → omitted).
- `tests/readiness.integration.test.ts` — one new case (E) verifying health context is in prompt + `loadSnapshot`.

**Generated (do not hand-edit):**
- `drizzle/NNNN_*.sql` — migration emitted by `drizzle-kit generate`.

---

## Task 1: Add three tables to the Drizzle schema, generate & push migration

**Files:**
- Modify: `src/db/schema.ts`
- Generated: `drizzle/NNNN_*.sql` (next migration)

- [ ] **Step 1: Append the three new tables to `src/db/schema.ts`.**

  Append at the bottom of the file, right *before* the existing `export * from "./auth-schema";` line:

  ```ts
  // ===== iOS companion =====

  export const healthMetric = pgTable(
    "health_metric",
    {
      id: uuid("id").defaultRandom().primaryKey(),
      userId: text("user_id").notNull(),
      // user's date in APP_TZ ("America/New_York"), computed on iOS
      metricDate: date("metric_date").notNull(),
      // 'hrv' | 'rhr' | 'sleep_duration_seconds'
      type: text("type").notNull(),
      // ms for hrv, bpm for rhr, seconds for sleep_duration_seconds
      value: numeric("value").notNull(),
      // which step of the fallback ladder fired ('primary' | 'fallback_morning' | ...)
      source: text("source").notNull(),
      // 'fresh' | 'stale_24h' | 'stale_48h'
      freshness: text("freshness").notNull(),
      // original HealthKit sample timestamp
      recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull(),
      createdAt: timestamp("created_at", { withTimezone: true })
        .defaultNow()
        .notNull(),
    },
    (t) => ({
      // upsert key; multi-device → last-write-wins
      uniqUserDateType: unique().on(t.userId, t.metricDate, t.type),
    })
  );

  export const deviceToken = pgTable("device_token", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    // sha256(plaintextToken). Plaintext only ever lives on iOS Keychain.
    tokenHash: text("token_hash").notNull().unique(),
    deviceName: text("device_name").notNull(),
    platform: text("platform").notNull().default("ios"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  });

  export const devicePairing = pgTable("device_pairing", {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    // 6-digit numeric code, unique while live
    code: text("code").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  });
  ```

- [ ] **Step 2: Generate the migration SQL (does not touch the DB).**

  Run:

  ```bash
  node --env-file=.env.local ./node_modules/.bin/drizzle-kit generate
  ```

  Expected: a new file under `drizzle/` (e.g. `drizzle/0001_<name>.sql`) is created containing `CREATE TABLE` for `health_metric`, `device_token`, `device_pairing` plus the `unique` constraints.

- [ ] **Step 3: Eyeball the generated SQL.**

  Open the new `drizzle/NNNN_*.sql` file. Confirm:
  - Three `CREATE TABLE` statements.
  - `health_metric` has `UNIQUE (user_id, metric_date, type)`.
  - `device_token` has `UNIQUE (token_hash)`.
  - `device_pairing` has `UNIQUE (code)`.
  - No accidental `DROP` or `ALTER` on existing tables.

- [ ] **Step 4: Apply the migration to live Neon.**

  Run:

  ```bash
  node --env-file=.env.local ./node_modules/.bin/drizzle-kit push
  ```

  Expected output ends with `Changes applied`. If the harness blocks the command (the destructive-write guard sometimes triggers on Neon writes), surface it to the user with the same command prefixed by `!` so they can run it interactively — the user-run-DB-ops memory covers this case.

- [ ] **Step 5: Verify the tables exist by introspecting from a one-off script.**

  Run a quick read:

  ```bash
  node --env-file=.env.local -e "
  const { neon } = require('@neondatabase/serverless');
  const sql = neon(process.env.DATABASE_URL);
  sql\`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('health_metric','device_token','device_pairing') ORDER BY table_name\`.then(r => { console.log(r); process.exit(0); }).catch(e => { console.error(e); process.exit(1); });
  "
  ```

  Expected: three rows printed (`device_pairing`, `device_token`, `health_metric`).

- [ ] **Step 6: Commit.**

  ```bash
  git add src/db/schema.ts drizzle/
  git commit -m "feat(ios): schema for health_metric, device_token, device_pairing"
  ```

---

## Task 2: Pure `health-signals` aggregator + unit tests (TDD)

**Files:**
- Create: `tests/health-signals.test.ts`
- Create: `src/lib/health-signals.ts`

- [ ] **Step 1: Write the failing unit test first.**

  Create `tests/health-signals.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import { computeHealthSignals, type HealthRow } from "@/lib/health-signals";

  // NOW: 2026-05-13T16:00:00Z → America/New_York Wed 2026-05-13 12:00 EDT
  const NOW = new Date("2026-05-13T16:00:00Z");
  const today = "2026-05-13";
  const d = (offset: number) => {
    // returns a date string offset days from today (negative = past)
    const x = new Date(NOW.getTime() + offset * 86_400_000);
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/New_York",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(x);
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  };

  const row = (
    metricDate: string,
    type: string,
    value: number,
    freshness: "fresh" | "stale_24h" | "stale_48h" = "fresh"
  ): HealthRow => ({
    metricDate,
    type,
    value,
    freshness,
    source: "primary",
    recordedAt: new Date(metricDate + "T07:00:00Z"),
  });

  describe("computeHealthSignals", () => {
    it("returns all-null with baselineN=0 when no rows", () => {
      const r = computeHealthSignals([], NOW);
      expect(r.today).toEqual({ hrv: null, rhr: null, sleepDuration: null });
      expect(r.baseline7d).toEqual({
        hrv: null,
        rhr: null,
        sleepDuration: null,
      });
      expect(r.freshness).toEqual({
        hrv: null,
        rhr: null,
        sleepDuration: null,
      });
      expect(r.baselineN).toBe(0);
    });

    it("computes today values with freshness propagated", () => {
      const rows: HealthRow[] = [
        row(today, "hrv", 42.5),
        row(today, "rhr", 58),
        row(today, "sleep_duration_seconds", 22320, "stale_24h"),
      ];
      const r = computeHealthSignals(rows, NOW);
      expect(r.today.hrv).toBe(42.5);
      expect(r.today.rhr).toBe(58);
      expect(r.today.sleepDuration).toBe(22320);
      expect(r.freshness.sleepDuration).toBe("stale_24h");
    });

    it("computes 7-day baseline over the 7 days preceding today only", () => {
      const rows: HealthRow[] = [
        row(d(-1), "hrv", 40),
        row(d(-2), "hrv", 50),
        row(d(-3), "hrv", 60),
        // today's value is NOT part of the baseline
        row(today, "hrv", 100),
        // outside the 7-day window
        row(d(-8), "hrv", 999),
      ];
      const r = computeHealthSignals(rows, NOW);
      expect(r.baseline7d.hrv).toBeCloseTo(50, 5);
      expect(r.baselineN).toBe(3);
    });

    it("missing today value still returns baseline from history", () => {
      const rows: HealthRow[] = [
        row(d(-1), "rhr", 56),
        row(d(-2), "rhr", 58),
      ];
      const r = computeHealthSignals(rows, NOW);
      expect(r.today.rhr).toBeNull();
      expect(r.baseline7d.rhr).toBe(57);
    });

    it("baselineN is the max samples across the three metrics", () => {
      // hrv has 3 days of history, rhr has 5, sleep has 0
      const rows: HealthRow[] = [
        row(d(-1), "hrv", 40),
        row(d(-2), "hrv", 45),
        row(d(-3), "hrv", 50),
        row(d(-1), "rhr", 55),
        row(d(-2), "rhr", 56),
        row(d(-3), "rhr", 57),
        row(d(-4), "rhr", 58),
        row(d(-5), "rhr", 59),
      ];
      const r = computeHealthSignals(rows, NOW);
      expect(r.baselineN).toBe(5);
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails.**

  Run:

  ```bash
  npx vitest run tests/health-signals.test.ts
  ```

  Expected: failure with `Cannot find module '@/lib/health-signals'`.

- [ ] **Step 3: Implement `src/lib/health-signals.ts` (pure compute + DB read function).**

  Create `src/lib/health-signals.ts`:

  ```ts
  import { and, eq, gte, inArray } from "drizzle-orm";
  import { db } from "@/db";
  import { healthMetric } from "@/db/schema";
  import { APP_TZ } from "@/lib/units";

  export type Freshness = "fresh" | "stale_24h" | "stale_48h";

  export type HealthRow = {
    metricDate: string; // 'YYYY-MM-DD'
    type: string; // 'hrv' | 'rhr' | 'sleep_duration_seconds'
    value: number;
    source: string;
    freshness: Freshness;
    recordedAt: Date;
  };

  export type HealthSignals = {
    today: {
      hrv: number | null;
      rhr: number | null;
      sleepDuration: number | null;
    };
    baseline7d: {
      hrv: number | null;
      rhr: number | null;
      sleepDuration: number | null;
    };
    freshness: {
      hrv: Freshness | null;
      rhr: Freshness | null;
      sleepDuration: Freshness | null;
    };
    baselineN: number;
  };

  // Maps the schema string keys to the output keys. Keep here, not in the
  // table — the schema column is the wire format with iOS.
  const KEY_HRV = "hrv";
  const KEY_RHR = "rhr";
  const KEY_SLEEP = "sleep_duration_seconds";

  function todayDateInAppTz(now: Date): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: APP_TZ,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  }

  function avg(nums: number[]): number | null {
    if (nums.length === 0) return null;
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }

  // Pure: takes the raw rows and produces the structured summary. Exported so
  // the aggregator is unit-testable without hitting the DB.
  export function computeHealthSignals(
    rows: HealthRow[],
    now: Date
  ): HealthSignals {
    const today = todayDateInAppTz(now);
    // Build the cutoff (inclusive) for "the 7 days preceding today" by string compare.
    // 'YYYY-MM-DD' sorts lexicographically the same as chronologically.
    const cutoff = todayDateInAppTz(new Date(now.getTime() - 7 * 86_400_000));

    const todayRows = rows.filter((r) => r.metricDate === today);
    const baselineRows = rows.filter(
      (r) => r.metricDate >= cutoff && r.metricDate < today
    );

    const todayVal = (type: string) => {
      const r = todayRows.find((x) => x.type === type);
      return r ? Number(r.value) : null;
    };
    const todayFresh = (type: string): Freshness | null => {
      const r = todayRows.find((x) => x.type === type);
      return r ? r.freshness : null;
    };
    const baseline = (type: string) =>
      avg(baselineRows.filter((r) => r.type === type).map((r) => Number(r.value)));

    const baselineN = Math.max(
      baselineRows.filter((r) => r.type === KEY_HRV).length,
      baselineRows.filter((r) => r.type === KEY_RHR).length,
      baselineRows.filter((r) => r.type === KEY_SLEEP).length
    );

    return {
      today: {
        hrv: todayVal(KEY_HRV),
        rhr: todayVal(KEY_RHR),
        sleepDuration: todayVal(KEY_SLEEP),
      },
      baseline7d: {
        hrv: baseline(KEY_HRV),
        rhr: baseline(KEY_RHR),
        sleepDuration: baseline(KEY_SLEEP),
      },
      freshness: {
        hrv: todayFresh(KEY_HRV),
        rhr: todayFresh(KEY_RHR),
        sleepDuration: todayFresh(KEY_SLEEP),
      },
      baselineN,
    };
  }

  // DB-touching wrapper. Pulls the 8-day window (today + previous 7).
  export async function loadHealthSignals(
    userId: string,
    now: Date
  ): Promise<HealthSignals> {
    const today = todayDateInAppTz(now);
    const cutoff = todayDateInAppTz(new Date(now.getTime() - 7 * 86_400_000));
    const rows = await db
      .select({
        metricDate: healthMetric.metricDate,
        type: healthMetric.type,
        value: healthMetric.value,
        source: healthMetric.source,
        freshness: healthMetric.freshness,
        recordedAt: healthMetric.recordedAt,
      })
      .from(healthMetric)
      .where(
        and(
          eq(healthMetric.userId, userId),
          gte(healthMetric.metricDate, cutoff),
          inArray(healthMetric.type, [KEY_HRV, KEY_RHR, KEY_SLEEP])
        )
      );
    const typed: HealthRow[] = rows.map((r) => ({
      metricDate: r.metricDate,
      type: r.type,
      value: Number(r.value),
      source: r.source,
      freshness: r.freshness as Freshness,
      recordedAt: r.recordedAt,
    }));
    // `today` is included in the query window but excluded from baseline
    // inside computeHealthSignals.
    void today;
    return computeHealthSignals(typed, now);
  }
  ```

- [ ] **Step 4: Run the unit tests and confirm they pass.**

  Run:

  ```bash
  npx vitest run tests/health-signals.test.ts
  ```

  Expected: all 5 cases pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/lib/health-signals.ts tests/health-signals.test.ts
  git commit -m "feat(ios): pure health-signals aggregator with 7-day baseline"
  ```

---

## Task 3: Extend `buildPrompt` with the health block (TDD)

**Files:**
- Modify: `tests/ai-engine.test.ts`
- Modify: `src/lib/ai-engine.ts`

- [ ] **Step 1: Add three failing tests to `tests/ai-engine.test.ts`.**

  Append inside the `describe("ai-engine", () => { ... })` block, right after the existing `goal`-omits test:

  ```ts
    it("buildPrompt includes the health-signals block when at least one metric is non-missing", () => {
      const p = buildPrompt({
        ...input,
        healthSignals: {
          today: { hrv: 42.5, rhr: 58, sleepDuration: 22320 },
          baseline7d: { hrv: 46.1, rhr: 55, sleepDuration: 25320 },
          freshness: { hrv: "fresh", rhr: "fresh", sleepDuration: "fresh" },
          baselineN: 7,
        },
      });
      expect(p).toContain("## Health signals");
      expect(p).toContain("HRV today: 42.5 ms (fresh)");
      expect(p).toContain("7-day avg 46.1 ms");
      expect(p).toContain("RHR today: 58 bpm (fresh)");
      expect(p).toContain("Sleep last night:");
    });

    it("buildPrompt renders partial health block, omitting missing metrics individually", () => {
      const p = buildPrompt({
        ...input,
        healthSignals: {
          today: { hrv: null, rhr: 58, sleepDuration: 22320 },
          baseline7d: { hrv: null, rhr: 55, sleepDuration: 25320 },
          freshness: { hrv: null, rhr: "fresh", sleepDuration: "stale_24h" },
          baselineN: 4,
        },
      });
      expect(p).toContain("## Health signals");
      expect(p).not.toContain("HRV today");
      expect(p).toContain("RHR today: 58 bpm (fresh)");
      expect(p).toContain("Sleep last night:");
      expect(p).toContain("(stale_24h)");
      expect(p).toContain("based on 4 days");
    });

    it("buildPrompt omits the whole health block when all metrics are missing", () => {
      const p = buildPrompt({
        ...input,
        healthSignals: {
          today: { hrv: null, rhr: null, sleepDuration: null },
          baseline7d: { hrv: null, rhr: null, sleepDuration: null },
          freshness: { hrv: null, rhr: null, sleepDuration: null },
          baselineN: 0,
        },
      });
      expect(p).not.toContain("## Health signals");
    });

    it("buildPrompt omits the health block when healthSignals is undefined", () => {
      const p = buildPrompt(input);
      expect(p).not.toContain("## Health signals");
    });
  ```

- [ ] **Step 2: Run the tests and confirm they fail.**

  Run:

  ```bash
  npx vitest run tests/ai-engine.test.ts
  ```

  Expected: 4 failures, all on the new cases (typescript may also complain that `healthSignals` isn't on `AnalyzeInput` yet — that's expected).

- [ ] **Step 3: Extend `AnalyzeInput` and `buildPrompt` in `src/lib/ai-engine.ts`.**

  At the top of `src/lib/ai-engine.ts`, add the import and type:

  ```ts
  import type { HealthSignals } from "@/lib/health-signals";
  ```

  Extend `AnalyzeInput`:

  ```ts
  export type AnalyzeInput = {
    goal: string;
    plannedSession: {
      title: string;
      notes: string;
      modality: string;
      exercises: PlannedExerciseInput[];
    };
    recentTraining: RecentTraining;
    healthSignals?: HealthSignals;
  };
  ```

  Add a helper just above `buildPrompt`:

  ```ts
  function formatSleepDuration(seconds: number): string {
    const h = Math.floor(seconds / 3600);
    const m = Math.round((seconds % 3600) / 60);
    return `${h}h ${m.toString().padStart(2, "0")}m`;
  }

  function buildHealthBlock(h: HealthSignals): string | null {
    const lines: string[] = [];
    if (h.today.hrv !== null) {
      const baseline =
        h.baseline7d.hrv !== null
          ? ` — 7-day avg ${h.baseline7d.hrv.toFixed(1)} ms`
          : "";
      lines.push(
        `HRV today: ${h.today.hrv.toFixed(1)} ms (${h.freshness.hrv})${baseline}`
      );
    }
    if (h.today.rhr !== null) {
      const baseline =
        h.baseline7d.rhr !== null
          ? ` — 7-day avg ${Math.round(h.baseline7d.rhr)} bpm`
          : "";
      lines.push(
        `RHR today: ${Math.round(h.today.rhr)} bpm (${h.freshness.rhr})${baseline}`
      );
    }
    if (h.today.sleepDuration !== null) {
      const baseline =
        h.baseline7d.sleepDuration !== null
          ? ` — 7-day avg ${formatSleepDuration(Math.round(h.baseline7d.sleepDuration))}`
          : "";
      lines.push(
        `Sleep last night: ${formatSleepDuration(Math.round(h.today.sleepDuration))} (${h.freshness.sleepDuration})${baseline}`
      );
    }
    if (lines.length === 0) return null;
    const disclaim = h.baselineN < 7 ? ` (based on ${h.baselineN} days)` : "";
    return ["## Health signals" + disclaim, ...lines].join("\n");
  }
  ```

  Then in `buildPrompt`, insert the block right after the `goalLine` definition and add it to the joined list. Replace the existing `return [...]` block with:

  ```ts
    const goal = i.goal.trim();
    const goalLine = goal ? `User's stated goal: ${goal}` : null;
    const healthBlock = i.healthSignals ? buildHealthBlock(i.healthSignals) : null;
    return [
      "You are a strength coach. Auto-regulate today's session using only the data below.",
      goalLine,
      `Planned (${ps.modality}) "${ps.title}": ${planned}`,
      `Day notes: ${ps.notes || "none"}`,
      `Recent strength (last ${rt.windowDays}d): ${strength}`,
      `Recent endurance (last ${rt.windowDays}d): ${endurance}`,
      healthBlock,
      "Match planned exercise names to recent-actual names by similarity (e.g. 'Bench' ~ 'Bench Press'); ignore planned exercises with no actual match.",
      "Endurance fatigue (runs/rides/swims) is real systemic load — weigh it when judging readiness for lower-body or heavy sessions.",
      "No RPE is available — judge fatigue from recent sets, frequency, endurance volume and rest only.",
      "When health signals are present, treat HRV / RHR / sleep deltas vs the 7-day baseline as soft inputs (a low-HRV day + short sleep argues for reduce_intensity; an above-baseline HRV day supports proceeding). Weight by freshness — 'stale_*' values are weaker evidence than 'fresh'.",
      "Interpret readiness and progression through the user's stated goal when present (e.g. a fat-loss cut tolerates less added volume than a bulk).",
      "Return TWO separate lists:",
      "- todayAdjustments[]: ephemeral, today-only tweaks given current fatigue (do NOT change the program). Empty unless warranted.",
      "- progressionSuggestions[]: durable target changes going forward, ONLY on clear evidence (clean reps at/above target across recent sessions, or a clear stall). currentWeight = the planned target. Empty unless clearly warranted. Do NOT include a status field.",
    ]
      .filter(Boolean)
      .join("\n");
  ```

- [ ] **Step 4: Run the full ai-engine test file and confirm everything passes.**

  Run:

  ```bash
  npx vitest run tests/ai-engine.test.ts
  ```

  Expected: every test green, including the four new health-block cases and the existing goal-related cases (which must remain untouched).

- [ ] **Step 5: Commit.**

  ```bash
  git add src/lib/ai-engine.ts tests/ai-engine.test.ts
  git commit -m "feat(ios): buildPrompt renders optional health-signals block"
  ```

---

## Task 4: Wire `loadHealthSignals` into `runReadinessAnalysis`

**Files:**
- Modify: `src/lib/readiness.ts`
- Modify: `tests/readiness.integration.test.ts`

- [ ] **Step 1: Add the new aggregator into the existing `Promise.all`.**

  In `src/lib/readiness.ts`, add the import next to the other lib imports:

  ```ts
  import { loadHealthSignals } from "@/lib/health-signals";
  ```

  Change the `Promise.all` from two awaits to three:

  ```ts
    const [recentTraining, goal, healthSignals] = await Promise.all([
      loadRecentTraining(opts.userId, now),
      getPlanProfile(opts.userId),
      loadHealthSignals(opts.userId, now),
    ]);
  ```

  Wrap the `loadHealthSignals` call so a DB failure inside it degrades gracefully — the readiness flow must succeed without health context if the new table errors. Replace the three-way `Promise.all` above with:

  ```ts
    const [recentTraining, goal, healthSignals] = await Promise.all([
      loadRecentTraining(opts.userId, now),
      getPlanProfile(opts.userId),
      loadHealthSignals(opts.userId, now).catch((e) => {
        console.error("loadHealthSignals failed; continuing without it", e);
        return undefined;
      }),
    ]);
  ```

  Then thread it into `analyzeReadiness` and the persisted `loadSnapshot`. Replace the `analyzeReadiness` call + `db.insert` block with:

  ```ts
    try {
      const result = await analyzeReadiness(
        {
          goal,
          plannedSession: {
            title: planned.title,
            notes: planned.notes,
            modality: planned.modality,
            exercises,
          },
          recentTraining,
          healthSignals: healthSignals ?? undefined,
        },
        { generate: opts.generate }
      );
      await db.insert(readinessAnalysis).values({
        userId: opts.userId,
        analysisDate: date,
        planSnapshot: { session: planned, exercises, goal },
        loadSnapshot: {
          ...(recentTraining as unknown as Record<string, unknown>),
          healthSignals: healthSignals ?? null,
        },
        verdict: result.verdict,
        headline: result.headline,
        rationale: result.rationale,
        todayAdjustments: result.todayAdjustments,
        progressionSuggestions: result.progressionSuggestions.map((s) => ({
          ...s,
          status: "pending" as const,
        })),
        model: MODEL_ID,
      });
      return { result };
    } catch (e: unknown) {
      const msg =
        e instanceof Error && typeof e.message === "string" ? e.message : "";
      return { error: /couldn't analyze/i.test(msg) ? msg : "Analysis failed." };
    }
  ```

- [ ] **Step 2: Add a new integration test case for the health-context happy path.**

  In `tests/readiness.integration.test.ts`, add `HEALTH_USER` and a new test case "E", and extend the `afterAll` cleanup. At the top, near the other user ids:

  ```ts
  const HEALTH_USER = "itest-rhealth-" + Date.now();
  const HEALTH_NOW = new Date("2026-05-19T16:00:00Z"); // Tue dow 2
  const ALL_USERS = [U, U3, U4, GOAL_USER, HEALTH_USER];
  ```

  Add this import alongside the existing imports:

  ```ts
  import { healthMetric } from "@/db/schema";
  ```

  Inside the `afterAll`, add a `healthMetric` delete before the existing deletes:

  ```ts
    await db
      .delete(healthMetric)
      .where(inArray(healthMetric.userId, [HEALTH_USER]));
  ```

  Then append this case inside the `describe(...)`:

  ```ts
    it("E: includes health signals in prompt + loadSnapshot when rows exist", async () => {
      const { dow, date } = todayInfo(HEALTH_NOW);
      await db.insert(plannedSession).values({
        userId: HEALTH_USER,
        dayOfWeek: dow,
        title: "Lower",
        notes: "",
        modality: "strength",
      });
      // today + 3 days of baseline history
      await db.insert(healthMetric).values([
        {
          userId: HEALTH_USER,
          metricDate: date,
          type: "hrv",
          value: "42.5",
          source: "primary",
          freshness: "fresh",
          recordedAt: HEALTH_NOW,
        },
        {
          userId: HEALTH_USER,
          metricDate: "2026-05-18",
          type: "hrv",
          value: "46.0",
          source: "primary",
          freshness: "fresh",
          recordedAt: new Date("2026-05-18T07:00:00Z"),
        },
        {
          userId: HEALTH_USER,
          metricDate: "2026-05-17",
          type: "hrv",
          value: "48.0",
          source: "primary",
          freshness: "fresh",
          recordedAt: new Date("2026-05-17T07:00:00Z"),
        },
      ]);
      let seenPrompt = "";
      const out = await runReadinessAnalysis({
        userId: HEALTH_USER,
        now: HEALTH_NOW,
        generate: async (p: string) => {
          seenPrompt = p;
          return {
            verdict: "proceed_as_planned",
            headline: "ok",
            rationale: "ok",
          };
        },
      });
      expect(out.error).toBeUndefined();
      expect(seenPrompt).toContain("## Health signals");
      expect(seenPrompt).toContain("HRV today: 42.5 ms (fresh)");
      // baseline avg of 46 + 48 = 47.0 over 2 days → disclaimed
      expect(seenPrompt).toContain("based on 2 days");

      const [row] = await db
        .select()
        .from(readinessAnalysis)
        .where(eq(readinessAnalysis.userId, HEALTH_USER));
      const snap = row.loadSnapshot as {
        healthSignals: { today: { hrv: number } } | null;
      };
      expect(snap.healthSignals).not.toBeNull();
      expect(snap.healthSignals!.today.hrv).toBe(42.5);
    });
  ```

- [ ] **Step 3: Run the integration tests.**

  Run:

  ```bash
  npm run test:integration -- tests/readiness.integration.test.ts
  ```

  Expected: all cases (A, B, B2, C, D, E) pass. If E fails on a date math mismatch, recompute `HEALTH_NOW` with `todayInfo` to confirm it lands on a day where `2026-05-17` and `2026-05-18` are within the trailing 7-day window.

- [ ] **Step 4: Run the unit tests to confirm nothing regressed.**

  Run:

  ```bash
  npm test
  ```

  Expected: every existing test still green.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/lib/readiness.ts tests/readiness.integration.test.ts
  git commit -m "feat(ios): readiness flow includes health signals in prompt + snapshot"
  ```

---

## Task 5: Pure pairing/token helpers + unit tests (TDD)

**Files:**
- Create: `tests/health-pairing.test.ts`
- Create: `src/lib/health-pairing.ts`

- [ ] **Step 1: Write the failing unit test first.**

  Create `tests/health-pairing.test.ts`:

  ```ts
  import { describe, it, expect } from "vitest";
  import {
    generatePairingCode,
    hashToken,
    isPairingExpired,
    mintRandomToken,
  } from "@/lib/health-pairing";

  describe("health-pairing helpers", () => {
    it("generatePairingCode is 6 ASCII digits", () => {
      for (let i = 0; i < 20; i++) {
        const code = generatePairingCode();
        expect(code).toMatch(/^\d{6}$/);
      }
    });

    it("generatePairingCode is not trivially repeating", () => {
      const seen = new Set<string>();
      for (let i = 0; i < 50; i++) seen.add(generatePairingCode());
      // Probability of <5 unique out of 50 6-digit codes is ~0; if this
      // ever fails, the RNG is broken.
      expect(seen.size).toBeGreaterThan(5);
    });

    it("mintRandomToken returns a URL-safe string of expected length", () => {
      const t = mintRandomToken();
      // 32 random bytes → 43 base64url chars (no padding).
      expect(t).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    });

    it("hashToken is deterministic and 64 hex chars (sha256)", () => {
      const t = "abc123";
      const a = hashToken(t);
      const b = hashToken(t);
      expect(a).toBe(b);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
    });

    it("isPairingExpired compares against the provided now", () => {
      const now = new Date("2026-05-23T12:00:00Z");
      const past = new Date("2026-05-23T11:50:00Z");
      const future = new Date("2026-05-23T12:05:00Z");
      expect(isPairingExpired(past, now)).toBe(true);
      expect(isPairingExpired(future, now)).toBe(false);
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails.**

  Run:

  ```bash
  npx vitest run tests/health-pairing.test.ts
  ```

  Expected: `Cannot find module '@/lib/health-pairing'`.

- [ ] **Step 3: Implement `src/lib/health-pairing.ts`.**

  Create `src/lib/health-pairing.ts`:

  ```ts
  import { randomBytes, randomInt, createHash } from "node:crypto";

  // 6-digit numeric pairing code. Uses crypto.randomInt to avoid modulo bias.
  export function generatePairingCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  // 256-bit random token, base64url-encoded for safe transport in headers.
  export function mintRandomToken(): string {
    return randomBytes(32).toString("base64url");
  }

  // sha256 of the plaintext token (hex). The DB stores the hash; the
  // plaintext lives only in the iOS Keychain.
  export function hashToken(plaintext: string): string {
    return createHash("sha256").update(plaintext).digest("hex");
  }

  // Pure expiry check (no clock reads inside the lib).
  export function isPairingExpired(expiresAt: Date, now: Date): boolean {
    return expiresAt.getTime() <= now.getTime();
  }

  // Lifetime constants. Pairing codes are short-lived; tokens are
  // non-expiring until explicitly revoked.
  export const PAIRING_CODE_TTL_MS = 10 * 60 * 1000;
  ```

- [ ] **Step 4: Run the unit tests and confirm they pass.**

  Run:

  ```bash
  npx vitest run tests/health-pairing.test.ts
  ```

  Expected: all 5 cases pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/lib/health-pairing.ts tests/health-pairing.test.ts
  git commit -m "feat(ios): pairing-code + device-token crypto helpers"
  ```

---

## Task 6: `device-auth` helper (bearer-token validator)

**Files:**
- Create: `src/lib/device-auth.ts`

- [ ] **Step 1: Implement `src/lib/device-auth.ts`.**

  Create `src/lib/device-auth.ts`:

  ```ts
  import { and, eq, isNull } from "drizzle-orm";
  import { db } from "@/db";
  import { deviceToken } from "@/db/schema";
  import { hashToken } from "@/lib/health-pairing";

  export type ResolvedDevice = { userId: string; deviceId: string };

  // Reads the `Authorization: Bearer <token>` header, looks up the device,
  // and updates lastUsedAt. Returns null on any auth failure. Callers
  // translate null → 401 themselves.
  export async function resolveDeviceUser(
    req: Request
  ): Promise<ResolvedDevice | null> {
    const header = req.headers.get("authorization") ?? "";
    const m = header.match(/^Bearer\s+([A-Za-z0-9_-]+)$/);
    if (!m) return null;
    const plaintext = m[1];
    const tokenHash = hashToken(plaintext);

    const rows = await db
      .select({ id: deviceToken.id, userId: deviceToken.userId })
      .from(deviceToken)
      .where(and(eq(deviceToken.tokenHash, tokenHash), isNull(deviceToken.revokedAt)));

    if (rows.length === 0) return null;
    const row = rows[0];
    // best-effort touch; do not await on failure
    db.update(deviceToken)
      .set({ lastUsedAt: new Date() })
      .where(eq(deviceToken.id, row.id))
      .catch((e) => {
        console.error("device lastUsedAt touch failed", e);
      });
    return { userId: row.userId, deviceId: row.id };
  }
  ```

- [ ] **Step 2: Type-check.**

  Run:

  ```bash
  npx tsc --noEmit
  ```

  Expected: no new errors.

- [ ] **Step 3: Commit.**

  ```bash
  git add src/lib/device-auth.ts
  git commit -m "feat(ios): resolveDeviceUser bearer-token validator"
  ```

  (Integration coverage for this lands with the API-route tasks below — calling `resolveDeviceUser` in isolation is exercised end-to-end in Task 8 and Task 9.)

---

## Task 7: Pairing server actions + `/settings/devices` page

**Files:**
- Create: `src/app/actions/devices.ts`
- Create: `src/app/(app)/settings/devices/page.tsx`
- Create: `src/app/(app)/settings/devices/devices-client.tsx`
- Modify: `src/app/(app)/site-nav.tsx`

- [ ] **Step 1: Implement the server actions.**

  Create `src/app/actions/devices.ts`:

  ```ts
  "use server";
  import { auth } from "@/auth/auth";
  import { headers } from "next/headers";
  import { and, desc, eq, isNull } from "drizzle-orm";
  import { db } from "@/db";
  import { devicePairing, deviceToken } from "@/db/schema";
  import {
    PAIRING_CODE_TTL_MS,
    generatePairingCode,
    isPairingExpired,
  } from "@/lib/health-pairing";

  type DeviceRow = {
    id: string;
    deviceName: string;
    platform: string;
    createdAt: Date;
    lastUsedAt: Date | null;
  };

  async function requireUserId(): Promise<string> {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session) throw new Error("unauthenticated");
    return session.user.id;
  }

  export async function listDevices(): Promise<DeviceRow[]> {
    const userId = await requireUserId();
    return db
      .select({
        id: deviceToken.id,
        deviceName: deviceToken.deviceName,
        platform: deviceToken.platform,
        createdAt: deviceToken.createdAt,
        lastUsedAt: deviceToken.lastUsedAt,
      })
      .from(deviceToken)
      .where(and(eq(deviceToken.userId, userId), isNull(deviceToken.revokedAt)))
      .orderBy(desc(deviceToken.createdAt));
  }

  // Creates (or replaces) the user's single outstanding pairing code.
  export async function createPairingCode(): Promise<{
    code: string;
    expiresAt: string;
  }> {
    const userId = await requireUserId();
    // One outstanding code per user — wipe prior rows first.
    await db.delete(devicePairing).where(eq(devicePairing.userId, userId));
    const code = generatePairingCode();
    const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
    await db.insert(devicePairing).values({ userId, code, expiresAt });
    return { code, expiresAt: expiresAt.toISOString() };
  }

  // Polled by the web page. Returns true once the pairing row is gone (it
  // is deleted on successful redemption) AND a new device exists with
  // createdAt newer than the polled-since timestamp.
  export async function pollPairingRedeemed(
    sinceIso: string
  ): Promise<boolean> {
    const userId = await requireUserId();
    const since = new Date(sinceIso);
    const rows = await db
      .select({ id: deviceToken.id })
      .from(deviceToken)
      .where(
        and(
          eq(deviceToken.userId, userId),
          isNull(deviceToken.revokedAt)
        )
      );
    // Naive check: any device with createdAt >= since. Drizzle filter would
    // be more efficient but rows are small (≤ a handful).
    if (rows.length === 0) return false;
    const newer = await db
      .select({ id: deviceToken.id, createdAt: deviceToken.createdAt })
      .from(deviceToken)
      .where(eq(deviceToken.userId, userId));
    return newer.some((r) => r.createdAt.getTime() >= since.getTime());
  }

  export async function revokeDevice(id: string): Promise<void> {
    const userId = await requireUserId();
    await db
      .update(deviceToken)
      .set({ revokedAt: new Date() })
      .where(and(eq(deviceToken.id, id), eq(deviceToken.userId, userId)));
  }

  // Defensive cleanup invoked opportunistically; not on a schedule in v1.
  export async function reapExpiredPairings(): Promise<void> {
    const now = new Date();
    const rows = await db.select().from(devicePairing);
    for (const r of rows) {
      if (isPairingExpired(r.expiresAt, now)) {
        await db.delete(devicePairing).where(eq(devicePairing.id, r.id));
      }
    }
  }
  ```

- [ ] **Step 2: Implement the server-component page shell.**

  Create `src/app/(app)/settings/devices/page.tsx`:

  ```tsx
  import { listDevices } from "@/app/actions/devices";
  import { DevicesClient } from "./devices-client";

  export default async function DevicesPage() {
    const devices = await listDevices();
    return (
      <div className="ds-stack" style={{ padding: "2rem 1.5rem" }}>
        <h1 className="ds-h1">Devices</h1>
        <p className="ds-body">
          Pair the SyncFit iOS companion to share Apple Health context with
          the readiness analysis.
        </p>
        <DevicesClient initialDevices={devices} />
      </div>
    );
  }
  ```

  Create `src/app/(app)/settings/devices/devices-client.tsx`:

  ```tsx
  "use client";
  import { useEffect, useState } from "react";
  import {
    createPairingCode,
    listDevices,
    pollPairingRedeemed,
    revokeDevice,
  } from "@/app/actions/devices";

  type DeviceRow = Awaited<ReturnType<typeof listDevices>>[number];

  export function DevicesClient({
    initialDevices,
  }: {
    initialDevices: DeviceRow[];
  }) {
    const [devices, setDevices] = useState(initialDevices);
    const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(
      null
    );
    const [polling, setPolling] = useState(false);

    async function onGenerate() {
      setCode(null);
      const c = await createPairingCode();
      setCode(c);
      setPolling(true);
    }

    async function onRevoke(id: string) {
      await revokeDevice(id);
      setDevices((d) => d.filter((x) => x.id !== id));
    }

    useEffect(() => {
      if (!polling || !code) return;
      const since = new Date().toISOString();
      const t = setInterval(async () => {
        const redeemed = await pollPairingRedeemed(since);
        if (redeemed) {
          setCode(null);
          setPolling(false);
          setDevices(await listDevices());
        }
      }, 2000);
      const stop = setTimeout(() => {
        clearInterval(t);
        setPolling(false);
      }, 11 * 60 * 1000); // a touch past code TTL
      return () => {
        clearInterval(t);
        clearTimeout(stop);
      };
    }, [polling, code]);

    return (
      <div className="ds-stack" style={{ gap: "1.5rem" }}>
        <section className="ds-card" style={{ padding: "1.25rem" }}>
          <h2 className="ds-h2">Pair iOS app</h2>
          {code ? (
            <>
              <p className="ds-body">Enter this code in the SyncFit iOS app:</p>
              <p
                className="ds-display"
                style={{ fontFamily: "var(--ds-font-mono)", letterSpacing: "0.2em" }}
              >
                {code.code}
              </p>
              <p className="ds-caption">
                Code expires at {new Date(code.expiresAt).toLocaleTimeString()}.
              </p>
            </>
          ) : (
            <button className="ds-btn" onClick={onGenerate}>
              Generate pairing code
            </button>
          )}
        </section>

        <section className="ds-card" style={{ padding: "1.25rem" }}>
          <h2 className="ds-h2">Paired devices</h2>
          {devices.length === 0 ? (
            <p className="ds-body">No devices paired yet.</p>
          ) : (
            <ul className="ds-list">
              {devices.map((d) => (
                <li key={d.id} className="ds-row">
                  <span>
                    {d.deviceName}{" "}
                    <span className="ds-caption">({d.platform})</span>
                  </span>
                  <button
                    className="ds-btn ds-btn-quiet"
                    onClick={() => onRevoke(d.id)}
                  >
                    Revoke
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    );
  }
  ```

  (Class names assume the design system primitives `.ds-card`, `.ds-stack`, `.ds-row`, `.ds-btn`, `.ds-list`, `.ds-display`, `.ds-h1`, `.ds-h2`, `.ds-body`, `.ds-caption`. If any of those don't exist in the package, swap to the closest primitive — do not introduce ad-hoc styles. Reference: the `dustinriley-design` skill at `.claude/skills/dustinriley-design/SKILL.md`.)

- [ ] **Step 3: Add a "Devices" link in the user-menu dropdown.**

  Open `src/app/(app)/site-nav.tsx` and locate the existing user-menu dropdown (it currently contains a sign-out item). Add a `<Link>` to `/settings/devices` above the sign-out, e.g.:

  ```tsx
  <Link href="/settings/devices" className="ds-menu-item">
    Devices
  </Link>
  ```

  Exact JSX shape depends on the existing dropdown; mirror the sign-out item's wrapper so the styling stays consistent.

- [ ] **Step 4: Manual smoke — start the dev server, sign in, hit `/settings/devices`.**

  Run:

  ```bash
  npm run dev
  ```

  In a browser:
  1. Sign in (any existing test account).
  2. Open the user menu → click "Devices".
  3. Click "Generate pairing code" → confirm a 6-digit code appears with an expiry time.
  4. (Pairing redemption is end-to-end-tested in Task 8 via curl.)

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/actions/devices.ts \
          "src/app/(app)/settings/devices/page.tsx" \
          "src/app/(app)/settings/devices/devices-client.tsx" \
          "src/app/(app)/site-nav.tsx"
  git commit -m "feat(ios): /settings/devices pairing page + server actions"
  ```

---

## Task 8: `POST /api/devices/pair` route + integration test

**Files:**
- Create: `src/app/api/devices/pair/route.ts`
- Create: `tests/device-pair.integration.test.ts`

- [ ] **Step 1: Write the failing integration test first.**

  Tests call the route handler directly (importing `POST` from the route file) rather than over HTTP — matches the existing integration-test style and removes any "needs dev server running" dependency.

  Create `tests/device-pair.integration.test.ts`:

  ```ts
  import { describe, it, expect, afterAll } from "vitest";
  import { inArray, eq } from "drizzle-orm";
  import { db } from "@/db";
  import { devicePairing, deviceToken } from "@/db/schema";
  import { hashToken, PAIRING_CODE_TTL_MS } from "@/lib/health-pairing";
  import { POST as pairPOST } from "@/app/api/devices/pair/route";

  const U = "itest-pair-" + Date.now();

  function pairRequest(body: unknown): Request {
    return new Request("http://test.local/api/devices/pair", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  afterAll(async () => {
    await db.delete(devicePairing).where(eq(devicePairing.userId, U));
    await db.delete(deviceToken).where(inArray(deviceToken.userId, [U]));
  });

  describe("POST /api/devices/pair", () => {
    it("redeems a valid code, returns a one-time token, deletes the pairing row", async () => {
      const code = "424242";
      const expiresAt = new Date(Date.now() + PAIRING_CODE_TTL_MS);
      await db.insert(devicePairing).values({ userId: U, code, expiresAt });

      // Cast to the Next type the handler expects. Next route handlers
      // accept spec-Request at runtime; the cast is just for TS.
      const resp = await pairPOST(
        pairRequest({ code, deviceName: "itest iPhone" }) as never
      );
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as { token: string };
      expect(typeof body.token).toBe("string");
      expect(body.token.length).toBeGreaterThan(40);

      // Pairing row removed.
      const pairs = await db
        .select()
        .from(devicePairing)
        .where(eq(devicePairing.userId, U));
      expect(pairs.length).toBe(0);

      // Token row exists with the right hash + deviceName.
      const toks = await db
        .select()
        .from(deviceToken)
        .where(eq(deviceToken.userId, U));
      expect(toks.length).toBe(1);
      expect(toks[0].tokenHash).toBe(hashToken(body.token));
      expect(toks[0].deviceName).toBe("itest iPhone");
    });

    it("rejects an unknown code with 400", async () => {
      const resp = await pairPOST(
        pairRequest({ code: "999999", deviceName: "itest" }) as never
      );
      expect(resp.status).toBe(400);
    });

    it("rejects an expired code with 400 and leaves the row alone", async () => {
      const code = "313131";
      const expiresAt = new Date(Date.now() - 1000);
      await db.insert(devicePairing).values({ userId: U, code, expiresAt });

      const resp = await pairPOST(
        pairRequest({ code, deviceName: "itest" }) as never
      );
      expect(resp.status).toBe(400);
      // The row is *not* deleted on a failed (expired) redemption — typo
      // tolerance for codes that are still valid; expired rows are reaped
      // by reapExpiredPairings, not by the failed-redeem path.
      const pairs = await db
        .select()
        .from(devicePairing)
        .where(eq(devicePairing.code, code));
      expect(pairs.length).toBe(1);
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails (route module does not exist yet).**

  Run:

  ```bash
  npm run test:integration -- tests/device-pair.integration.test.ts
  ```

  Expected: failure with `Cannot find module '@/app/api/devices/pair/route'`.

- [ ] **Step 3: Implement the route.**

  Create `src/app/api/devices/pair/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { z } from "zod";
  import { and, eq } from "drizzle-orm";
  import { db } from "@/db";
  import { devicePairing, deviceToken } from "@/db/schema";
  import {
    hashToken,
    isPairingExpired,
    mintRandomToken,
  } from "@/lib/health-pairing";

  export const runtime = "nodejs";

  const Body = z.object({
    code: z.string().regex(/^\d{6}$/),
    deviceName: z.string().min(1).max(120),
  });

  export async function POST(req: NextRequest) {
    let parsed;
    try {
      parsed = Body.safeParse(await req.json());
    } catch {
      return NextResponse.json(
        { error: "invalid_or_expired_code" },
        { status: 400 }
      );
    }
    if (!parsed.success) {
      return NextResponse.json(
        { error: "invalid_or_expired_code" },
        { status: 400 }
      );
    }
    const { code, deviceName } = parsed.data;

    const rows = await db
      .select()
      .from(devicePairing)
      .where(eq(devicePairing.code, code));
    if (rows.length === 0) {
      return NextResponse.json(
        { error: "invalid_or_expired_code" },
        { status: 400 }
      );
    }
    const row = rows[0];
    if (isPairingExpired(row.expiresAt, new Date())) {
      // Leave the row in place (per spec; expired rows are reaped elsewhere).
      return NextResponse.json(
        { error: "invalid_or_expired_code" },
        { status: 400 }
      );
    }

    const plaintext = mintRandomToken();
    const tokenHash = hashToken(plaintext);

    // Delete the pairing row first so a duplicate redeem attempt can't race
    // through, then insert the token.
    await db
      .delete(devicePairing)
      .where(and(eq(devicePairing.id, row.id), eq(devicePairing.code, code)));
    await db.insert(deviceToken).values({
      userId: row.userId,
      tokenHash,
      deviceName,
      platform: "ios",
    });

    return NextResponse.json({ token: plaintext });
  }
  ```

- [ ] **Step 4: Run the integration test and confirm it passes.**

  Run:

  ```bash
  npm run test:integration -- tests/device-pair.integration.test.ts
  ```

  Expected: all three cases pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/api/devices/pair/route.ts tests/device-pair.integration.test.ts
  git commit -m "feat(ios): POST /api/devices/pair endpoint with integration tests"
  ```

---

## Task 9: `POST /api/health/sync` route + integration test

**Files:**
- Create: `src/app/api/health/sync/route.ts`
- Create: `tests/health-sync.integration.test.ts`

- [ ] **Step 1: Write the failing integration test first.**

  Same direct-handler invocation pattern as Task 8 (no dev server required).

  Create `tests/health-sync.integration.test.ts`:

  ```ts
  import { describe, it, expect, afterAll, beforeAll } from "vitest";
  import { eq, inArray } from "drizzle-orm";
  import { db } from "@/db";
  import { deviceToken, healthMetric } from "@/db/schema";
  import { hashToken, mintRandomToken } from "@/lib/health-pairing";
  import { POST as syncPOST } from "@/app/api/health/sync/route";

  const U = "itest-sync-" + Date.now();

  let TOKEN = "";
  let REVOKED_TOKEN = "";

  function syncRequest(
    body: unknown,
    auth?: string
  ): Request {
    const headers: Record<string, string> = {
      "content-type": "application/json",
    };
    if (auth) headers.authorization = `Bearer ${auth}`;
    return new Request("http://test.local/api/health/sync", {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
  }

  beforeAll(async () => {
    TOKEN = mintRandomToken();
    await db.insert(deviceToken).values({
      userId: U,
      tokenHash: hashToken(TOKEN),
      deviceName: "itest iPhone",
      platform: "ios",
    });
    REVOKED_TOKEN = mintRandomToken();
    await db.insert(deviceToken).values({
      userId: U,
      tokenHash: hashToken(REVOKED_TOKEN),
      deviceName: "itest revoked",
      platform: "ios",
      revokedAt: new Date(),
    });
  });

  afterAll(async () => {
    await db.delete(healthMetric).where(eq(healthMetric.userId, U));
    await db.delete(deviceToken).where(inArray(deviceToken.userId, [U]));
  });

  describe("POST /api/health/sync", () => {
    it("401 with no Authorization header", async () => {
      const resp = await syncPOST(syncRequest({ uploads: [] }) as never);
      expect(resp.status).toBe(401);
    });

    it("401 with a revoked token", async () => {
      const resp = await syncPOST(
        syncRequest({ uploads: [] }, REVOKED_TOKEN) as never
      );
      expect(resp.status).toBe(401);
    });

    it("200 with empty uploads returns counts 0/0", async () => {
      const resp = await syncPOST(syncRequest({ uploads: [] }, TOKEN) as never);
      expect(resp.status).toBe(200);
      const body = (await resp.json()) as { accepted: number; updated: number };
      expect(body).toEqual({ accepted: 0, updated: 0 });
    });

    it("upserts three metrics and re-posting with new value overwrites", async () => {
      const today = new Date().toISOString().slice(0, 10);
      const payload = {
        uploads: [
          {
            metricDate: today,
            type: "hrv",
            value: 42.5,
            source: "primary",
            freshness: "fresh",
            recordedAt: new Date().toISOString(),
          },
          {
            metricDate: today,
            type: "rhr",
            value: 58,
            source: "primary",
            freshness: "fresh",
            recordedAt: new Date().toISOString(),
          },
          {
            metricDate: today,
            type: "sleep_duration_seconds",
            value: 22320,
            source: "primary",
            freshness: "fresh",
            recordedAt: new Date().toISOString(),
          },
        ],
      };
      const first = await syncPOST(syncRequest(payload, TOKEN) as never);
      expect(first.status).toBe(200);
      const b1 = (await first.json()) as { accepted: number };
      expect(b1.accepted).toBe(3);

      // Re-post with a different HRV value → upsert overwrites.
      payload.uploads[0].value = 50;
      const second = await syncPOST(syncRequest(payload, TOKEN) as never);
      expect(second.status).toBe(200);

      const rows = await db
        .select()
        .from(healthMetric)
        .where(eq(healthMetric.userId, U));
      expect(rows.length).toBe(3);
      const hrv = rows.find((r) => r.type === "hrv")!;
      expect(Number(hrv.value)).toBe(50);
    });

    it("400 on malformed payload (no rows written)", async () => {
      const resp = await syncPOST(
        syncRequest({ uploads: [{ type: "hrv" }] }, TOKEN) as never
      );
      expect(resp.status).toBe(400);
    });

    it("400 on metricDate outside the allowed window", async () => {
      const tooOld = new Date(Date.now() - 60 * 86_400_000)
        .toISOString()
        .slice(0, 10);
      const resp = await syncPOST(
        syncRequest(
          {
            uploads: [
              {
                metricDate: tooOld,
                type: "hrv",
                value: 40,
                source: "primary",
                freshness: "fresh",
                recordedAt: new Date().toISOString(),
              },
            ],
          },
          TOKEN
        ) as never
      );
      expect(resp.status).toBe(400);
    });
  });
  ```

- [ ] **Step 2: Run the test and confirm it fails (route 404 / missing).**

  Run:

  ```bash
  npm run test:integration -- tests/health-sync.integration.test.ts
  ```

  Expected: failures across all six cases.

- [ ] **Step 3: Implement the route.**

  Create `src/app/api/health/sync/route.ts`:

  ```ts
  import { NextRequest, NextResponse } from "next/server";
  import { z } from "zod";
  import { sql } from "drizzle-orm";
  import { db } from "@/db";
  import { healthMetric } from "@/db/schema";
  import { resolveDeviceUser } from "@/lib/device-auth";

  export const runtime = "nodejs";

  // metricDate is bounded to [today-30d, today+1d] (the +1d tolerates TZ skew
  // between iOS and the server without admitting truly future dates).
  function isDateWithinWindow(dateStr: string, now: Date): boolean {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
    const d = new Date(dateStr + "T00:00:00Z").getTime();
    if (Number.isNaN(d)) return false;
    const lo = now.getTime() - 30 * 86_400_000;
    const hi = now.getTime() + 1 * 86_400_000;
    return d >= lo && d <= hi;
  }

  const Upload = z.object({
    metricDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    type: z.enum(["hrv", "rhr", "sleep_duration_seconds"]),
    value: z.number().finite(),
    source: z.string().min(1).max(64),
    freshness: z.enum(["fresh", "stale_24h", "stale_48h"]),
    recordedAt: z.string().datetime(),
  });

  const Body = z.object({
    uploads: z.array(Upload).max(500),
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

    const now = new Date();
    for (const u of parsed.data.uploads) {
      if (!isDateWithinWindow(u.metricDate, now)) {
        return NextResponse.json({ error: "invalid_payload" }, { status: 400 });
      }
    }

    if (parsed.data.uploads.length === 0) {
      return NextResponse.json({ accepted: 0, updated: 0 });
    }

    const values = parsed.data.uploads.map((u) => ({
      userId: device.userId,
      metricDate: u.metricDate,
      type: u.type,
      value: String(u.value),
      source: u.source,
      freshness: u.freshness,
      recordedAt: new Date(u.recordedAt),
    }));

    // Single-statement upsert. Drizzle's onConflictDoUpdate gives us
    // last-write-wins on (userId, metricDate, type).
    await db
      .insert(healthMetric)
      .values(values)
      .onConflictDoUpdate({
        target: [
          healthMetric.userId,
          healthMetric.metricDate,
          healthMetric.type,
        ],
        set: {
          value: sql`excluded.value`,
          source: sql`excluded.source`,
          freshness: sql`excluded.freshness`,
          recordedAt: sql`excluded.recorded_at`,
        },
      });

    return NextResponse.json({
      accepted: values.length,
      updated: values.length,
    });
  }
  ```

- [ ] **Step 4: Run the integration test and confirm it passes.**

  Run:

  ```bash
  npm run test:integration -- tests/health-sync.integration.test.ts
  ```

  Expected: all six cases pass.

- [ ] **Step 5: Commit.**

  ```bash
  git add src/app/api/health/sync/route.ts tests/health-sync.integration.test.ts
  git commit -m "feat(ios): POST /api/health/sync ingestion endpoint with integration tests"
  ```

---

## Task 10: Full green-bar verification

**Files:** none (verification only)

- [ ] **Step 1: Run the unit test suite.**

  ```bash
  npm test
  ```

  Expected: all green.

- [ ] **Step 2: Run the type check.**

  ```bash
  npx tsc --noEmit
  ```

  Expected: clean.

- [ ] **Step 3: Run lint and format checks.**

  ```bash
  npm run lint && npm run format:check
  ```

  Expected: clean. If `format:check` fails, run `npm run format` and stage the changes in a follow-up commit titled `style: prettier`.

- [ ] **Step 4: Run the integration suite end-to-end.**

  Run:

  ```bash
  npm run test:integration
  ```

  Expected: all integration tests pass (existing ones plus the three new files). No running dev server required — the new tests invoke route handlers directly.

- [ ] **Step 5: Run the production build.**

  ```bash
  npm run build
  ```

  Expected: clean. Any "missing module" errors here indicate a broken import path in the new files.

- [ ] **Step 6: Smoke-test the readiness flow end-to-end via the dashboard.**

  - Open the running dev server in a browser, sign in.
  - Go to `/settings/devices`, generate a pairing code.
  - From a terminal, mint a real token by hitting the pair endpoint with the code:
    ```bash
    curl -sX POST http://localhost:3000/api/devices/pair \
      -H 'content-type: application/json' \
      -d '{"code":"<6-digit code from web>","deviceName":"smoke iPhone"}'
    ```
  - Use the returned token to POST a small payload:
    ```bash
    curl -sX POST http://localhost:3000/api/health/sync \
      -H 'content-type: application/json' \
      -H "authorization: Bearer <token>" \
      -d '{"uploads":[{"metricDate":"'$(date +%F)'","type":"hrv","value":42.5,"source":"primary","freshness":"fresh","recordedAt":"'$(date -u +%FT%TZ)'"}]}'
    ```
  - On the dashboard, click "Analyze readiness" (with a planned session for today). Inspect the latest `readiness_analysis.loadSnapshot.healthSignals` row — it should contain the value just uploaded.

- [ ] **Step 7: Open PR.**

  ```bash
  git push -u origin feature/ios-companion
  gh pr create --base main --title "feat(ios): backend for iOS companion (Apple Health context)" --body "Implements the backend half of the iOS companion feature per docs/superpowers/specs/2026-05-23-ios-companion-app-design.md — schema, pairing flow, ingestion API, readiness prompt integration. iOS app lands in Plan B.

  🤖 Generated with [Claude Code](https://claude.com/claude-code)"
  ```
