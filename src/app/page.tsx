import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { db } from "@/db";
import { plannedSession, workout, readinessAnalysis } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { todayInfo } from "@/lib/readiness";
import { AnalyzeButton } from "./analyze-button";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const userId = session.user.id;
  const { dow } = todayInfo(new Date());
  const [planned] = await db.select().from(plannedSession)
    .where(and(eq(plannedSession.userId, userId), eq(plannedSession.dayOfWeek, dow)));
  const recentWorkouts = await db.select().from(workout)
    .where(eq(workout.userId, userId)).orderBy(desc(workout.performedAt)).limit(10);
  const pastAnalyses = await db.select().from(readinessAnalysis)
    .where(eq(readinessAnalysis.userId, userId)).orderBy(desc(readinessAnalysis.createdAt)).limit(5);

  return (
    <main className="ds-container p-8">
      <h1>Today</h1>
      <section className="ds-panel p-4 my-3">
        <h2>Planned session</h2>
        {planned ? <p>{planned.title} — {planned.description}</p>
                 : <p>No plan set. <a href="/plan">Add one</a>.</p>}
        <AnalyzeButton />
      </section>
      <section className="my-6">
        <h2>Activity feed</h2>
        {recentWorkouts.length === 0
          ? <p>No workouts yet. <a href="/import">Import your Strong CSV</a>.</p>
          : <ul>{recentWorkouts.map(w =>
              <li key={w.id} className="ds-mono-note">{w.performedAt.toDateString()} — {w.title}</li>)}</ul>}
        <h3 className="mt-4">Recent readiness checks</h3>
        <ul>{pastAnalyses.map(a =>
          <li key={a.id} className="ds-panel p-3 my-2"><strong>{a.headline}</strong> — {a.rationale}</li>)}</ul>
      </section>
    </main>
  );
}
