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
    <>
      <div
        className="scrim"
        // Deliberate asymmetry: a backdrop click is treated as accidental and
        // ignored while an unapplied proposal is pending; the X button is an
        // explicit dismissal and always closes (chat is ephemeral — spec §6/§11).
        onClick={() => {
          if (!pending) onClose();
        }}
      />
      <div
        ref={panelRef}
        tabIndex={-1}
        className="sheet sheet--large"
        onKeyDown={handlePanelKeyDown}
        role="dialog"
        aria-modal="true"
        aria-label="build plan with ai"
      >
        <span className="sheet-grabber" aria-hidden="true" />
        <div className="sheet-head">
          <h2 className="sheet-title">build with ai</h2>
          <button
            type="button"
            className="sheet-close"
            aria-label="close"
            onClick={onClose}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </div>

        <div className="sheet-body flex flex-col gap-2">
          {messages.length === 0 && (
            <p className="caption">
              tell the coach your goal, schedule, and any constraints. it may
              ask a few questions before proposing a week.
            </p>
          )}
          {messages.map((m, i) => (
            <div
              key={i}
              className={m.role === "user" ? "self-end" : "self-start"}
            >
              <span
                className={m.role === "user" ? "bubble bubble--user" : "bubble"}
              >
                {m.content}
              </span>
            </div>
          ))}
          {busy && <p className="caption">thinking…</p>}
          {error && (
            <p
              className="caption"
              role="alert"
              style={{ color: "var(--error)" }}
            >
              {error}
            </p>
          )}
        </div>

        <div className="sheet-foot flex flex-col gap-2">
          {pending && (
            <button
              type="button"
              className="btn btn--cta"
              onClick={() => onApply(toDays(pending.plan), pending.goal)}
            >
              apply this plan to the editor
            </button>
          )}
          <div className="flex gap-2">
            <input
              className="input flex-1"
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
              className="btn btn--secondary"
              aria-busy={busy}
              disabled={busy}
              onClick={() => void send()}
            >
              send
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
