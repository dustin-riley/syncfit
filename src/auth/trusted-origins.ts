export function buildTrustedOrigins(env: {
  NODE_ENV?: string;
  BETTER_AUTH_URL?: string;
  VERCEL_URL?: string;
}): string[] {
  return [
    "https://*.vercel.app",
    ...(env.BETTER_AUTH_URL ? [env.BETTER_AUTH_URL] : []),
    ...(env.VERCEL_URL ? [`https://${env.VERCEL_URL}`] : []),
    ...(env.NODE_ENV !== "production" ? ["http://localhost:*"] : []),
  ];
}
