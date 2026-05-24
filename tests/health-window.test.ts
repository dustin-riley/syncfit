import { describe, it, expect } from "vitest";
import { isMetricDateWithinWindow } from "@/lib/health-window";

// Anchored to midnight UTC so the timestamp-based +/-Nd boundaries line
// up exactly with the metricDate strings (which are parsed as UTC midnight).
const now = new Date("2026-05-23T00:00:00Z");

describe("isMetricDateWithinWindow", () => {
  it("accepts today", () => {
    expect(isMetricDateWithinWindow("2026-05-23", now)).toBe(true);
  });

  it("accepts a date 30 days back (lower boundary)", () => {
    expect(isMetricDateWithinWindow("2026-04-23", now)).toBe(true);
  });

  it("rejects a date 31 days back", () => {
    expect(isMetricDateWithinWindow("2026-04-22", now)).toBe(false);
  });

  it("accepts a date one day in the future (tolerates TZ skew)", () => {
    expect(isMetricDateWithinWindow("2026-05-24", now)).toBe(true);
  });

  it("rejects a date two days in the future", () => {
    expect(isMetricDateWithinWindow("2026-05-25", now)).toBe(false);
  });

  it("rejects malformed date strings", () => {
    expect(isMetricDateWithinWindow("2026/05/23", now)).toBe(false);
    expect(isMetricDateWithinWindow("not-a-date", now)).toBe(false);
    expect(isMetricDateWithinWindow("", now)).toBe(false);
  });

  it("rejects valid format but impossible dates", () => {
    expect(isMetricDateWithinWindow("2026-13-01", now)).toBe(false);
    expect(isMetricDateWithinWindow("2026-02-30", now)).toBe(false);
  });
});
