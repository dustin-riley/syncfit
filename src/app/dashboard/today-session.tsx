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

export function TodaySession({
  title,
  modality,
  notes,
  exercises,
  actuals,
}: {
  title: string;
  modality: string;
  notes: string;
  exercises: Ex[];
  actuals: Actual[];
}) {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Awaited<
    ReturnType<typeof analyzeToday>
  > | null>(null);

  const adjFor = (name: string) =>
    out?.result?.todayAdjustments.find((a) => a.exercise === name)?.change;
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
      {out?.error && <p style={{ color: "var(--ds-error)" }}>{out.error}</p>}
      {out?.result && (
        <VerdictBanner
          verdict={out.result.verdict}
          headline={out.result.headline}
          rationale={out.result.rationale}
        />
      )}
    </section>
  );
}
