import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { loadProgressData } from "@/app/actions/progress";
import { ProgressWorkspace } from "./progress-workspace";

export default async function ProgressPage() {
  // Layout already redirects on no-session, but every page calls getSession
  // independently per CLAUDE.md (security boundary stays per-page/per-action).
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  const { data, error } = await loadProgressData();

  return (
    <main className="ds-container p-8">
      <ProgressWorkspace
        initialSeries={data.series.map((s) => ({
          ...s,
          // Dates serialise across the client boundary as strings; convert at
          // the edge so the client component receives Date instances.
          lastPerformedAt: s.lastPerformedAt.toISOString(),
          points: s.points.map((p) => ({
            ...p,
            performedAt: p.performedAt.toISOString(),
          })),
        }))}
        error={error}
      />
    </main>
  );
}
