"use client";
import { useState, useTransition } from "react";
import Link from "next/link";
import {
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  CalendarClock,
  Minus,
} from "lucide-react";
import type { TrainingWeekData, DayState } from "@/lib/week-view";
import { formatDuration } from "@/lib/duration";
import { loadTrainingWeek } from "@/app/actions/training-week";

const STATE_META: Record<
  DayState,
  { label: string; Icon: typeof Check; color: string }
> = {
  done: { label: "done", Icon: Check, color: "var(--ds-accent-teal)" },
  missed: { label: "missed", Icon: X, color: "var(--ds-accent-ochre)" },
  planned: {
    label: "planned",
    Icon: CalendarClock,
    color: "var(--ds-text-muted)",
  },
  rest: { label: "rest", Icon: Minus, color: "var(--ds-text-muted)" },
};

export function TrainingWeek({ initial }: { initial: TrainingWeekData }) {
  const [data, setData] = useState(initial);
  const [pending, startTransition] = useTransition();

  const go = (weekStartYmd: string) => {
    startTransition(async () => {
      setData(await loadTrainingWeek(weekStartYmd));
    });
  };

  // Spec confines the prompt to the new-user "no workouts and no plan" case.
  // The plan recurs weekly, so any plan yields planned/missed rows — an
  // all-rest week is exactly that case.
  const isEmptyWeek = data.days.every((d) => d.state === "rest");

  return (
    <div style={{ opacity: pending ? 0.6 : 1 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--ds-space-2)",
          marginBottom: "var(--ds-space-3)",
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
        <span className="ds-mono-note" style={{ minWidth: "9ch" }}>
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
          return (
            <li
              key={d.ymd}
              style={{
                borderBottom: "var(--ds-border-width) solid var(--ds-border)",
                borderLeft: d.isToday
                  ? "var(--ds-border-width) solid var(--ds-primary)"
                  : "var(--ds-border-width) solid transparent",
                paddingLeft: "var(--ds-space-2)",
                paddingTop: "var(--ds-space-2)",
                paddingBottom: "var(--ds-space-2)",
              }}
            >
              <div
                className="ds-mono-note"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--ds-space-2)",
                }}
              >
                <span style={{ minWidth: "6ch", fontWeight: 600 }}>
                  {d.label}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--ds-space-1)",
                    minWidth: "8ch",
                    color: meta.color,
                    fontWeight: 600,
                  }}
                >
                  <Icon size={14} aria-hidden="true" />
                  {meta.label}
                  {d.isToday ? " · today" : ""}
                </span>
                {d.state === "rest" && <span>no plan</span>}
                {(d.state === "missed" || d.state === "planned") && (
                  <span>{d.plannedTitle}</span>
                )}
              </div>

              {d.state === "done" && (
                <div
                  style={{
                    marginTop: "var(--ds-space-2)",
                    marginLeft: "var(--ds-space-5)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--ds-space-3)",
                  }}
                >
                  {d.workouts.map((w) => (
                    <div key={w.id}>
                      <div
                        className="ds-mono-note"
                        style={{
                          color: "var(--ds-text)",
                          fontWeight: 600,
                          marginBottom: "var(--ds-space-1)",
                        }}
                      >
                        {w.title}
                      </div>
                      <table
                        className="ds-mono-note"
                        style={{ borderCollapse: "collapse" }}
                      >
                        <tbody>
                          {w.exercises.map((ex) => (
                            <tr key={ex.name}>
                              <td
                                style={{
                                  whiteSpace: "nowrap",
                                  paddingRight: "var(--ds-space-6)",
                                  paddingTop: "var(--ds-space-1)",
                                  paddingBottom: "var(--ds-space-1)",
                                  verticalAlign: "baseline",
                                }}
                              >
                                {ex.name}
                              </td>
                              {ex.sets.map((s, i) => (
                                <td
                                  key={i}
                                  style={{
                                    width: "11ch",
                                    textAlign: "right",
                                    fontVariantNumeric: "tabular-nums",
                                    paddingLeft: "var(--ds-space-4)",
                                    paddingTop: "var(--ds-space-1)",
                                    paddingBottom: "var(--ds-space-1)",
                                    color: s.isTop
                                      ? "var(--ds-primary)"
                                      : "var(--ds-text-muted)",
                                    fontWeight: s.isTop ? 600 : 400,
                                  }}
                                >
                                  {s.weight}×{s.reps}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}

                  {d.endurance.map((e, i) => (
                    <div className="ds-mono-note" key={`end-${i}`}>
                      {e.activityType}
                      {e.distanceMi === null
                        ? ""
                        : ` ${e.distanceMi.toFixed(1)}mi`}{" "}
                      · {formatDuration(e.durationSec)}
                    </div>
                  ))}
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {isEmptyWeek && (
        <p className="ds-mono-note" style={{ marginTop: "var(--ds-space-3)" }}>
          no workouts this week.{" "}
          <Link href="/log" style={{ color: "var(--ds-link)" }}>
            log a workout
          </Link>
          .
        </p>
      )}
    </div>
  );
}
