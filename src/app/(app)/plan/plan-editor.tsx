"use client";
import type { Dispatch, SetStateAction } from "react";
import { Plus, X } from "lucide-react";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

export type Ex = {
  id: string;
  name: string;
  targetSets: number;
  targetReps: number;
  targetWeight: number;
};
export type Day = {
  title: string;
  notes: string;
  modality: string;
  exercises: Ex[];
};

export const emptyEx = (): Ex => ({
  id: crypto.randomUUID(),
  name: "",
  targetSets: 3,
  targetReps: 5,
  targetWeight: 0,
});

export function PlanEditor({
  days,
  setDays,
}: {
  days: Day[];
  setDays: Dispatch<SetStateAction<Day[]>>;
}) {
  const setDay = (i: number, patch: Partial<Day>) =>
    setDays((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  const setEx = (di: number, ei: number, patch: Partial<Ex>) =>
    setDays((d) =>
      d.map((x, idx) =>
        idx === di
          ? {
              ...x,
              exercises: x.exercises.map((e, j) =>
                j === ei ? { ...e, ...patch } : e
              ),
            }
          : x
      )
    );
  const addEx = (di: number) =>
    setDays((d) =>
      d.map((x, idx) =>
        idx === di ? { ...x, exercises: [...x.exercises, emptyEx()] } : x
      )
    );
  const removeEx = (di: number, ei: number) =>
    setDays((d) =>
      d.map((x, idx) =>
        idx === di
          ? { ...x, exercises: x.exercises.filter((_, j) => j !== ei) }
          : x
      )
    );

  return (
    <>
      {DAYS.map((name, dow) => (
        <section key={dow} className="ds-panel p-4 my-3">
          <h2 className="h4">{name.toLowerCase()}</h2>
          <input
            type="hidden"
            name={`rowCount-${dow}`}
            value={days[dow].exercises.length}
          />
          <input
            className="border rounded p-2 w-full my-1"
            name={`title-${dow}`}
            placeholder="Title (e.g. heavy lower)"
            value={days[dow].title}
            onChange={(e) => setDay(dow, { title: e.target.value })}
          />
          <select
            className="border rounded p-2 my-1"
            name={`modality-${dow}`}
            value={days[dow].modality}
            onChange={(e) => setDay(dow, { modality: e.target.value })}
          >
            <option value="strength">strength</option>
            <option value="endurance">endurance</option>
            <option value="rest">rest</option>
          </select>

          {days[dow].exercises.length > 0 && (
            <div className="flex gap-2 items-center" aria-hidden="true">
              <span className="grid-label flex-1">exercise</span>
              <span className="grid-label w-16">sets</span>
              <span className="grid-label w-16">reps</span>
              <span className="grid-label w-20">weight</span>
              <span
                className="ds-btn ds-btn-ghost"
                style={{ visibility: "hidden", pointerEvents: "none" }}
              >
                <X size={16} aria-hidden="true" />
              </span>
            </div>
          )}
          {days[dow].exercises.map((ex, ei) => (
            <div key={ex.id} className="flex gap-2 my-1 items-center">
              <input
                className="border rounded p-2 flex-1"
                aria-label="exercise name"
                name={`ex-${dow}-${ei}-name`}
                placeholder="exercise"
                value={ex.name}
                onChange={(e) => setEx(dow, ei, { name: e.target.value })}
              />
              <input
                className="border rounded p-2 w-16"
                type="number"
                min={1}
                aria-label="sets"
                name={`ex-${dow}-${ei}-sets`}
                value={ex.targetSets}
                onChange={(e) =>
                  setEx(dow, ei, { targetSets: Number(e.target.value) })
                }
              />
              <input
                className="border rounded p-2 w-16"
                type="number"
                min={1}
                aria-label="reps"
                name={`ex-${dow}-${ei}-reps`}
                value={ex.targetReps}
                onChange={(e) =>
                  setEx(dow, ei, { targetReps: Number(e.target.value) })
                }
              />
              <input
                className="border rounded p-2 w-20"
                type="number"
                min={0}
                step="any"
                aria-label="weight"
                name={`ex-${dow}-${ei}-weight`}
                value={ex.targetWeight}
                onChange={(e) =>
                  setEx(dow, ei, { targetWeight: Number(e.target.value) })
                }
              />
              <button
                type="button"
                className="ds-btn ds-btn-ghost"
                aria-label="remove exercise"
                onClick={() => removeEx(dow, ei)}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </div>
          ))}
          <textarea
            className="border rounded p-2 w-full my-1"
            name={`notes-${dow}`}
            placeholder="notes the coach should read (e.g. deload, knee cranky)"
            value={days[dow].notes}
            onChange={(e) => setDay(dow, { notes: e.target.value })}
          />
          <button
            type="button"
            className="ds-btn ds-btn-secondary"
            onClick={() => addEx(dow)}
          >
            <Plus size={16} aria-hidden="true" /> add exercise
          </button>
        </section>
      ))}
      <button className="ds-btn ds-btn-primary" type="submit">
        Save plan
      </button>
    </>
  );
}
