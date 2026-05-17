// Pure APP_TZ (America/New_York) week math. No React, no DB — this module
// MUST NOT import "@/db" (offline unit tests rely on that). Whole-day
// arithmetic is done at noon UTC so DST never shifts the calendar date.
import { APP_TZ } from "@/lib/units";

const MS_DAY = 86_400_000;
const MONTHS = [
  "jan",
  "feb",
  "mar",
  "apr",
  "may",
  "jun",
  "jul",
  "aug",
  "sep",
  "oct",
  "nov",
  "dec",
];

function appParts(d: Date): { ymd: string; dow: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short",
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return {
    ymd: `${get("year")}-${get("month")}-${get("day")}`,
    dow: map[get("weekday")],
  };
}

/** APP_TZ calendar date ("YYYY-MM-DD") for an instant. */
export function appDate(d: Date): string {
  return appParts(d).ymd;
}

/** Add (or subtract) whole days to a "YYYY-MM-DD" string. */
export function addDaysYmd(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`) + n * MS_DAY;
  return new Date(t).toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" of the Monday of the week containing `d` (APP_TZ). */
export function weekStartFor(d: Date): string {
  const { ymd, dow } = appParts(d);
  const back = dow === 0 ? 6 : dow - 1;
  return addDaysYmd(ymd, -back);
}

/** 7 entries Mon..Sun: calendar date + plan dayOfWeek (Sun=0..Sat=6). */
export function weekDays(
  weekStartYmd: string
): { ymd: string; planDow: number }[] {
  return Array.from({ length: 7 }, (_, i) => ({
    ymd: addDaysYmd(weekStartYmd, i),
    planDow: (i + 1) % 7,
  }));
}

/** UTC window padded ±1 day; exact bucketing happens in buildTrainingWeek. */
export function paddedUtcRange(weekStartYmd: string): { gte: Date; lt: Date } {
  return {
    gte: new Date(Date.parse(`${weekStartYmd}T00:00:00Z`) - MS_DAY),
    lt: new Date(
      Date.parse(`${addDaysYmd(weekStartYmd, 7)}T00:00:00Z`) + MS_DAY
    ),
  };
}

/** "may 11–17" (same month) or "apr 27 – may 3" (cross month). */
export function formatWeekLabel(weekStartYmd: string): string {
  const end = addDaysYmd(weekStartYmd, 6);
  const m1 = MONTHS[Number(weekStartYmd.slice(5, 7)) - 1];
  const d1 = Number(weekStartYmd.slice(8, 10));
  const m2 = MONTHS[Number(end.slice(5, 7)) - 1];
  const d2 = Number(end.slice(8, 10));
  return m1 === m2 ? `${m1} ${d1}–${d2}` : `${m1} ${d1} – ${m2} ${d2}`;
}

/** Prev/next week starts; next is disabled once the current week is reached. */
export function weekNav(
  weekStartYmd: string,
  now: Date
): { prevWeekYmd: string; nextWeekYmd: string; nextDisabled: boolean } {
  return {
    prevWeekYmd: addDaysYmd(weekStartYmd, -7),
    nextWeekYmd: addDaysYmd(weekStartYmd, 7),
    nextDisabled: weekStartYmd >= weekStartFor(now),
  };
}
