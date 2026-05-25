"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { sortSeries, type ProgressSort } from "@/lib/progress";
import { ChartCard } from "./chart-card";

type SerializedPoint = {
  performedAt: string; // ISO
  day: string;
  topSetWeight: number;
  topSetReps: number;
  e1RM: number;
};

export type SerializedSeries = {
  exerciseKey: string;
  exerciseName: string;
  equipment: string;
  points: SerializedPoint[];
  totalSessions: number;
  lastPerformedAt: string;
  firstTopSetWeight: number;
  currentTopSetWeight: number;
  firstE1RM: number;
  currentE1RM: number;
};

type Metric = "topSet" | "e1rm";

export function ProgressWorkspace({
  initialSeries,
  error,
}: {
  initialSeries: SerializedSeries[];
  error?: string;
}) {
  const [metric, setMetric] = useState<Metric>("topSet");
  const [sort, setSort] = useState<ProgressSort>("recent");

  // Rehydrate Date instances once. sortSeries is generic so the hydrated
  // shape passes through cleanly without casts.
  const sorted = useMemo(() => {
    const hydrated = initialSeries.map((s) => ({
      ...s,
      lastPerformedAt: new Date(s.lastPerformedAt),
      points: s.points.map((p) => ({
        ...p,
        performedAt: new Date(p.performedAt),
      })),
    }));
    return sortSeries(hydrated, sort);
  }, [initialSeries, sort]);

  if (error) {
    return (
      <>
        <h1 className="h2">Progress</h1>
        <section className="ds-panel p-4 my-4">
          <p>{error}</p>
        </section>
      </>
    );
  }

  if (sorted.length === 0) {
    return (
      <>
        <h1 className="h2">Progress</h1>
        <section className="ds-panel p-4 my-4">
          <p>
            Nothing to chart yet —{" "}
            <Link href="/import" style={{ color: "var(--ds-link)" }}>
              import a Strong CSV
            </Link>{" "}
            or{" "}
            <Link href="/log" style={{ color: "var(--ds-link)" }}>
              log a workout
            </Link>
            .
          </p>
        </section>
      </>
    );
  }

  return (
    <>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "var(--ds-space-3)",
          flexWrap: "wrap",
          marginBottom: "var(--ds-space-4)",
        }}
      >
        <h1 className="h2" style={{ margin: 0 }}>
          Progress
        </h1>
        <div style={{ display: "flex", gap: "var(--ds-space-2)" }}>
          <PillToggle
            options={[
              { value: "topSet", label: "Top set" },
              { value: "e1rm", label: "e1RM" },
            ]}
            value={metric}
            onChange={setMetric}
          />
          <PillToggle
            options={[
              { value: "recent", label: "Recent" },
              { value: "frequent", label: "Frequent" },
              { value: "az", label: "A–Z" },
            ]}
            value={sort}
            onChange={setSort}
          />
        </div>
      </header>

      <ul
        style={{
          listStyle: "none",
          padding: 0,
          margin: 0,
          display: "flex",
          flexDirection: "column",
          gap: "var(--ds-space-3)",
        }}
      >
        {sorted.map((s) => (
          <li key={s.exerciseKey}>
            <ChartCard series={s} metric={metric} />
          </li>
        ))}
      </ul>
    </>
  );
}

function PillToggle<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div
      className="ds-panel"
      style={{
        display: "inline-flex",
        padding: 3,
        gap: 2,
        borderRadius: 999,
      }}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={active ? "ds-btn ds-btn-primary" : "ds-btn ds-btn-ghost"}
            style={{
              borderRadius: 999,
              padding: "4px 10px",
              fontSize: 12,
              lineHeight: 1,
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
