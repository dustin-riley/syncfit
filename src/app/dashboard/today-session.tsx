"use client";
import { useState } from "react";
import Link from "next/link";
import { analyzeToday } from "@/app/actions/analyze";
import { findExerciseMatch } from "@/lib/exercise-match";
import { VerdictBanner } from "./verdict-banner";

type Ex = {
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
};
type Actual = {
  exerciseName: string;
  topSetWeight: number;
  topSetReps: number;
  agoDays: number;
};
type PriorResult = {
  verdict: string;
  headline: string;
  rationale: string;
  todayAdjustments: { exercise: string; change: string }[];
};

export function TodaySession({
  title,
  modality,
  notes,
  exercises,
  actuals,
  initialResult,
}: {
  title: string;
  modality: string;
  notes: string;
  exercises: Ex[];
  actuals: Actual[];
  initialResult?: PriorResult | null;
}) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Awaited<
    ReturnType<typeof analyzeToday>
  > | null>(null);
  // out (a fresh in-component analyze) intentionally wins and stays sticky
  // until unmount. The only flow that mints a new readiness row is the
  // analyze button below (which sets `out`); progression-accept revalidates
  // `/` but does not change readiness content, so initialResult can never be
  // "newer" than a set `out`. initialResult only fills the pre-analyze load.
  const result = out?.result ?? initialResult ?? undefined;

  const adjFor = (name: string) =>
    findExerciseMatch(name, result?.todayAdjustments ?? [], (a) => a.exercise)
      ?.change;
  const actualFor = (name: string) =>
    findExerciseMatch(name, actuals, (a) => a.exerciseName);

  return (
    <section className="ds-panel p-4 my-3">
      <h2 className="h4">today · {title || modality}</h2>
      {exercises.length === 0 ? (
        <p className="ds-mono-note">
          no exercises planned.{" "}
          <Link href="/plan" style={{ color: "var(--ds-link)" }}>
            build your plan
          </Link>
          .
        </p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0 }}>
          {exercises.map((e) => {
            const a = actualFor(e.name);
            const adj = adjFor(e.name);
            return (
              <li key={e.name} className="my-2">
                <strong>{e.name}</strong> — {e.targetSets}×{e.targetReps} @{" "}
                {e.targetWeight}
                {a && (
                  <span className="ds-mono-note">
                    {" "}
                    · recent: {a.topSetWeight}×{a.topSetReps} (
                    {a.agoDays === 0 ? "today" : `${a.agoDays}d ago`})
                  </span>
                )}
                {adj && (
                  <div
                    className="ds-mono-note"
                    style={{ color: "var(--ds-accent-ochre)" }}
                  >
                    today: {adj}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {notes && <p className="ds-mono-note">notes: {notes}</p>}
      <button
        className="ds-btn ds-btn-primary mt-3"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          try {
            setOut(await analyzeToday());
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "analyzing…" : "analyze readiness"}
      </button>
      {out?.error && (
        <p style={{ color: "var(--ds-error)" }}>
          {out.error}
          {result && " Showing your earlier result below."}
        </p>
      )}
      {result && (
        <VerdictBanner
          verdict={result.verdict}
          headline={result.headline}
          rationale={result.rationale}
        />
      )}
    </section>
  );
}
