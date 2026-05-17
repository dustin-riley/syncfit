import { ArrowUp, ArrowDown, Check, Pause } from "lucide-react";

const MAP: Record<
  string,
  { label: string; Icon: typeof Check; token: string }
> = {
  proceed_as_planned: {
    label: "proceed as planned",
    Icon: Check,
    token: "--ds-accent-teal",
  },
  push_harder: { label: "push harder", Icon: ArrowUp, token: "--ds-primary" },
  reduce_intensity: {
    label: "reduce intensity",
    Icon: ArrowDown,
    token: "--ds-accent-ochre",
  },
  rest: { label: "rest", Icon: Pause, token: "--ds-accent-ochre" },
};

export function VerdictBanner({
  verdict,
  headline,
  rationale,
}: {
  verdict: string;
  headline: string;
  rationale: string;
}) {
  const v = MAP[verdict] ?? MAP.proceed_as_planned;
  return (
    <div
      className="ds-panel p-4 my-3"
      style={{ borderInlineStart: `4px solid var(${v.token})` }}
    >
      <p
        className="ds-mono-note"
        style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}
      >
        <v.Icon size={16} aria-hidden="true" />
        {v.label}
      </p>
      <strong>{headline}</strong>
      <p>{rationale}</p>
    </div>
  );
}
