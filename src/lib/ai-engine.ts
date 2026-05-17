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
