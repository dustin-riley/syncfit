import { ArrowUp, ArrowDown, Check, Pause, Cpu } from "lucide-react";

const MAP: Record<
  string,
  { label: string; Icon: typeof Check; token: string }
> = {
  proceed_as_planned: {
    label: "proceed as planned",
    Icon: Check,
    token: "--ds-success",
  },
  push_harder: { label: "push harder", Icon: ArrowUp, token: "--ds-primary" },
  reduce_intensity: {
    label: "reduce intensity",
    Icon: ArrowDown,
    token: "--ds-warning",
  },
  rest: { label: "rest", Icon: Pause, token: "--ds-text-muted" },
};

export function VerdictBanner({
  verdict,
  headline,
  rationale,
  model,
}: {
  verdict: string;
  headline: string;
  rationale: string;
  model: string;
}) {
  const v = MAP[verdict] ?? MAP.proceed_as_planned;
  return (
    <div className="ds-panel ds-ai p-4 my-3">
      <span className="ds-ai-mark">
        <Cpu size={13} aria-hidden="true" /> the model says · {model}
      </span>
      <p
        className="flex items-center gap-2"
        style={{ color: `var(${v.token})`, marginTop: "var(--ds-space-2)" }}
      >
        <v.Icon size={16} aria-hidden="true" />
        <strong>{v.label}</strong>
      </p>
      <strong>{headline}</strong>
      <p>{rationale}</p>
    </div>
  );
}
