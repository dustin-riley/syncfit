import { ArrowUp, ArrowDown, Check, Pause, Bot } from "lucide-react";

const MAP: Record<
  string,
  { label: string; Icon: typeof Check; modifier: string }
> = {
  proceed_as_planned: {
    label: "proceed as planned",
    Icon: Check,
    modifier: "ai-banner--proceed",
  },
  push_harder: {
    label: "push harder",
    Icon: ArrowUp,
    modifier: "ai-banner--push",
  },
  reduce_intensity: {
    label: "reduce intensity",
    Icon: ArrowDown,
    modifier: "ai-banner--reduce",
  },
  rest: { label: "rest", Icon: Pause, modifier: "ai-banner--rest" },
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
    <div className={`ai-banner ${v.modifier} my-3`}>
      <span className="ai-banner__eyebrow">
        <Bot size={13} aria-hidden="true" /> the model says · {model}
      </span>
      <p className="ai-banner__verdict">
        <v.Icon size={16} aria-hidden="true" />
        {v.label}
      </p>
      <p className="ai-banner__headline">{headline}</p>
      <p className="ai-banner__body">{rationale}</p>
    </div>
  );
}
