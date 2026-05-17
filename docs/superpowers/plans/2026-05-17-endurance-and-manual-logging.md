# Endurance Activities + Manual Workout Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a manual workout-logging page (strength or endurance), a first-class `endurance_activity` model, and replace the strength-only trailing-load aggregator with one raw 7-day "recent training" builder that feeds both the dashboard's today card and the AI.

**Architecture:** Thin `"use server"` actions over pure libs (the existing repo pattern). New pure modules: `duration`, `recent-training`, `manual-log`. The pure `recent-training` replaces `trailing-load`; the AI input shape changes (not its reasoning). Endurance renders in the existing weekly training view. Tasks are ordered so each commit keeps `npx tsc --noEmit`, `npm test`, and `npm run build` green.

**Tech Stack:** Next.js 16 (App Router, TS) + React 19, Drizzle ORM + Neon Postgres, Better Auth, Vitest, Tailwind v4 + `@dustin-riley/design`.

**Spec:** `docs/superpowers/specs/2026-05-17-endurance-and-manual-logging-design.md`

**Conventions reused (read before starting):**
- Controlled-input gotcha (React 19 form reset) — see `src/app/(app)/plan/plan-editor.tsx` and CLAUDE.md "Plan editor must stay controlled".
- `contentHash` dedupe via `sha256(JSON.stringify(...))` + `onConflictDoNothing` — see `src/lib/import-persist.ts` / `src/lib/strong-parser.ts:135`.
- Single-statement `db` (neon-http) for normal writes; `txDb` only for the CSV importer. Manual logging uses `db` (single workout, non-transactional — same precedent as `plan-store`).
- Integration tests are self-cleaning with `itest-*` user ids — see `tests/import.integration.test.ts`.
- `npm test` is offline (LLM mocked, no DB). Integration tests run via `npm run test:integration` and need `node --env-file=.env.local`.

---

### Task 1: `endurance_activity` schema + push to Neon

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add the table to the schema**

In `src/db/schema.ts`, the import line already includes `numeric`, `integer`, `text`, `timestamp`, `uuid`, `unique`. Add this table immediately after the `workoutSet` table (before `plannedSession`):

```ts
export const enduranceActivity = pgTable(
  "endurance_activity",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
    activityType: text("activity_type").notNull(), // 'run' | 'ride' | 'swim' | 'other'
    distance: numeric("distance"), // miles; nullable (e.g. unmeasured swim)
    durationSec: integer("duration_sec").notNull(), // seconds
    notes: text("notes").notNull().default(""),
    source: text("source").notNull().default("manual"), // forward-compat: 'strava'
    contentHash: text("content_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => ({ uniqUserContent: unique().on(t.userId, t.contentHash) })
);
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS (no errors).

- [ ] **Step 3: Apply the schema to live Neon**

Run: `node --env-file=.env.local ./node_modules/.bin/drizzle-kit push`
Expected: drizzle-kit reports creating table `endurance_activity` and applies it without prompting for destructive changes (this is purely additive).

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts drizzle
git commit -m "feat(endurance): add endurance_activity table"
```

---

### Task 2: `duration` pure helper (parse + format)

Seconds is the stored unit; the UI and prompt need `h:mm:ss` formatting and a parser shared by the form and the server action.

**Files:**
- Create: `src/lib/duration.ts`
- Test: `tests/duration.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/duration.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration } from "@/lib/duration";

describe("parseDuration", () => {
  it("parses h:mm:ss, mm:ss, and bare seconds", () => {
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("48:00")).toBe(2880);
    expect(parseDuration("90")).toBe(90);
  });
  it("trims and tolerates single-digit parts", () => {
    expect(parseDuration(" 5:3 ")).toBe(303);
  });
  it("rejects garbage and out-of-range parts", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1:2:3:4")).toBeNull();
    expect(parseDuration("1:60")).toBeNull(); // seconds must be < 60
    expect(parseDuration("-1")).toBeNull();
    expect(parseDuration("0")).toBeNull(); // a workout has positive duration
  });
});

describe("formatDuration", () => {
  it("formats mm:ss under an hour and h:mm:ss at/over an hour", () => {
    expect(formatDuration(2880)).toBe("48:00");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(65)).toBe("1:05");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/duration.test.ts`
Expected: FAIL — cannot find module `@/lib/duration`.

- [ ] **Step 3: Implement**

Create `src/lib/duration.ts`:

```ts
// Pure duration helpers. Seconds is the canonical stored unit.
// No DB, no React — unit-tested offline.

/** "h:mm:ss" | "mm:ss" | "ss" -> positive integer seconds, else null. */
export function parseDuration(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const parts = s.split(":").map((p) => p.trim());
  if (parts.length > 3) return null;
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  let h = 0,
    m = 0,
    sec = 0;
  if (nums.length === 3) [h, m, sec] = nums;
  else if (nums.length === 2) [m, sec] = nums;
  else [sec] = nums;
  if (nums.length > 1 && (m >= 60 || sec >= 60)) return null;
  const total = h * 3600 + m * 60 + sec;
  return total > 0 ? total : null;
}

/** seconds -> "h:mm:ss" (>= 1h) or "m:ss" (< 1h). */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.trunc(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/duration.test.ts`
Expected: PASS (both describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/duration.ts tests/duration.test.ts
git commit -m "feat(duration): pure parse/format seconds helpers"
```

---

### Task 2.5: `parseAppDateTime` in units.ts

Manual entry uses an `<input type="datetime-local">` whose value (`"YYYY-MM-DDTHH:mm"`) must be interpreted as `APP_TZ` wall time (the app is single-timezone; Vercel runs UTC). `strong-parser` has a private equivalent for CSV space-separated dates; do **not** refactor it (out of scope) — add a sibling helper next to `APP_TZ`.

**Files:**
- Modify: `src/lib/units.ts`
- Test: `tests/units.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/units.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { parseAppDateTime } from "@/lib/units";

describe("parseAppDateTime", () => {
  it("interprets a datetime-local string as APP_TZ wall time (EDT)", () => {
    // 2026-05-17 12:00 America/New_York (EDT, -4) === 16:00Z
    expect(parseAppDateTime("2026-05-17T12:00")?.toISOString()).toBe(
      "2026-05-17T16:00:00.000Z"
    );
  });
  it("accepts an optional seconds component", () => {
    expect(parseAppDateTime("2026-05-17T12:00:30")?.toISOString()).toBe(
      "2026-05-17T16:00:30.000Z"
    );
  });
  it("returns null for empty or unparseable input", () => {
    expect(parseAppDateTime("")).toBeNull();
    expect(parseAppDateTime("not-a-date")).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/units.test.ts`
Expected: FAIL — `parseAppDateTime` is not exported.

- [ ] **Step 3: Implement**

Replace the entire contents of `src/lib/units.ts` with:

```ts
export const APP_TZ = "America/New_York";

/**
 * Parse an <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm" with an
 * optional ":ss") as APP_TZ wall time. Returns null on bad input.
 * Same offset technique as strong-parser's private CSV date parser.
 */
export function parseAppDateTime(s: string): Date | null {
  const m = s
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const utcGuess = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(se ?? 0)
  );
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    timeZoneName: "shortOffset",
  })
    .formatToParts(new Date(utcGuess))
    .find((p) => p.type === "timeZoneName")!.value;
  const offsetHrs = Number(tzName.replace("GMT", "")) || 0;
  const t = utcGuess - offsetHrs * 3600_000;
  return Number.isFinite(t) ? new Date(t) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/units.test.ts`
Expected: PASS.

- [ ] **Step 5: Full unit suite + type check (nothing else imports units beyond `APP_TZ`)**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/units.ts tests/units.test.ts
git commit -m "feat(units): parseAppDateTime for datetime-local input"
```

---

### Task 3: `recent-training` pure builder (will replace `trailing-load`)

New module; `trailing-load.ts` stays until Task 8 so the build stays green. Provides `computeRecentTraining` (raw 7-day strength sessions + endurance activities) and `lastSessionSetsByExercise` (for the today card).

**Files:**
- Create: `src/lib/recent-training.ts`
- Test: `tests/recent-training.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/recent-training.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  computeRecentTraining,
  lastSessionSetsByExercise,
  type StrengthRow,
  type EnduranceRow,
} from "@/lib/recent-training";

const NOW = new Date("2026-05-17T16:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000);

const strength: StrengthRow[] = [
  // newest session (1 day ago): Squat x2 + Bench x1
  { workoutId: "w2", performedAt: day(1), title: "Lower B", exerciseName: "Squat", weight: 250, reps: 3 },
  { workoutId: "w2", performedAt: day(1), title: "Lower B", exerciseName: "Squat", weight: 250, reps: 3 },
  { workoutId: "w2", performedAt: day(1), title: "Lower B", exerciseName: "Bench", weight: 185, reps: 5 },
  // older session (3 days ago): Squat x1
  { workoutId: "w1", performedAt: day(3), title: "Lower A", exerciseName: "Squat", weight: 245, reps: 5 },
  // outside the 7-day window: ignored
  { workoutId: "w0", performedAt: day(9), title: "Old", exerciseName: "Squat", weight: 225, reps: 5 },
];
const endurance: EnduranceRow[] = [
  { performedAt: day(2), activityType: "run", distanceMi: 6.2, durationSec: 2880 },
  { performedAt: day(10), activityType: "ride", distanceMi: 30, durationSec: 7200 }, // out of window
  { performedAt: day(4), activityType: "swim", distanceMi: null, durationSec: 1800 },
];

describe("computeRecentTraining", () => {
  it("windows to 7 days, groups strength by workout, sorts newest-first", () => {
    const rt = computeRecentTraining(strength, endurance, NOW, 7);
    expect(rt.windowDays).toBe(7);
    expect(rt.strengthSessions.map((s) => s.workoutId)).toEqual(["w2", "w1"]);
    expect(rt.strengthSessions[0].sets).toEqual([
      { exerciseName: "Squat", weight: 250, reps: 3 },
      { exerciseName: "Squat", weight: 250, reps: 3 },
      { exerciseName: "Bench", weight: 185, reps: 5 },
    ]);
  });
  it("derives pace/mph and handles null distance", () => {
    const rt = computeRecentTraining(strength, endurance, NOW, 7);
    // newest-first: run is day(2) (2 days ago), swim is day(4) (4 days ago).
    expect(rt.enduranceActivities.map((e) => e.activityType)).toEqual([
      "run",
      "swim",
    ]);
    const run = rt.enduranceActivities.find((e) => e.activityType === "run")!;
    expect(run.pacePerMiSec).toBeCloseTo(2880 / 6.2, 5);
    expect(run.mph).toBeCloseTo(6.2 / (2880 / 3600), 5);
    const swim = rt.enduranceActivities.find((e) => e.activityType === "swim")!;
    expect(swim.distanceMi).toBeNull();
    expect(swim.pacePerMiSec).toBeNull();
    expect(swim.mph).toBeNull();
  });
  it("returns empty arrays for no input", () => {
    const rt = computeRecentTraining([], [], NOW, 7);
    expect(rt.strengthSessions).toEqual([]);
    expect(rt.enduranceActivities).toEqual([]);
  });
});

describe("lastSessionSetsByExercise", () => {
  it("returns each exercise's most-recent session sets with agoDays", () => {
    const rt = computeRecentTraining(strength, endurance, NOW, 7);
    const out = lastSessionSetsByExercise(rt, NOW);
    const squat = out.find((o) => o.exerciseName === "Squat")!;
    expect(squat.agoDays).toBe(1); // from w2, not the older w1
    expect(squat.sets).toEqual([
      { weight: 250, reps: 3 },
      { weight: 250, reps: 3 },
    ]);
    const bench = out.find((o) => o.exerciseName === "Bench")!;
    expect(bench.sets).toEqual([{ weight: 185, reps: 5 }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/recent-training.test.ts`
Expected: FAIL — cannot find module `@/lib/recent-training`.

- [ ] **Step 3: Implement**

Create `src/lib/recent-training.ts`:

```ts
// Pure "recent training" builder: raw recent strength sessions + endurance
// activities over an N-day window. Replaces the old trailing-load aggregator.
// No DB, no HTTP — unit-tested offline.

export type StrengthRow = {
  workoutId: string;
  performedAt: Date;
  title: string;
  exerciseName: string;
  weight: number;
  reps: number;
};
export type EnduranceRow = {
  performedAt: Date;
  activityType: string;
  distanceMi: number | null;
  durationSec: number;
};
export type StrengthSetView = {
  exerciseName: string;
  weight: number;
  reps: number;
};
export type StrengthSession = {
  workoutId: string;
  performedAt: Date;
  title: string;
  sets: StrengthSetView[];
};
export type EnduranceView = {
  performedAt: Date;
  activityType: string;
  distanceMi: number | null;
  durationSec: number;
  pacePerMiSec: number | null; // sec per mile; null when no usable distance
  mph: number | null; // null when no usable distance
};
export type RecentTraining = {
  windowDays: number;
  strengthSessions: StrengthSession[]; // newest-first
  enduranceActivities: EnduranceView[]; // newest-first
};

export function computeRecentTraining(
  strengthRows: StrengthRow[],
  enduranceRows: EnduranceRow[],
  now: Date,
  windowDays: number
): RecentTraining {
  const cutoff = now.getTime() - windowDays * 86_400_000;
  const inWin = (t: Date) =>
    t.getTime() >= cutoff && t.getTime() <= now.getTime();

  const byWorkout = new Map<string, StrengthSession>();
  for (const r of strengthRows) {
    if (!inWin(r.performedAt)) continue;
    let s = byWorkout.get(r.workoutId);
    if (!s) {
      s = {
        workoutId: r.workoutId,
        performedAt: r.performedAt,
        title: r.title,
        sets: [],
      };
      byWorkout.set(r.workoutId, s);
    }
    s.sets.push({
      exerciseName: r.exerciseName,
      weight: r.weight,
      reps: r.reps,
    });
  }
  const strengthSessions = [...byWorkout.values()].sort(
    (a, b) => b.performedAt.getTime() - a.performedAt.getTime()
  );

  const enduranceActivities = enduranceRows
    .filter((e) => inWin(e.performedAt))
    .map((e) => {
      const usable =
        e.distanceMi !== null && e.distanceMi > 0 && e.durationSec > 0;
      return {
        performedAt: e.performedAt,
        activityType: e.activityType,
        distanceMi: e.distanceMi,
        durationSec: e.durationSec,
        pacePerMiSec: usable ? e.durationSec / (e.distanceMi as number) : null,
        mph: usable ? (e.distanceMi as number) / (e.durationSec / 3600) : null,
      };
    })
    .sort((a, b) => b.performedAt.getTime() - a.performedAt.getTime());

  return { windowDays, strengthSessions, enduranceActivities };
}

/**
 * For each exercise, the set list from its most recent session in the window
 * (sessions are newest-first, so the first occurrence wins).
 */
export function lastSessionSetsByExercise(
  rt: RecentTraining,
  now: Date
): { exerciseName: string; agoDays: number; sets: StrengthSetView[] }[] {
  const seen = new Map<
    string,
    { exerciseName: string; agoDays: number; sets: StrengthSetView[] }
  >();
  for (const s of rt.strengthSessions) {
    const byEx = new Map<string, StrengthSetView[]>();
    for (const set of s.sets) {
      if (!byEx.has(set.exerciseName)) byEx.set(set.exerciseName, []);
      byEx.get(set.exerciseName)!.push(set);
    }
    const agoDays = Math.floor(
      (now.getTime() - s.performedAt.getTime()) / 86_400_000
    );
    for (const [exerciseName, sets] of byEx) {
      if (seen.has(exerciseName)) continue;
      seen.set(exerciseName, { exerciseName, agoDays, sets });
    }
  }
  return [...seen.values()];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/recent-training.test.ts`
Expected: PASS (all three + last-session describe green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/recent-training.ts tests/recent-training.test.ts
git commit -m "feat(recent-training): pure 7-day raw training builder"
```

---

### Task 4: `manual-log` — pure validation + content hashing

Validation and hashing are pure (offline-tested here); DB persistence is added in Task 5 and integration-tested in Task 11.

**Files:**
- Create: `src/lib/manual-log.ts`
- Test: `tests/manual-log.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/manual-log.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import {
  validateStrengthInput,
  validateEnduranceInput,
  strengthContentHash,
  enduranceContentHash,
  ACTIVITY_TYPES,
  type ManualStrengthInput,
  type ManualEnduranceInput,
} from "@/lib/manual-log";

const when = new Date("2026-05-17T16:00:00Z");

const goodStrength: ManualStrengthInput = {
  performedAt: when,
  title: "Lower",
  sets: [
    { exerciseName: "Squat", weight: 245, reps: 5, setNumber: 1 },
    { exerciseName: "Squat", weight: 245, reps: 5, setNumber: 2 },
  ],
};
const goodEndurance: ManualEnduranceInput = {
  performedAt: when,
  activityType: "run",
  distanceMi: 6.2,
  durationSec: 2880,
  notes: "easy",
};

describe("validateStrengthInput", () => {
  it("accepts a valid workout", () => {
    expect(validateStrengthInput(goodStrength).fieldErrors).toEqual({});
  });
  it("flags a bad date, empty sets, and bad numbers", () => {
    expect(
      validateStrengthInput({ ...goodStrength, performedAt: new Date(NaN) })
        .fieldErrors.performedAt
    ).toBeTruthy();
    expect(
      validateStrengthInput({ ...goodStrength, sets: [] }).fieldErrors.sets
    ).toBeTruthy();
    expect(
      validateStrengthInput({
        ...goodStrength,
        sets: [{ exerciseName: "", weight: 1, reps: 1, setNumber: 1 }],
      }).fieldErrors.sets
    ).toBeTruthy();
    expect(
      validateStrengthInput({
        ...goodStrength,
        sets: [{ exerciseName: "Squat", weight: -1, reps: 0, setNumber: 1 }],
      }).fieldErrors.sets
    ).toBeTruthy();
  });
});

describe("validateEnduranceInput", () => {
  it("accepts valid input incl. null distance", () => {
    expect(validateEnduranceInput(goodEndurance).fieldErrors).toEqual({});
    expect(
      validateEnduranceInput({ ...goodEndurance, distanceMi: null })
        .fieldErrors
    ).toEqual({});
  });
  it("flags unknown type, non-positive duration, negative distance", () => {
    expect(
      validateEnduranceInput({ ...goodEndurance, activityType: "yoga" })
        .fieldErrors.activityType
    ).toBeTruthy();
    expect(
      validateEnduranceInput({ ...goodEndurance, durationSec: 0 }).fieldErrors
        .durationSec
    ).toBeTruthy();
    expect(
      validateEnduranceInput({ ...goodEndurance, distanceMi: -2 }).fieldErrors
        .distance
    ).toBeTruthy();
  });
  it("exposes the activity-type vocabulary", () => {
    expect(ACTIVITY_TYPES).toEqual(["run", "ride", "swim", "other"]);
  });
});

describe("content hashes", () => {
  it("are stable and order/identity sensitive", () => {
    expect(strengthContentHash(goodStrength)).toBe(
      strengthContentHash(goodStrength)
    );
    expect(strengthContentHash(goodStrength)).not.toBe(
      strengthContentHash({ ...goodStrength, title: "Upper" })
    );
    expect(enduranceContentHash(goodEndurance)).toBe(
      enduranceContentHash({ ...goodEndurance, notes: "different note" })
    ); // notes excluded from identity
    expect(enduranceContentHash(goodEndurance)).not.toBe(
      enduranceContentHash({ ...goodEndurance, distanceMi: 6.3 })
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/manual-log.test.ts`
Expected: FAIL — cannot find module `@/lib/manual-log`.

- [ ] **Step 3: Implement (pure parts only; persistence added in Task 5)**

Create `src/lib/manual-log.ts`:

```ts
import { createHash } from "node:crypto";

export const ACTIVITY_TYPES = ["run", "ride", "swim", "other"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export type ManualStrengthInput = {
  performedAt: Date;
  title: string;
  sets: {
    exerciseName: string;
    weight: number;
    reps: number;
    setNumber: number;
  }[];
};
export type ManualEnduranceInput = {
  performedAt: Date;
  activityType: string;
  distanceMi: number | null;
  durationSec: number;
  notes: string;
};

export type Validation = { fieldErrors: Record<string, string> };

function dateValid(d: Date): boolean {
  return d instanceof Date && Number.isFinite(d.getTime());
}

export function validateStrengthInput(i: ManualStrengthInput): Validation {
  const fieldErrors: Record<string, string> = {};
  if (!dateValid(i.performedAt))
    fieldErrors.performedAt = "Enter a valid date and time.";
  if (!i.sets || i.sets.length === 0) {
    fieldErrors.sets = "Add at least one set.";
  } else {
    const bad = i.sets.some(
      (s) =>
        !s.exerciseName.trim() ||
        !Number.isFinite(s.weight) ||
        s.weight < 0 ||
        !Number.isInteger(s.reps) ||
        s.reps < 1
    );
    if (bad)
      fieldErrors.sets =
        "Each set needs an exercise name, weight ≥ 0 and reps ≥ 1.";
  }
  return { fieldErrors };
}

export function validateEnduranceInput(i: ManualEnduranceInput): Validation {
  const fieldErrors: Record<string, string> = {};
  if (!dateValid(i.performedAt))
    fieldErrors.performedAt = "Enter a valid date and time.";
  if (!(ACTIVITY_TYPES as readonly string[]).includes(i.activityType))
    fieldErrors.activityType = "Choose run, ride, swim or other.";
  if (!Number.isInteger(i.durationSec) || i.durationSec <= 0)
    fieldErrors.durationSec = "Enter a positive duration.";
  if (
    i.distanceMi !== null &&
    (!Number.isFinite(i.distanceMi) || i.distanceMi < 0)
  )
    fieldErrors.distance = "Distance must be 0 or more (or left blank).";
  return { fieldErrors };
}

const sha = (obj: unknown) =>
  createHash("sha256").update(JSON.stringify(obj)).digest("hex");

// Identity = what makes a logged item "the same" for dedupe. Notes excluded.
export function strengthContentHash(i: ManualStrengthInput): string {
  return sha({
    performedAt: i.performedAt.toISOString(),
    title: i.title,
    sets: i.sets,
  });
}
export function enduranceContentHash(i: ManualEnduranceInput): string {
  return sha({
    performedAt: i.performedAt.toISOString(),
    activityType: i.activityType,
    distanceMi: i.distanceMi,
    durationSec: i.durationSec,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/manual-log.test.ts`
Expected: PASS (all describe blocks green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/manual-log.ts tests/manual-log.test.ts
git commit -m "feat(manual-log): pure validation + content hashing"
```

---

### Task 5: `manual-log` persistence + `log` server action

Adds DB writes to `manual-log.ts` and the thin action. Persistence is integration-tested in Task 11.

**Files:**
- Modify: `src/lib/manual-log.ts`
- Create: `src/app/actions/log.ts`

- [ ] **Step 1: Add the persistence functions to `manual-log.ts`**

Append to `src/lib/manual-log.ts` (add the imports at the top of the file, after the existing `createHash` import):

```ts
import { db } from "@/db";
import { workout, workoutSet, enduranceActivity } from "@/db/schema";
```

Then append at the end of the file:

```ts
export type LogResult = {
  ok: boolean;
  added: number;
  skipped: number;
  fieldErrors?: Record<string, string>;
  error?: string;
};

export async function logStrengthWorkout(
  userId: string,
  input: ManualStrengthInput
): Promise<LogResult> {
  const { fieldErrors } = validateStrengthInput(input);
  if (Object.keys(fieldErrors).length)
    return { ok: false, added: 0, skipped: 0, fieldErrors };

  const [row] = await db
    .insert(workout)
    .values({
      userId,
      performedAt: input.performedAt,
      title: input.title.trim() || "Workout",
      source: "manual",
      contentHash: strengthContentHash(input),
    })
    .onConflictDoNothing({ target: [workout.userId, workout.contentHash] })
    .returning();
  if (!row) return { ok: true, added: 0, skipped: 1 }; // duplicate

  await db.insert(workoutSet).values(
    input.sets.map((s) => ({
      workoutId: row.id,
      userId,
      exerciseName: s.exerciseName.trim(),
      equipment: null,
      setNumber: s.setNumber,
      weight: String(s.weight),
      reps: s.reps,
    }))
  );
  return { ok: true, added: 1, skipped: 0 };
}

export async function logEnduranceActivity(
  userId: string,
  input: ManualEnduranceInput
): Promise<LogResult> {
  const { fieldErrors } = validateEnduranceInput(input);
  if (Object.keys(fieldErrors).length)
    return { ok: false, added: 0, skipped: 0, fieldErrors };

  const [row] = await db
    .insert(enduranceActivity)
    .values({
      userId,
      performedAt: input.performedAt,
      activityType: input.activityType,
      distance: input.distanceMi === null ? null : String(input.distanceMi),
      durationSec: input.durationSec,
      notes: input.notes,
      source: "manual",
      contentHash: enduranceContentHash(input),
    })
    .onConflictDoNothing({
      target: [enduranceActivity.userId, enduranceActivity.contentHash],
    })
    .returning();
  return row
    ? { ok: true, added: 1, skipped: 0 }
    : { ok: true, added: 0, skipped: 1 };
}
```

> Note: `db` is the neon-http single-statement client. The two strength
> statements are not wrapped in a transaction — same non-atomic,
> small-blast-radius precedent as `plan-store` (per spec §3.3). Do not
> introduce `txDb` here.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Create the server action**

Create `src/app/actions/log.ts`:

```ts
"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { parseAppDateTime } from "@/lib/units";
import { parseDuration } from "@/lib/duration";
import {
  logStrengthWorkout,
  logEnduranceActivity,
  type LogResult,
} from "@/lib/manual-log";

function num(v: FormDataEntryValue | null): number {
  const n = Number(v ?? NaN);
  return Number.isFinite(n) ? n : NaN;
}

export async function logWorkout(formData: FormData): Promise<LogResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session)
    return { ok: false, added: 0, skipped: 0, error: "Not authenticated." };
  const userId = session.user.id;

  const kind = String(formData.get("kind") ?? "");
  const performedAt =
    parseAppDateTime(String(formData.get("performedAt") ?? "")) ??
    new Date(NaN);

  if (kind === "strength") {
    const count = Math.min(
      Math.trunc(num(formData.get("rowCount")) || 0),
      100
    );
    const perExerciseSeq = new Map<string, number>();
    const sets: {
      exerciseName: string;
      weight: number;
      reps: number;
      setNumber: number;
    }[] = [];
    for (let r = 0; r < count; r++) {
      const name = String(formData.get(`set-${r}-name`) ?? "").trim();
      if (!name) continue; // skip blank trailing rows
      const seq = (perExerciseSeq.get(name) ?? 0) + 1;
      perExerciseSeq.set(name, seq);
      sets.push({
        exerciseName: name,
        weight: num(formData.get(`set-${r}-weight`)),
        reps: Math.trunc(num(formData.get(`set-${r}-reps`))),
        setNumber: seq,
      });
    }
    const res = await logStrengthWorkout(userId, {
      performedAt,
      title: String(formData.get("title") ?? ""),
      sets,
    });
    if (res.ok) revalidatePath("/");
    return res;
  }

  if (kind === "endurance") {
    const distRaw = String(formData.get("distance") ?? "").trim();
    const res = await logEnduranceActivity(userId, {
      performedAt,
      activityType: String(formData.get("activityType") ?? ""),
      distanceMi: distRaw === "" ? null : num(formData.get("distance")),
      durationSec: parseDuration(String(formData.get("duration") ?? "")) ?? 0,
      notes: String(formData.get("notes") ?? ""),
    });
    if (res.ok) revalidatePath("/");
    return res;
  }

  return { ok: false, added: 0, skipped: 0, error: "Unknown workout kind." };
}
```

- [ ] **Step 4: Type-check + full offline suite**

Run: `npx tsc --noEmit && npx vitest run`
Expected: PASS (no test regressions; new modules covered).

- [ ] **Step 5: Commit**

```bash
git add src/lib/manual-log.ts src/app/actions/log.ts
git commit -m "feat(manual-log): persistence + log server action"
```

---

### Task 6: `/log` page (client component) + nav link

**Files:**
- Create: `src/app/(app)/log/page.tsx`
- Modify: `src/lib/nav.ts`
- Modify: `tests/nav.test.ts`

- [ ] **Step 1: Update the nav test (failing)**

In `tests/nav.test.ts`, replace the first `it` body's `toEqual` array and its title:

```ts
  it("lists the four signed-in routes in order with short labels", () => {
    expect(NAV_ITEMS).toEqual([
      { href: "/", label: "Today", shortLabel: "Today" },
      { href: "/plan", label: "Weekly plan", shortLabel: "Plan" },
      { href: "/log", label: "Log workout", shortLabel: "Log" },
      { href: "/import", label: "Import", shortLabel: "Import" },
    ]);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/nav.test.ts`
Expected: FAIL — `NAV_ITEMS` still has 3 entries.

- [ ] **Step 3: Add the nav item**

In `src/lib/nav.ts`, change `NAV_ITEMS` to insert `/log` between `/plan` and `/import`:

```ts
export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Today", shortLabel: "Today" },
  { href: "/plan", label: "Weekly plan", shortLabel: "Plan" },
  { href: "/log", label: "Log workout", shortLabel: "Log" },
  { href: "/import", label: "Import", shortLabel: "Import" },
];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/nav.test.ts`
Expected: PASS.

- [ ] **Step 5: Create the page**

Create `src/app/(app)/log/page.tsx`. All inputs are controlled (`useState`), per the React-19 form-reset gotcha documented for `plan-editor`. Design-system rules: `.ds-*` / `--ds-*` only, sentence case, no emoji.

```tsx
"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { logWorkout } from "@/app/actions/log";
import { ACTIVITY_TYPES } from "@/lib/manual-log";

type SetRow = { id: string; name: string; weight: string; reps: string };
const emptySet = (): SetRow => ({
  id: crypto.randomUUID(),
  name: "",
  weight: "",
  reps: "",
});

// datetime-local default: now, trimmed to "YYYY-MM-DDTHH:mm".
function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export default function LogPage() {
  const [kind, setKind] = useState<"strength" | "endurance">("strength");
  const [performedAt, setPerformedAt] = useState(nowLocal());
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<SetRow[]>([emptySet()]);
  const [activityType, setActivityType] = useState<string>("run");
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Awaited<
    ReturnType<typeof logWorkout>
  > | null>(null);

  const setRow = (i: number, patch: Partial<SetRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("performedAt", performedAt);
      if (kind === "strength") {
        fd.set("title", title);
        fd.set("rowCount", String(rows.length));
        rows.forEach((r, i) => {
          fd.set(`set-${i}-name`, r.name);
          fd.set(`set-${i}-weight`, r.weight);
          fd.set(`set-${i}-reps`, r.reps);
        });
      } else {
        fd.set("activityType", activityType);
        fd.set("distance", distance);
        fd.set("duration", duration);
        fd.set("notes", notes);
      }
      setRes(await logWorkout(fd));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="ds-container p-8 max-w-lg">
      <h1 className="h2">log a workout</h1>
      <div
        className="flex gap-2 my-3"
        role="group"
        aria-label="workout kind"
      >
        <button
          type="button"
          className={`ds-btn ${kind === "strength" ? "ds-btn-primary" : "ds-btn-ghost"}`}
          aria-pressed={kind === "strength"}
          onClick={() => setKind("strength")}
        >
          strength
        </button>
        <button
          type="button"
          className={`ds-btn ${kind === "endurance" ? "ds-btn-primary" : "ds-btn-ghost"}`}
          aria-pressed={kind === "endurance"}
          onClick={() => setKind("endurance")}
        >
          endurance
        </button>
      </div>

      <form onSubmit={submit}>
        <label className="grid-label">date &amp; time</label>
        <input
          className="border rounded p-2 w-full my-1"
          type="datetime-local"
          value={performedAt}
          onChange={(e) => setPerformedAt(e.target.value)}
        />

        {kind === "strength" ? (
          <>
            <input
              className="border rounded p-2 w-full my-1"
              placeholder="title (e.g. heavy lower)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {rows.map((r, i) => (
              <div key={r.id} className="flex gap-2 my-1 items-center">
                <input
                  className="border rounded p-2 flex-1"
                  aria-label="exercise name"
                  placeholder="exercise"
                  value={r.name}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                />
                <input
                  className="border rounded p-2 w-20"
                  type="number"
                  step="any"
                  min={0}
                  aria-label="weight"
                  placeholder="weight"
                  value={r.weight}
                  onChange={(e) => setRow(i, { weight: e.target.value })}
                />
                <input
                  className="border rounded p-2 w-16"
                  type="number"
                  min={1}
                  aria-label="reps"
                  placeholder="reps"
                  value={r.reps}
                  onChange={(e) => setRow(i, { reps: e.target.value })}
                />
                <button
                  type="button"
                  className="ds-btn ds-btn-ghost"
                  aria-label="remove set"
                  onClick={() =>
                    setRows((rs) =>
                      rs.length > 1 ? rs.filter((_, j) => j !== i) : rs
                    )
                  }
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="ds-btn ds-btn-secondary my-1"
              onClick={() => setRows((rs) => [...rs, emptySet()])}
            >
              <Plus size={16} aria-hidden="true" /> add set
            </button>
            <p className="ds-mono-note">
              one row per set; set numbers are assigned per exercise in order.
            </p>
          </>
        ) : (
          <>
            <label className="grid-label">activity</label>
            <select
              className="border rounded p-2 my-1"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className="border rounded p-2 w-full my-1"
              type="number"
              step="any"
              min={0}
              placeholder="distance (mi, optional)"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
            <input
              className="border rounded p-2 w-full my-1"
              placeholder="duration (h:mm:ss or mm:ss)"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
            <textarea
              className="border rounded p-2 w-full my-1"
              placeholder="notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </>
        )}

        <button
          className="ds-btn ds-btn-primary mt-3"
          type="submit"
          disabled={busy}
        >
          {busy ? "saving…" : "log workout"}
        </button>
      </form>

      {res &&
        (res.error || res.fieldErrors ? (
          <p style={{ color: "var(--ds-error)" }}>
            {res.error ??
              Object.values(res.fieldErrors ?? {}).join(" ") ??
              "Could not save."}
          </p>
        ) : (
          <div className="ds-panel mt-4 p-4">
            <p>
              {res.added > 0
                ? "logged."
                : "already logged (skipped duplicate)."}
            </p>
          </div>
        ))}
    </main>
  );
}
```

- [ ] **Step 6: Build + type-check (page compiles, route resolves)**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS; build output lists the `/log` route.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/log/page.tsx" src/lib/nav.ts tests/nav.test.ts
git commit -m "feat(log): manual workout entry page + nav link"
```

---

### Task 7: AI cutover — `recentTraining` input + `loadRecentTraining`

Replaces the AI's `trailingLoad` input with `recentTraining`. `trailing-load.ts` and `loadTrailingLoad` stay (still used by the dashboard) until Tasks 8–9. Single commit so the build stays green.

**Files:**
- Modify: `src/lib/ai-engine.ts`
- Modify: `src/lib/readiness.ts`
- Modify: `tests/ai-engine.test.ts`
- Modify: `tests/readiness.integration.test.ts`

- [ ] **Step 1: Update the ai-engine unit test (failing)**

In `tests/ai-engine.test.ts`, replace the `input` constant's `trailingLoad` block with a `recentTraining` block and update the prompt assertions. The full new `input` and the changed `it` are:

```ts
const input: AnalyzeInput = {
  plannedSession: {
    title: "Heavy Lower",
    notes: "deload-ish, knee a bit cranky",
    modality: "strength",
    exercises: [
      { name: "Squat", targetSets: 5, targetReps: 5, targetWeight: 245 },
    ],
  },
  recentTraining: {
    windowDays: 7,
    strengthSessions: [
      {
        workoutId: "w1",
        performedAt: new Date("2026-05-13T12:35:00Z"),
        title: "Lower A",
        sets: [
          { exerciseName: "Squat", weight: 245, reps: 5 },
          { exerciseName: "Squat", weight: 245, reps: 5 },
        ],
      },
    ],
    enduranceActivities: [
      {
        performedAt: new Date("2026-05-14T11:00:00Z"),
        activityType: "run",
        distanceMi: 6.2,
        durationSec: 2880,
        pacePerMiSec: 2880 / 6.2,
        mph: 6.2 / (2880 / 3600),
      },
    ],
  },
};
```

Then in the `"buildPrompt is deterministic ..."` test, replace the `8200` assertion line with endurance + raw-set assertions:

```ts
    expect(a).toContain("Squat 245×5");
    expect(a).toContain("run");
    expect(a).toContain("6.2");
```

Leave the other `it` blocks (validation/retry) unchanged — they only depend on `analyzeReadiness` + the mocked generate, not the input shape.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai-engine.test.ts`
Expected: FAIL — `recentTraining` is not assignable to `AnalyzeInput` (still `trailingLoad`).

- [ ] **Step 3: Update `ai-engine.ts`**

In `src/lib/ai-engine.ts`:

a) Add an import at the top (after the `zod` import):

```ts
import { appDate } from "@/lib/week";
import { formatDuration } from "@/lib/duration";
import type { RecentTraining } from "@/lib/recent-training";
```

b) Replace the `trailingLoad: { ... }` member of `AnalyzeInput` with:

```ts
  recentTraining: RecentTraining;
```

c) Replace the `buildPrompt` function body's `tl`/`actual` derivation and the returned array with:

```ts
export function buildPrompt(i: AnalyzeInput): string {
  const ps = i.plannedSession;
  const planned =
    ps.exercises
      .map(
        (e) => `${e.name}: ${e.targetSets}x${e.targetReps} @ ${e.targetWeight}`
      )
      .join("; ") || "no structured exercises";
  const rt = i.recentTraining;
  const strength =
    rt.strengthSessions
      .map(
        (s) =>
          `[${appDate(s.performedAt)}] ${s.title}: ` +
          s.sets
            .map((x) => `${x.exerciseName} ${x.weight}×${x.reps}`)
            .join(", ")
      )
      .join(" | ") || "none";
  const endurance =
    rt.enduranceActivities
      .map((e) => {
        const dist = e.distanceMi === null ? "?" : `${e.distanceMi}mi`;
        const pace =
          e.pacePerMiSec === null
            ? ""
            : ` (${formatDuration(Math.round(e.pacePerMiSec))}/mi)`;
        return `[${appDate(e.performedAt)}] ${e.activityType} ${dist} in ${formatDuration(e.durationSec)}${pace}`;
      })
      .join(" | ") || "none";
  return [
    "You are a strength coach. Auto-regulate today's session using only the data below.",
    `Planned (${ps.modality}) "${ps.title}": ${planned}`,
    `Day notes: ${ps.notes || "none"}`,
    `Recent strength (last ${rt.windowDays}d): ${strength}`,
    `Recent endurance (last ${rt.windowDays}d): ${endurance}`,
    "Match planned exercise names to recent-actual names by similarity (e.g. 'Bench' ~ 'Bench Press'); ignore planned exercises with no actual match.",
    "Endurance fatigue (runs/rides/swims) is real systemic load — weigh it when judging readiness for lower-body or heavy sessions.",
    "No RPE is available — judge fatigue from recent sets, frequency, endurance volume and rest only.",
    "Return TWO separate lists:",
    "- todayAdjustments[]: ephemeral, today-only tweaks given current fatigue (do NOT change the program). Empty unless warranted.",
    "- progressionSuggestions[]: durable target changes going forward, ONLY on clear evidence (clean reps at/above target across recent sessions, or a clear stall). currentWeight = the planned target. Empty unless clearly warranted. Do NOT include a status field.",
  ].join("\n");
}
```

The Zod **output** schema, `MODEL_ID`, `MODEL_LABEL`, `defaultGenerate`, `analyzeReadiness`, and the retry path are unchanged.

- [ ] **Step 4: Update `readiness.ts` (loader + call site)**

In `src/lib/readiness.ts`:

a) Replace the trailing-load import block:

```ts
import {
  computeRecentTraining,
  type RecentTraining,
  type StrengthRow,
  type EnduranceRow,
} from "@/lib/recent-training";
```

b) Add `enduranceActivity` to the `@/db/schema` import (it currently imports `plannedSession, plannedExercise, workout, workoutSet, readinessAnalysis`):

```ts
import {
  plannedSession,
  plannedExercise,
  workout,
  workoutSet,
  readinessAnalysis,
  enduranceActivity,
} from "@/db/schema";
```

c) Replace the entire `loadTrailingLoad` function with `loadRecentTraining`:

```ts
export async function loadRecentTraining(
  userId: string,
  now: Date
): Promise<RecentTraining> {
  const cutoff = new Date(now.getTime() - 7 * 86_400_000);
  const sRows = await db
    .select({
      workoutId: workout.id,
      performedAt: workout.performedAt,
      title: workout.title,
      exerciseName: workoutSet.exerciseName,
      weight: workoutSet.weight,
      reps: workoutSet.reps,
      setNumber: workoutSet.setNumber,
    })
    .from(workoutSet)
    .innerJoin(workout, eq(workoutSet.workoutId, workout.id))
    .where(and(eq(workoutSet.userId, userId), gte(workout.performedAt, cutoff)))
    .orderBy(workout.performedAt, workoutSet.setNumber);
  const eRows = await db
    .select({
      performedAt: enduranceActivity.performedAt,
      activityType: enduranceActivity.activityType,
      distance: enduranceActivity.distance,
      durationSec: enduranceActivity.durationSec,
    })
    .from(enduranceActivity)
    .where(
      and(
        eq(enduranceActivity.userId, userId),
        gte(enduranceActivity.performedAt, cutoff)
      )
    );

  const strengthRows: StrengthRow[] = sRows.map((r) => ({
    workoutId: r.workoutId,
    performedAt: r.performedAt,
    title: r.title,
    exerciseName: r.exerciseName,
    weight: Number(r.weight),
    reps: r.reps,
  }));
  const enduranceRows: EnduranceRow[] = eRows.map((r) => ({
    performedAt: r.performedAt,
    activityType: r.activityType,
    distanceMi: r.distance === null ? null : Number(r.distance),
    durationSec: r.durationSec,
  }));
  return computeRecentTraining(strengthRows, enduranceRows, now, 7);
}
```

d) In `runReadinessAnalysis`, replace the line `const load = await loadTrailingLoad(opts.userId, now);` with:

```ts
  const recentTraining = await loadRecentTraining(opts.userId, now);
```

e) In the `analyzeReadiness({ ... })` call, replace `trailingLoad: load,` with:

```ts
        recentTraining,
```

f) In the `db.insert(readinessAnalysis).values({ ... })`, replace `loadSnapshot: load,` with:

```ts
      loadSnapshot: recentTraining as unknown as Record<string, unknown>,
```

- [ ] **Step 5: Update the readiness integration test's loadSnapshot assertions**

In `tests/readiness.integration.test.ts`, the block currently reading:

```ts
    const load = row.loadSnapshot as Record<string, unknown>;
    expect(load.setCount).toBe(2);
    expect(load.totalVolume).toBe(185 * 5 + 135 * 8);
```

Replace those three lines with:

```ts
    const load = row.loadSnapshot as {
      windowDays: number;
      strengthSessions: { sets: unknown[] }[];
    };
    expect(load.windowDays).toBe(7);
    expect(load.strengthSessions.length).toBe(1);
    expect(load.strengthSessions[0].sets.length).toBe(2);
```

- [ ] **Step 6: Run unit tests + type-check**

Run: `npx vitest run && npx tsc --noEmit`
Expected: PASS. `tests/trailing-load.test.ts` still passes (module not yet removed).

- [ ] **Step 7: Run the touched integration paths**

Run: `npm run test:integration`
Expected: PASS — readiness + import + plan + progression + training-week integration suites green (the readiness suite now asserts the new snapshot shape).

- [ ] **Step 8: Commit**

```bash
git add src/lib/ai-engine.ts src/lib/readiness.ts tests/ai-engine.test.ts tests/readiness.integration.test.ts
git commit -m "feat(ai): feed raw 7-day recent training (strength+endurance) to the model"
```

---

### Task 8: Dashboard today card — last session's sets

Switch the dashboard off `loadTrailingLoad` onto `loadRecentTraining` + `lastSessionSetsByExercise`, and reshape the `TodaySession` `actuals` to show the last session's sets per planned exercise.

**Files:**
- Modify: `src/app/(app)/page.tsx`
- Modify: `src/app/(app)/dashboard/today-session.tsx`

- [ ] **Step 1: Reshape `TodaySession`'s `actuals`**

In `src/app/(app)/dashboard/today-session.tsx`:

a) Replace the `Actual` type:

```ts
type Actual = {
  exerciseName: string;
  agoDays: number;
  sets: { weight: number; reps: number }[];
};
```

b) Replace the `{a && ( ... )}` recent-note block inside the `exercises.map` with:

```tsx
                {a && a.sets.length > 0 && (
                  <span className="ds-mono-note">
                    {" "}
                    · last ({a.agoDays === 0 ? "today" : `${a.agoDays}d ago`}):{" "}
                    {a.sets.map((s) => `${s.weight}×${s.reps}`).join(", ")}
                  </span>
                )}
```

`actualFor` (the `findExerciseMatch` call) is unchanged — it still matches on `exerciseName`.

- [ ] **Step 2: Update `page.tsx` to build the new actuals**

In `src/app/(app)/page.tsx`:

a) Replace the import `import { todayInfo, loadTrailingLoad } from "@/lib/readiness";` with:

```ts
import { todayInfo, loadRecentTraining } from "@/lib/readiness";
import { lastSessionSetsByExercise } from "@/lib/recent-training";
```

b) Replace `const load = await loadTrailingLoad(userId, now);` with:

```ts
  const recentTraining = await loadRecentTraining(userId, now);
  const lastSets = lastSessionSetsByExercise(recentTraining, now);
```

c) Replace the `actuals={load.perExercise.map(...)}` prop on `<TodaySession>` with:

```tsx
          actuals={lastSets.map((e) => ({
            exerciseName: e.exerciseName,
            agoDays: e.agoDays,
            sets: e.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
          }))}
```

- [ ] **Step 3: Type-check + build + unit suite**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: PASS. `loadTrailingLoad` is now unreferenced (removed in Task 9).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/page.tsx" "src/app/(app)/dashboard/today-session.tsx"
git commit -m "feat(dashboard): show last session's sets per planned exercise"
```

---

### Task 9: Remove the dead `trailing-load` module

`computeTrailingLoad` / `loadTrailingLoad` now have zero references.

**Files:**
- Delete: `src/lib/trailing-load.ts`
- Delete: `tests/trailing-load.test.ts`

- [ ] **Step 1: Confirm there are no remaining references**

Run: `grep -rn "trailing-load\|loadTrailingLoad\|computeTrailingLoad\|TrailingLoad" src tests`
Expected: no matches.

- [ ] **Step 2: Delete the files**

```bash
git rm src/lib/trailing-load.ts tests/trailing-load.test.ts
```

- [ ] **Step 3: Type-check + full offline suite + build**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: PASS (no broken imports).

- [ ] **Step 4: Commit**

```bash
git commit -m "refactor: remove dead trailing-load aggregator"
```

---

### Task 10: Weekly training view shows endurance

Endurance activities render in the weekly view; an endurance-only day counts as `done`.

**Files:**
- Modify: `src/lib/week-view.ts`
- Modify: `tests/week-view.test.ts`
- Modify: `src/lib/training-week-data.ts`
- Modify: `src/app/(app)/dashboard/training-week.tsx`

- [ ] **Step 1: Add a failing week-view test**

Append to `tests/week-view.test.ts` (inside the existing `describe("buildTrainingWeek", ...)` block — reuse the file's existing `NOW`/`WEEK` constants):

```ts
  it("counts an endurance-only day as done and summarizes it", () => {
    const data = buildTrainingWeek({
      weekStartYmd: WEEK,
      now: NOW,
      workouts: [],
      planDays: [],
      enduranceActivities: [
        {
          performedAt: new Date("2026-05-12T16:00:00Z"), // Tue 2026-05-12
          activityType: "run",
          distanceMi: 6.2,
          durationSec: 2880,
        },
      ],
    });
    const tue = data.days.find((d) => d.ymd === "2026-05-12")!;
    expect(tue.state).toBe("done");
    expect(tue.endurance).toEqual([
      { activityType: "run", distanceMi: 6.2, durationSec: 2880 },
    ]);
    expect(tue.summary).toContain("run 6.2mi · 48:00");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/week-view.test.ts`
Expected: FAIL — `enduranceActivities` not accepted; `tue.endurance` undefined.

- [ ] **Step 3: Update `week-view.ts`**

In `src/lib/week-view.ts`:

a) Add an import for the duration formatter at the top (next to the existing `@/lib/week` import):

```ts
import { formatDuration } from "@/lib/duration";
```

b) Add types after `SetView`:

```ts
export type EnduranceInput = {
  performedAt: Date;
  activityType: string;
  distanceMi: number | null;
  durationSec: number;
};
export type EnduranceCell = {
  activityType: string;
  distanceMi: number | null;
  durationSec: number;
};
```

c) Add `endurance: EnduranceCell[];` to the `DayCell` type (after `workouts`).

d) Add an endurance summary helper after the existing `summarize` function:

```ts
function summarizeEndurance(es: EnduranceCell[]): string | null {
  if (es.length === 0) return null;
  return es
    .map(
      (e) =>
        `${e.activityType}${e.distanceMi === null ? "" : ` ${e.distanceMi}mi`} · ${formatDuration(e.durationSec)}`
    )
    .join(" · ");
}
```

e) Change the `buildTrainingWeek` signature's `args` to add the optional input (optional + default keeps the existing tests, which pass no endurance, green):

```ts
export function buildTrainingWeek(args: {
  weekStartYmd: string;
  now: Date;
  workouts: WorkoutInput[];
  planDays: PlanDayLite[];
  enduranceActivities?: EnduranceInput[];
}): TrainingWeekData {
  const { weekStartYmd, now, workouts, planDays } = args;
  const enduranceActivities = args.enduranceActivities ?? [];
```

f) Inside the `weekDays(...).map(...)`, after the `dayWorkouts` line, add the per-day endurance and fold it into state + summary. Replace the `let state: DayState; ... ` block and the `return { ... }` object with:

```ts
    const dayEndurance: EnduranceCell[] = enduranceActivities
      .filter((e) => appDate(e.performedAt) === d.ymd)
      .sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime())
      .map((e) => ({
        activityType: e.activityType,
        distanceMi: e.distanceMi,
        durationSec: e.durationSec,
      }));
    const plan = planDays.find((p) => p.dayOfWeek === d.planDow) ?? null;
    const dayNum = Number(d.ymd.slice(8, 10));
    const label = `${DOW_LABELS[i]} ${dayNum}`;
    const isToday = d.ymd === todayYmd;

    const didTrain = dayWorkouts.length > 0 || dayEndurance.length > 0;
    let state: DayState;
    if (didTrain) state = "done";
    else if (plan) state = d.ymd < todayYmd ? "missed" : "planned";
    else state = "rest";

    const flatSets = dayWorkouts.flatMap((w) => w.sets);
    const strengthSummary = summarize(flatSets);
    const enduranceSummary = summarizeEndurance(dayEndurance);
    const summary =
      state === "done"
        ? [strengthSummary, enduranceSummary].filter(Boolean).join(" · ") ||
          null
        : null;

    return {
      ymd: d.ymd,
      label,
      isToday,
      state,
      workouts: dayWorkouts.map((w) => ({
        id: w.id,
        title: w.title,
        sets: w.sets,
      })),
      endurance: dayEndurance,
      summary,
      plannedTitle:
        state === "missed" || state === "planned" ? (plan?.title ?? "") : null,
    };
```

(Delete the now-replaced original `const plan = ...`, `const dayNum`, `const label`, `const isToday`, `let state`, `const flatSets`, and `return {...}` lines so they are not duplicated.)

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/week-view.test.ts`
Expected: PASS — the new endurance test green and all pre-existing `buildTrainingWeek` cases still green (they pass no `enduranceActivities`, default `[]`, summary unchanged for strength-only days).

- [ ] **Step 5: Load endurance in `training-week-data.ts`**

In `src/lib/training-week-data.ts`:

a) Add `enduranceActivity` to the `@/db/schema` import (currently `workout, workoutSet, plannedSession`):

```ts
import {
  workout,
  workoutSet,
  plannedSession,
  enduranceActivity,
} from "@/db/schema";
```

b) Add an import for the new type from `@/lib/week-view` (currently imports `buildTrainingWeek, TrainingWeekData, WorkoutInput`):

```ts
import {
  buildTrainingWeek,
  type TrainingWeekData,
  type WorkoutInput,
  type EnduranceInput,
} from "@/lib/week-view";
```

c) After the `planDays` query and before the `return buildTrainingWeek({...})`, add the endurance query:

```ts
  const enduranceRows = await db
    .select()
    .from(enduranceActivity)
    .where(
      and(
        eq(enduranceActivity.userId, userId),
        gte(enduranceActivity.performedAt, from),
        lt(enduranceActivity.performedAt, to)
      )
    )
    .orderBy(asc(enduranceActivity.performedAt));
  const enduranceInputs: EnduranceInput[] = enduranceRows.map((e) => ({
    performedAt: e.performedAt,
    activityType: e.activityType,
    distanceMi: e.distance === null ? null : Number(e.distance),
    durationSec: e.durationSec,
  }));
```

d) Add `enduranceActivities: enduranceInputs,` to the `buildTrainingWeek({ ... })` call.

- [ ] **Step 6: Render endurance in the weekly view component**

In `src/app/(app)/dashboard/training-week.tsx`, the expand list currently maps `d.workouts.flatMap((w) => w.sets...)`. Replace the `{isOpen && canExpand && ( <ul ...> ... </ul> )}` block's inner list contents so endurance lines also render:

```tsx
              {isOpen && canExpand && (
                <ul
                  className="ds-mono-note"
                  style={{
                    listStyle: "none",
                    margin: "0 0 var(--ds-space-2) var(--ds-space-5)",
                    padding: 0,
                  }}
                >
                  {d.workouts.flatMap((w) =>
                    w.sets.map((s, i) => (
                      <li key={`${w.id}-${i}`}>
                        {s.exerciseName}: {s.weight} × {s.reps}
                      </li>
                    ))
                  )}
                  {d.endurance.map((e, i) => (
                    <li key={`end-${i}`}>
                      {e.activityType}
                      {e.distanceMi === null ? "" : ` ${e.distanceMi}mi`} ·{" "}
                      {formatDuration(e.durationSec)}
                    </li>
                  ))}
                </ul>
              )}
```

Add the import at the top of the file (next to the `@/lib/week-view` type import):

```ts
import { formatDuration } from "@/lib/duration";
```

- [ ] **Step 7: Type-check + build + offline suite**

Run: `npx tsc --noEmit && npx vitest run && npm run build`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/lib/week-view.ts tests/week-view.test.ts src/lib/training-week-data.ts "src/app/(app)/dashboard/training-week.tsx"
git commit -m "feat(week): render endurance activities in the weekly training view"
```

---

### Task 11: Integration test for the log action + endurance in readiness/week

**Files:**
- Create: `tests/log.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Create `tests/log.integration.test.ts` (self-cleaning `itest-*` users, mirrors `tests/import.integration.test.ts`):

```ts
import { describe, it, expect, afterAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import { workout, workoutSet, enduranceActivity } from "@/db/schema";
import {
  logStrengthWorkout,
  logEnduranceActivity,
} from "@/lib/manual-log";

const SU = "itest-log-strength-" + Date.now();
const EU = "itest-log-endurance-" + Date.now();
const ALL = [SU, EU];
const when = new Date("2026-05-15T16:00:00Z");

afterAll(async () => {
  await db.delete(workout).where(inArray(workout.userId, ALL));
  await db
    .delete(enduranceActivity)
    .where(inArray(enduranceActivity.userId, ALL));
  const w = await db
    .select({ id: workout.id })
    .from(workout)
    .where(inArray(workout.userId, ALL));
  const e = await db
    .select({ id: enduranceActivity.id })
    .from(enduranceActivity)
    .where(inArray(enduranceActivity.userId, ALL));
  expect(w.length).toBe(0);
  expect(e.length).toBe(0);
});

describe("logStrengthWorkout (live Neon)", () => {
  const input = {
    performedAt: when,
    title: "Lower",
    sets: [
      { exerciseName: "Squat", weight: 245, reps: 5, setNumber: 1 },
      { exerciseName: "Squat", weight: 245, reps: 5, setNumber: 2 },
    ],
  };
  it("adds a workout + its sets, then dedupes a re-submit", async () => {
    const a = await logStrengthWorkout(SU, input);
    expect(a).toMatchObject({ ok: true, added: 1, skipped: 0 });
    const rows = await db
      .select()
      .from(workout)
      .where(eq(workout.userId, SU));
    expect(rows.length).toBe(1);
    const sets = await db
      .select()
      .from(workoutSet)
      .where(eq(workoutSet.workoutId, rows[0].id));
    expect(sets.length).toBe(2);

    const b = await logStrengthWorkout(SU, input);
    expect(b).toMatchObject({ ok: true, added: 0, skipped: 1 });
  });
  it("rejects invalid input with field errors and writes nothing", async () => {
    const r = await logStrengthWorkout(SU, {
      performedAt: when,
      title: "Bad",
      sets: [],
    });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.sets).toBeTruthy();
  });
});

describe("logEnduranceActivity (live Neon)", () => {
  const input = {
    performedAt: when,
    activityType: "run",
    distanceMi: 6.2,
    durationSec: 2880,
    notes: "easy",
  };
  it("adds an activity then dedupes a re-submit (notes ignored for identity)", async () => {
    const a = await logEnduranceActivity(EU, input);
    expect(a).toMatchObject({ ok: true, added: 1, skipped: 0 });
    const b = await logEnduranceActivity(EU, {
      ...input,
      notes: "totally different note",
    });
    expect(b).toMatchObject({ ok: true, added: 0, skipped: 1 });
    const rows = await db
      .select()
      .from(enduranceActivity)
      .where(eq(enduranceActivity.userId, EU));
    expect(rows.length).toBe(1);
    expect(rows[0].activityType).toBe("run");
  });
  it("rejects an unknown activity type", async () => {
    const r = await logEnduranceActivity(EU, {
      ...input,
      activityType: "yoga",
    });
    expect(r.ok).toBe(false);
    expect(r.fieldErrors?.activityType).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `npm run test:integration`
Expected: PASS — the new `log` suite green plus all pre-existing integration suites still green; the `afterAll` cleanup leaves zero `itest-log-*` rows.

- [ ] **Step 3: Commit**

```bash
git add tests/log.integration.test.ts
git commit -m "test(log): integration coverage for manual strength + endurance logging"
```

---

### Task 12: Mark spec implemented + final green-bar verification

**Files:**
- Modify: `docs/superpowers/specs/2026-05-17-endurance-and-manual-logging-design.md`

- [ ] **Step 1: Run the full required gate**

Run each and confirm PASS:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run format:check
npm run build
npm run test:integration
```

Expected: all green. If `npm run format:check` fails, run `npm run format` and amend the relevant prior commit (or add a `style:` commit).

- [ ] **Step 2: Mark the spec status implemented**

In `docs/superpowers/specs/2026-05-17-endurance-and-manual-logging-design.md`, change the `**Status:**` line to:

```markdown
**Status:** Implemented (2026-05-17)
```

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-17-endurance-and-manual-logging-design.md
git commit -m "docs(endurance): mark spec implemented"
```

---

## Self-Review Notes (addressed inline)

- **Spec coverage:** §2 model → Task 1; §3.1 `recent-training` → Task 3; §3.2 loader → Task 7; §3.3 `manual-log` → Tasks 4–5; §3.4 action → Task 5; §3.5 page + nav → Task 6; §3.6 weekly view → Task 10; §3.7 ai-engine → Task 7; §4 flows → Tasks 5–8/10; §5 errors → Tasks 4/5 (validation, dedupe, auth) ; §6 testing → unit Tasks 2–4/7/10, integration Task 11, `trailing-load.test.ts` removed Task 9; §7 migration/rollout (additive DDL, rename ripple, jsonb back-compat) → Tasks 1/7/8/9.
- **Build-green ordering:** new modules added before the cutover; `trailing-load` retired only after both consumers (AI Task 7, dashboard Task 8) move off it (Task 9).
- **Type consistency:** `RecentTraining`/`StrengthRow`/`EnduranceRow` defined in Task 3 are the exact names imported in Tasks 7/8; `EnduranceInput`/`EnduranceCell` defined in Task 10 match `training-week-data.ts` usage; `ManualStrengthInput`/`ManualEnduranceInput`/`LogResult` defined in Task 4 match Task 5/6/11 usage; `ACTIVITY_TYPES` is the single source for the form and validation.
- **Open spec items (§8):** duration UX resolved as a single `h:mm:ss`/`mm:ss` text field (Task 6 + `parseDuration`); nav placement resolved as `/log` "Log workout"/"Log" between Plan and Import (Task 6); combined strength+endurance summary reuses the existing `summarize` `+N more` convention plus `summarizeEndurance` (Task 10).
- **Endurance→AI integration** is exercised end-to-end by the existing readiness integration suite (snapshot shape, Task 7) and the new log integration suite (Task 11); a logged endurance activity within 7 days now appears in `loadRecentTraining` and the prompt.
