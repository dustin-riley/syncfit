"use client";
import {
  LineChart,
  Line,
  ResponsiveContainer,
  Tooltip,
  YAxis,
  XAxis,
} from "recharts";
import type { SerializedSeries } from "./progress-workspace";

type Metric = "topSet" | "e1rm";

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function agoLabel(d: Date, now = new Date()): string {
  const ms = now.getTime() - d.getTime();
  const days = Math.floor(ms / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "1d ago";
  return `${days}d ago`;
}

export function ChartCard({
  series,
  metric,
}: {
  series: Omit<SerializedSeries, "points" | "lastPerformedAt"> & {
    lastPerformedAt: Date;
    points: {
      performedAt: Date;
      topSetWeight: number;
      topSetReps: number;
      e1RM: number;
    }[];
  };
  metric: Metric;
}) {
  const dataKey = metric === "topSet" ? "topSetWeight" : "e1RM";
  const unit = metric === "topSet" ? "lb" : "e1RM";

  const current =
    metric === "topSet" ? series.currentTopSetWeight : series.currentE1RM;
  const first =
    metric === "topSet" ? series.firstTopSetWeight : series.firstE1RM;
  const delta = current - first;

  const chartData = series.points.map((p) => ({
    ts: p.performedAt.getTime(),
    [dataKey]: metric === "topSet" ? p.topSetWeight : p.e1RM,
    date: fmtDate(p.performedAt),
  }));

  const showDelta = series.totalSessions > 1;
  const sessionsLabel =
    series.totalSessions === 1
      ? "1 session"
      : `${series.totalSessions} sessions`;

  return (
    <article className="ds-panel" style={{ padding: "14px 16px" }}>
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 4,
        }}
      >
        <div>
          <span className="h5" style={{ marginRight: 6 }}>
            {series.exerciseName}
          </span>
          {series.equipment && (
            <span className="ds-mono-note">{series.equipment}</span>
          )}
        </div>
        <span className="h5">
          {Math.round(current)} {unit}
        </span>
      </header>

      <p className="ds-mono-note" style={{ margin: "0 0 8px" }}>
        {agoLabel(series.lastPerformedAt)} · {sessionsLabel}
        {showDelta && (
          <>
            {" "}
            · {delta >= 0 ? "+" : ""}
            {Math.round(delta)} {unit} from first session
          </>
        )}
      </p>

      <div style={{ width: "100%", height: 80 }}>
        <ResponsiveContainer>
          <LineChart
            data={chartData}
            margin={{ top: 4, right: 4, bottom: 0, left: 0 }}
          >
            <XAxis dataKey="ts" hide />
            <YAxis dataKey={dataKey} hide domain={["auto", "auto"]} />
            <Tooltip
              cursor={false}
              labelFormatter={() => ""}
              formatter={(
                value: unknown,
                _name: unknown,
                item: { payload?: { date?: string } }
              ) => [
                `${Math.round(Number(value))} ${unit}`,
                item?.payload?.date ?? "",
              ]}
            />
            <Line
              type="monotone"
              dataKey={dataKey}
              stroke="var(--ds-accent, currentColor)"
              strokeWidth={2}
              dot={{ r: 2 }}
              activeDot={{ r: 3 }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </article>
  );
}
