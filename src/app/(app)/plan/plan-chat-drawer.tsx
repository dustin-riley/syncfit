"use client";
import { useEffect, useState } from "react";
import { proposePlanTurnAction } from "@/app/actions/plan";
import type { ChatMessage, WeeklyPlan } from "@/lib/plan-generator";
import type { Day } from "./plan-editor";
import { X } from "lucide-react";

export function PlanChatDrawer({
  open,
  onClose,
  onApply,
}: {
  open: boolean;
  onClose: () => void;
  onApply: (plan: Day[], proposedGoal: string | null) => void;
}) {
  // Conversation is intentionally ephemeral: unmounting on close (return null)
  // resets all state. The backdrop guard below prevents silently discarding an
  // unapplied proposal; the X button always closes.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    plan: WeeklyPlan;
    goal: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    const next: ChatMessage[] = [...messages, { role: "user", content: text }];
    setMessages(next);
    setDraft("");
    setBusy(true);
    setError(null);
    const res = await proposePlanTurnAction(next);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMessages([
      ...next,
      { role: "assistant", content: res.turn.reply },
    ]);
    if (res.turn.proposedPlan) {
      setPending({
        plan: res.turn.proposedPlan,
        goal: res.turn.proposedGoal,
      });
    }
  }

  // WeeklyPlan day shape == Day shape minus the editor's per-exercise React
  // key id; add ids so the controlled editor can key rows stably.
  const toDays = (plan: WeeklyPlan): Day[] =>
    plan.map((d) => ({
      title: d.title,
      notes: d.notes,
      modality: d.modality,
      exercises: d.exercises.map((e) => ({
        ...e,
        id: crypto.randomUUID(),
      })),
    }));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{ background: "rgba(0,0,0,0.32)" }}
      onClick={() => { if (!pending) onClose(); }}
    >
      <div
        className="ds-panel h-full w-full max-w-md p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="build plan with ai"
      >
        <div className="flex items-center justify-between">
          <h2 className="h4">build with ai</h2>
          <button
            type="button"
            className="ds-btn ds-btn-ghost"
            aria-label="close"
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="text-sm opacity-70">
              tell the coach your goal, schedule, and any constraints. it may
              ask a few questions before proposing a week.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={
                m.role === "user"
                  ? "self-end ds-panel p-2 text-sm"
                  : "self-start p-2 text-sm"
              }
            >
              {m.content}
            </div>
          ))}
          {busy && <p className="text-sm opacity-70">thinking…</p>}
          {error && (
            <p className="text-sm" role="alert">
              {error}
            </p>
          )}
        </div>

        {pending && (
          <button
            type="button"
            className="ds-btn ds-btn-primary"
            onClick={() => onApply(toDays(pending.plan), pending.goal)}
          >
            apply this plan to the editor
          </button>
        )}

        <div className="flex gap-2">
          <input
            className="border rounded p-2 flex-1"
            aria-label="message"
            placeholder="message the coach…"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void send();
              }
            }}
          />
          <button
            type="button"
            className="ds-btn ds-btn-secondary"
            disabled={busy}
            onClick={() => void send()}
          >
            send
          </button>
        </div>
      </div>
    </div>
  );
}
