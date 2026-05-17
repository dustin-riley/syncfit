import { createHash } from "node:crypto";
import { APP_TZ } from "./units";

export type ParsedSet = { setNumber: number; weight: number; reps: number };
export type ParsedExercise = {
  name: string;
  equipment: string | null;
  sets: ParsedSet[];
};
export type ParsedWorkout = {
  performedAt: Date;
  title: string;
  contentHash: string;
  exercises: ParsedExercise[];
};
export type ParseResult = {
  workouts: ParsedWorkout[];
  warnings: string[];
  error?: string;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") {
      out.push(cur);
      cur = "";
    } else cur += c;
  }
  out.push(cur);
  return out;
}

function parseEtDate(s: string): Date {
  const [d, t] = s.trim().split(" ");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi, se] = t.split(":").map(Number);
  const utcGuess = Date.UTC(y, mo - 1, da, h, mi, se);
  const tzName = new Intl.DateTimeFormat("en-US", {
    timeZone: APP_TZ,
    timeZoneName: "shortOffset",
  })
    .formatToParts(new Date(utcGuess))
    .find((p) => p.type === "timeZoneName")!.value;
  const offsetHrs = Number(tzName.replace("GMT", "")) || 0;
  return new Date(utcGuess - offsetHrs * 3600_000);
}

function splitNameEquipment(raw: string): {
  name: string;
  equipment: string | null;
} {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m
    ? { name: m[1].trim(), equipment: m[2].trim() }
    : { name: raw.trim(), equipment: null };
}

export function parseStrongCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const warnings: string[] = [];
  if (lines.length < 2)
    return { workouts: [], warnings, error: "No data rows found in file." };

  const header = splitCsvLine(lines[0]).map((h) => h.trim());
  const idx = (n: string) => header.indexOf(n);
  const iDate = idx("Date"),
    iName = idx("Workout Name"),
    iEx = idx("Exercise Name"),
    iSet = idx("Set Order"),
    iW = idx("Weight"),
    iR = idx("Reps"),
    iDist = idx("Distance"),
    iSec = idx("Seconds");
  if (iDate < 0 || iEx < 0)
    return { workouts: [], warnings, error: "Unrecognized CSV header." };

  const byDate = new Map<string, { title: string; rows: string[][] }>();
  for (let li = 1; li < lines.length; li++) {
    const c = splitCsvLine(lines[li]);
    const dateStr = c[iDate]?.trim();
    if (!dateStr) {
      warnings.push(`Row ${li + 1}: missing date, skipped.`);
      continue;
    }
    const reps = Number(c[iR]);
    const dist = Number(c[iDist] ?? 0);
    const sec = Number(c[iSec] ?? 0);
    const exRaw = c[iEx]?.trim() ?? "";
    if ((!reps || reps <= 0) && (dist > 0 || sec > 0)) {
      warnings.push(
        `Row ${li + 1}: "${exRaw}" looks like cardio (no reps); skipped — endurance not supported in v1.`
      );
      continue;
    }
    const w = Number(c[iW]);
    const setN = Number(c[iSet]);
    if (
      !Number.isFinite(w) ||
      !Number.isFinite(reps) ||
      !Number.isFinite(setN)
    ) {
      warnings.push(`Row ${li + 1}: non-numeric weight/reps/set; skipped.`);
      continue;
    }
    if (!byDate.has(dateStr))
      byDate.set(dateStr, { title: c[iName]?.trim() || "Workout", rows: [] });
    byDate.get(dateStr)!.rows.push(c);
  }

  const workouts: ParsedWorkout[] = [];
  for (const [dateStr, grp] of byDate) {
    const exMap = new Map<string, ParsedExercise>();
    for (const c of grp.rows) {
      const { name, equipment } = splitNameEquipment(c[iEx].trim());
      const key = `${name}__${equipment ?? ""}`;
      if (!exMap.has(key)) exMap.set(key, { name, equipment, sets: [] });
      exMap.get(key)!.sets.push({
        setNumber: Number(c[iSet]),
        weight: Number(c[iW]),
        reps: Number(c[iR]),
      });
    }
    const exercises = [...exMap.values()];
    const hash = createHash("sha256")
      .update(JSON.stringify({ dateStr, exercises }))
      .digest("hex");
    workouts.push({
      performedAt: parseEtDate(dateStr),
      title: grp.title,
      contentHash: hash,
      exercises,
    });
  }

  if (workouts.length === 0)
    return {
      workouts,
      warnings,
      error: "Couldn't read any workouts from this file.",
    };
  return { workouts, warnings };
}
