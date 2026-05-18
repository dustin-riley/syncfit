# AI Plan Generation & Plan Goal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a durable free-text plan goal that contextualizes the daily readiness verdict, and a conversational AI plan builder (chat drawer) that proposes a full weekly plan into the existing editor for review and save.

**Architecture:** A new `plan_profile` per-user table holds the goal. A pure `plan-generator` lib (mirroring `ai-engine.ts`: dynamic `ai` import, injected `generate` for offline tests, one-retry) drives a per-turn `generateObject` chat contract. Thin server actions load context (current plan + recent training) and delegate. The plan page becomes a shared-state client shell rendering the goal field, the existing controlled editor, and an on-demand chat drawer; nothing persists until the existing Save path runs.

**Tech Stack:** Next.js 16 App Router, TypeScript, Drizzle (Neon), Vercel AI SDK + `@ai-sdk/anthropic`, Zod, Vitest.

Spec: `docs/superpowers/specs/2026-05-17-ai-plan-generation-design.md`

---

## File Structure

- Create `src/lib/plan-generator.ts` — pure AI plan-builder: `PlanTurnSchema`, `WeeklyPlanSchema`, `buildPlanSystem`, `proposePlanTurn`.
- Create `tests/plan-generator.test.ts` — offline unit tests (injected `generate`).
- Modify `src/db/schema.ts` — add `planProfile` table.
- Modify `src/lib/plan-store.ts` — add `getPlanProfile` / `upsertPlanProfile`.
- Modify `src/lib/ai-engine.ts` — add `goal` to `AnalyzeInput`; one prompt line.
- Modify `src/lib/readiness.ts` — load + thread the goal.
- Modify `src/app/actions/plan.ts` — `savePlanWeek` reads `goal`; new `proposePlanTurnAction`.
- Modify `src/app/(app)/plan/plan-editor.tsx` — controlled-by-parent (lift state).
- Create `src/app/(app)/plan/plan-workspace.tsx` — shared-state shell (goal + editor + drawer trigger).
- Create `src/app/(app)/plan/plan-chat-drawer.tsx` — ephemeral chat drawer.
- Modify `src/app/(app)/plan/page.tsx` — load goal, render workspace.
- Modify `tests/ai-engine.test.ts` — assert goal line in/out.
- Modify `tests/plan.integration.test.ts` — `plan_profile` round-trip.
- Modify `tests/readiness.integration.test.ts` — goal threaded into prompt.

---

### Task 1: `plan_profile` schema

**Files:**
- Modify: `src/db/schema.ts`

- [ ] **Step 1: Add the table**

In `src/db/schema.ts`, after the `plannedExercise` table (before `readinessAnalysis`), add:

```ts
export const planProfile = pgTable("plan_profile", {
  userId: text("user_id").primaryKey(),
  goal: text("goal").notNull().default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .defaultNow()
    .notNull(),
});
```

- [ ] **Step 2: Apply to live Neon**

Run: `node --env-file=.env.local ./node_modules/.bin/drizzle-kit push`
Expected: prompt-free apply; output ends with `Changes applied`. The new table is `plan_profile`.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/db/schema.ts
git commit -m "feat(plan-ai): add plan_profile table for durable plan goal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: plan-store goal accessors

**Files:**
- Modify: `src/lib/plan-store.ts`
- Test: `tests/plan.integration.test.ts`

- [ ] **Step 1: Write the failing integration test**

In `tests/plan.integration.test.ts`, add `planProfile` to imports from `@/db/schema` and to the `afterAll` cleanup, then append a test inside the `describe`:

```ts
it("F: plan_profile goal upserts and round-trips", async () => {
  expect(await getPlanProfile(U)).toBe("");
  await upsertPlanProfile(U, "lose fat, keep strength");
  expect(await getPlanProfile(U)).toBe("lose fat, keep strength");
  await upsertPlanProfile(U, "lean bulk");
  expect(await getPlanProfile(U)).toBe("lean bulk");
});
```

Add to the top-of-file imports:

```ts
import { getPlanProfile, upsertPlanProfile } from "@/lib/plan-store";
```

Add `planProfile` to the schema import and extend `afterAll`:

```ts
await db.delete(planProfile).where(inArray(planProfile.userId, ALL));
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- -t "plan_profile goal upserts"`
Expected: FAIL — `getPlanProfile is not a function` (not yet exported).

- [ ] **Step 3: Implement the accessors**

In `src/lib/plan-store.ts`, add `planProfile` to the `@/db/schema` import, then append:

```ts
export async function getPlanProfile(userId: string): Promise<string> {
  const [row] = await db
    .select({ goal: planProfile.goal })
    .from(planProfile)
    .where(eq(planProfile.userId, userId));
  return row?.goal ?? "";
}

// Single-statement upsert on `db` (NOT txDb). Consistent with plan-store's
// deliberately non-transactional, single-user-blast-radius design.
export async function upsertPlanProfile(
  userId: string,
  goal: string
): Promise<void> {
  await db
    .insert(planProfile)
    .values({ userId, goal })
    .onConflictDoUpdate({
      target: planProfile.userId,
      set: { goal, updatedAt: new Date() },
    });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:integration -- -t "plan_profile goal upserts"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-store.ts tests/plan.integration.test.ts
git commit -m "feat(plan-ai): plan-store goal get/upsert accessors

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: Thread the goal into the readiness prompt

**Files:**
- Modify: `src/lib/ai-engine.ts:40-93`
- Test: `tests/ai-engine.test.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/ai-engine.test.ts`, add two tests inside the `describe("ai-engine")` block:

```ts
it("buildPrompt includes the goal line when goal is set", () => {
  const p = buildPrompt({ ...input, goal: "lean bulk, add size" });
  expect(p).toContain("User's stated goal: lean bulk, add size");
});

it("buildPrompt omits the goal line when goal is empty", () => {
  const p = buildPrompt({ ...input, goal: "" });
  expect(p).not.toContain("User's stated goal:");
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/ai-engine.test.ts -t "goal line"`
Expected: FAIL — `goal` is not assignable to `AnalyzeInput` (type error) / line absent.

- [ ] **Step 3: Add `goal` to the type and prompt**

In `src/lib/ai-engine.ts`, add `goal` to `AnalyzeInput`:

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
};
```

In `buildPrompt`, immediately before the final `return [` array, add:

```ts
const goalLine = i.goal.trim()
  ? `User's stated goal: ${i.goal.trim()}`
  : null;
```

Then inside the returned array, insert `goalLine` right after the
`"You are a strength coach..."` line and filter nulls before `.join`:

```ts
return [
  "You are a strength coach. Auto-regulate today's session using only the data below.",
  goalLine,
  `Planned (${ps.modality}) "${ps.title}": ${planned}`,
  `Day notes: ${ps.notes || "none"}`,
  `Recent strength (last ${rt.windowDays}d): ${strength}`,
  `Recent endurance (last ${rt.windowDays}d): ${endurance}`,
  "Match planned exercise names to recent-actual names by similarity (e.g. 'Bench' ~ 'Bench Press'); ignore planned exercises with no actual match.",
  "Endurance fatigue (runs/rides/swims) is real systemic load — weigh it when judging readiness for lower-body or heavy sessions.",
  "No RPE is available — judge fatigue from recent sets, frequency, endurance volume and rest only.",
  "Interpret readiness and progression through the user's stated goal when present (e.g. a fat-loss cut tolerates less added volume than a bulk).",
  "Return TWO separate lists:",
  "- todayAdjustments[]: ephemeral, today-only tweaks given current fatigue (do NOT change the program). Empty unless warranted.",
  "- progressionSuggestions[]: durable target changes going forward, ONLY on clear evidence (clean reps at/above target across recent sessions, or a clear stall). currentWeight = the planned target. Empty unless clearly warranted. Do NOT include a status field.",
].filter(Boolean).join("\n");
```

- [ ] **Step 4: Fix the existing fixture**

In `tests/ai-engine.test.ts`, the shared `const input: AnalyzeInput` now needs `goal`. Add `goal: "",` as the first property of that object literal.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/ai-engine.test.ts`
Expected: PASS (all, including the two new ones).

- [ ] **Step 6: Commit**

```bash
git add src/lib/ai-engine.ts tests/ai-engine.test.ts
git commit -m "feat(plan-ai): thread plan goal into readiness prompt

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: readiness.ts loads + passes the goal

**Files:**
- Modify: `src/lib/readiness.ts:97-172`
- Test: `tests/readiness.integration.test.ts`

- [ ] **Step 1: Write the failing test (self-contained — no reliance on unseen helpers)**

In `tests/readiness.integration.test.ts`, add to the top-of-file imports:

```ts
import { plannedSession, planProfile } from "@/db/schema";
import { upsertPlanProfile } from "@/lib/plan-store";
import { runReadinessAnalysis, todayInfo } from "@/lib/readiness";
```

(If any of these are already imported in the file, merge — do not duplicate.)
Add a dedicated user constant near the other `itest-*` constants:

```ts
const GOAL_USER = "itest-rgoal-" + Date.now();
const GOAL_NOW = new Date("2026-05-18T15:00:00Z"); // a Monday in APP_TZ
```

Extend the file's `afterAll` cleanup to also delete this user's rows
(use whatever `db`/`inArray` the file already imports):

```ts
await db.delete(planProfile).where(inArray(planProfile.userId, [GOAL_USER]));
await db
  .delete(plannedSession)
  .where(inArray(plannedSession.userId, [GOAL_USER]));
```

Add the self-contained test inside the `describe`:

```ts
it("threads the user's plan goal into the AI prompt", async () => {
  const { dow } = todayInfo(GOAL_NOW);
  await db
    .delete(plannedSession)
    .where(inArray(plannedSession.userId, [GOAL_USER]));
  await db.insert(plannedSession).values({
    userId: GOAL_USER,
    dayOfWeek: dow,
    title: "Lower",
    notes: "",
    modality: "strength",
  });
  await upsertPlanProfile(GOAL_USER, "cutting for summer");

  let seenPrompt = "";
  const res = await runReadinessAnalysis({
    userId: GOAL_USER,
    now: GOAL_NOW,
    generate: async (p: string) => {
      seenPrompt = p;
      return { verdict: "proceed_as_planned", headline: "ok", rationale: "ok" };
    },
  });
  expect(res.result).toBeDefined();
  expect(seenPrompt).toContain("User's stated goal: cutting for summer");
});
```

`todayInfo` is already exported from `src/lib/readiness.ts` (used internally
there); it maps a `Date` to `{ date, dow }` in `APP_TZ`.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test:integration -- -t "threads the user's plan goal"`
Expected: FAIL — prompt does not contain the goal line (readiness doesn't load it yet).

- [ ] **Step 3: Load the goal in `runReadinessAnalysis`**

In `src/lib/readiness.ts`, add to the `@/lib/plan-store` import (create the import if absent):

```ts
import { getPlanProfile } from "@/lib/plan-store";
```

In `runReadinessAnalysis`, after `recentTraining` is computed and before the
`analyzeReadiness` call, add:

```ts
const goal = await getPlanProfile(opts.userId);
```

Pass it into `analyzeReadiness` and the persisted snapshot:

```ts
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
  },
  { generate: opts.generate }
);
await db.insert(readinessAnalysis).values({
  userId: opts.userId,
  analysisDate: date,
  planSnapshot: { session: planned, exercises, goal },
  // ...rest unchanged
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm run test:integration -- -t "threads the user's plan goal"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/readiness.ts tests/readiness.integration.test.ts
git commit -m "feat(plan-ai): readiness loads plan goal and snapshots it

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 5: `plan-generator` library

**Files:**
- Create: `src/lib/plan-generator.ts`
- Test: `tests/plan-generator.test.ts`

- [ ] **Step 1: Write the failing unit tests**

Create `tests/plan-generator.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";
import {
  buildPlanSystem,
  proposePlanTurn,
  PlanTurnSchema,
  type PlanContext,
} from "@/lib/plan-generator";

const ctx: PlanContext = {
  goal: "lean bulk",
  currentPlan: [
    {
      dayOfWeek: 1,
      title: "Lower",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Squat", targetSets: 5, targetReps: 5, targetWeight: 245 },
      ],
    },
  ],
  recentTraining: {
    windowDays: 7,
    strengthSessions: [
      {
        workoutId: "w1",
        performedAt: new Date("2026-05-13T12:00:00Z"),
        title: "Lower A",
        sets: [{ exerciseName: "Squat", weight: 245, reps: 5 }],
      },
    ],
    enduranceActivities: [],
  },
};

describe("plan-generator", () => {
  it("buildPlanSystem is deterministic and includes goal + current plan + recent facts", () => {
    const s = buildPlanSystem(ctx);
    expect(s).toBe(buildPlanSystem(ctx));
    expect(s).toContain("lean bulk");
    expect(s).toContain("Squat");
    expect(s).toContain("245");
  });

  it("returns a clarifying-question turn (no plan)", async () => {
    const fake = vi.fn().mockResolvedValue({
      reply: "How many days a week can you train?",
      proposedPlan: null,
      proposedGoal: null,
    });
    const r = await proposePlanTurn(
      ctx,
      [{ role: "user", content: "make me a plan" }],
      { generate: fake }
    );
    expect(r.reply).toMatch(/how many days/i);
    expect(r.proposedPlan).toBeNull();
  });

  it("returns a committed 7-day plan + goal", async () => {
    const week = Array.from({ length: 7 }, (_, d) => ({
      dayOfWeek: d,
      title: d % 2 ? "Lift" : "Rest",
      notes: "",
      modality: d % 2 ? "strength" : "rest",
      exercises:
        d % 2
          ? [{ name: "Bench", targetSets: 5, targetReps: 5, targetWeight: 185 }]
          : [],
    }));
    const fake = vi.fn().mockResolvedValue({
      reply: "Here's a 4-day plan.",
      proposedPlan: week,
      proposedGoal: "lean bulk, 4 days/wk",
    });
    const r = await proposePlanTurn(ctx, [{ role: "user", content: "go" }], {
      generate: fake,
    });
    expect(r.proposedPlan).toHaveLength(7);
    expect(r.proposedGoal).toBe("lean bulk, 4 days/wk");
    expect(PlanTurnSchema.safeParse(r).success).toBe(true);
  });

  it("retries once then throws a friendly error on invalid output", async () => {
    const bad = vi.fn().mockResolvedValue({ nope: true });
    await expect(
      proposePlanTurn(ctx, [{ role: "user", content: "go" }], { generate: bad })
    ).rejects.toThrow(/couldn't build/i);
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/plan-generator.test.ts`
Expected: FAIL — cannot find module `@/lib/plan-generator`.

- [ ] **Step 3: Implement the library**

Create `src/lib/plan-generator.ts`:

```ts
import { z } from "zod";
import { appDate } from "@/lib/week";
import type { RecentTraining } from "@/lib/recent-training";
import { MODEL_ID } from "@/lib/ai-engine";

export const WeeklyPlanDaySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  title: z.string(),
  notes: z.string(),
  modality: z.enum(["strength", "endurance", "rest"]),
  exercises: z.array(
    z.object({
      name: z.string().min(1),
      targetSets: z.number().int().min(0),
      targetReps: z.number().int().min(0),
      targetWeight: z.number().min(0),
    })
  ),
});
export const WeeklyPlanSchema = z.array(WeeklyPlanDaySchema).length(7);

export const PlanTurnSchema = z.object({
  reply: z.string().min(1),
  proposedPlan: WeeklyPlanSchema.nullable().default(null),
  proposedGoal: z.string().nullable().default(null),
});
export type PlanTurn = z.infer<typeof PlanTurnSchema>;
export type WeeklyPlan = z.infer<typeof WeeklyPlanSchema>;

export type ChatMessage = { role: "user" | "assistant"; content: string };

export type PlanContext = {
  goal: string;
  currentPlan: Array<{
    dayOfWeek: number;
    title: string;
    notes: string;
    modality: string;
    exercises: Array<{
      name: string;
      targetSets: number;
      targetReps: number;
      targetWeight: number;
    }>;
  }>;
  recentTraining: RecentTraining;
};

const DOW = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];

export function buildPlanSystem(c: PlanContext): string {
  const plan =
    c.currentPlan
      .map((d) => {
        const ex =
          d.exercises
            .map(
              (e) =>
                `${e.name} ${e.targetSets}x${e.targetReps}@${e.targetWeight}`
            )
            .join(", ") || "—";
        return `${DOW[d.dayOfWeek]} (${d.modality}) "${d.title}": ${ex}`;
      })
      .join(" | ") || "empty";
  const strength =
    c.recentTraining.strengthSessions
      .map(
        (s) =>
          `[${appDate(s.performedAt)}] ${s.title}: ` +
          s.sets.map((x) => `${x.exerciseName} ${x.weight}×${x.reps}`).join(", ")
      )
      .join(" | ") || "none";
  return [
    "You are a strength & conditioning coach helping the user build a recurring weekly training plan.",
    "Ask focused clarifying questions (days available, equipment, experience, deadlines, injuries) until you can commit a sensible plan.",
    `User's stated goal: ${c.goal.trim() || "not stated yet"}`,
    `Current saved weekly plan: ${plan}`,
    `Recent strength (last ${c.recentTraining.windowDays}d): ${strength}`,
    "Until you are confident, set proposedPlan and proposedGoal to null and put your question in reply.",
    "When confident, return reply (a short summary) AND proposedPlan: EXACTLY 7 entries, one per dayOfWeek 0..6 (0=Sunday). Rest days use modality 'rest' and an empty exercises array. Endurance days use modality 'endurance'. Ground weights in the user's recent actuals.",
    "Also return proposedGoal: a concise (<= 140 char) restatement of the durable goal for future daily check-ins.",
  ].join("\n");
}

type GenerateFn = (args: {
  system: string;
  messages: ChatMessage[];
}) => Promise<unknown>;

// `ai`/`@ai-sdk/anthropic` imported dynamically so injected-mock tests stay
// offline (same pattern as src/lib/ai-engine.ts).
async function defaultGenerate(args: {
  system: string;
  messages: ChatMessage[];
}): Promise<unknown> {
  const { generateObject } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { object } = await generateObject({
    model: anthropic(MODEL_ID),
    schema: PlanTurnSchema,
    system: args.system,
    messages: args.messages,
  });
  return object;
}

export async function proposePlanTurn(
  ctx: PlanContext,
  messages: ChatMessage[],
  deps: { generate?: GenerateFn } = {}
): Promise<PlanTurn> {
  const generate = deps.generate ?? defaultGenerate;
  const system = buildPlanSystem(ctx);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const raw = await generate({ system, messages });
      const parsed = PlanTurnSchema.safeParse(raw);
      if (parsed.success) return parsed.data;
    } catch {
      // fall through to retry / friendly error
    }
  }
  throw new Error(
    "Sorry, we couldn't build a plan right now. Please try again."
  );
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/plan-generator.test.ts`
Expected: PASS (all 4).

- [ ] **Step 5: Commit**

```bash
git add src/lib/plan-generator.ts tests/plan-generator.test.ts
git commit -m "feat(plan-ai): pure plan-generator chat lib (offline-tested)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 6: Server actions — `proposePlanTurnAction` + `savePlanWeek` goal

**Files:**
- Modify: `src/app/actions/plan.ts`
- Modify: `src/lib/plan-store.ts` (extend `upsertPlanWeekForUser` caller path — see step)

- [ ] **Step 1: Add the goal to the Save path**

In `src/app/actions/plan.ts`, import `upsertPlanProfile`:

```ts
import {
  upsertPlanWeekForUser,
  upsertPlanProfile,
  applyProgressionDecision,
  type PlanDayInput,
  type PlanExerciseInput,
} from "@/lib/plan-store";
```

In `savePlanWeek`, after `await upsertPlanWeekForUser(...)` and before
`revalidatePath`, add:

```ts
await upsertPlanProfile(
  session.user.id,
  String(formData.get("goal") ?? "").trim()
);
```

- [ ] **Step 2: Add the chat-turn action**

Append to `src/app/actions/plan.ts`:

```ts
import { getPlanForUser, getPlanProfile } from "@/lib/plan-store";
import { loadRecentTraining } from "@/lib/readiness";
import {
  proposePlanTurn,
  type ChatMessage,
  type PlanTurn,
} from "@/lib/plan-generator";

export async function proposePlanTurnAction(
  messages: ChatMessage[]
): Promise<{ ok: true; turn: PlanTurn } | { ok: false; error: string }> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Not authenticated." };
  try {
    const [currentPlan, goal] = await Promise.all([
      getPlanForUser(session.user.id),
      getPlanProfile(session.user.id),
    ]);
    const recentTraining = await loadRecentTraining(
      session.user.id,
      new Date()
    );
    const turn = await proposePlanTurn(
      { goal, currentPlan, recentTraining },
      messages
    );
    return { ok: true, turn };
  } catch (e: unknown) {
    const msg =
      e instanceof Error && typeof e.message === "string" ? e.message : "";
    return {
      ok: false,
      error: /couldn't build/i.test(msg) ? msg : "Couldn't build a plan.",
    };
  }
}
```

> Note: `getPlanForUser` returns `PlanExerciseRead` (carries `id`); `PlanContext.currentPlan` only reads `name/targetSets/targetReps/targetWeight/dayOfWeek/title/notes/modality`, so the extra `id` is structurally compatible — no mapping needed.

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/app/actions/plan.ts
git commit -m "feat(plan-ai): proposePlanTurn action + goal in savePlanWeek

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: Lift PlanEditor state to a parent (controlled-by-parent)

**Files:**
- Modify: `src/app/(app)/plan/plan-editor.tsx`

The editor must stay a controlled component (React-19 form-reset rationale,
CLAUDE.md). We only move ownership of `days` up so the drawer can replace it.
Field names are unchanged.

- [ ] **Step 1: Change the props contract**

In `src/app/(app)/plan/plan-editor.tsx`, change the React import line from
`import { useState } from "react";` to:

```ts
import type { Dispatch, SetStateAction } from "react";
```

(`useState` is no longer used in this file after lifting; the other helpers
`setDay/setEx/addEx/removeEx` only call `setDays`.) Replace the component
signature and delete its internal `useState`:

```ts
export function PlanEditor({
  days,
  setDays,
}: {
  days: Day[];
  setDays: Dispatch<SetStateAction<Day[]>>;
}) {
  // DELETE: const [days, setDays] = useState<Day[]>(initial);
  // (keep setDay/setEx/addEx/removeEx exactly as-is — they only use setDays)
```

Keep `Day`/`Ex`/`emptyEx`
exported or move them to the workspace (see Task 8 — export them):

Add `export` to the `Day` and `Ex` type aliases and `emptyEx`:

```ts
export type Ex = { /* unchanged */ };
export type Day = { /* unchanged */ };
export const emptyEx = (): Ex => ({ /* unchanged */ });
```

- [ ] **Step 2: Type check (expected to fail at the call site)**

Run: `npx tsc --noEmit`
Expected: FAIL only in `page.tsx`/missing `plan-workspace.tsx` (fixed in Tasks 8–9). `plan-editor.tsx` itself must be error-free.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/plan/plan-editor.tsx
git commit -m "refactor(plan-ai): PlanEditor takes days/setDays from parent

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `plan-workspace.tsx` shell (goal field + editor)

**Files:**
- Create: `src/app/(app)/plan/plan-workspace.tsx`

- [ ] **Step 1: Create the shell (drawer wired in Task 9)**

Create `src/app/(app)/plan/plan-workspace.tsx`:

```tsx
"use client";
import { useState } from "react";
import { savePlanWeek } from "@/app/actions/plan";
import { PlanEditor, type Day } from "./plan-editor";
import { PlanChatDrawer } from "./plan-chat-drawer";

export function PlanWorkspace({
  initialDays,
  initialGoal,
}: {
  initialDays: Day[];
  initialGoal: string;
}) {
  const [days, setDays] = useState<Day[]>(initialDays);
  const [goal, setGoal] = useState(initialGoal);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3 my-3">
        <input
          className="border rounded p-2 flex-1"
          aria-label="training goal"
          name="goal-display"
          placeholder="training goal (e.g. lose fat, keep my squat)"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          form="plan-form"
        />
        <button
          type="button"
          className="ds-btn ds-btn-secondary"
          onClick={() => setDrawerOpen(true)}
        >
          build with ai
        </button>
      </div>

      <form action={savePlanWeek} id="plan-form">
        {/* goal travels with the existing Save submit */}
        <input type="hidden" name="goal" value={goal} />
        <PlanEditor days={days} setDays={setDays} />
      </form>

      <PlanChatDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onApply={(plan, proposedGoal) => {
          setDays(plan);
          if (proposedGoal) setGoal(proposedGoal);
          setDrawerOpen(false);
        }}
      />
    </>
  );
}
```

> The visible goal input is purely display; the hidden `name="goal"` input
> inside the form is what `savePlanWeek` reads. `PlanEditor`'s own `<form>`
> wrapper must be removed — Task 8 Step 2.

- [ ] **Step 2: Move the `<form>` boundary out of PlanEditor**

In `src/app/(app)/plan/plan-editor.tsx`, replace the outer
`<form action={savePlanWeek}> ... </form>` wrapper with a `<>` fragment, and
move the `Save plan` submit button to the very end of the fragment (it now
submits the parent `<form id="plan-form">` because the button is rendered
inside it via `PlanEditor`). Remove the now-unused `savePlanWeek` import from
`plan-editor.tsx`.

```tsx
return (
  <>
    {DAYS.map((name, dow) => (
      /* ...unchanged section markup... */
    ))}
    <button className="ds-btn ds-btn-primary" type="submit">
      Save plan
    </button>
  </>
);
```

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/plan/plan-workspace.tsx src/app/(app)/plan/plan-editor.tsx
git commit -m "feat(plan-ai): plan workspace shell with durable goal field

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 9: `plan-chat-drawer.tsx`

**Files:**
- Create: `src/app/(app)/plan/plan-chat-drawer.tsx`

- [ ] **Step 1: Create the drawer**

Create `src/app/(app)/plan/plan-chat-drawer.tsx`:

```tsx
"use client";
import { useState } from "react";
import { proposePlanTurnAction } from "@/app/actions/plan";
import type { ChatMessage, WeeklyPlan } from "@/lib/plan-generator";
import type { Day } from "./plan-editor";
import { X } from "lucide-react";

export function PlanChatDrawer({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (plan: Day[], proposedGoal: string | null) => void;
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    plan: WeeklyPlan;
    goal: string | null;
  } | null>(null);

  if (!open) return null;

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError(null);
    const res = await proposePlanTurnAction(next);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMessages([
      ...next,
      { role: "assistant", content: res.turn.reply },
    ]);
    if (res.turn.proposedPlan) {
      setPending({
        plan: res.turn.proposedPlan,
        goal: res.turn.proposedGoal,
      });
    }
  }

  // WeeklyPlan day shape == Day shape minus the editor's per-exercise React
  // key id; add ids so the controlled editor can key rows stably.
  const toDays = (plan: WeeklyPlan): Day[] =>
    plan.map((d) => ({
      title: d.title,
      notes: d.notes,
      modality: d.modality,
      exercises: d.exercises.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
      })),
    }));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.32)" }}
      onClick={onClose}
    >
      <div
        className="ds-panel h-full w-full max-w-md p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label="build plan with ai"
      >
        <div className="flex items-center justify-between">
          <h2 className="h4">build with ai</h2>
          <button
            type="button"
            className="ds-btn ds-btn-ghost"
            aria-label="close"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="text-sm opacity-70">
              tell the coach your goal, schedule, and any constraints. it may
              ask a few questions before proposing a week.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "self-end ds-panel p-2 text-sm"
                  : "self-start p-2 text-sm"
              }
            >
              {m.content}
            </div>
          ))}
          {busy && <p className="text-sm opacity-70">thinking…</p>}
          {error && (
            <p className="text-sm" role="alert">
              {error}
            </p>
          )}
        </div>

        {pending && (
          <button
            type="button"
            className="ds-btn ds-btn-primary"
            onClick={() => onApply(toDays(pending.plan), pending.goal)}
          >
            apply this plan to the editor
          </button>
        )}

        <div className="flex gap-2">
          <input
            className="border rounded p-2 flex-1"
            aria-label="message"
            placeholder="message the coach…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className="ds-btn ds-btn-secondary"
            disabled={busy}
            onClick={() => void send()}
          >
            send
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: still failing only on `page.tsx` (fixed in Task 10); no errors in the drawer/workspace/editor trio.

- [ ] **Step 3: Commit**

```bash
git add src/app/(app)/plan/plan-chat-drawer.tsx
git commit -m "feat(plan-ai): ephemeral chat drawer proposing plans to editor

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: Wire the page

**Files:**
- Modify: `src/app/(app)/plan/page.tsx`

- [ ] **Step 1: Load goal + render the workspace**

Replace the body of `src/app/(app)/plan/page.tsx`:

```tsx
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { getPlanForUser, getPlanProfile } from "@/lib/plan-store";
import { PlanWorkspace } from "./plan-workspace";
import type { Day } from "./plan-editor";

export default async function PlanPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const [plan, goal] = await Promise.all([
    getPlanForUser(session.user.id),
    getPlanProfile(session.user.id),
  ]);
  const byDay = new Map(plan.map((p) => [p.dayOfWeek, p]));
  const initialDays: Day[] = Array.from({ length: 7 }, (_, dow) => {
    const p = byDay.get(dow);
    return {
      title: p?.title ?? "",
      notes: p?.notes ?? "",
      modality: p?.modality ?? "strength",
      exercises: (p?.exercises ?? []).map((e) => ({
        ...e,
        id: crypto.randomUUID(),
      })),
    };
  });
  return (
    <main className="ds-container p-8">
      <h1 className="h2">weekly plan</h1>
      <PlanWorkspace initialDays={initialDays} initialGoal={goal} />
    </main>
  );
}
```

- [ ] **Step 2: Full type check + build**

Run: `npx tsc --noEmit && npm run build`
Expected: both pass with no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/plan/page.tsx"
git commit -m "feat(plan-ai): wire plan page to workspace + goal

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 11: Integration coverage for the Save path + full green bar

**Files:**
- Modify: `tests/plan.integration.test.ts`

- [ ] **Step 1: Add a Save-path goal test**

The `savePlanWeek` server action resolves a session, so test the underlying
lib path it now exercises. In `tests/plan.integration.test.ts` add:

```ts
it("G: saving a plan persists the goal alongside the week", async () => {
  await upsertPlanWeekForUser(W, [
    {
      dayOfWeek: 1,
      title: "Lower",
      notes: "",
      modality: "strength",
      exercises: [
        { name: "Squat", targetSets: 5, targetReps: 5, targetWeight: 245 },
      ],
    },
  ]);
  await upsertPlanProfile(W, "recomp");
  expect(await getPlanProfile(W)).toBe("recomp");
  const days = await getPlanForUser(W);
  expect(days.find((d) => d.dayOfWeek === 1)?.exercises[0].name).toBe(
    "Squat"
  );
});
```

(`upsertPlanWeekForUser` accepts the single-day array; it iterates days.)

- [ ] **Step 2: Run the integration suite**

Run: `npm run test:integration`
Expected: PASS (existing + F + G + the readiness goal test from Task 4).

- [ ] **Step 3: Full green bar**

Run each, expect all green:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run format:check
npm run build
npm run test:integration
```

If `npm run format:check` fails, run `npm run format` and re-stage.

- [ ] **Step 4: Commit**

```bash
git add tests/plan.integration.test.ts
git commit -m "test(plan-ai): integration coverage for goal persistence

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Update the decision record

**Files:**
- Modify: `docs/superpowers/specs/2026-05-17-ai-plan-generation-design.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Mark the spec implemented**

Add to the top of the spec, under `Status:`:
`Status: implemented 2026-05-17 (plan: docs/superpowers/plans/2026-05-17-ai-plan-generation.md).`

- [ ] **Step 2: Add a CLAUDE.md note**

In `CLAUDE.md` under "Architecture (the parts that span files)", add a short
paragraph:

> **AI plan builder.** `src/lib/plan-generator.ts` mirrors `ai-engine.ts`
> (dynamic `ai` import, injected `generate`, one retry). `proposePlanTurnAction`
> loads current plan + recent training + goal and returns a per-turn
> `{reply, proposedPlan?, proposedGoal?}`. The plan page is a client shell
> (`plan-workspace.tsx`) owning `days`+`goal`; the chat (`plan-chat-drawer.tsx`)
> is ephemeral and only proposes — nothing persists until the existing
> `savePlanWeek` (now also upserting `plan_profile.goal`). The durable goal is
> threaded into the readiness prompt.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-05-17-ai-plan-generation-design.md CLAUDE.md
git commit -m "docs(plan-ai): mark spec implemented; record architecture note

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Notes for the implementer

- **Offline rule:** `npm test` must never hit the network. `plan-generator`
  tests always inject `generate`. Never import `ai`/`@ai-sdk/anthropic`
  statically.
- **CLI env:** every `drizzle-kit` / integration command needs
  `node --env-file=.env.local …` (only `next` auto-loads `.env.local`).
- **Design system:** all new UI uses `--ds-*` / `.ds-*` only — no hex/px, 3
  radii (8/16/999), sentence-case copy, no emoji. The plan reuses the editor's
  existing class vocabulary; if you add anything, route styling decisions
  through the `dustinriley-design` skill.
- **Controlled editor:** do not reintroduce `defaultValue` or rename the
  `title-/notes-/modality-{0..6}`, `rowCount-{dow}`,
  `ex-{dow}-{row}-{name|sets|reps|weight}` form fields.
- **No `txDb`:** `upsertPlanProfile` is a single statement on `db` by design.
```
