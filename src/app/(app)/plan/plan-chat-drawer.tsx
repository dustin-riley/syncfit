"use client";
import { useEffect, useRef, useState } from "react";
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
  // The drawer stays mounted; the parent only toggles `open` and `if (!open)
  // return null` below just hides it — it does NOT reset state, so messages /
  // draft / pending persist across close+reopen. The backdrop guard below
  // prevents silently discarding an unapplied proposal; the X button always
  // closes.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<{
    plan: WeeklyPlan;
    goal: string | null;
  } | null>(null);

  // Refs for focus management: panelRef targets the dialog panel so we can
  // query its focusable descendants; restoreFocusRef holds whatever element had
  // focus before the drawer opened so we can return focus on close.
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  // Focus management: move focus into the drawer on open; restore the
  // previously focused element on close. The cleanup runs on every close
  // because `open` is an effect dependency (the component is not unmounted —
  // the parent only toggles `open`); the ref persists across renders.
  useEffect(() => {
    if (!open) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    // Use rAF so the panel is fully painted before we query its children.
    const frame = requestAnimationFrame(() => {
      const focusable = panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable) {
        focusable.focus();
      } else {
        panelRef.current?.focus();
      }
    });
    return () => {
      cancelAnimationFrame(frame);
      restoreFocusRef.current?.focus?.();
    };
  }, [open]);

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
    setMessages([...next, { role: "assistant", content: res.turn.reply }]);
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

  // Returns all keyboard-focusable elements inside the panel at call-time.
  function getPanelFocusable(): HTMLElement[] {
    if (!panelRef.current) return [];
    return Array.from(
      panelRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
    );
  }

  function handlePanelKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Tab") return;
    const focusable = getPanelFocusable();
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end"
      style={{
        background: "color-mix(in srgb, var(--ds-text) 32%, transparent)",
      }}
      // Deliberate asymmetry: a backdrop click is treated as accidental, so it
      // is ignored while an unapplied proposal is pending; the X button is an
      // explicit dismissal and always closes (chat is ephemeral by design —
      // spec §6/§11).
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="ds-panel h-full w-full max-w-md p-4 flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handlePanelKeyDown}
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
