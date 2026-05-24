"use client";
import { useState } from "react";
import { importCsv } from "@/app/actions/import";

export default function ImportPage() {
  const [res, setRes] = useState<Awaited<ReturnType<typeof importCsv>> | null>(
    null
  );
  const [busy, setBusy] = useState(false);
  return (
    <main className="ds-container p-8 max-w-lg">
      <h1 className="h1">Import Strong CSV</h1>
      <p style={{ color: "var(--ds-text-muted)" }}>
        Export from Strong → Settings → Export Data, then upload the CSV.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            setRes(await importCsv(new FormData(e.currentTarget)));
          } finally {
            setBusy(false);
          }
        }}
      >
        <input
          className="my-3 block"
          type="file"
          name="file"
          accept=".csv"
          required
        />
        <button className="ds-btn ds-btn-primary" disabled={busy} type="submit">
          {busy ? "Importing…" : "Upload"}
        </button>
      </form>
      {res &&
        (res.error ? (
          <p style={{ color: "var(--ds-error)" }}>{res.error}</p>
        ) : (
          <div className="ds-panel mt-4 p-4">
            <p>
              Added {res.added} workout(s), skipped {res.skipped} duplicate(s).
            </p>
            {res.warnings.length > 0 && (
              <ul className="ds-mono-note">
                {res.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            )}
          </div>
        ))}
    </main>
  );
}
