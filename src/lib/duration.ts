// Pure duration helpers. Seconds is the canonical stored unit.
// No DB, no React — unit-tested offline.

/** "h:mm:ss" | "mm:ss" | "ss" -> positive integer seconds, else null. */
export function parseDuration(input: string): number | null {
  const s = input.trim();
  if (!s) return null;
  const parts = s.split(":").map((p) => p.trim());
  if (parts.length > 3) return null;
  if (parts.some((p) => p === "" || !/^\d+$/.test(p))) return null;
  const nums = parts.map(Number);
  let h = 0,
    m = 0,
    sec = 0;
  if (nums.length === 3) [h, m, sec] = nums;
  else if (nums.length === 2) [m, sec] = nums;
  else [sec] = nums;
  if (nums.length > 1 && (m >= 60 || sec >= 60)) return null;
  const total = h * 3600 + m * 60 + sec;
  return total > 0 ? total : null;
}

/** seconds -> "h:mm:ss" (>= 1h) or "m:ss" (< 1h). */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.trunc(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${m}:${pad(sec)}`;
}
