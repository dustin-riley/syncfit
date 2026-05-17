import { describe, it, expect } from "vitest";
import { parseDuration, formatDuration } from "@/lib/duration";

describe("parseDuration", () => {
  it("parses h:mm:ss, mm:ss, and bare seconds", () => {
    expect(parseDuration("1:02:03")).toBe(3723);
    expect(parseDuration("48:00")).toBe(2880);
    expect(parseDuration("90")).toBe(90);
  });
  it("trims and tolerates single-digit parts", () => {
    expect(parseDuration(" 5:3 ")).toBe(303);
  });
  it("rejects garbage and out-of-range parts", () => {
    expect(parseDuration("")).toBeNull();
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1:2:3:4")).toBeNull();
    expect(parseDuration("1:60")).toBeNull(); // seconds must be < 60
    expect(parseDuration("-1")).toBeNull();
    expect(parseDuration("0")).toBeNull(); // a workout has positive duration
  });
});

describe("formatDuration", () => {
  it("formats mm:ss under an hour and h:mm:ss at/over an hour", () => {
    expect(formatDuration(2880)).toBe("48:00");
    expect(formatDuration(3723)).toBe("1:02:03");
    expect(formatDuration(65)).toBe("1:05");
  });
});
