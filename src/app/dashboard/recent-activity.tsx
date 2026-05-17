"use client";
import { useState } from "react";
import Link from "next/link";
import { ChevronRight, ChevronDown } from "lucide-react";

type WorkoutView = {
  id: string;
  performedAt: string;
  title: string;
  sets: { exerciseName: string; weight: number; reps: number }[];
};

export function RecentActivity({ workouts }: { workouts: WorkoutView[] }) {
  const [open, setOpen] = useState<string | null>(null);
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
  return (
    <ul style={{ listStyle: "none", padding: 0 }}>
      {workouts.map((w) => {
        const isOpen = open === w.id;
        return (
          <li key={w.id} className="ds-panel p-3 my-2">
            <button
              className="ds-btn ds-btn-ghost"
              aria-expanded={isOpen}
              onClick={() => setOpen(isOpen ? null : w.id)}
            >
              {isOpen ? (
                <ChevronDown size={16} aria-hidden="true" />
              ) : (
                <ChevronRight size={16} aria-hidden="true" />
              )}{" "}
              {w.performedAt} — {w.title}
            </button>
            {isOpen && (
              <ul className="ds-mono-note" style={{ marginTop: "0.5rem" }}>
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
  );
}
