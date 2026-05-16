import { getPlan, savePlanDay } from "@/app/actions/plan";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export default async function PlanPage() {
  const plan = await getPlan();
  const byDay = new Map(plan.map(p => [p.dayOfWeek, p]));
  return (
    <main className="ds-container p-8">
      <h1>Weekly plan</h1>
      {DAYS.map((name, dow) => {
        const p = byDay.get(dow);
        return (
          <form key={dow} action={savePlanDay} className="ds-panel p-4 my-3">
            <input type="hidden" name="dayOfWeek" value={dow} />
            <strong>{name}</strong>
            <input className="border rounded p-2 w-full my-1" name="title" placeholder="Title" defaultValue={p?.title ?? ""} />
            <textarea className="border rounded p-2 w-full my-1" name="description" placeholder="e.g. Squat 5x5, bench 5x5" defaultValue={p?.description ?? ""} />
            <select className="border rounded p-2 my-1" name="modality" defaultValue={p?.modality ?? "strength"}>
              <option value="strength">Strength</option>
              <option value="endurance">Endurance</option>
              <option value="rest">Rest</option>
            </select>
            <button className="ds-btn ds-btn-secondary ml-2" type="submit">Save {name}</button>
          </form>
        );
      })}
    </main>
  );
}
