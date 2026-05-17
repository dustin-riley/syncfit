// Pure day-state derivation for the weekly training view. Imports only
// "@/lib/week" — no React, no DB. Output is fully serializable (no Date).
import { appDate, weekDays, formatWeekLabel, weekNav } from "@/lib/week";
import { formatDuration } from "@/lib/duration";

export type SetView = { exerciseName: string; weight: number; reps: number };
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
export type WorkoutInput = {
  id: string;
  performedAt: Date;
  title: string;
  sets: SetView[];
};
export type PlanDayLite = { dayOfWeek: number; title: string };
export type DayState = "done" | "missed" | "planned" | "rest";
export type DayCell = {
  ymd: string;
  label: string; // "mon 11"
  isToday: boolean;
  state: DayState;
  workouts: { id: string; title: string; sets: SetView[] }[];
  endurance: EnduranceCell[];
  summary: string | null; // done only
  plannedTitle: string | null; // missed/planned only
};
export type TrainingWeekData = {
  weekStartYmd: string;
  label: string;
  days: DayCell[];
  prevWeekYmd: string;
  nextWeekYmd: string;
  nextDisabled: boolean;
};

const DOW_LABELS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function summarize(sets: SetView[]): string | null {
  if (sets.length === 0) return null;
  // Strong logs one row per set, so a real workout has many sets per
  // exercise. Collapse to one entry per exercise (first-seen order) at its
  // top set (heaviest; tie → more reps), matching the app's top-set notion.
  const top = new Map<string, SetView>();
  for (const s of sets) {
    const best = top.get(s.exerciseName);
    if (
      !best ||
      s.weight > best.weight ||
      (s.weight === best.weight && s.reps > best.reps)
    ) {
      top.set(s.exerciseName, s);
    }
  }
  const exercises = [...top.values()];
  const head = exercises
    .slice(0, 2)
    .map((s) => `${s.exerciseName} ${s.weight}×${s.reps}`)
    .join(" · ");
  const rest = exercises.length - 2;
  return rest > 0 ? `${head} · +${rest} more` : head;
}

function summarizeEndurance(es: EnduranceCell[]): string | null {
  if (es.length === 0) return null;
  return es
    .map(
      (e) =>
        `${e.activityType}${e.distanceMi === null ? "" : ` ${e.distanceMi}mi`} · ${formatDuration(e.durationSec)}`
    )
    .join(" · ");
}

export function buildTrainingWeek(args: {
  weekStartYmd: string;
  now: Date;
  workouts: WorkoutInput[];
  planDays: PlanDayLite[];
  enduranceActivities?: EnduranceInput[];
}): TrainingWeekData {
  const { weekStartYmd, now, workouts, planDays } = args;
  const enduranceActivities = args.enduranceActivities ?? [];
  const todayYmd = appDate(now);

  const days: DayCell[] = weekDays(weekStartYmd).map((d, i) => {
    const dayWorkouts = workouts
      .filter((w) => appDate(w.performedAt) === d.ymd)
      .sort((a, b) => a.performedAt.getTime() - b.performedAt.getTime());
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
  });

  const nav = weekNav(weekStartYmd, now);
  return {
    weekStartYmd,
    label: formatWeekLabel(weekStartYmd),
    days,
    ...nav,
  };
}
