import { z } from "zod";
import { appDate } from "@/lib/week";
import { formatDuration } from "@/lib/duration";
import type { RecentTraining } from "@/lib/recent-training";
import type { HealthSignals } from "@/lib/health-signals";

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
}

type GenerateFn = (prompt: string) => Promise<unknown>;
export const MODEL_ID = "claude-sonnet-4-6";
// Short, human label for the AI mark byline ("the model says · <MODEL_LABEL>").
export const MODEL_LABEL = "sonnet";

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
