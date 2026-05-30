import { listDevices } from "@/app/actions/devices";
import { DevicesClient } from "./devices-client";

export default async function DevicesPage() {
  const devices = await listDevices();
  return (
    <main className="container py-8">
      <h1 className="h1">devices</h1>
      <p
        style={{
          marginTop: "var(--space-3)",
          color: "var(--text-muted)",
        }}
      >
        Pair the SyncFit iOS companion to share Apple Health context with the
        readiness analysis.
      </p>
      <DevicesClient initialDevices={devices} />
    </main>
  );
}
