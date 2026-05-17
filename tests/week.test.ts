import { describe, it, expect } from "vitest";
import {
  appDate,
  addDaysYmd,
  weekStartFor,
  weekDays,
  paddedUtcRange,
  formatWeekLabel,
  weekNav,
} from "@/lib/week";

describe("appDate", () => {
  it("returns the APP_TZ calendar date, not the UTC date", () => {
    // 2026-05-13T03:00:00Z is still 2026-05-12 23:00 in America/New_York
    expect(appDate(new Date("2026-05-13T03:00:00Z"))).toBe("2026-05-12");
  });
});

describe("addDaysYmd", () => {
  it("adds and subtracts whole days across month and year boundaries", () => {
    expect(addDaysYmd("2026-05-13", 4)).toBe("2026-05-17");
    expect(addDaysYmd("2026-05-01", -1)).toBe("2026-04-30");
    expect(addDaysYmd("2026-01-01", -1)).toBe("2025-12-31");
  });
  it("is unaffected by DST transitions (whole-day math at noon UTC)", () => {
    // US spring-forward 2026-03-08, fall-back 2026-11-01
    expect(addDaysYmd("2026-03-07", 2)).toBe("2026-03-09");
    expect(addDaysYmd("2026-10-31", 2)).toBe("2026-11-02");
  });
});

describe("weekStartFor", () => {
  it("returns the Monday of the week (mid-week)", () => {
    // 2026-05-13 is a Wednesday
    expect(weekStartFor(new Date("2026-05-13T16:00:00Z"))).toBe("2026-05-11");
  });
  it("treats Sunday as the last day of the week, not the first", () => {
    // 2026-05-17 is a Sunday -> Monday is 2026-05-11
    expect(weekStartFor(new Date("2026-05-17T16:00:00Z"))).toBe("2026-05-11");
  });
  it("returns the same date when given a Monday", () => {
    expect(weekStartFor(new Date("2026-05-11T16:00:00Z"))).toBe("2026-05-11");
  });
  it("rolls back across a month boundary", () => {
    // 2026-05-01 is a Friday -> Monday is 2026-04-27
    expect(weekStartFor(new Date("2026-05-01T16:00:00Z"))).toBe("2026-04-27");
  });
});

describe("weekDays", () => {
  it("returns 7 days Mon..Sun with plan dayOfWeek (Sun=0..Sat=6)", () => {
    const d = weekDays("2026-05-11");
    expect(d.map((x) => x.ymd)).toEqual([
      "2026-05-11", "2026-05-12", "2026-05-13", "2026-05-14",
      "2026-05-15", "2026-05-16", "2026-05-17",
    ]);
    expect(d.map((x) => x.planDow)).toEqual([1, 2, 3, 4, 5, 6, 0]);
  });
});

describe("paddedUtcRange", () => {
  it("brackets the week with ±1 day padding", () => {
    const { gte, lt } = paddedUtcRange("2026-05-11");
    expect(gte.toISOString()).toBe("2026-05-10T00:00:00.000Z");
    expect(lt.toISOString()).toBe("2026-05-19T00:00:00.000Z");
  });
});

describe("formatWeekLabel", () => {
  it("formats a same-month week", () => {
    expect(formatWeekLabel("2026-05-11")).toBe("may 11–17");
  });
  it("formats a cross-month week", () => {
    expect(formatWeekLabel("2026-04-27")).toBe("apr 27 – may 3");
  });
});

describe("weekNav", () => {
  it("computes prev/next and disables next at the current week", () => {
    const now = new Date("2026-05-13T16:00:00Z"); // current week starts 2026-05-11
    expect(weekNav("2026-05-11", now)).toEqual({
      prevWeekYmd: "2026-05-04",
      nextWeekYmd: "2026-05-18",
      nextDisabled: true,
    });
  });
  it("enables next for a past week", () => {
    const now = new Date("2026-05-13T16:00:00Z");
    expect(weekNav("2026-05-04", now)).toEqual({
      prevWeekYmd: "2026-04-27",
      nextWeekYmd: "2026-05-11",
      nextDisabled: false,
    });
  });
});
