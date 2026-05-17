# Dashboard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the scaffold dashboard with a structured weekly plan (exercises × sets × reps × weight), an AI engine that emits ephemeral today-only adjustments plus durable progression suggestions that write back to the template, and a focused-column dashboard that shows real lifted weights and a progression accept/dismiss inbox.

**Architecture:** Thin server actions over pure libs (unchanged repo pattern). New pure `exercise-match` helper shared by the AI prompt and the accept action. `trailing-load` extended with per-exercise recent top set. `ai-engine` output split into `todayAdjustments[]` + `progressionSuggestions[]`. New `planned_exercise` table; `plan-store` does replace-on-save and gains `applyProgressionDecision`. Dashboard rebuilt as Layout A with `@dustin-riley/design` primitives and `lucide-react` icons.

**Tech Stack:** Next.js 16 (App Router, TS), Tailwind v4 + `@dustin-riley/design`, Neon Postgres + Drizzle, Better Auth, Vercel AI SDK + Anthropic, Vitest, `lucide-react`.

**Spec:** `docs/superpowers/specs/2026-05-16-dashboard-redesign-design.md`

---

## File Structure

| File                                      | Responsibility                                                                             | Action  |
| ----------------------------------------- | ------------------------------------------------------------------------------------------ | ------- |
| `scripts/migrate-dashboard-redesign.mjs`  | One-off idempotent SQL migration (rename, create table, split jsonb, backfill)             | Create  |
| `src/db/schema.ts`                        | `planned_session.notes`, new `plannedExercise`, split `readiness_analysis` jsonb           | Modify  |
| `src/lib/exercise-match.ts`               | Pure name-normalization + fuzzy match used by prompt and accept action                     | Create  |
| `src/lib/trailing-load.ts`                | Add per-exercise recent top set                                                            | Modify  |
| `src/lib/ai-engine.ts`                    | New `AnalyzeInput`, split output schema, rewritten prompt                                  | Modify  |
| `src/lib/plan-store.ts`                   | Structured plan types, `getPlanWithExercises`, replace-on-save, `applyProgressionDecision` | Modify  |
| `src/lib/readiness.ts`                    | Build structured input, persist split fields, stamp `status:'pending'`                     | Modify  |
| `src/app/actions/plan.ts`                 | Parse structured form data; `applyProgression` action wrapper                              | Modify  |
| `src/app/plan/plan-editor.tsx`            | Controlled structured editor (dynamic exercise rows)                                       | Rewrite |
| `src/app/plan/page.tsx`                   | Load structured plan                                                                       | Modify  |
| `src/app/page.tsx`                        | Layout A dashboard (server)                                                                | Rewrite |
| `src/app/dashboard/verdict-banner.tsx`    | Verdict word + lucide icon + accent                                                        | Create  |
| `src/app/dashboard/today-session.tsx`     | Hero: targets + analyze + inline adjustments/actuals                                       | Create  |
| `src/app/dashboard/recent-activity.tsx`   | Disclosure list of workouts with weights                                                   | Create  |
| `src/app/dashboard/progression-inbox.tsx` | Pending suggestions + accept/dismiss                                                       | Create  |
| `tests/exercise-match.test.ts`            | Unit                                                                                       | Create  |
| `tests/trailing-load.test.ts`             | Unit (extend)                                                                              | Modify  |
| `tests/ai-engine.test.ts`                 | Unit (rewrite for new schema)                                                              | Modify  |
| `tests/plan.integration.test.ts`          | Integration (structured)                                                                   | Modify  |
| `tests/progression.integration.test.ts`   | Integration (accept/dismiss)                                                               | Create  |
| `tests/readiness.integration.test.ts`     | Integration (new fields/status)                                                            | Modify  |
| `CLAUDE.md`                               | Update gotchas (notes rename, planned_exercise, field-name scheme)                         | Modify  |

---

## Task 1: Schema changes + migration

**Files:**

- Modify: `src/db/schema.ts`
- Create: `scripts/migrate-dashboard-redesign.mjs`

- [ ] **Step 1: Rewrite the app tables in `src/db/schema.ts`**

Replace the `plannedSession`, `workoutSet` is unchanged, add `plannedExercise`, and replace `readinessAnalysis`'s `modifications` with two columns. Final file (keep `workout`, `workoutSet`, and `export * from "./auth-schema"` exactly as they are; only the three regions below change):

```ts
export const plannedSession = pgTable(
  "planned_session",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    userId: text("user_id").notNull(),
    dayOfWeek: integer("day_of_week").notNull(),
    title: text("title").notNull().default(""),
    notes: text("notes").notNull().default(""),
    modality: text("modality").notNull().default("strength"),
  },
  (t) => ({ uniqUserDay: unique().on(t.userId, t.dayOfWeek) })
);

export const plannedExercise = pgTable("planned_exercise", {
  id: uuid("id").defaultRandom().primaryKey(),
  plannedSessionId: uuid("planned_session_id")
    .notNull()
    .references(() => plannedSession.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  name: text("name").notNull(),
  targetSets: integer("target_sets").notNull(),
  targetReps: integer("target_reps").notNull(),
  targetWeight: numeric("target_weight").notNull(),
  orderIndex: integer("order_index").notNull(),
});

export const readinessAnalysis = pgTable("readiness_analysis", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  analysisDate: date("analysis_date").notNull(),
  planSnapshot: jsonb("plan_snapshot")
    .$type<Record<string, unknown>>()
    .notNull(),
  loadSnapshot: jsonb("load_snapshot")
    .$type<Record<string, unknown>>()
    .notNull(),
  verdict: text("verdict").notNull(),
  headline: text("headline").notNull(),
  rationale: text("rationale").notNull(),
  todayAdjustments: jsonb("today_adjustments")
    .$type<Array<{ exercise: string; change: string }>>()
    .notNull()
    .default([]),
  progressionSuggestions: jsonb("progression_suggestions")
    .$type<
      Array<{
        exercise: string;
        currentWeight: number;
        suggestedWeight: number;
        suggestedSets?: number;
        suggestedReps?: number;
        rationale: string;
        status: "pending" | "accepted" | "dismissed";
      }>
    >()
    .notNull()
    .default([]),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 2: Write the idempotent migration script**

Create `scripts/migrate-dashboard-redesign.mjs` (raw SQL via the neon serverless client — avoids drizzle-kit's interactive rename prompt, which this environment can't answer):

```js
import { neon } from "@neondatabase/serverless";

const sql = neon(process.env.DATABASE_URL);

await sql`ALTER TABLE planned_session RENAME COLUMN description TO notes`.catch(
  (e) => {
    if (!/column "description" does not exist|already exists/i.test(String(e)))
      throw e;
  }
);

await sql`
  CREATE TABLE IF NOT EXISTS planned_exercise (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    planned_session_id uuid NOT NULL REFERENCES planned_session(id) ON DELETE CASCADE,
    user_id text NOT NULL,
    name text NOT NULL,
    target_sets integer NOT NULL,
    target_reps integer NOT NULL,
    target_weight numeric NOT NULL,
    order_index integer NOT NULL
  )`;

await sql`ALTER TABLE readiness_analysis ADD COLUMN IF NOT EXISTS today_adjustments jsonb NOT NULL DEFAULT '[]'::jsonb`;
await sql`ALTER TABLE readiness_analysis ADD COLUMN IF NOT EXISTS progression_suggestions jsonb NOT NULL DEFAULT '[]'::jsonb`;
await sql`
  UPDATE readiness_analysis
  SET today_adjustments = modifications
  WHERE modifications IS NOT NULL
    AND modifications <> '[]'::jsonb
    AND today_adjustments = '[]'::jsonb`.catch((e) => {
  if (!/column "modifications" does not exist/i.test(String(e))) throw e;
});
await sql`ALTER TABLE readiness_analysis DROP COLUMN IF EXISTS modifications`;

console.log("migration: dashboard-redesign applied");
```

- [ ] **Step 3: Type-check the schema in isolation**

Run: `npx tsc --noEmit 2>&1 | grep -E "src/db/schema\.ts"`
Expected: **no output** (zero `tsc` errors originating in `schema.ts`). The full `tsc` run is still non-zero here because downstream files reference renamed names; those are fixed in Tasks 5–10 and the green gate is enforced in Task 11. Only `schema.ts` itself must be clean now.

- [ ] **Step 4: Apply the migration to live Neon**

Run: `node --env-file=.env.local scripts/migrate-dashboard-redesign.mjs`
Expected: stdout `migration: dashboard-redesign applied`

- [ ] **Step 5: Verify drizzle agrees with the DB**

Run: `node --env-file=.env.local ./node_modules/.bin/drizzle-kit push`
Expected: drizzle reports "No changes detected" (or applies only no-op/index parity). If it proposes to drop/recreate `planned_session` or `readiness_analysis`, STOP — the migration script and schema have diverged; reconcile before continuing.

- [ ] **Step 6: Commit**

```bash
git add src/db/schema.ts scripts/migrate-dashboard-redesign.mjs
git commit -m "feat(db): structured planned_exercise + split readiness jsonb"
```

---

## Task 2: `exercise-match` pure helper

**Files:**

- Create: `src/lib/exercise-match.ts`
- Test: `tests/exercise-match.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import {
  normalizeExerciseName,
  exerciseMatches,
  findExerciseMatch,
} from "@/lib/exercise-match";

describe("exercise-match", () => {
  it("normalizes case and punctuation/equipment noise", () => {
    expect(normalizeExerciseName("Incline Bench Press (Barbell)")).toBe(
      "incline bench press barbell"
    );
    expect(normalizeExerciseName("  Pull-Up  ")).toBe("pull up");
  });

  it("matches exact, containment either direction, case-insensitive", () => {
    expect(exerciseMatches("Bench", "Bench Press")).toBe(true);
    expect(exerciseMatches("bench press", "Bench")).toBe(true);
    expect(exerciseMatches("Squat", "Bench Press")).toBe(false);
    expect(exerciseMatches("", "Bench")).toBe(false);
  });

  it("findExerciseMatch prefers an exact normalized hit over containment", () => {
    const items = [{ n: "Bench Press" }, { n: "Bench" }];
    expect(findExerciseMatch("bench", items, (i) => i.n)?.n).toBe("Bench");
    expect(findExerciseMatch("Incline", items, (i) => i.n)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/exercise-match.test.ts`
Expected: FAIL — cannot resolve `@/lib/exercise-match`.

- [ ] **Step 3: Implement `src/lib/exercise-match.ts`**

```ts
export function normalizeExerciseName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function exerciseMatches(a: string, b: string): boolean {
  const x = normalizeExerciseName(a);
  const y = normalizeExerciseName(b);
  if (!x || !y) return false;
  return x === y || x.includes(y) || y.includes(x);
}

export function findExerciseMatch<T>(
  target: string,
  items: T[],
  key: (t: T) => string
): T | undefined {
  const t = normalizeExerciseName(target);
  if (!t) return undefined;
  return (
    items.find((i) => normalizeExerciseName(key(i)) === t) ??
    items.find((i) => exerciseMatches(target, key(i)))
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/exercise-match.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/exercise-match.ts tests/exercise-match.test.ts
git commit -m "feat(lib): pure exercise-name fuzzy match helper"
```

---

## Task 3: `trailing-load` — per-exercise recent top set

**Files:**

- Modify: `src/lib/trailing-load.ts`
- Test: `tests/trailing-load.test.ts`

- [ ] **Step 1: Update the existing test file**

Replace the body of `tests/trailing-load.test.ts` with (the old `toContainEqual` literal must change because `PerExercise` gains fields):

```ts
import { describe, it, expect } from "vitest";
import { computeTrailingLoad, type SetRow } from "@/lib/trailing-load";

const now = new Date("2026-05-14T12:00:00Z");
const rows: SetRow[] = [
  {
    exerciseName: "Bench Press",
    performedAt: new Date("2026-05-13T12:35:00Z"),
    weight: 115,
    reps: 8,
  },
  {
    exerciseName: "Bench Press",
    performedAt: new Date("2026-05-13T12:35:00Z"),
    weight: 135,
    reps: 8,
  },
  {
    exerciseName: "Squat",
    performedAt: new Date("2026-05-13T12:35:00Z"),
    weight: 185,
    reps: 5,
  },
  {
    exerciseName: "Old",
    performedAt: new Date("2026-05-01T12:00:00Z"),
    weight: 100,
    reps: 5,
  },
];

describe("computeTrailingLoad", () => {
  it("aggregates only sets inside the window", () => {
    const r = computeTrailingLoad(rows, now, 72);
    expect(r.windowHours).toBe(72);
    expect(r.setCount).toBe(3);
    expect(r.sessions).toBe(1);
    expect(r.totalVolume).toBe(115 * 8 + 135 * 8 + 185 * 5);
  });

  it("breaks volume down per exercise with the recent top set", () => {
    const r = computeTrailingLoad(rows, now, 72);
    const bench = r.perExercise.find((e) => e.exerciseName === "Bench Press");
    expect(bench).toMatchObject({ volume: 2000, setCount: 2 });
    expect(bench?.topSetWeight).toBe(135);
    expect(bench?.topSetReps).toBe(8);
    expect(bench?.topSetAt.toISOString()).toBe("2026-05-13T12:35:00.000Z");
  });

  it("top set tie-breaks heavier weight, then more reps, then most recent", () => {
    const tie: SetRow[] = [
      {
        exerciseName: "Row",
        performedAt: new Date("2026-05-13T10:00:00Z"),
        weight: 100,
        reps: 5,
      },
      {
        exerciseName: "Row",
        performedAt: new Date("2026-05-13T11:00:00Z"),
        weight: 100,
        reps: 8,
      },
    ];
    const r = computeTrailingLoad(tie, now, 72);
    const row = r.perExercise.find((e) => e.exerciseName === "Row");
    expect(row?.topSetReps).toBe(8);
  });

  it("reports rest days and last session", () => {
    const r = computeTrailingLoad(rows, now, 72);
    expect(r.lastSessionAt?.toISOString()).toBe("2026-05-13T12:35:00.000Z");
    expect(r.restDays).toBe(0);
  });

  it("returns empty summary when no rows in window", () => {
    const r = computeTrailingLoad([], now, 72);
    expect(r.setCount).toBe(0);
    expect(r.sessions).toBe(0);
    expect(r.perExercise).toEqual([]);
    expect(r.lastSessionAt).toBeNull();
    expect(r.restDays).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/trailing-load.test.ts`
Expected: FAIL — `topSetWeight`/`topSetReps`/`topSetAt` undefined on `PerExercise`.

- [ ] **Step 3: Update `src/lib/trailing-load.ts`**

Change `PerExercise` and the accumulation loop. Full file:

```ts
export type SetRow = {
  exerciseName: string;
  performedAt: Date;
  weight: number;
  reps: number;
};
export type PerExercise = {
  exerciseName: string;
  volume: number;
  setCount: number;
  topSetWeight: number;
  topSetReps: number;
  topSetAt: Date;
};
export type TrailingLoad = {
  windowHours: number;
  sessions: number;
  setCount: number;
  totalVolume: number;
  perExercise: PerExercise[];
  lastSessionAt: Date | null;
  restDays: number;
};

// heavier weight wins; tie → more reps; tie → more recent
function isBetterTopSet(c: SetRow, best: PerExercise): boolean {
  if (c.weight !== best.topSetWeight) return c.weight > best.topSetWeight;
  if (c.reps !== best.topSetReps) return c.reps > best.topSetReps;
  return c.performedAt.getTime() > best.topSetAt.getTime();
}

export function computeTrailingLoad(
  rows: SetRow[],
  now: Date,
  windowHours: number
): TrailingLoad {
  const cutoff = now.getTime() - windowHours * 3600_000;
  const inWin = rows.filter(
    (r) =>
      r.performedAt.getTime() >= cutoff &&
      r.performedAt.getTime() <= now.getTime()
  );
  const perMap = new Map<string, PerExercise>();
  let totalVolume = 0;
  for (const r of inWin) {
    const v = r.weight * r.reps;
    totalVolume += v;
    const e = perMap.get(r.exerciseName);
    if (!e) {
      perMap.set(r.exerciseName, {
        exerciseName: r.exerciseName,
        volume: v,
        setCount: 1,
        topSetWeight: r.weight,
        topSetReps: r.reps,
        topSetAt: r.performedAt,
      });
      continue;
    }
    e.volume += v;
    e.setCount += 1;
    if (isBetterTopSet(r, e)) {
      e.topSetWeight = r.weight;
      e.topSetReps = r.reps;
      e.topSetAt = r.performedAt;
    }
  }
  const sessionKeys = new Set(inWin.map((r) => r.performedAt.toISOString()));
  const lastSessionAt = inWin.length
    ? new Date(Math.max(...inWin.map((r) => r.performedAt.getTime())))
    : null;
  const restDays = lastSessionAt
    ? Math.floor((now.getTime() - lastSessionAt.getTime()) / 86_400_000)
    : 0;
  return {
    windowHours,
    sessions: sessionKeys.size,
    setCount: inWin.length,
    totalVolume,
    perExercise: [...perMap.values()],
    lastSessionAt,
    restDays,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/trailing-load.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/trailing-load.ts tests/trailing-load.test.ts
git commit -m "feat(lib): trailing-load tracks per-exercise recent top set"
```

---

## Task 4: `ai-engine` — split output schema + structured prompt

**Files:**

- Modify: `src/lib/ai-engine.ts`
- Test: `tests/ai-engine.test.ts`

- [ ] **Step 1: Rewrite `tests/ai-engine.test.ts`**

```ts
import { describe, it, expect, vi } from "vitest";
import {
  buildPrompt,
  analyzeReadiness,
  ReadinessSchema,
  type AnalyzeInput,
} from "@/lib/ai-engine";

const input: AnalyzeInput = {
  plannedSession: {
    title: "Heavy Lower",
    notes: "deload-ish, knee a bit cranky",
    modality: "strength",
    exercises: [
      { name: "Squat", targetSets: 5, targetReps: 5, targetWeight: 245 },
    ],
  },
  trailingLoad: {
    windowHours: 72,
    sessions: 1,
    setCount: 12,
    totalVolume: 8200,
    perExercise: [
      {
        exerciseName: "Squat",
        volume: 4625,
        setCount: 5,
        topSetWeight: 245,
        topSetReps: 5,
        topSetAt: new Date("2026-05-13T12:35:00Z"),
      },
    ],
    lastSessionAt: new Date("2026-05-13T12:35:00Z"),
    restDays: 1,
  },
};

describe("ai-engine", () => {
  it("buildPrompt is deterministic and includes plan + load + actual facts", () => {
    const a = buildPrompt(input);
    expect(a).toBe(buildPrompt(input));
    expect(a).toContain("Heavy Lower");
    expect(a).toContain("Squat");
    expect(a).toContain("245");
    expect(a).toContain("8200");
    expect(a).toContain("knee a bit cranky");
    expect(a).toContain("todayAdjustments");
    expect(a).toContain("progressionSuggestions");
  });

  it("validates split output and defaults both lists to []", async () => {
    const fake = vi.fn().mockResolvedValue({
      verdict: "reduce_intensity",
      headline: "Ease off today",
      rationale: "High trailing volume with one rest day.",
    });
    const r = await analyzeReadiness(input, { generate: fake });
    expect(r.verdict).toBe("reduce_intensity");
    expect(r.todayAdjustments).toEqual([]);
    expect(r.progressionSuggestions).toEqual([]);
    expect(ReadinessSchema.safeParse(r).success).toBe(true);
  });

  it("parses populated progression suggestions (no status from model)", async () => {
    const fake = vi.fn().mockResolvedValue({
      verdict: "proceed_as_planned",
      headline: "Good to go",
      rationale: "Clean reps at target.",
      todayAdjustments: [{ exercise: "Squat", change: "warm up extra" }],
      progressionSuggestions: [
        {
          exercise: "Squat",
          currentWeight: 245,
          suggestedWeight: 255,
          rationale: "5x5 at 245 clean for two sessions.",
        },
      ],
    });
    const r = await analyzeReadiness(input, { generate: fake });
    expect(r.progressionSuggestions[0].suggestedWeight).toBe(255);
    expect(r.progressionSuggestions[0]).not.toHaveProperty("status");
  });

  it("retries once then throws a friendly error on persistent failure", async () => {
    const bad = vi.fn().mockResolvedValue({ verdict: "nonsense" });
    await expect(analyzeReadiness(input, { generate: bad })).rejects.toThrow(
      /couldn't analyze/i
    );
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/ai-engine.test.ts`
Expected: FAIL — `AnalyzeInput` has no `exercises`/`notes`; schema lacks `todayAdjustments`/`progressionSuggestions`.

- [ ] **Step 3: Rewrite `src/lib/ai-engine.ts`**

```ts
import { z } from "zod";

export const ReadinessSchema = z.object({
  verdict: z.enum([
    "push_harder",
    "proceed_as_planned",
    "reduce_intensity",
    "rest",
  ]),
  headline: z.string().min(1),
  rationale: z.string().min(1),
  todayAdjustments: z
    .array(z.object({ exercise: z.string(), change: z.string() }))
    .default([]),
  progressionSuggestions: z
    .array(
      z.object({
        exercise: z.string(),
        currentWeight: z.number(),
        suggestedWeight: z.number(),
        suggestedSets: z.number().optional(),
        suggestedReps: z.number().optional(),
        rationale: z.string(),
      })
    )
    .default([]),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

export type PlannedExerciseInput = {
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
};

export type AnalyzeInput = {
  plannedSession: {
    title: string;
    notes: string;
    modality: string;
    exercises: PlannedExerciseInput[];
  };
  trailingLoad: {
    windowHours: number;
    sessions: number;
    setCount: number;
    totalVolume: number;
    perExercise: {
      exerciseName: string;
      volume: number;
      setCount: number;
      topSetWeight: number;
      topSetReps: number;
      topSetAt: Date;
    }[];
    lastSessionAt: Date | null;
    restDays: number;
  };
};

export function buildPrompt(i: AnalyzeInput): string {
  const ps = i.plannedSession;
  const planned =
    ps.exercises
      .map(
        (e) => `${e.name}: ${e.targetSets}x${e.targetReps} @ ${e.targetWeight}`
      )
      .join("; ") || "no structured exercises";
  const tl = i.trailingLoad;
  const actual =
    tl.perExercise
      .map(
        (e) =>
          `${e.exerciseName}: recent top set ${e.topSetWeight}x${e.topSetReps}, vol ${e.volume} (${e.setCount} sets)`
      )
      .join("; ") || "none";
  return [
    "You are a strength coach. Auto-regulate today's session using only the data below.",
    `Planned (${ps.modality}) "${ps.title}": ${planned}`,
    `Day notes: ${ps.notes || "none"}`,
    `Trailing ${tl.windowHours}h: ${tl.sessions} session(s), ${tl.setCount} sets, total volume ${tl.totalVolume}, rest days since last ${tl.restDays}.`,
    `Recent actuals: ${actual}`,
    "Match planned exercise names to recent-actual names by similarity (e.g. 'Bench' ~ 'Bench Press'); ignore planned exercises with no actual match.",
    "No RPE is available — judge fatigue from volume, frequency and rest only.",
    "Return TWO separate lists:",
    "- todayAdjustments[]: ephemeral, today-only tweaks given current fatigue (do NOT change the program). Empty unless warranted.",
    "- progressionSuggestions[]: durable target changes going forward, ONLY on clear evidence (clean reps at/above target across recent sessions, or a clear stall). currentWeight = the planned target. Empty unless clearly warranted. Do NOT include a status field.",
  ].join("\n");
}

type GenerateFn = (prompt: string) => Promise<unknown>;
export const MODEL_ID = "claude-sonnet-4-6";

// `ai`/`@ai-sdk/anthropic` imported dynamically so injected-mock tests stay offline.
async function defaultGenerate(prompt: string): Promise<unknown> {
  const { generateObject } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { object } = await generateObject({
    model: anthropic(MODEL_ID),
    schema: ReadinessSchema,
    prompt,
  });
  return object;
}

export async function analyzeReadiness(
  i: AnalyzeInput,
  deps: { generate?: GenerateFn } = {}
): Promise<Readiness> {
  const generate = deps.generate ?? defaultGenerate;
  const prompt = buildPrompt(i);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generate(prompt);
      const parsed = ReadinessSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // fall through to retry / friendly error below
    }
  }
  throw new Error(
    "Sorry, we couldn't analyze your readiness right now. Please try again."
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/ai-engine.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/ai-engine.ts tests/ai-engine.test.ts
git commit -m "feat(ai): split output into today adjustments + progression"
```

---

## Task 5: `plan-store` — structured types, read, replace-on-save

**Files:**

- Modify: `src/lib/plan-store.ts`
- Test: `tests/plan.integration.test.ts`

- [ ] **Step 1: Rewrite `src/lib/plan-store.ts` (structured part; `applyProgressionDecision` added in Task 6)**

```ts
import { db } from "@/db";
import { plannedSession, plannedExercise } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export type PlanExerciseInput = {
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
};
export type PlanDayInput = {
  dayOfWeek: number;
  title: string;
  notes: string;
  modality: string;
  exercises: PlanExerciseInput[];
};
export type PlanDay = {
  dayOfWeek: number;
  title: string;
  notes: string;
  modality: string;
  exercises: PlanExerciseInput[];
};

export async function getPlanForUser(userId: string): Promise<PlanDay[]> {
  const sessions = await db
    .select()
    .from(plannedSession)
    .where(eq(plannedSession.userId, userId));
  const exercises = await db
    .select()
    .from(plannedExercise)
    .where(eq(plannedExercise.userId, userId));
  return sessions.map((s) => ({
    dayOfWeek: s.dayOfWeek,
    title: s.title,
    notes: s.notes,
    modality: s.modality,
    exercises: exercises
      .filter((e) => e.plannedSessionId === s.id)
      .sort((a, b) => a.orderIndex - b.orderIndex)
      .map((e) => ({
        name: e.name,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeight: Number(e.targetWeight),
      })),
  }));
}

export async function upsertPlanDayForUser(userId: string, v: PlanDayInput) {
  const [row] = await db
    .insert(plannedSession)
    .values({
      userId,
      dayOfWeek: v.dayOfWeek,
      title: v.title,
      notes: v.notes,
      modality: v.modality,
    })
    .onConflictDoUpdate({
      target: [plannedSession.userId, plannedSession.dayOfWeek],
      set: { title: v.title, notes: v.notes, modality: v.modality },
    })
    .returning({ id: plannedSession.id });

  // replace-on-save: this day's exercise rows are fully authoritative
  await db
    .delete(plannedExercise)
    .where(
      and(
        eq(plannedExercise.userId, userId),
        eq(plannedExercise.plannedSessionId, row.id)
      )
    );
  if (v.exercises.length > 0) {
    await db.insert(plannedExercise).values(
      v.exercises.map((e, idx) => ({
        plannedSessionId: row.id,
        userId,
        name: e.name,
        targetSets: e.targetSets,
        targetReps: e.targetReps,
        targetWeight: String(e.targetWeight),
        orderIndex: idx,
      }))
    );
  }
}

export async function upsertPlanWeekForUser(
  userId: string,
  days: PlanDayInput[]
) {
  for (const d of days) await upsertPlanDayForUser(userId, d);
}
```

- [ ] **Step 2: Rewrite `tests/plan.integration.test.ts`**

```ts
import { describe, it, expect, afterAll } from "vitest";
import { inArray } from "drizzle-orm";
import { db } from "@/db";
import { plannedSession, plannedExercise } from "@/db/schema";
import {
  getPlanForUser,
  upsertPlanDayForUser,
  upsertPlanWeekForUser,
} from "@/lib/plan-store";

const U = "itest-plan-" + Date.now();
const U2 = "itest-plan-other-" + Date.now();
const W = "itest-planweek-" + Date.now();
const ALL = [U, U2, W];

afterAll(async () => {
  await db.delete(plannedExercise).where(inArray(plannedExercise.userId, ALL));
  await db.delete(plannedSession).where(inArray(plannedSession.userId, ALL));
  const leftover = await db
    .select({ id: plannedSession.id })
    .from(plannedSession)
    .where(inArray(plannedSession.userId, ALL));
  expect(leftover.length).toBe(0);
});

describe("plan-store structured (live Neon)", () => {
  it("A: insert creates a day with ordered exercises", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 3,
      title: "Heavy Lower",
      notes: "knee ok",
      modality: "strength",
      exercises: [
        { name: "Squat", targetSets: 5, targetReps: 5, targetWeight: 245 },
        { name: "RDL", targetSets: 3, targetReps: 8, targetWeight: 185 },
      ],
    });
    const days = await getPlanForUser(U);
    expect(days.length).toBe(1);
    expect(days[0].notes).toBe("knee ok");
    expect(days[0].exercises.map((e) => e.name)).toEqual(["Squat", "RDL"]);
    expect(days[0].exercises[0].targetWeight).toBe(245);
  });

  it("B: re-saving replaces exercises (removed rows gone, no orphans)", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 3,
      title: "Heavy Lower v2",
      notes: "",
      modality: "strength",
      exercises: [
        {
          name: "Front Squat",
          targetSets: 4,
          targetReps: 6,
          targetWeight: 205,
        },
      ],
    });
    const days = await getPlanForUser(U);
    expect(days.length).toBe(1);
    expect(days[0].title).toBe("Heavy Lower v2");
    expect(days[0].exercises.map((e) => e.name)).toEqual(["Front Squat"]);
    const allEx = await db
      .select()
      .from(plannedExercise)
      .where(inArray(plannedExercise.userId, [U]));
    expect(allEx.length).toBe(1);
  });

  it("C: a zero-exercise day is valid (rest day)", async () => {
    await upsertPlanDayForUser(U, {
      dayOfWeek: 0,
      title: "Rest",
      notes: "",
      modality: "rest",
      exercises: [],
    });
    const days = await getPlanForUser(U);
    const sun = days.find((d) => d.dayOfWeek === 0);
    expect(sun?.exercises).toEqual([]);
  });

  it("D: user-scoped, no cross-user bleed", async () => {
    await upsertPlanDayForUser(U2, {
      dayOfWeek: 3,
      title: "U2",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Bench", targetSets: 5, targetReps: 5, targetWeight: 185 },
      ],
    });
    const days = await getPlanForUser(U);
    expect(days.find((d) => d.dayOfWeek === 3)?.title).toBe("Heavy Lower v2");
  });

  it("E: upsertPlanWeekForUser saves 7 days, re-save stays 7", async () => {
    const week = (s: string) =>
      Array.from({ length: 7 }, (_, dow) => ({
        dayOfWeek: dow,
        title: `Day ${dow} ${s}`,
        notes: "",
        modality: dow === 0 ? "rest" : "strength",
        exercises:
          dow === 0
            ? []
            : [
                {
                  name: "Squat",
                  targetSets: 5,
                  targetReps: 5,
                  targetWeight: 200 + dow,
                },
              ],
      }));
    await upsertPlanWeekForUser(W, week("v1"));
    await upsertPlanWeekForUser(W, week("v2"));
    const days = await getPlanForUser(W);
    expect(days.length).toBe(7);
    expect(days.find((d) => d.dayOfWeek === 3)?.title).toBe("Day 3 v2");
    const ex = await db
      .select()
      .from(plannedExercise)
      .where(inArray(plannedExercise.userId, [W]));
    expect(ex.length).toBe(6); // 6 non-rest days, 1 exercise each
  });
});
```

- [ ] **Step 3: Run integration test to verify it fails, then passes**

Run: `npm run test:integration -- tests/plan.integration.test.ts`
Expected: PASS (5 tests) once `src/lib/plan-store.ts` from Step 1 is in place. (If run before Step 1, FAIL on missing `notes`/`exercises`.)

- [ ] **Step 4: Commit**

```bash
git add src/lib/plan-store.ts tests/plan.integration.test.ts
git commit -m "feat(plan): structured plan store with replace-on-save"
```

---

## Task 6: `applyProgressionDecision`

**Files:**

- Modify: `src/lib/plan-store.ts`
- Test: `tests/progression.integration.test.ts`

- [ ] **Step 1: Append `applyProgressionDecision` to `src/lib/plan-store.ts`**

First, **edit the existing schema import line** (do not add a second import from `@/db/schema`) so it reads:

```ts
import {
  plannedSession,
  plannedExercise,
  readinessAnalysis,
} from "@/db/schema";
```

Then add one new import line below the existing imports:

```ts
import { findExerciseMatch } from "@/lib/exercise-match";
```

Then append the function to the end of the file:

```ts
export type ProgressionDecision = "accept" | "dismiss";

export async function applyProgressionDecision(opts: {
  userId: string;
  analysisId: string;
  exercise: string;
  decision: ProgressionDecision;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const [row] = await db
    .select()
    .from(readinessAnalysis)
    .where(
      and(
        eq(readinessAnalysis.id, opts.analysisId),
        eq(readinessAnalysis.userId, opts.userId)
      )
    );
  if (!row) return { ok: false, error: "Analysis not found." };

  const list = row.progressionSuggestions;
  const idx = list.findIndex(
    (s) => s.exercise === opts.exercise && s.status === "pending"
  );
  if (idx === -1)
    return { ok: false, error: "That suggestion is no longer pending." };

  if (opts.decision === "accept") {
    const snap = row.planSnapshot as {
      session?: { id?: string; dayOfWeek?: number };
    };
    const sessionId = snap.session?.id;
    if (!sessionId)
      return { ok: false, error: "Plan snapshot is missing its session." };
    const liveExercises = await db
      .select()
      .from(plannedExercise)
      .where(
        and(
          eq(plannedExercise.userId, opts.userId),
          eq(plannedExercise.plannedSessionId, sessionId)
        )
      );
    const target = findExerciseMatch(
      list[idx].exercise,
      liveExercises,
      (e) => e.name
    );
    if (!target)
      return {
        ok: false,
        error:
          "Couldn't find that exercise in your current plan — it may have changed.",
      };
    await db
      .update(plannedExercise)
      .set({
        targetWeight: String(list[idx].suggestedWeight),
        targetSets: list[idx].suggestedSets ?? target.targetSets,
        targetReps: list[idx].suggestedReps ?? target.targetReps,
      })
      .where(eq(plannedExercise.id, target.id));
  }

  const updated = list.map((s, i) =>
    i === idx
      ? {
          ...s,
          status: (opts.decision === "accept" ? "accepted" : "dismissed") as
            | "accepted"
            | "dismissed",
        }
      : s
  );
  await db
    .update(readinessAnalysis)
    .set({ progressionSuggestions: updated })
    .where(eq(readinessAnalysis.id, opts.analysisId));
  return { ok: true };
}
```

- [ ] **Step 2: Write `tests/progression.integration.test.ts`**

```ts
import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { inArray, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  plannedSession,
  plannedExercise,
  readinessAnalysis,
} from "@/db/schema";
import { applyProgressionDecision, getPlanForUser } from "@/lib/plan-store";

const U = "itest-prog-" + Date.now();
let sessionId = "";
let analysisId = "";

beforeAll(async () => {
  const [s] = await db
    .insert(plannedSession)
    .values({
      userId: U,
      dayOfWeek: 3,
      title: "Lower",
      notes: "",
      modality: "strength",
    })
    .returning({ id: plannedSession.id });
  sessionId = s.id;
  await db.insert(plannedExercise).values({
    plannedSessionId: sessionId,
    userId: U,
    name: "Squat",
    targetSets: 5,
    targetReps: 5,
    targetWeight: "245",
    orderIndex: 0,
  });
  const [a] = await db
    .insert(readinessAnalysis)
    .values({
      userId: U,
      analysisDate: "2026-05-16",
      planSnapshot: { session: { id: sessionId, dayOfWeek: 3 } },
      loadSnapshot: {},
      verdict: "proceed_as_planned",
      headline: "Go",
      rationale: "Clean.",
      todayAdjustments: [],
      progressionSuggestions: [
        {
          exercise: "Squat",
          currentWeight: 245,
          suggestedWeight: 255,
          rationale: "5x5 clean twice.",
          status: "pending",
        },
        {
          exercise: "Bench",
          currentWeight: 185,
          suggestedWeight: 190,
          rationale: "stalled? push.",
          status: "pending",
        },
      ],
      model: "test",
    })
    .returning({ id: readinessAnalysis.id });
  analysisId = a.id;
});

afterAll(async () => {
  await db
    .delete(readinessAnalysis)
    .where(inArray(readinessAnalysis.userId, [U]));
  await db.delete(plannedExercise).where(inArray(plannedExercise.userId, [U]));
  await db.delete(plannedSession).where(inArray(plannedSession.userId, [U]));
});

describe("applyProgressionDecision (live Neon)", () => {
  it("A: accept writes suggestedWeight to the matching planned_exercise", async () => {
    const r = await applyProgressionDecision({
      userId: U,
      analysisId,
      exercise: "Squat",
      decision: "accept",
    });
    expect(r.ok).toBe(true);
    const days = await getPlanForUser(U);
    expect(days[0].exercises[0].targetWeight).toBe(255);
    const [row] = await db
      .select()
      .from(readinessAnalysis)
      .where(eq(readinessAnalysis.id, analysisId));
    expect(
      row.progressionSuggestions.find((s) => s.exercise === "Squat")?.status
    ).toBe("accepted");
  });

  it("B: re-accepting the same suggestion is rejected (not pending)", async () => {
    const r = await applyProgressionDecision({
      userId: U,
      analysisId,
      exercise: "Squat",
      decision: "accept",
    });
    expect(r.ok).toBe(false);
  });

  it("C: dismiss only flips status, no plan write", async () => {
    const r = await applyProgressionDecision({
      userId: U,
      analysisId,
      exercise: "Bench",
      decision: "dismiss",
    });
    expect(r.ok).toBe(true);
    const [row] = await db
      .select()
      .from(readinessAnalysis)
      .where(eq(readinessAnalysis.id, analysisId));
    expect(
      row.progressionSuggestions.find((s) => s.exercise === "Bench")?.status
    ).toBe("dismissed");
  });

  it("D: cross-user analysis id is not found", async () => {
    const r = await applyProgressionDecision({
      userId: "itest-prog-other",
      analysisId,
      exercise: "Squat",
      decision: "dismiss",
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run integration test**

Run: `npm run test:integration -- tests/progression.integration.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/plan-store.ts tests/progression.integration.test.ts
git commit -m "feat(plan): applyProgressionDecision writes back to template"
```

---

## Task 7: `readiness.ts` — structured input, persist split fields

**Files:**

- Modify: `src/lib/readiness.ts`
- Test: `tests/readiness.integration.test.ts`

- [ ] **Step 1: Rewrite `src/lib/readiness.ts` (keep `todayInfo` exactly as-is)**

Replace from `export type AnalyzeOutcome` to end of file:

```ts
export type AnalyzeOutcome = { result?: Readiness; error?: string };

export async function runReadinessAnalysis(opts: {
  userId: string;
  now?: Date;
  generate?: GenerateFn;
}): Promise<AnalyzeOutcome> {
  const now = opts.now ?? new Date();
  const { date, dow } = todayInfo(now);

  const [planned] = await db
    .select()
    .from(plannedSession)
    .where(
      and(
        eq(plannedSession.userId, opts.userId),
        eq(plannedSession.dayOfWeek, dow)
      )
    );
  if (!planned)
    return {
      error: "No planned session for today. Add one on the Plan page first.",
    };

  const plannedExercises = await db
    .select()
    .from(plannedExercise)
    .where(
      and(
        eq(plannedExercise.userId, opts.userId),
        eq(plannedExercise.plannedSessionId, planned.id)
      )
    );
  const exercises = plannedExercises
    .sort((a, b) => a.orderIndex - b.orderIndex)
    .map((e) => ({
      name: e.name,
      targetSets: e.targetSets,
      targetReps: e.targetReps,
      targetWeight: Number(e.targetWeight),
    }));

  const cutoff = new Date(now.getTime() - 72 * 3600_000);
  const rows = await db
    .select({
      exerciseName: workoutSet.exerciseName,
      performedAt: workout.performedAt,
      weight: workoutSet.weight,
      reps: workoutSet.reps,
    })
    .from(workoutSet)
    .innerJoin(workout, eq(workoutSet.workoutId, workout.id))
    .where(
      and(eq(workoutSet.userId, opts.userId), gte(workout.performedAt, cutoff))
    );
  const setRows: SetRow[] = rows.map((r) => ({
    exerciseName: r.exerciseName,
    performedAt: r.performedAt,
    weight: Number(r.weight),
    reps: r.reps,
  }));

  const load = computeTrailingLoad(setRows, now, 72);
  try {
    const result = await analyzeReadiness(
      {
        plannedSession: {
          title: planned.title,
          notes: planned.notes,
          modality: planned.modality,
          exercises,
        },
        trailingLoad: load,
      },
      { generate: opts.generate }
    );
    await db.insert(readinessAnalysis).values({
      userId: opts.userId,
      analysisDate: date,
      planSnapshot: { session: planned, exercises },
      loadSnapshot: load,
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
  } catch (e: any) {
    return { error: e?.message ?? "Analysis failed." };
  }
}
```

Update the imports at the top of `src/lib/readiness.ts` to add `plannedExercise` to the `@/db/schema` import.

- [ ] **Step 2: Update `tests/readiness.integration.test.ts`**

Apply these edits to the existing file:

1. Replace `goodGenerate`:

```ts
const goodGenerate = async () => ({
  verdict: "reduce_intensity",
  headline: "Ease off",
  rationale: "High volume, one rest day.",
  todayAdjustments: [{ exercise: "Squat", change: "stop 1 rep short" }],
  progressionSuggestions: [],
});
```

2. In test B, replace the `plannedSession` insert and add an exercise insert before the workout insert:

```ts
const [ps] = await db
  .insert(plannedSession)
  .values({
    userId: U,
    dayOfWeek: 3,
    title: "Heavy Lower",
    notes: "knee ok",
    modality: "strength",
  })
  .returning({ id: plannedSession.id });
await db.insert(plannedExercise).values({
  plannedSessionId: ps.id,
  userId: U,
  name: "Squat",
  targetSets: 5,
  targetReps: 5,
  targetWeight: "245",
  orderIndex: 0,
});
```

3. In test C, change the `plannedSession` insert to use `notes: "Squat 5x5"` instead of `description: "Squat 5x5"`.
4. Add to test B's assertions after the existing `load.totalVolume` check:

```ts
expect(row.todayAdjustments).toEqual([
  { exercise: "Squat", change: "stop 1 rep short" },
]);
expect(row.progressionSuggestions).toEqual([]);
const snap = row.planSnapshot as { exercises: unknown[] };
expect(snap.exercises.length).toBe(1);
```

5. Add `plannedExercise` to the `@/db/schema` import and add this line to the `afterAll` cleanup before the `plannedSession` delete:

```ts
await db
  .delete(plannedExercise)
  .where(inArray(plannedExercise.userId, ALL_USERS));
```

- [ ] **Step 3: Run integration test**

Run: `npm run test:integration -- tests/readiness.integration.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 4: Commit**

```bash
git add src/lib/readiness.ts tests/readiness.integration.test.ts
git commit -m "feat(readiness): structured input + persist split AI output"
```

---

## Task 8: Server actions — structured plan form + progression action

**Files:**

- Modify: `src/app/actions/plan.ts`

- [ ] **Step 1: Rewrite `src/app/actions/plan.ts`**

```ts
"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  upsertPlanWeekForUser,
  applyProgressionDecision,
  type PlanDayInput,
  type PlanExerciseInput,
} from "@/lib/plan-store";

// Exercise rows are named ex-{day}-{row}-{field}; rowCount-{day} carries the
// number of rows the editor rendered for that day. Non-numeric / blank-name
// rows are dropped (an empty trailing row is not an exercise).
function readExercises(fd: FormData, dow: number): PlanExerciseInput[] {
  const count = Number(fd.get(`rowCount-${dow}`) ?? 0);
  const out: PlanExerciseInput[] = [];
  for (let r = 0; r < count; r++) {
    const name = String(fd.get(`ex-${dow}-${r}-name`) ?? "").trim();
    if (!name) continue;
    out.push({
      name,
      targetSets: Number(fd.get(`ex-${dow}-${r}-sets`) ?? 0),
      targetReps: Number(fd.get(`ex-${dow}-${r}-reps`) ?? 0),
      targetWeight: Number(fd.get(`ex-${dow}-${r}-weight`) ?? 0),
    });
  }
  return out;
}

export async function savePlanWeek(formData: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const days: PlanDayInput[] = [];
  for (let dow = 0; dow < 7; dow++) {
    days.push({
      dayOfWeek: dow,
      title: String(formData.get(`title-${dow}`) ?? ""),
      notes: String(formData.get(`notes-${dow}`) ?? ""),
      modality: String(formData.get(`modality-${dow}`) ?? "strength"),
      exercises: readExercises(formData, dow),
    });
  }
  await upsertPlanWeekForUser(session.user.id, days);
  revalidatePath("/plan");
  revalidatePath("/");
}

export async function applyProgression(input: {
  analysisId: string;
  exercise: string;
  decision: "accept" | "dismiss";
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false as const, error: "Not authenticated." };
  const r = await applyProgressionDecision({
    userId: session.user.id,
    ...input,
  });
  if (r.ok) revalidatePath("/");
  return r;
}
```

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: PASS for `src/app/actions/plan.ts` (errors may remain only in `plan-editor.tsx`/`page.tsx`/`analyze-button.tsx`, fixed in Tasks 9–10).

- [ ] **Step 3: Commit**

```bash
git add src/app/actions/plan.ts
git commit -m "feat(actions): structured plan form parse + progression action"
```

---

## Task 9: Plan editor rewrite (controlled, structured)

**Files:**

- Rewrite: `src/app/plan/plan-editor.tsx`
- Modify: `src/app/plan/page.tsx`

- [ ] **Step 1: Rewrite `src/app/plan/plan-editor.tsx`**

Every field is controlled (value+onChange) — React 19 calls native `form.reset()` after a server-action submit, so uncontrolled fields revert (CLAUDE.md gotcha). A hidden `rowCount-{dow}` input tells the action how many rows to read.

```tsx
"use client";
import { useState } from "react";
import { savePlanWeek } from "@/app/actions/plan";
import { Plus, X } from "lucide-react";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

type Ex = {
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
};
type Day = { title: string; notes: string; modality: string; exercises: Ex[] };

const emptyEx = (): Ex => ({
  name: "",
  targetSets: 3,
  targetReps: 5,
  targetWeight: 0,
});

export function PlanEditor({ initial }: { initial: Day[] }) {
  const [days, setDays] = useState<Day[]>(initial);

  const setDay = (i: number, patch: Partial<Day>) =>
    setDays((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const setEx = (di: number, ei: number, patch: Partial<Ex>) =>
    setDays((d) =>
      d.map((x, idx) =>
        idx === di
          ? {
              ...x,
              exercises: x.exercises.map((e, j) =>
                j === ei ? { ...e, ...patch } : e
              ),
            }
          : x
      )
    );
  const addEx = (di: number) =>
    setDays((d) =>
      d.map((x, idx) =>
        idx === di ? { ...x, exercises: [...x.exercises, emptyEx()] } : x
      )
    );
  const removeEx = (di: number, ei: number) =>
    setDays((d) =>
      d.map((x, idx) =>
        idx === di
          ? { ...x, exercises: x.exercises.filter((_, j) => j !== ei) }
          : x
      )
    );

  return (
    <form action={savePlanWeek}>
      {DAYS.map((name, dow) => (
        <section key={dow} className="ds-panel p-4 my-3">
          <h2 className="h4">{name.toLowerCase()}</h2>
          <input
            type="hidden"
            name={`rowCount-${dow}`}
            value={days[dow].exercises.length}
          />
          <input
            className="border rounded p-2 w-full my-1"
            name={`title-${dow}`}
            placeholder="Title (e.g. heavy lower)"
            value={days[dow].title}
            onChange={(e) => setDay(dow, { title: e.target.value })}
          />
          <select
            className="border rounded p-2 my-1"
            name={`modality-${dow}`}
            value={days[dow].modality}
            onChange={(e) => setDay(dow, { modality: e.target.value })}
          >
            <option value="strength">strength</option>
            <option value="endurance">endurance</option>
            <option value="rest">rest</option>
          </select>

          {days[dow].exercises.map((ex, ei) => (
            <div key={ei} className="flex gap-2 my-1 items-center">
              <input
                className="border rounded p-2 flex-1"
                name={`ex-${dow}-${ei}-name`}
                placeholder="exercise"
                value={ex.name}
                onChange={(e) => setEx(dow, ei, { name: e.target.value })}
              />
              <input
                className="border rounded p-2 w-16"
                type="number"
                aria-label="sets"
                name={`ex-${dow}-${ei}-sets`}
                value={ex.targetSets}
                onChange={(e) =>
                  setEx(dow, ei, { targetSets: Number(e.target.value) })
                }
              />
              <input
                className="border rounded p-2 w-16"
                type="number"
                aria-label="reps"
                name={`ex-${dow}-${ei}-reps`}
                value={ex.targetReps}
                onChange={(e) =>
                  setEx(dow, ei, { targetReps: Number(e.target.value) })
                }
              />
              <input
                className="border rounded p-2 w-20"
                type="number"
                aria-label="weight"
                name={`ex-${dow}-${ei}-weight`}
                value={ex.targetWeight}
                onChange={(e) =>
                  setEx(dow, ei, { targetWeight: Number(e.target.value) })
                }
              />
              <button
                type="button"
                className="ds-btn ds-btn-ghost"
                aria-label="remove exercise"
                onClick={() => removeEx(dow, ei)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          <textarea
            className="border rounded p-2 w-full my-1"
            name={`notes-${dow}`}
            placeholder="notes the coach should read (e.g. deload, knee cranky)"
            value={days[dow].notes}
            onChange={(e) => setDay(dow, { notes: e.target.value })}
          />
          <button
            type="button"
            className="ds-btn ds-btn-secondary"
            onClick={() => addEx(dow)}
          >
            <Plus size={16} aria-hidden="true" /> add exercise
          </button>
        </section>
      ))}
      <button className="ds-btn ds-btn-primary" type="submit">
        Save plan
      </button>
    </form>
  );
}
```

- [ ] **Step 2: Update `src/app/plan/page.tsx`**

```tsx
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPlanForUser } from "@/lib/plan-store";
import { PlanEditor } from "./plan-editor";

export default async function PlanPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const plan = await getPlanForUser(session.user.id);
  const byDay = new Map(plan.map((p) => [p.dayOfWeek, p]));
  const initial = Array.from({ length: 7 }, (_, dow) => {
    const p = byDay.get(dow);
    return {
      title: p?.title ?? "",
      notes: p?.notes ?? "",
      modality: p?.modality ?? "strength",
      exercises: p?.exercises ?? [],
    };
  });
  return (
    <main className="ds-container p-8">
      <h1 className="h2">weekly plan</h1>
      <PlanEditor initial={initial} />
    </main>
  );
}
```

- [ ] **Step 3: Verify build + type-check**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. Manually: `npm run dev`, open `/plan`, add two exercises to a day, Save — confirm fields do NOT reset to blank (controlled-input check) and reload shows the saved exercises.

- [ ] **Step 4: Commit**

```bash
git add src/app/plan/plan-editor.tsx src/app/plan/page.tsx
git commit -m "feat(plan): controlled structured plan editor"
```

---

## Task 10: Dashboard rebuild (Layout A) + design-system conformance

**Files:**

- Create: `src/app/dashboard/verdict-banner.tsx`, `today-session.tsx`, `recent-activity.tsx`, `progression-inbox.tsx`
- Rewrite: `src/app/page.tsx`
- Delete: `src/app/analyze-button.tsx` (folded into `today-session.tsx`)

- [ ] **Step 1: Create `src/app/dashboard/verdict-banner.tsx`**

Verdict is never color-only: sentence-case word + lucide icon + palette accent token (spec §7).

```tsx
import { ArrowUp, ArrowDown, Check, Pause } from "lucide-react";

const MAP: Record<
  string,
  { label: string; Icon: typeof Check; token: string }
> = {
  proceed_as_planned: {
    label: "proceed as planned",
    Icon: Check,
    token: "--ds-accent-teal",
  },
  push_harder: { label: "push harder", Icon: ArrowUp, token: "--ds-primary" },
  reduce_intensity: {
    label: "reduce intensity",
    Icon: ArrowDown,
    token: "--ds-accent-ochre",
  },
  rest: { label: "rest", Icon: Pause, token: "--ds-accent-ochre" },
};

export function VerdictBanner({
  verdict,
  headline,
  rationale,
}: {
  verdict: string;
  headline: string;
  rationale: string;
}) {
  const v = MAP[verdict] ?? MAP.proceed_as_planned;
  return (
    <div
      className="ds-panel p-4 my-3"
      style={{ borderInlineStart: `4px solid var(${v.token})` }}
    >
      <p
        className="ds-mono-note"
        style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
      >
        <v.Icon size={16} aria-hidden="true" />
        {v.label}
      </p>
      <strong>{headline}</strong>
      <p>{rationale}</p>
    </div>
  );
}
```

> If `--ds-accent-teal`/`--ds-accent-ochre` are not the exact token names in `node_modules/@dustin-riley/design/tokens.css`, substitute the real accent token names found there (do not invent colors or hard-code hex — spec §7). Verify with: `grep -o '\-\-ds-accent[a-z-]*' node_modules/@dustin-riley/design/tokens.css | sort -u`.

- [ ] **Step 2: Create `src/app/dashboard/today-session.tsx`**

Client component: holds the analyze button + renders targets with inline today-adjustments and recent actuals.

```tsx
"use client";
import { useState } from "react";
import { analyzeToday } from "@/app/actions/analyze";
import { VerdictBanner } from "./verdict-banner";

type Ex = {
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
};
type Actual = {
  exerciseName: string;
  topSetWeight: number;
  topSetReps: number;
};

export function TodaySession({
  title,
  modality,
  notes,
  exercises,
  actuals,
}: {
  title: string;
  modality: string;
  notes: string;
  exercises: Ex[];
  actuals: Actual[];
}) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Awaited<
    ReturnType<typeof analyzeToday>
  > | null>(null);

  const adjFor = (name: string) =>
    out?.result?.todayAdjustments.find((a) => a.exercise === name)?.change;
  const actualFor = (name: string) =>
    actuals.find((a) => a.exerciseName === name);

  return (
    <section className="ds-panel p-4 my-3">
      <h2 className="h4">today · {title || modality}</h2>
      {exercises.length === 0 ? (
        <p className="ds-mono-note">
          no exercises planned.{" "}
          <a href="/plan" style={{ color: "var(--ds-link)" }}>
            build your plan
          </a>
          .
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {exercises.map((e) => {
            const a = actualFor(e.name);
            const adj = adjFor(e.name);
            return (
              <li key={e.name} className="my-2">
                <strong>{e.name}</strong> — {e.targetSets}×{e.targetReps} @{" "}
                {e.targetWeight}
                {a && (
                  <span className="ds-mono-note">
                    {" "}
                    · recent: {a.topSetWeight}×{a.topSetReps}
                  </span>
                )}
                {adj && (
                  <div
                    className="ds-mono-note"
                    style={{ color: "var(--ds-accent-ochre)" }}
                  >
                    today: {adj}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notes && <p className="ds-mono-note">notes: {notes}</p>}
      <button
        className="ds-btn ds-btn-primary mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setOut(await analyzeToday());
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "analyzing…" : "analyze readiness"}
      </button>
      {out?.error && <p style={{ color: "var(--ds-error)" }}>{out.error}</p>}
      {out?.result && (
        <VerdictBanner
          verdict={out.result.verdict}
          headline={out.result.headline}
          rationale={out.result.rationale}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 3: Create `src/app/dashboard/recent-activity.tsx`**

```tsx
"use client";
import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";

type WorkoutView = {
  id: string;
  performedAt: string;
  title: string;
  sets: { exerciseName: string; weight: number; reps: number }[];
};

export function RecentActivity({ workouts }: { workouts: WorkoutView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  if (workouts.length === 0)
    return (
      <p className="ds-mono-note">
        no workouts yet.{" "}
        <a href="/import" style={{ color: "var(--ds-link)" }}>
          import your Strong CSV
        </a>
        .
      </p>
    );
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {workouts.map((w) => {
        const isOpen = open === w.id;
        return (
          <li key={w.id} className="ds-panel p-3 my-2">
            <button
              className="ds-btn ds-btn-ghost"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : w.id)}
            >
              {isOpen ? (
                <ChevronDown size={16} aria-hidden="true" />
              ) : (
                <ChevronRight size={16} aria-hidden="true" />
              )}{" "}
              {w.performedAt} — {w.title}
            </button>
            {isOpen && (
              <ul className="ds-mono-note" style={{ marginTop: "0.5rem" }}>
                {w.sets.map((s, i) => (
                  <li key={i}>
                    {s.exerciseName}: {s.weight} × {s.reps}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: Create `src/app/dashboard/progression-inbox.tsx`**

```tsx
"use client";
import { useState } from "react";
import { applyProgression } from "@/app/actions/plan";

type Suggestion = {
  exercise: string;
  currentWeight: number;
  suggestedWeight: number;
  suggestedSets?: number;
  suggestedReps?: number;
  rationale: string;
};

export function ProgressionInbox({
  analysisId,
  suggestions,
}: {
  analysisId: string;
  suggestions: Suggestion[];
}) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const pending = suggestions.filter((s) => !done[s.exercise]);
  if (pending.length === 0) return null;

  const act = async (s: Suggestion, decision: "accept" | "dismiss") => {
    setBusy(s.exercise);
    setErr(null);
    try {
      const r = await applyProgression({
        analysisId,
        exercise: s.exercise,
        decision,
      });
      if (r.ok) setDone((d) => ({ ...d, [s.exercise]: decision }));
      else setErr(r.error);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="my-6">
      <h2 className="h4">progression</h2>
      {err && <p style={{ color: "var(--ds-error)" }}>{err}</p>}
      {pending.map((s) => (
        <div key={s.exercise} className="ds-panel p-3 my-2">
          <strong>{s.exercise}</strong>: {s.currentWeight} → {s.suggestedWeight}
          {s.suggestedSets || s.suggestedReps ? (
            <span className="ds-mono-note">
              {" "}
              ({s.suggestedSets ?? "—"}×{s.suggestedReps ?? "—"})
            </span>
          ) : null}
          <p className="ds-mono-note">{s.rationale}</p>
          <button
            className="ds-btn ds-btn-primary"
            disabled={busy === s.exercise}
            onClick={() => act(s, "accept")}
          >
            accept
          </button>{" "}
          <button
            className="ds-btn ds-btn-ghost"
            disabled={busy === s.exercise}
            onClick={() => act(s, "dismiss")}
          >
            dismiss
          </button>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 5: Rewrite `src/app/page.tsx`**

```tsx
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { workout, workoutSet, readinessAnalysis } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { todayInfo } from "@/lib/readiness";
import { getPlanForUser } from "@/lib/plan-store";
import { computeTrailingLoad, type SetRow } from "@/lib/trailing-load";
import { TodaySession } from "./dashboard/today-session";
import { RecentActivity } from "./dashboard/recent-activity";
import { ProgressionInbox } from "./dashboard/progression-inbox";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const userId = session.user.id;
  const now = new Date();
  const { dow } = todayInfo(now);

  const plan = await getPlanForUser(userId);
  const today = plan.find((p) => p.dayOfWeek === dow);

  const recentWorkouts = await db
    .select()
    .from(workout)
    .where(eq(workout.userId, userId))
    .orderBy(desc(workout.performedAt))
    .limit(10);
  const wIds = recentWorkouts.map((w) => w.id);
  const sets = wIds.length
    ? await db
        .select()
        .from(workoutSet)
        .where(inArray(workoutSet.workoutId, wIds))
    : [];

  const cutoff = new Date(now.getTime() - 72 * 3600_000);
  const trailingRows: SetRow[] = sets
    .map((s) => {
      const w = recentWorkouts.find((x) => x.id === s.workoutId)!;
      return {
        exerciseName: s.exerciseName,
        performedAt: w.performedAt,
        weight: Number(s.weight),
        reps: s.reps,
      };
    })
    .filter((r) => r.performedAt >= cutoff);
  const load = computeTrailingLoad(trailingRows, now, 72);

  const [latest] = await db
    .select()
    .from(readinessAnalysis)
    .where(eq(readinessAnalysis.userId, userId))
    .orderBy(desc(readinessAnalysis.createdAt))
    .limit(1);
  const pastAnalyses = await db
    .select()
    .from(readinessAnalysis)
    .where(eq(readinessAnalysis.userId, userId))
    .orderBy(desc(readinessAnalysis.createdAt))
    .limit(6);

  const workoutViews = recentWorkouts.map((w) => ({
    id: w.id,
    performedAt: w.performedAt.toDateString(),
    title: w.title,
    sets: sets
      .filter((s) => s.workoutId === w.id)
      .map((s) => ({
        exerciseName: s.exerciseName,
        weight: Number(s.weight),
        reps: s.reps,
      })),
  }));

  return (
    <main className="ds-container p-8">
      <h1 className="h2">today</h1>
      {today ? (
        <TodaySession
          title={today.title}
          modality={today.modality}
          notes={today.notes}
          exercises={today.exercises}
          actuals={load.perExercise.map((e) => ({
            exerciseName: e.exerciseName,
            topSetWeight: e.topSetWeight,
            topSetReps: e.topSetReps,
          }))}
        />
      ) : (
        <section className="ds-panel p-4 my-3">
          <p className="ds-mono-note">
            no plan for today.{" "}
            <a href="/plan" style={{ color: "var(--ds-link)" }}>
              build your plan
            </a>
            .
          </p>
        </section>
      )}

      {latest &&
        latest.progressionSuggestions.some((s) => s.status === "pending") && (
          <ProgressionInbox
            analysisId={latest.id}
            suggestions={latest.progressionSuggestions
              .filter((s) => s.status === "pending")
              .map((s) => ({
                exercise: s.exercise,
                currentWeight: s.currentWeight,
                suggestedWeight: s.suggestedWeight,
                suggestedSets: s.suggestedSets,
                suggestedReps: s.suggestedReps,
                rationale: s.rationale,
              }))}
          />
        )}

      <section className="my-6">
        <h2 className="h4">recent activity</h2>
        <RecentActivity workouts={workoutViews} />
      </section>

      <section className="my-6">
        <h2 className="h4">past readiness checks</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {pastAnalyses.map((a) => (
            <li key={a.id} className="ds-panel p-3 my-2">
              <span className="ds-mono-note">
                {a.analysisDate} · {a.verdict.replace(/_/g, " ")}
              </span>{" "}
              <strong>{a.headline}</strong>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 6: Delete the obsolete component**

```bash
git rm src/app/analyze-button.tsx
```

- [ ] **Step 7: Verify build, types, lint, format**

Run: `npx tsc --noEmit && npm run lint && npm run format:check && npm run build`
Expected: all PASS. If `format:check` fails, run `npm run format` and re-stage. Manually (`npm run dev`, `/`): with a plan for today the hero shows targets; click "analyze readiness" → verdict banner (word + icon + accent border, readable without color); recent activity rows expand to weights×reps; if the model returned a progression suggestion, the inbox accept writes the new target (verify on `/plan`).

- [ ] **Step 8: Commit**

```bash
git add src/app/page.tsx src/app/dashboard
git commit -m "feat(dashboard): Layout A — targets, actuals, progression inbox"
```

---

## Task 11: Docs + full green gate

**Files:**

- Modify: `CLAUDE.md`

- [ ] **Step 1: Update `CLAUDE.md`**

In the "Non-obvious gotchas" → plan-editor bullet, replace the sentence naming the field convention so it reads:

> Don't convert plan/auth form fields back to uncontrolled `defaultValue`, and don't rename the field names the bulk `savePlanWeek` action reads: `title-/notes-/modality-{0..6}`, the per-day `rowCount-{dow}`, and exercise rows `ex-{dow}-{row}-{name|sets|reps|weight}`.

In the "Analyze Readiness flow" paragraph, replace "leave `modifications` empty" framing with: the AI now returns `todayAdjustments[]` (ephemeral) and `progressionSuggestions[]` (durable; accepted via `applyProgressionDecision` which writes back to `planned_exercise`). In the Strong-import / data-model area add: the plan is structured (`planned_session` + `planned_exercise`); `planned_session.description` was renamed `notes`.

- [ ] **Step 2: Full offline gate**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run format:check && npm run build`
Expected: all PASS (unit suites: exercise-match, trailing-load, ai-engine, strong-parser, trusted-origins).

- [ ] **Step 3: Full integration gate**

Run: `npm run test:integration`
Expected: PASS — plan, progression, readiness, import integration suites all green; `itest-*` users self-cleaned (each suite's `afterAll` asserts zero leftover rows).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: CLAUDE.md — structured plan, split AI output, field scheme"
```

---

## Self-Review Notes

- **Spec coverage:** §3 data model → Task 1; §4 AI I/O → Tasks 3,4,7; §5 plan editor + `applyProgressionDecision` → Tasks 5,6,8,9; §6 dashboard Layout A → Task 10; §7 design-system conformance → Task 10 (verdict word+icon+accent, `--ds-link`, primitives, sentence case) + Task 9 (lucide icons, sentence case); §8 error/empty → Tasks 6 (unmatched accept), 10 (empty states); §9 testing → every task is TDD with the gate in Task 11; §3 migration → Task 1 Step 2–5; supersede note → Task 11 Step 1.
- **Type consistency:** `PlanDayInput`/`PlanExerciseInput`/`PlanDay` (plan-store) used identically in actions/editor/page; `AnalyzeInput` (ai-engine) matches what `readiness.ts` constructs; `progressionSuggestions` element shape identical across schema, ai-engine output (minus `status`), readiness persist (`status:'pending'` stamped), `applyProgressionDecision`, and the inbox prop.
- **Open items resolved:** the spec's similarity-rule open item is fixed by the single shared `exercise-match` helper (Task 2) used by both `buildPrompt` (prose instruction) and `applyProgressionDecision` (Task 6); the column-rename mechanism is fixed as the explicit SQL script (Task 1) rather than interactive drizzle-kit.
