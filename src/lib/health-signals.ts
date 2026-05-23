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

// Wire-format keys (also the `health_metric.type` column values).
// Exported so the DB loader in readiness.ts can target the same set.
export const HEALTH_METRIC_KEYS = {
  HRV: "hrv",
  RHR: "rhr",
  SLEEP: "sleep_duration_seconds",
} as const;
const KEY_HRV = HEALTH_METRIC_KEYS.HRV;
const KEY_RHR = HEALTH_METRIC_KEYS.RHR;
const KEY_SLEEP = HEALTH_METRIC_KEYS.SLEEP;

// Exported so readiness.ts's loader can reuse the same APP_TZ-aware
// date formatting.
export function todayDateInAppTz(now: Date): string {
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

// Pure: takes the raw rows and produces the structured summary.
export function computeHealthSignals(
  rows: HealthRow[],
  now: Date
): HealthSignals {
  const today = todayDateInAppTz(now);
  // Build the cutoff for "the 7 days preceding today" by string compare.
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
