"use client";
import { useState } from "react";
import { savePlanWeek } from "@/app/actions/plan";

const DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];
type Day = { title: string; description: string; modality: string };

export function PlanEditor({ initial }: { initial: Day[] }) {
  const [days, setDays] = useState<Day[]>(initial);
  const set = (i: number, patch: Partial<Day>) =>
    setDays((d) => d.map((x, idx) => (idx === i ? { ...x, ...patch } : x)));
  return (
    <form action={savePlanWeek}>
      {DAYS.map((name, dow) => (
        <div key={dow} className="ds-panel p-4 my-3">
          <strong>{name}</strong>
          <input
            className="border rounded p-2 w-full my-1"
            name={`title-${dow}`}
            placeholder="Title"
            value={days[dow].title}
            onChange={(e) => set(dow, { title: e.target.value })}
          />
          <textarea
            className="border rounded p-2 w-full my-1"
            name={`description-${dow}`}
            placeholder="e.g. Squat 5x5, bench 5x5"
            value={days[dow].description}
            onChange={(e) => set(dow, { description: e.target.value })}
          />
          <select
            className="border rounded p-2 my-1"
            name={`modality-${dow}`}
            value={days[dow].modality}
            onChange={(e) => set(dow, { modality: e.target.value })}
          >
            <option value="strength">Strength</option>
            <option value="endurance">Endurance</option>
            <option value="rest">Rest</option>
          </select>
        </div>
      ))}
      <button className="ds-btn ds-btn-primary" type="submit">
        Save plan
      </button>
    </form>
  );
}
