"use client";
import { useEffect, useState } from "react";
import {
  createPairingCode,
  listDevices,
  pollPairingRedeemed,
  revokeDevice,
} from "@/app/actions/devices";

type DeviceRow = Awaited<ReturnType<typeof listDevices>>[number];

export function DevicesClient({
  initialDevices,
}: {
  initialDevices: DeviceRow[];
}) {
  const [devices, setDevices] = useState(initialDevices);
  const [code, setCode] = useState<{ code: string; expiresAt: string } | null>(
    null
  );
  const [polling, setPolling] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onGenerate() {
    if (generating) return;
    setGenerating(true);
    setError(null);
    setCode(null);
    try {
      const result = await createPairingCode();
      if ("error" in result) {
        setError(result.error);
      } else {
        setCode(result);
        setPolling(true);
      }
    } finally {
      setGenerating(false);
    }
  }

  async function onRevoke(id: string) {
    if (revokingId) return;
    const prev = devices;
    setRevokingId(id);
    setError(null);
    // Optimistic remove
    setDevices((d) => d.filter((x) => x.id !== id));
    try {
      const result = await revokeDevice(id);
      if ("error" in result) {
        // Roll back
        setDevices(prev);
        setError(result.error);
      }
    } catch (e) {
      // Network / unexpected — roll back
      setDevices(prev);
      setError(
        e instanceof Error ? e.message : "Couldn't revoke device. Try again."
      );
    } finally {
      setRevokingId(null);
    }
  }

  useEffect(() => {
    if (!polling || !code) return;
    const since = new Date().toISOString();
    const t = setInterval(async () => {
      const result = await pollPairingRedeemed(since);
      if ("error" in result) {
        setPolling(false);
        setError(result.error);
        return;
      }
      if (result.redeemed) {
        setCode(null);
        setPolling(false);
        setDevices(await listDevices());
      }
    }, 2000);
    const stop = setTimeout(
      () => {
        clearInterval(t);
        setPolling(false);
      },
      11 * 60 * 1000
    ); // a touch past code TTL
    return () => {
      clearInterval(t);
      clearTimeout(stop);
    };
  }, [polling, code]);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-5)",
        marginTop: "var(--space-5)",
      }}
    >
      {error && (
        <div
          role="alert"
          className="card"
          style={{
            padding: "var(--space-3) var(--space-4)",
            color: "var(--error)",
          }}
        >
          {error}
        </div>
      )}

      <section className="card" style={{ padding: "var(--space-4)" }}>
        <h2 className="h2">Pair iOS app</h2>
        {code ? (
          <div
            style={{
              marginTop: "var(--space-3)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            <p style={{ color: "var(--text-muted)" }}>
              Enter this code in the SyncFit iOS app:
            </p>
            <p
              className="display"
              style={{
                fontFamily: "var(--font-mono)",
                letterSpacing: "0.2em",
                margin: 0,
              }}
            >
              {code.code}
            </p>
            <p className="caption" style={{ margin: 0 }}>
              Code expires at {new Date(code.expiresAt).toLocaleTimeString()}.
            </p>
          </div>
        ) : (
          <div style={{ marginTop: "var(--space-3)" }}>
            <button
              className="btn btn--cta"
              onClick={onGenerate}
              disabled={generating}
              aria-busy={generating}
            >
              {generating ? "Generating…" : "Generate pairing code"}
            </button>
          </div>
        )}
      </section>

      <section className="card" style={{ padding: "var(--space-4)" }}>
        <h2 className="h2">Paired devices</h2>
        {devices.length === 0 ? (
          <p className="caption" style={{ marginTop: "var(--space-3)" }}>
            No devices paired yet.
          </p>
        ) : (
          <ul
            style={{
              listStyle: "none",
              padding: 0,
              margin: 0,
              marginTop: "var(--space-3)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            {devices.map((d) => (
              <li
                key={d.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "var(--space-3)",
                  padding: "var(--space-2) 0",
                  borderBottom: "1px solid var(--border)",
                }}
              >
                <span>
                  {d.deviceName} <span className="caption">({d.platform})</span>
                </span>
                <button
                  className="btn btn--danger"
                  onClick={() => onRevoke(d.id)}
                  disabled={revokingId === d.id}
                  aria-busy={revokingId === d.id}
                >
                  {revokingId === d.id ? "Revoking…" : "Revoke"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
