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
  modifications: z
    .array(z.object({ exercise: z.string(), change: z.string() }))
    .default([]),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

export type AnalyzeInput = {
  plannedSession: { title: string; description: string; modality: string };
  trailingLoad: {
    windowHours: number;
    sessions: number;
    setCount: number;
    totalVolume: number;
    perExercise: { exerciseName: string; volume: number; setCount: number }[];
    lastSessionAt: Date | null;
    restDays: number;
  };
};

export function buildPrompt(i: AnalyzeInput): string {
  const tl = i.trailingLoad;
  const per = tl.perExercise
    .map((e) => `${e.exerciseName}: vol ${e.volume} (${e.setCount} sets)`)
    .join("; ");
  return [
    "You are a strength coach. Auto-regulate today's planned session using only the data below.",
    `Planned (${i.plannedSession.modality}): ${i.plannedSession.title} — ${i.plannedSession.description}`,
    `Trailing ${tl.windowHours}h: ${tl.sessions} session(s), ${tl.setCount} sets, total volume ${tl.totalVolume}.`,
    `Per exercise: ${per || "none"}. Rest days since last session: ${tl.restDays}.`,
    "No RPE is available. Base fatigue judgment on volume, frequency and rest only.",
    "v1: leave modifications empty.",
  ].join("\n");
}

type GenerateFn = (prompt: string) => Promise<unknown>;
export const MODEL_ID = "claude-sonnet-4-6";

// `ai`/`@ai-sdk/anthropic` are imported dynamically so injected-mock tests stay offline.
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
