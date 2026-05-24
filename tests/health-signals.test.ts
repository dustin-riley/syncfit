import { describe, it, expect } from "vitest";
import { computeHealthSignals, type HealthRow } from "@/lib/health-signals";

// NOW: 2026-05-13T16:00:00Z → America/New_York Wed 2026-05-13 12:00 EDT
const NOW = new Date("2026-05-13T16:00:00Z");
const today = "2026-05-13";
const d = (offset: number) => {
  // returns a date string offset days from today (negative = past)
  const x = new Date(NOW.getTime() + offset * 86_400_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(x);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
};

const row = (
  metricDate: string,
  type: string,
  value: number,
  freshness: "fresh" | "stale_24h" | "stale_48h" = "fresh"
): HealthRow => ({
  metricDate,
  type,
  value,
  freshness,
  source: "primary",
  recordedAt: new Date(metricDate + "T07:00:00Z"),
});

describe("computeHealthSignals", () => {
  it("returns all-null with baselineN=0 when no rows", () => {
    const r = computeHealthSignals([], NOW);
    expect(r.today).toEqual({ hrv: null, rhr: null, sleepDuration: null });
    expect(r.baseline7d).toEqual({
      hrv: null,
      rhr: null,
      sleepDuration: null,
    });
    expect(r.freshness).toEqual({
      hrv: null,
      rhr: null,
      sleepDuration: null,
    });
    expect(r.baselineN).toBe(0);
  });

  it("computes today values with freshness propagated", () => {
    const rows: HealthRow[] = [
      row(today, "hrv", 42.5),
      row(today, "rhr", 58),
      row(today, "sleep_duration_seconds", 22320, "stale_24h"),
    ];
    const r = computeHealthSignals(rows, NOW);
    expect(r.today.hrv).toBe(42.5);
    expect(r.today.rhr).toBe(58);
    expect(r.today.sleepDuration).toBe(22320);
    expect(r.freshness.sleepDuration).toBe("stale_24h");
  });

  it("computes 7-day baseline over the 7 days preceding today only", () => {
    const rows: HealthRow[] = [
      row(d(-1), "hrv", 40),
      row(d(-2), "hrv", 50),
      row(d(-3), "hrv", 60),
      // today's value is NOT part of the baseline
      row(today, "hrv", 100),
      // outside the 7-day window
      row(d(-8), "hrv", 999),
    ];
    const r = computeHealthSignals(rows, NOW);
    expect(r.baseline7d.hrv).toBeCloseTo(50, 5);
    expect(r.baselineN).toBe(3);
  });

  it("includes the inclusive boundary day d(-7) in the baseline", () => {
    const rows: HealthRow[] = [
      // d(-7) is exactly at the cutoff — must be INCLUDED.
      row(d(-7), "hrv", 50),
      // d(-8) is outside — must be EXCLUDED (already covered, repeated here for clarity).
      row(d(-8), "hrv", 999),
    ];
    const r = computeHealthSignals(rows, NOW);
    expect(r.baseline7d.hrv).toBe(50);
    expect(r.baselineN).toBe(1);
  });

  it("missing today value still returns baseline from history", () => {
    const rows: HealthRow[] = [row(d(-1), "rhr", 56), row(d(-2), "rhr", 58)];
    const r = computeHealthSignals(rows, NOW);
    expect(r.today.rhr).toBeNull();
    expect(r.baseline7d.rhr).toBe(57);
  });

  it("baselineN is the max samples across the three metrics", () => {
    // hrv has 3 days of history, rhr has 5, sleep has 0
    const rows: HealthRow[] = [
      row(d(-1), "hrv", 40),
      row(d(-2), "hrv", 45),
      row(d(-3), "hrv", 50),
      row(d(-1), "rhr", 55),
      row(d(-2), "rhr", 56),
      row(d(-3), "rhr", 57),
      row(d(-4), "rhr", 58),
      row(d(-5), "rhr", 59),
    ];
    const r = computeHealthSignals(rows, NOW);
    expect(r.baselineN).toBe(5);
  });
});
