"use client";
import { useState } from "react";
import { savePlanWeek } from "@/app/actions/plan";
import { PlanEditor, type Day } from "./plan-editor";
import { PlanChatDrawer } from "./plan-chat-drawer";

export function PlanWorkspace({
  initialDays,
  initialGoal,
}: {
  initialDays: Day[];
  initialGoal: string;
}) {
  const [days, setDays] = useState<Day[]>(initialDays);
  const [goal, setGoal] = useState(initialGoal);
  const [drawerOpen, setDrawerOpen] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3 my-3">
        <input
          className="border rounded p-2 flex-1"
          aria-label="training goal"
          name="goal-display"
          placeholder="training goal (e.g. lose fat, keep my squat)"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          form="plan-form"
        />
        <button
          type="button"
          className="ds-btn ds-btn-secondary"
          onClick={() => setDrawerOpen(true)}
        >
          build with ai
        </button>
      </div>

      <form action={savePlanWeek} id="plan-form">
        {/* goal travels with the existing Save submit */}
        <input type="hidden" name="goal" value={goal} />
        <PlanEditor days={days} setDays={setDays} />
      </form>

      <PlanChatDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onApply={(plan: Day[], proposedGoal?: string) => {
          setDays(plan);
          if (proposedGoal) setGoal(proposedGoal);
          setDrawerOpen(false);
        }}
      />
    </>
  );
}
