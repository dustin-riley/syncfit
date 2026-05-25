import { describe, it, expect } from "vitest";
import { NAV_ITEMS, isActivePath } from "@/lib/nav";

describe("NAV_ITEMS", () => {
  it("lists the five signed-in routes in order with short labels", () => {
    expect(NAV_ITEMS).toEqual([
      { href: "/", label: "Today", shortLabel: "Today" },
      { href: "/progress", label: "Progress", shortLabel: "Progress" },
      { href: "/plan", label: "Weekly plan", shortLabel: "Plan" },
      { href: "/log", label: "Log workout", shortLabel: "Log" },
      { href: "/import", label: "Import", shortLabel: "Import" },
    ]);
  });
});

describe("isActivePath", () => {
  it("matches '/' only exactly, not as a prefix of every route", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/plan", "/")).toBe(false);
    expect(isActivePath("/import", "/")).toBe(false);
  });

  it("matches non-root routes by prefix (covers nested paths)", () => {
    expect(isActivePath("/plan", "/plan")).toBe(true);
    expect(isActivePath("/plan/anything", "/plan")).toBe(true);
    expect(isActivePath("/import", "/import")).toBe(true);
    expect(isActivePath("/import", "/plan")).toBe(false);
    expect(isActivePath("/progress", "/progress")).toBe(true);
    expect(isActivePath("/progress/anything", "/progress")).toBe(true);
    expect(isActivePath("/progress", "/")).toBe(false);
  });

  it("does not treat a string-prefix as a path match", () => {
    expect(isActivePath("/planner", "/plan")).toBe(false);
  });
});
