import { describe, it, expect } from "vitest";
import { buildTrustedOrigins } from "@/auth/trusted-origins";

describe("buildTrustedOrigins", () => {
  it("dev: allows any localhost port + vercel previews + BETTER_AUTH_URL", () => {
    const o = buildTrustedOrigins({
      NODE_ENV: "development",
      BETTER_AUTH_URL: "http://localhost:3000",
    });
    expect(o).toContain("http://localhost:*");
    expect(o).toContain("https://*.vercel.app");
    expect(o).toContain("http://localhost:3000");
    expect(o).not.toContain("*");
  });
  it("production: does NOT trust localhost, keeps vercel previews + prod origin", () => {
    const o = buildTrustedOrigins({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://syncfit.example.com",
    });
    expect(o).not.toContain("http://localhost:*");
    expect(o).toContain("https://*.vercel.app");
    expect(o).toContain("https://syncfit.example.com");
    expect(o).not.toContain("*");
  });
  it("omits BETTER_AUTH_URL entry when unset; never empty of vercel previews", () => {
    const o = buildTrustedOrigins({
      NODE_ENV: "production",
      BETTER_AUTH_URL: undefined,
    });
    expect(o).toContain("https://*.vercel.app");
    expect(o.some((x) => x === "" || x == null)).toBe(false);
  });
});
