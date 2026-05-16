"use client";
import { useState } from "react";
import { analyzeToday } from "@/app/actions/analyze";

export function AnalyzeButton() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<Awaited<ReturnType<typeof analyzeToday>> | null>(null);
  return (
    <div className="mt-3">
      <button className="ds-btn ds-btn-primary" disabled={busy}
        onClick={async () => { setBusy(true);
          try { setOut(await analyzeToday()); } finally { setBusy(false); } }}>
        {busy ? "Analyzing…" : "Analyze readiness"}
      </button>
      {out?.error && <p style={{ color: "var(--ds-error)" }}>{out.error}</p>}
      {out?.result && (
        <div className="ds-panel p-4 mt-3">
          <p className="ds-mono-note">{out.result.verdict.replace(/_/g, " ")}</p>
          <strong>{out.result.headline}</strong>
          <p>{out.result.rationale}</p>
        </div>
      )}
    </div>
  );
}
