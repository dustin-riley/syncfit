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
  it("VERCEL_URL: derives https://<host> origin and keeps vercel wildcard", () => {
    const o = buildTrustedOrigins({
      NODE_ENV: "production",
      VERCEL_URL: "syncfit-abc123.vercel.app",
    });
    expect(o).toContain("https://syncfit-abc123.vercel.app");
    expect(o).toContain("https://*.vercel.app");
    expect(o).not.toContain("*");
  });
  it("VERCEL_URL unset: output unchanged, no undefined/empty entries", () => {
    const o = buildTrustedOrigins({
      NODE_ENV: "production",
      BETTER_AUTH_URL: undefined,
      VERCEL_URL: undefined,
    });
    expect(o).toContain("https://*.vercel.app");
    expect(o.some((x) => !x)).toBe(false);
  });
  it("precedence sanity: both BETTER_AUTH_URL and VERCEL_URL appear as trusted origins", () => {
    const o = buildTrustedOrigins({
      NODE_ENV: "production",
      BETTER_AUTH_URL: "https://syncfit.example.com",
      VERCEL_URL: "syncfit-abc123.vercel.app",
    });
    expect(o).toContain("https://syncfit.example.com");
    expect(o).toContain("https://syncfit-abc123.vercel.app");
    expect(o).toContain("https://*.vercel.app");
    expect(o).not.toContain("*");
  });
});
