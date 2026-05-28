"use client";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { logWorkout } from "@/app/actions/log";
import { ACTIVITY_TYPES } from "@/lib/manual-log";

type SetRow = { id: string; name: string; weight: string; reps: string };
const emptySet = (): SetRow => ({
  id: crypto.randomUUID(),
  name: "",
  weight: "",
  reps: "",
});

// datetime-local default: now, trimmed to "YYYY-MM-DDTHH:mm".
function nowLocal(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(
    d.getHours()
  )}:${p(d.getMinutes())}`;
}

export default function LogPage() {
  const [kind, setKind] = useState<"strength" | "endurance">("strength");
  const [performedAt, setPerformedAt] = useState(nowLocal());
  const [title, setTitle] = useState("");
  const [rows, setRows] = useState<SetRow[]>([emptySet()]);
  const [activityType, setActivityType] = useState<string>("run");
  const [distance, setDistance] = useState("");
  const [duration, setDuration] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Awaited<ReturnType<typeof logWorkout>> | null>(
    null
  );

  const setRow = (i: number, patch: Partial<SetRow>) =>
    setRows((rs) => rs.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("kind", kind);
      fd.set("performedAt", performedAt);
      if (kind === "strength") {
        fd.set("title", title);
        fd.set("rowCount", String(rows.length));
        rows.forEach((r, i) => {
          fd.set(`set-${i}-name`, r.name);
          fd.set(`set-${i}-weight`, r.weight);
          fd.set(`set-${i}-reps`, r.reps);
        });
      } else {
        fd.set("activityType", activityType);
        fd.set("distance", distance);
        fd.set("duration", duration);
        fd.set("notes", notes);
      }
      setRes(await logWorkout(fd));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="container p-8 max-w-lg">
      <h1 className="h1">log a workout</h1>
      <div className="seg my-3" role="group" aria-label="workout kind">
        <button
          type="button"
          aria-pressed={kind === "strength"}
          className={kind === "strength" ? "on" : undefined}
          onClick={() => setKind("strength")}
        >
          strength
        </button>
        <button
          type="button"
          aria-pressed={kind === "endurance"}
          className={kind === "endurance" ? "on" : undefined}
          onClick={() => setKind("endurance")}
        >
          endurance
        </button>
      </div>

      <form onSubmit={submit}>
        <label className="metric-label">date &amp; time</label>
        <input
          className="input w-full my-1"
          type="datetime-local"
          value={performedAt}
          onChange={(e) => setPerformedAt(e.target.value)}
        />

        {kind === "strength" ? (
          <>
            <input
              className="input w-full my-1"
              placeholder="title (e.g. heavy lower)"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
            {rows.map((r, i) => (
              <div key={r.id} className="flex gap-2 my-1 items-center">
                <input
                  className="input flex-1"
                  aria-label="exercise name"
                  placeholder="exercise"
                  value={r.name}
                  onChange={(e) => setRow(i, { name: e.target.value })}
                />
                <input
                  className="input w-20"
                  type="number"
                  step="any"
                  min={0}
                  aria-label="weight"
                  placeholder="weight"
                  value={r.weight}
                  onChange={(e) => setRow(i, { weight: e.target.value })}
                />
                <input
                  className="input w-16"
                  type="number"
                  min={1}
                  aria-label="reps"
                  placeholder="reps"
                  value={r.reps}
                  onChange={(e) => setRow(i, { reps: e.target.value })}
                />
                <button
                  type="button"
                  className="btn btn--ghost"
                  aria-label="remove set"
                  disabled={rows.length <= 1}
                  onClick={() =>
                    setRows((rs) =>
                      rs.length > 1 ? rs.filter((_, j) => j !== i) : rs
                    )
                  }
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            ))}
            <button
              type="button"
              className="btn btn--secondary my-1"
              onClick={() => setRows((rs) => [...rs, emptySet()])}
            >
              <Plus size={16} aria-hidden="true" /> add set
            </button>
            <p className="caption">
              one row per set; set numbers are assigned per exercise in order.
            </p>
          </>
        ) : (
          <>
            <label className="metric-label">activity</label>
            <select
              className="input my-1"
              value={activityType}
              onChange={(e) => setActivityType(e.target.value)}
            >
              {ACTIVITY_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
            <input
              className="input w-full my-1"
              type="number"
              step="any"
              min={0}
              placeholder="distance (mi, optional)"
              value={distance}
              onChange={(e) => setDistance(e.target.value)}
            />
            <input
              className="input w-full my-1"
              placeholder="duration (h:mm:ss or mm:ss)"
              value={duration}
              onChange={(e) => setDuration(e.target.value)}
            />
            <textarea
              className="input w-full my-1"
              placeholder="notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </>
        )}

        <button
          className="btn btn--cta mt-3"
          type="submit"
          disabled={busy}
          aria-busy={busy}
        >
          {busy ? "saving…" : "log workout"}
        </button>
      </form>

      {res &&
        (res.error || res.fieldErrors ? (
          <p style={{ color: "var(--error)" }}>
            {res.error ??
              Object.values(res.fieldErrors ?? {}).join(" ") ??
              "Could not save."}
          </p>
        ) : (
          <div className="card mt-4 p-4">
            <p>
              {res.added > 0
                ? "logged."
                : "already logged (skipped duplicate)."}
            </p>
          </div>
        ))}
    </main>
  );
}
