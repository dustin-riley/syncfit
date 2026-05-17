import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import Link from "next/link";
import { db } from "@/db";
import { workout, workoutSet, readinessAnalysis } from "@/db/schema";
import { eq, desc, inArray } from "drizzle-orm";
import { todayInfo, loadTrailingLoad } from "@/lib/readiness";
import { getPlanForUser } from "@/lib/plan-store";
import { TodaySession } from "./dashboard/today-session";
import { RecentActivity } from "./dashboard/recent-activity";
import { ProgressionInbox } from "./dashboard/progression-inbox";

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");
  const userId = session.user.id;
  const now = new Date();
  const { dow } = todayInfo(now);

  const plan = await getPlanForUser(userId);
  const today = plan.find((p) => p.dayOfWeek === dow);

  const recentWorkouts = await db
    .select()
    .from(workout)
    .where(eq(workout.userId, userId))
    .orderBy(desc(workout.performedAt))
    .limit(10);
  const wIds = recentWorkouts.map((w) => w.id);
  const sets = wIds.length
    ? await db
        .select()
        .from(workoutSet)
        .where(inArray(workoutSet.workoutId, wIds))
    : [];

  const load = await loadTrailingLoad(userId, now);

  const [latest] = await db
    .select()
    .from(readinessAnalysis)
    .where(eq(readinessAnalysis.userId, userId))
    .orderBy(desc(readinessAnalysis.createdAt))
    .limit(1);
  const pastAnalyses = await db
    .select()
    .from(readinessAnalysis)
    .where(eq(readinessAnalysis.userId, userId))
    .orderBy(desc(readinessAnalysis.createdAt))
    .limit(6);

  const workoutViews = recentWorkouts.map((w) => ({
    id: w.id,
    performedAt: w.performedAt.toDateString(),
    title: w.title,
    sets: sets
      .filter((s) => s.workoutId === w.id)
      .map((s) => ({
        exerciseName: s.exerciseName,
        weight: Number(s.weight),
        reps: s.reps,
      })),
  }));

  return (
    <main className="ds-container p-8">
      <h1 className="h2">today</h1>
      {today ? (
        <TodaySession
          title={today.title}
          modality={today.modality}
          notes={today.notes}
          exercises={today.exercises}
          actuals={load.perExercise.map((e) => ({
            exerciseName: e.exerciseName,
            topSetWeight: e.topSetWeight,
            topSetReps: e.topSetReps,
          }))}
        />
      ) : (
        <section className="ds-panel p-4 my-3">
          <p className="ds-mono-note">
            no plan for today.{" "}
            <Link href="/plan" style={{ color: "var(--ds-link)" }}>
              build your plan
            </Link>
            .
          </p>
        </section>
      )}

      {latest &&
        latest.progressionSuggestions.some((s) => s.status === "pending") && (
          <ProgressionInbox
            analysisId={latest.id}
            suggestions={latest.progressionSuggestions
              .filter((s) => s.status === "pending")
              .map((s) => ({
                exercise: s.exercise,
                currentWeight: s.currentWeight,
                suggestedWeight: s.suggestedWeight,
                suggestedSets: s.suggestedSets,
                suggestedReps: s.suggestedReps,
                rationale: s.rationale,
              }))}
          />
        )}

      <section className="my-6">
        <h2 className="h4">recent activity</h2>
        <RecentActivity workouts={workoutViews} />
      </section>

      <section className="my-6">
        <h2 className="h4">past readiness checks</h2>
        <ul style={{ listStyle: "none", padding: 0 }}>
          {pastAnalyses.map((a) => (
            <li key={a.id} className="ds-panel p-3 my-2">
              <span className="ds-mono-note">
                {a.analysisDate} · {a.verdict.replace(/_/g, " ")}
              </span>{" "}
              <strong>{a.headline}</strong>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
