import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import { buildTrustedOrigins } from "@/auth/trusted-origins";

const baseURL =
  process.env.BETTER_AUTH_URL ??
  (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined);

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  ...(baseURL ? { baseURL } : {}),
  emailAndPassword: { enabled: true },
  trustedOrigins: buildTrustedOrigins(process.env),
});
