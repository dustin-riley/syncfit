"use client";
import { useState } from "react";
import { Check, X } from "lucide-react";
import { applyProgression } from "@/app/actions/plan";

type Suggestion = {
  exercise: string;
  currentWeight: number;
  suggestedWeight: number;
  suggestedSets?: number;
  suggestedReps?: number;
  rationale: string;
};

export function ProgressionInbox({
  analysisId,
  suggestions,
}: {
  analysisId: string;
  suggestions: Suggestion[];
}) {
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pending = suggestions.filter((s) => !done[s.exercise]);
  if (pending.length === 0) return null;

  // Serialized: one decision in flight at a time across the whole inbox.
  // applyProgressionDecision read-modify-writes a shared jsonb blob, so
  // concurrent decisions on the same analysis would lose-update each other.
  const act = async (s: Suggestion, decision: "accept" | "dismiss") => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const r = await applyProgression({
        analysisId,
        exercise: s.exercise,
        decision,
      });
      if (r.ok) setDone((d) => ({ ...d, [s.exercise]: decision }));
      else setErr(r.error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="my-6">
      <h2 className="h4">progression</h2>
      {err && (
        <p role="alert" className="alert-text">
          {err}
        </p>
      )}
      {pending.map((s) => (
        <div key={s.exercise} className="card p-3 my-2">
          <strong>{s.exercise}</strong>: {s.currentWeight} → {s.suggestedWeight}
          {s.suggestedSets || s.suggestedReps ? (
            <span className="caption">
              {" "}
              ({s.suggestedSets ?? "—"}×{s.suggestedReps ?? "—"})
            </span>
          ) : null}
          <p className="caption">{s.rationale}</p>
          <button
            className="btn"
            aria-busy={busy}
            disabled={busy}
            onClick={() => act(s, "accept")}
          >
            <Check size={16} aria-hidden="true" /> accept
          </button>{" "}
          <button
            className="btn btn--ghost"
            aria-busy={busy}
            disabled={busy}
            onClick={() => act(s, "dismiss")}
          >
            <X size={16} aria-hidden="true" /> dismiss
          </button>
        </div>
      ))}
    </section>
  );
}
