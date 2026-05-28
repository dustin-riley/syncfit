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
  done: { label: "done", Icon: Check, color: "var(--accent-teal)" },
  missed: { label: "missed", Icon: X, color: "var(--accent-ochre)" },
  planned: {
    label: "planned",
    Icon: CalendarClock,
    color: "var(--text-muted)",
  },
  rest: { label: "rest", Icon: Minus, color: "var(--text-muted)" },
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
          gap: "var(--space-2)",
          marginBottom: "var(--space-3)",
        }}
      >
        <button
          className="btn btn--ghost"
          onClick={() => go(data.prevWeekYmd)}
          disabled={pending}
          aria-label="previous week"
        >
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <span className="caption" style={{ minWidth: "9ch" }}>
          {data.label}
        </span>
        <button
          className="btn btn--ghost"
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
                borderBottom: "1px solid var(--border)",
                borderLeft: d.isToday
                  ? "1px solid var(--primary)"
                  : "1px solid transparent",
                paddingLeft: "var(--space-2)",
                paddingTop: "var(--space-2)",
                paddingBottom: "var(--space-2)",
              }}
            >
              <div
                className="caption"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "var(--space-2)",
                }}
              >
                <span style={{ minWidth: "6ch", fontWeight: 600 }}>
                  {d.label}
                </span>
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "var(--space-1)",
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
                    marginTop: "var(--space-2)",
                    marginLeft: "var(--space-5)",
                    display: "flex",
                    flexDirection: "column",
                    gap: "var(--space-3)",
                  }}
                >
                  {d.workouts.map((w) => (
                    <div key={w.id}>
                      <div
                        className="caption"
                        style={{
                          color: "var(--text)",
                          fontWeight: 600,
                          marginBottom: "var(--space-1)",
                        }}
                      >
                        {w.title}
                      </div>
                      <table
                        className="caption"
                        style={{ borderCollapse: "collapse" }}
                      >
                        <tbody>
                          {w.exercises.map((ex) => (
                            <tr key={ex.name}>
                              <td
                                style={{
                                  whiteSpace: "nowrap",
                                  paddingRight: "var(--space-6)",
                                  paddingTop: "var(--space-1)",
                                  paddingBottom: "var(--space-1)",
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
                                    paddingLeft: "var(--space-4)",
                                    paddingTop: "var(--space-1)",
                                    paddingBottom: "var(--space-1)",
                                    color: s.isTop
                                      ? "var(--primary)"
                                      : "var(--text-muted)",
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
                    <div className="caption" key={`end-${i}`}>
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
        <p className="caption" style={{ marginTop: "var(--space-3)" }}>
          no workouts this week.{" "}
          <Link href="/log" style={{ color: "var(--link)" }}>
            log a workout
          </Link>
          .
        </p>
      )}
    </div>
  );
}
