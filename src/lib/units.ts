export const APP_TZ = "America/New_York";

/**
 * Parse an <input type="datetime-local"> value ("YYYY-MM-DDTHH:mm" with an
 * optional ":ss") as APP_TZ wall time. Returns null on bad input.
 * Same offset technique as strong-parser's private CSV date parser.
 */
export function parseAppDateTime(s: string): Date | null {
  const m = s
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, y, mo, d, h, mi, se] = m;
  const utcGuess = Date.UTC(
    Number(y),
    Number(mo) - 1,
    Number(d),
    Number(h),
    Number(mi),
    Number(se ?? 0)
  );
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    timeZoneName: "shortOffset",
  })
    .formatToParts(new Date(utcGuess))
    .find((p) => p.type === "timeZoneName")!.value;
  const offsetHrs = Number(tzName.replace("GMT", "")) || 0;
  const t = utcGuess - offsetHrs * 3600_000;
  return Number.isFinite(t) ? new Date(t) : null;
}
