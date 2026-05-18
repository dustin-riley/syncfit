import { describe, it, expect } from "vitest";
import { parseAppDateTime } from "@/lib/units";

describe("parseAppDateTime", () => {
  it("interprets a datetime-local string as APP_TZ wall time (EDT)", () => {
    // 2026-05-17 12:00 America/New_York (EDT, -4) === 16:00Z
    expect(parseAppDateTime("2026-05-17T12:00")?.toISOString()).toBe(
      "2026-05-17T16:00:00.000Z"
    );
  });
  it("accepts an optional seconds component", () => {
    expect(parseAppDateTime("2026-05-17T12:00:30")?.toISOString()).toBe(
      "2026-05-17T16:00:30.000Z"
    );
  });
  it("returns null for empty or unparseable input", () => {
    expect(parseAppDateTime("")).toBeNull();
    expect(parseAppDateTime("not-a-date")).toBeNull();
  });
});
