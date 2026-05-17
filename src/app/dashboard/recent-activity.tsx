"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown, ChevronUp } from "lucide-react";

type WorkoutView = {
  id: string;
  performedAt: string;
  title: string;
  sets: { exerciseName: string; weight: number; reps: number }[];
};

const INITIAL = 5;

export function RecentActivity({ workouts }: { workouts: WorkoutView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  if (workouts.length === 0)
    return (
      <p className="ds-mono-note">
        no workouts yet.{" "}
        <Link href="/import" style={{ color: "var(--ds-link)" }}>
          import your Strong CSV
        </Link>
        .
      </p>
    );

  const visible = showAll ? workouts : workouts.slice(0, INITIAL);
  const hidden = workouts.length - visible.length;

  return (
    <div>
      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {visible.map((w) => {
          const isOpen = open === w.id;
          return (
            <li
              key={w.id}
              className="border-b"
              style={{ borderBottomColor: "var(--ds-border)" }}
            >
              <button
                onClick={() => setOpen(isOpen ? null : w.id)}
                aria-expanded={isOpen}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--ds-space-2)",
                  width: "100%",
                  padding: "var(--ds-space-2) 0",
                  background: "none",
                  border: "none",
                  font: "inherit",
                  color: "var(--ds-text)",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                {isOpen ? (
                  <ChevronDown size={16} aria-hidden="true" />
                ) : (
                  <ChevronRight size={16} aria-hidden="true" />
                )}
                <span className="ds-mono-note">
                  {w.performedAt} — {w.title}
                </span>
              </button>
              {isOpen && (
                <ul
                  className="ds-mono-note"
                  style={{
                    listStyle: "none",
                    margin: "0 0 var(--ds-space-2) var(--ds-space-5)",
                    padding: 0,
                  }}
                >
                  {w.sets.map((s, i) => (
                    <li key={i}>
                      {s.exerciseName}: {s.weight} × {s.reps}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {workouts.length > INITIAL && (
        <button
          className="ds-btn ds-btn-ghost"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          style={{ marginTop: "var(--ds-space-2)" }}
        >
          {showAll ? (
            <>
              <ChevronUp size={16} aria-hidden="true" /> show less
            </>
          ) : (
            <>
              <ChevronDown size={16} aria-hidden="true" /> show more ({hidden})
            </>
          )}
        </button>
      )}
    </div>
  );
}
