"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Check,
  X,
  CalendarClock,
  Minus,
} from "lucide-react";
import type { TrainingWeekData, DayState } from "@/lib/week-view";
import { formatDuration } from "@/lib/duration";
import { loadTrainingWeek } from "@/app/actions/training-week";

const STATE_META: Record<DayState, { label: string; Icon: typeof Check }> = {
  done: { label: "done", Icon: Check },
  missed: { label: "missed", Icon: X },
  planned: { label: "planned", Icon: CalendarClock },
  rest: { label: "rest", Icon: Minus },
};

export function TrainingWeek({ initial }: { initial: TrainingWeekData }) {
  const [data, setData] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const go = (weekStartYmd: string) => {
    setOpen(null);
    startTransition(async () => {
      setData(await loadTrainingWeek(weekStartYmd));
    });
  };

  // Spec confines the import prompt to the new-user "no workouts and no
  // plan" case. The plan recurs every week, so any plan yields planned/
  // missed rows — an all-rest week is exactly that case.
  const isEmptyWeek = data.days.every((d) => d.state === "rest");

  return (
    <div style={{ opacity: pending ? 0.6 : 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--ds-space-2)",
          marginBottom: "var(--ds-space-2)",
        }}
      >
        <button
          className="ds-btn ds-btn-ghost"
          onClick={() => go(data.prevWeekYmd)}
          disabled={pending}
          aria-label="previous week"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span
          className="ds-mono-note"
          style={{
            minWidth:
              "9ch" /* keeps the nav arrows from shifting as the label width changes */,
          }}
        >
          {data.label}
        </span>
        <button
          className="ds-btn ds-btn-ghost"
          onClick={() => go(data.nextWeekYmd)}
          disabled={pending || data.nextDisabled}
          aria-label="next week"
        >
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {data.days.map((d) => {
          const meta = STATE_META[d.state];
          const Icon = meta.Icon;
          const isOpen = open === d.ymd;
          const canExpand = d.state === "done";
          return (
            <li
              key={d.ymd}
              style={{
                borderBottom: "var(--ds-border-width) solid var(--ds-border)",
                borderLeft: d.isToday
                  ? "var(--ds-border-width) solid var(--ds-primary)"
                  : "var(--ds-border-width) solid transparent",
                paddingLeft: "var(--ds-space-2)",
              }}
            >
              <button
                onClick={
                  canExpand ? () => setOpen(isOpen ? null : d.ymd) : undefined
                }
                aria-expanded={canExpand ? isOpen : undefined}
                disabled={!canExpand}
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
                  cursor: canExpand ? "pointer" : "default",
                }}
              >
                <span
                  className="ds-mono-note"
                  style={{ minWidth: "6ch", fontWeight: 600 }}
                >
                  {d.label}
                </span>
                <span
                  className="ds-mono-note"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--ds-space-1)",
                    minWidth: "8ch",
                  }}
                >
                  <Icon size={14} aria-hidden="true" />
                  {meta.label}
                  {d.isToday ? " · today" : ""}
                </span>
                <span className="ds-mono-note" style={{ flex: 1 }}>
                  {d.state === "done"
                    ? [d.workouts.map((w) => w.title).join(" · "), d.summary]
                        .filter(Boolean)
                        .join(" — ")
                    : d.state === "rest"
                      ? "no plan"
                      : d.plannedTitle}
                </span>
                {canExpand && (
                  <ChevronDown
                    size={16}
                    aria-hidden="true"
                    style={{
                      transform: isOpen ? "rotate(180deg)" : "none",
                      transition: "transform 150ms",
                    }}
                  />
                )}
              </button>
              {isOpen && canExpand && (
                <ul
                  className="ds-mono-note"
                  style={{
                    listStyle: "none",
                    margin: "0 0 var(--ds-space-2) var(--ds-space-5)",
                    padding: 0,
                  }}
                >
                  {d.workouts.flatMap((w) =>
                    w.sets.map((s, i) => (
                      <li key={`${w.id}-${i}`}>
                        {s.exerciseName}: {s.weight} × {s.reps}
                      </li>
                    ))
                  )}
                  {d.endurance.map((e, i) => (
                    <li key={`end-${i}`}>
                      {e.activityType}
                      {e.distanceMi === null ? "" : ` ${e.distanceMi}mi`} ·{" "}
                      {formatDuration(e.durationSec)}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {isEmptyWeek && (
        <p className="ds-mono-note" style={{ marginTop: "var(--ds-space-2)" }}>
          no workouts this week.{" "}
          <Link href="/import" style={{ color: "var(--ds-link)" }}>
            import your Strong CSV
          </Link>
          .
        </p>
      )}
    </div>
  );
}
