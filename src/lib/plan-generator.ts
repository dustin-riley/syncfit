import { z } from "zod";
import { appDate } from "@/lib/week";
import { formatDuration } from "@/lib/duration";
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
          s.sets
            .map((x) => `${x.exerciseName} ${x.weight}×${x.reps}`)
            .join(", ")
      )
      .join(" | ") || "none";
  const endurance =
    c.recentTraining.enduranceActivities
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
    "You are a strength & conditioning coach helping the user build a recurring weekly training plan.",
    "Ask focused clarifying questions (days available, equipment, experience, deadlines, injuries) until you can commit a sensible plan.",
    `User's stated goal: ${c.goal.trim() || "not stated yet"}`,
    `Current saved weekly plan: ${plan}`,
    `Recent strength (last ${c.recentTraining.windowDays}d): ${strength}`,
    `Recent endurance (last ${c.recentTraining.windowDays}d): ${endurance}`,
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
