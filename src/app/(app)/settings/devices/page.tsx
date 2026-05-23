import { listDevices } from "@/app/actions/devices";
import { DevicesClient } from "./devices-client";

export default async function DevicesPage() {
  const devices = await listDevices();
  return (
    <div
      style={{ padding: "2rem 1.5rem", maxWidth: "40rem", margin: "0 auto" }}
    >
      <h1 className="h1">Devices</h1>
      <p
        style={{
          marginTop: "var(--ds-space-3)",
          color: "var(--ds-text-muted)",
        }}
      >
        Pair the SyncFit iOS companion to share Apple Health context with the
        readiness analysis.
      </p>
      <DevicesClient initialDevices={devices} />
    </div>
  );
}
