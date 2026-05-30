"use client";
import { useMemo, useState } from "react";
import Link from "next/link";
import { sortSeries, type ProgressSort } from "@/lib/progress";
import { ChartCard } from "./chart-card";
import { ChartCardBoundary } from "./chart-card-boundary";

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
        <h1 className="h1">progress</h1>
        <section className="card my-4">
          <p>{error}</p>
        </section>
      </>
    );
  }

  if (sorted.length === 0) {
    return (
      <>
        <h1 className="h1">progress</h1>
        <section className="card my-4">
          <p>
            Nothing to chart yet —{" "}
            <Link href="/import">import a Strong CSV</Link> or{" "}
            <Link href="/log">log a workout</Link>.
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
          gap: "var(--space-3)",
          flexWrap: "wrap",
          marginBottom: "var(--space-4)",
        }}
      >
        <h1 className="h1" style={{ margin: 0 }}>
          progress
        </h1>
        <div style={{ display: "flex", gap: "var(--space-2)" }}>
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
          gap: "var(--space-3)",
        }}
      >
        {sorted.map((s) => (
          <li key={s.exerciseKey}>
            <ChartCardBoundary>
              <ChartCard series={s} metric={metric} />
            </ChartCardBoundary>
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
    <div className="seg" role="group">
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            aria-pressed={active}
            className={active ? "on" : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
