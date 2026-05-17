// src/app/(app)/layout.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth/auth";
import { SiteNav } from "./site-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Supplies the nav's email and centralizes the redirect. Pages still call
  // getSession independently for userId-scoped queries (security boundary
  // stays per-page/per-action, per CLAUDE.md) — spec §2.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <>
      <SiteNav email={session.user.email} />
      {children}
    </>
  );
}
