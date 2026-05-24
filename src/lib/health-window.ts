// Bounds metricDate uploads to [now - 30d, now + 1d]. The +1d tolerates
// timezone skew between iOS and the server without admitting truly
// future-dated metrics.
export function isMetricDateWithinWindow(dateStr: string, now: Date): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const d = new Date(dateStr + "T00:00:00Z").getTime();
  if (Number.isNaN(d)) return false;
  const lo = now.getTime() - 30 * 86_400_000;
  const hi = now.getTime() + 1 * 86_400_000;
  return d >= lo && d <= hi;
}
