# SyncFit MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a multi-user web app where a user logs in, uploads their Strong CSV, enters a weekly plan, and clicks "Analyze Readiness" to get an AI verdict on today's session based on trailing strength load.

**Architecture:** Next.js App Router on Vercel. Pure, independently-tested modules for the Strong CSV parser, trailing-load aggregator, and AI engine. Neon Postgres via Drizzle, Better Auth (email+password) for auth, Vercel AI SDK + Anthropic for the coaching engine. Design system vendored as a copy-first shim (spec §0), migrated to `@dustinriley/design` later as an off-critical-path task.

**Tech Stack:** Next.js 16 (App Router, TypeScript; `create-next-app@latest` resolved to 16.2.6 — accepted deliberately, all stack deps support it), Tailwind CSS v4, shadcn/ui, Drizzle ORM, Neon Postgres, Better Auth, Vercel AI SDK (`ai` + `@ai-sdk/anthropic`), Vitest.

**Decisions locked from spec open items:**
- Auth: **email + password** (no Resend/magic link for the testing phase — spec §10 allows this).
- Model: **`claude-sonnet-4-6`** via `@ai-sdk/anthropic` (swappable in one place).
- Progression view: **deferred to v1.1** (not in this plan; keeps the core loop the critical path — spec §10).

---

## File Structure

```
src/
  db/
    schema.ts            # Drizzle tables: workout, workout_set, planned_session, readiness_analysis
    index.ts             # Neon + Drizzle client singleton
  auth/
    auth.ts              # Better Auth server instance
    client.ts            # Better Auth React client
  lib/
    strong-parser.ts     # PURE: Strong CSV text -> normalized workouts
    trailing-load.ts     # PURE: rows + now + window -> load summary
    ai-engine.ts         # PURE-ish: schema + buildPrompt + analyze (model injected)
    units.ts             # shared constants (APP_TZ)
  app/
    globals.css          # Tailwind v4 + vendored design-system shim (spec §0)
    layout.tsx           # fonts + html shell
    page.tsx             # dashboard (today + feed + Analyze)
    login/page.tsx
    signup/page.tsx
    import/page.tsx
    plan/page.tsx
    api/auth/[...all]/route.ts
    actions/
      import.ts          # server action: parse + persist
      plan.ts            # server action: upsert weekly plan
      analyze.ts         # server action: aggregate + AI + persist
  components/ui/         # shadcn primitives (CLI-generated)
  middleware.ts          # route protection
tests/
  strong-parser.test.ts
  trailing-load.test.ts
  ai-engine.test.ts
  fixtures/strong_sample.csv
drizzle.config.ts
vitest.config.ts
```

---

## Task 1: Project scaffold + design-system shim

**Files:**
- Create: `package.json`, `tsconfig.json`, `next.config.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`, `src/lib/units.ts`, `.env.local`, `.gitignore`

- [ ] **Step 1: Scaffold Next.js**

Run:
```bash
npx create-next-app@latest . --typescript --tailwind --app --src-dir --no-eslint --use-npm --import-alias "@/*" --yes
```
Expected: project files created in cwd (the repo already has `vision.md`/`docs/`; accept overwrite prompts only for scaffold files, keep `docs/` and `vision.md`).

- [ ] **Step 2: Add the design-system shim to `globals.css`**

Replace `src/app/globals.css` with the vendored token block + shadcn HSL bridge + `@theme` radius map (tokens/bridge ONLY — no `.hero`/blobs/`.site-nav`, per spec §0). Source values from `../scorigami/src/app/globals.css` lines 1–260.

```css
@import "tailwindcss";

/* === VENDORED DESIGN-SYSTEM SHIM (spec §0) — replace with @dustinriley/design imports on migration (spec §11) === */
:root {
  --ds-bg:#faf6f0; --ds-surface:#f3ece0; --ds-surface-sunken:#ede4d3; --ds-border:#e0d5c2;
  --ds-text:#1f1a14; --ds-text-muted:#6b5f50;
  --ds-primary:#b8541c; --ds-primary-hover:#9e4615; --ds-primary-pressed:#85390f; --ds-on-primary:#faf6f0;
  --ds-link:#9e4615; --ds-link-hover:#85390f;
  --ds-accent-ochre:#c9922b; --ds-accent-teal:#2e7d7a;
  --ds-success:#5c7a3e; --ds-error:#a8392e; --ds-warning:#c9922b;
  --ds-shadow-sm:0 1px 2px rgba(74,52,28,.06),0 1px 1px rgba(74,52,28,.04);
  --ds-shadow-md:0 4px 8px rgba(74,52,28,.08),0 2px 4px rgba(74,52,28,.05);
  --ds-shadow-lg:0 16px 32px rgba(74,52,28,.12),0 4px 8px rgba(74,52,28,.06);
  --ds-font-display:"Outfit",system-ui,sans-serif;
  --ds-font-body:"DM Sans",system-ui,sans-serif;
  --ds-font-mono:"JetBrains Mono",ui-monospace,monospace;
  --ds-radius-sm:8px; --ds-radius-md:16px; --ds-radius-pill:999px;
  /* shadcn HSL bridge (matches scorigami; will be regenerated drift-free on migration) */
  --background:36 48% 96%; --foreground:33 20% 10%;
  --card:36 48% 96%; --card-foreground:33 20% 10%;
  --primary:22 74% 42%; --primary-foreground:36 48% 96%;
  --secondary:36 40% 91%; --secondary-foreground:33 20% 10%;
  --muted:36 40% 91%; --muted-foreground:33 12% 37%;
  --border:36 30% 82%; --input:36 30% 82%; --ring:22 74% 42%;
  --destructive:4 57% 42%; --destructive-foreground:36 48% 96%;
  --radius:8px;
}
@theme inline {
  --color-background:hsl(var(--background)); --color-foreground:hsl(var(--foreground));
  --color-card:hsl(var(--card)); --color-card-foreground:hsl(var(--card-foreground));
  --color-primary:hsl(var(--primary)); --color-primary-foreground:hsl(var(--primary-foreground));
  --color-secondary:hsl(var(--secondary)); --color-muted:hsl(var(--muted));
  --color-muted-foreground:hsl(var(--muted-foreground));
  --color-border:hsl(var(--border)); --color-input:hsl(var(--input)); --color-ring:hsl(var(--ring));
  --color-destructive:hsl(var(--destructive));
  --radius-sm:8px; --radius-md:8px; --radius-lg:16px; --radius-xl:16px;
  --font-sans:var(--ds-font-body);
}
body { background:var(--ds-bg); color:var(--ds-text); font-family:var(--ds-font-body); }
h1,h2,h3 { font-family:var(--ds-font-display); letter-spacing:-0.02em; }
a { color:var(--ds-link); } a:hover { color:var(--ds-link-hover); }
:focus-visible { outline:2px solid var(--ds-primary); outline-offset:2px; }
/* === END SHIM === */
```

- [ ] **Step 3: Load the 3 Google fonts in `layout.tsx`**

```tsx
import type { Metadata } from "next";
import { Outfit, DM_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Outfit({ subsets: ["latin"], variable: "--ds-font-display" });
const body = DM_Sans({ subsets: ["latin"], variable: "--ds-font-body" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--ds-font-mono" });

export const metadata: Metadata = { title: "SyncFit", description: "Hybrid training readiness" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 4: Add shared constant**

`src/lib/units.ts`:
```ts
export const APP_TZ = "America/New_York";
```

- [ ] **Step 5: Minimal placeholder dashboard**

`src/app/page.tsx`:
```tsx
export default function Home() {
  return <main className="ds-container p-8"><h1>SyncFit</h1></main>;
}
```

- [ ] **Step 6: Verify dev server boots**

Run: `npm run dev` then `curl -s localhost:3000 | grep -q SyncFit && echo OK`
Expected: `OK`. Stop the server.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Next.js app with vendored design-system shim"
```

---

## Task 2: Database client, schema, and migrations

**Files:**
- Create: `src/db/index.ts`, `src/db/schema.ts`, `drizzle.config.ts`
- Modify: `.env.local`, `package.json`

- [ ] **Step 1: Install deps**

Run:
```bash
npm i drizzle-orm @neondatabase/serverless
npm i -D drizzle-kit
```
Expected: installs succeed.

- [ ] **Step 2: Add `DATABASE_URL` to `.env.local`**

Add the Neon connection string:
```
DATABASE_URL=postgresql://...neon.tech/neondb?sslmode=require
```
(User supplies the value from their Neon project.)

- [ ] **Step 3: Write the schema**

`src/db/schema.ts`:
```ts
import { pgTable, text, timestamp, integer, numeric, jsonb, uuid, unique, date } from "drizzle-orm/pg-core";

// Better Auth tables (created by `npx @better-auth/cli generate` in Task 3; placeholder import note only).

export const workout = pgTable("workout", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  performedAt: timestamp("performed_at", { withTimezone: true }).notNull(),
  title: text("title").notNull(),
  source: text("source").notNull().default("strong_csv"),
  contentHash: text("content_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => ({ uniqUserContent: unique().on(t.userId, t.contentHash) }));

export const workoutSet = pgTable("workout_set", {
  id: uuid("id").defaultRandom().primaryKey(),
  workoutId: uuid("workout_id").notNull().references(() => workout.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  exerciseName: text("exercise_name").notNull(),
  equipment: text("equipment"),
  setNumber: integer("set_number").notNull(),
  weight: numeric("weight").notNull(),
  reps: integer("reps").notNull(),
});

export const plannedSession = pgTable("planned_session", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  dayOfWeek: integer("day_of_week").notNull(), // 0=Sun..6=Sat
  title: text("title").notNull().default(""),
  description: text("description").notNull().default(""),
  modality: text("modality").notNull().default("strength"), // strength|endurance|rest
}, (t) => ({ uniqUserDay: unique().on(t.userId, t.dayOfWeek) }));

export const readinessAnalysis = pgTable("readiness_analysis", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull(),
  analysisDate: date("analysis_date").notNull(),
  planSnapshot: jsonb("plan_snapshot").notNull(),
  loadSnapshot: jsonb("load_snapshot").notNull(),
  verdict: text("verdict").notNull(),
  headline: text("headline").notNull(),
  rationale: text("rationale").notNull(),
  modifications: jsonb("modifications").notNull().default([]),
  model: text("model").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
```

- [ ] **Step 4: DB client singleton**

`src/db/index.ts`:
```ts
import { drizzle } from "drizzle-orm/neon-http";
import { neon } from "@neondatabase/serverless";
import * as schema from "./schema";

const sql = neon(process.env.DATABASE_URL!);
export const db = drizzle(sql, { schema });
```

- [ ] **Step 5: drizzle-kit config**

`drizzle.config.ts`:
```ts
import { defineConfig } from "drizzle-kit";
export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: process.env.DATABASE_URL! },
});
```

- [ ] **Step 6: Push schema to Neon**

Run: `npx drizzle-kit push`
Expected: tables `workout`, `workout_set`, `planned_session`, `readiness_analysis` created.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: add Drizzle schema and Neon client"
```

---

## Task 3: Better Auth (email + password) + route protection

**Files:**
- Create: `src/auth/auth.ts`, `src/auth/client.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/login/page.tsx`, `src/app/signup/page.tsx`, `src/middleware.ts`
- Modify: `.env.local`, `src/db/schema.ts` (Better Auth generated tables)

- [ ] **Step 1: Install + env**

Run: `npm i better-auth`
Add to `.env.local`:
```
BETTER_AUTH_SECRET=<openssl rand -base64 32>
BETTER_AUTH_URL=http://localhost:3000
```

- [ ] **Step 2: Auth server instance**

`src/auth/auth.ts`:
```ts
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
});
```

- [ ] **Step 3: Generate + push Better Auth tables**

Run: `npx @better-auth/cli generate --output src/db/auth-schema.ts` then add `export * from "./auth-schema";` to `src/db/schema.ts`, then `npx drizzle-kit push`.
Expected: `user`, `session`, `account`, `verification` tables created.

- [ ] **Step 4: Auth route handler + client**

`src/app/api/auth/[...all]/route.ts`:
```ts
import { auth } from "@/auth/auth";
import { toNextJsHandler } from "better-auth/next-js";
export const { GET, POST } = toNextJsHandler(auth);
```
`src/auth/client.ts`:
```ts
import { createAuthClient } from "better-auth/react";
export const authClient = createAuthClient();
```

- [ ] **Step 5: Login + signup pages**

`src/app/signup/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { authClient } from "@/auth/client";
import { useRouter } from "next/navigation";

export default function Signup() {
  const r = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  return (
    <main className="ds-container p-8 max-w-sm">
      <h1>Create account</h1>
      <form onSubmit={async (e) => { e.preventDefault();
        const { error } = await authClient.signUp.email({ email, password, name: email });
        if (error) setErr(error.message ?? "Signup failed"); else r.push("/"); }}>
        <input className="border rounded p-2 w-full my-2" placeholder="Email" value={email} onChange={(e)=>setEmail(e.target.value)} />
        <input className="border rounded p-2 w-full my-2" type="password" placeholder="Password" value={password} onChange={(e)=>setPassword(e.target.value)} />
        <button className="ds-btn ds-btn-primary" type="submit">Sign up</button>
        {err && <p style={{color:"var(--ds-error)"}}>{err}</p>}
      </form>
    </main>
  );
}
```
`src/app/login/page.tsx`: identical structure but `authClient.signIn.email({ email, password })` and heading "Sign in".

- [ ] **Step 6: Route protection middleware**

`src/middleware.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

export function middleware(req: NextRequest) {
  const session = getSessionCookie(req);
  if (!session) return NextResponse.redirect(new URL("/login", req.url));
  return NextResponse.next();
}
export const config = { matcher: ["/", "/import", "/plan"] };
```

- [ ] **Step 7: Verify**

Run `npm run dev`; `curl -s -o /dev/null -w "%{http_code}" localhost:3000` → expect `307` (redirect to /login). Visit `/signup`, create a user, confirm redirect to `/`. Stop server.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: email+password auth with route protection"
```

---

## Task 4: Strong CSV parser (pure module, TDD)

**Files:**
- Create: `src/lib/strong-parser.ts`, `tests/strong-parser.test.ts`, `tests/fixtures/strong_sample.csv`, `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: Install Vitest + config**

Run: `npm i -D vitest`
`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";
export default defineConfig({ test: { environment: "node" } });
```
Add to `package.json` scripts: `"test": "vitest run"`.

- [ ] **Step 2: Create the fixture from the real export**

`tests/fixtures/strong_sample.csv`:
```
Date,Workout Name,Duration,Exercise Name,Set Order,Weight,Reps,Distance,Seconds,Notes,Workout Notes,RPE
2026-05-13 08:35:00,"Morning Workout",45m,"Bench Press (Barbell)",1,115.0,8.0,0,0.0,"","",
2026-05-13 08:35:00,"Morning Workout",45m,"Bench Press (Barbell)",2,135.0,8.0,0,0.0,,,
2026-05-13 08:35:00,"Morning Workout",45m,"Pull Up",1,0,4.0,0,0.0,,,
2026-05-13 08:35:00,"Morning Workout",45m,"Treadmill",1,0,0,1609,600.0,,,
2026-05-11 07:00:00,"Day 1",30m,"Goblet Squat (Kettlebell)",1,35.0,8.0,0,0.0,,,
```
(Row 4 = a cardio row: must be skipped + warned. Two distinct `Date`s = two workouts.)

- [ ] **Step 3: Write the failing test**

`tests/strong-parser.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseStrongCsv } from "@/lib/strong-parser";

const csv = readFileSync("tests/fixtures/strong_sample.csv", "utf8");

describe("parseStrongCsv", () => {
  it("groups rows by Date into workouts", () => {
    const { workouts } = parseStrongCsv(csv);
    expect(workouts).toHaveLength(2);
    const w = workouts.find(x => x.title === "Morning Workout")!;
    expect(w.performedAt.toISOString()).toBe("2026-05-13T12:35:00.000Z"); // 08:35 ET = 12:35 UTC
  });

  it("splits equipment from exercise name; null when absent", () => {
    const { workouts } = parseStrongCsv(csv);
    const w = workouts.find(x => x.title === "Morning Workout")!;
    const bench = w.exercises.find(e => e.name === "Bench Press")!;
    expect(bench.equipment).toBe("Barbell");
    expect(bench.sets).toEqual([
      { setNumber: 1, weight: 115, reps: 8 },
      { setNumber: 2, weight: 135, reps: 8 },
    ]);
    const pullup = w.exercises.find(e => e.name === "Pull Up")!;
    expect(pullup.equipment).toBeNull();
    expect(pullup.sets[0]).toEqual({ setNumber: 1, weight: 0, reps: 4 });
  });

  it("skips cardio rows (no reps, distance/seconds present) with a warning", () => {
    const { workouts, warnings } = parseStrongCsv(csv);
    const w = workouts.find(x => x.title === "Morning Workout")!;
    expect(w.exercises.find(e => e.name === "Treadmill")).toBeUndefined();
    expect(warnings.some(s => s.includes("Treadmill"))).toBe(true);
  });

  it("computes a stable contentHash per workout", () => {
    const a = parseStrongCsv(csv).workouts[0].contentHash;
    const b = parseStrongCsv(csv).workouts[0].contentHash;
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("errors when zero valid sets parse", () => {
    const r = parseStrongCsv("Date,Workout Name\n");
    expect(r.workouts).toHaveLength(0);
    expect(r.error).toBeTruthy();
  });
});
```

- [ ] **Step 4: Run to verify it fails**

Run: `npm test`
Expected: FAIL — `parseStrongCsv` is not defined.

- [ ] **Step 5: Implement the parser**

`src/lib/strong-parser.ts`:
```ts
import { createHash } from "node:crypto";
import { APP_TZ } from "./units";

export type ParsedSet = { setNumber: number; weight: number; reps: number };
export type ParsedExercise = { name: string; equipment: string | null; sets: ParsedSet[] };
export type ParsedWorkout = {
  performedAt: Date; title: string; contentHash: string; exercises: ParsedExercise[];
};
export type ParseResult = { workouts: ParsedWorkout[]; warnings: string[]; error?: string };

// Minimal RFC4180-ish CSV line splitter (handles quoted commas + "" escapes).
function splitCsvLine(line: string): string[] {
  const out: string[] = []; let cur = ""; let q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) {
      if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (c === '"') q = false;
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ",") { out.push(cur); cur = ""; }
    else cur += c;
  }
  out.push(cur);
  return out;
}

// "2026-05-13 08:35:00" interpreted in APP_TZ -> UTC Date.
function parseEtDate(s: string): Date {
  const [d, t] = s.trim().split(" ");
  const [y, mo, da] = d.split("-").map(Number);
  const [h, mi, se] = t.split(":").map(Number);
  // ET offset: derive via Intl to avoid DST hard-coding.
  const utcGuess = Date.UTC(y, mo - 1, da, h, mi, se);
  const tzName = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, timeZoneName: "shortOffset" })
    .formatToParts(new Date(utcGuess)).find(p => p.type === "timeZoneName")!.value; // e.g. "GMT-4"
  const offsetHrs = Number(tzName.replace("GMT", "")) || 0;
  return new Date(utcGuess - offsetHrs * 3600_000);
}

function splitNameEquipment(raw: string): { name: string; equipment: string | null } {
  const m = raw.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  return m ? { name: m[1].trim(), equipment: m[2].trim() } : { name: raw.trim(), equipment: null };
}

export function parseStrongCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/).filter(l => l.trim().length > 0);
  const warnings: string[] = [];
  if (lines.length < 2) return { workouts: [], warnings, error: "No data rows found in file." };

  const header = splitCsvLine(lines[0]).map(h => h.trim());
  const idx = (n: string) => header.indexOf(n);
  const iDate = idx("Date"), iName = idx("Workout Name"), iEx = idx("Exercise Name"),
    iSet = idx("Set Order"), iW = idx("Weight"), iR = idx("Reps"),
    iDist = idx("Distance"), iSec = idx("Seconds");
  if (iDate < 0 || iEx < 0) return { workouts: [], warnings, error: "Unrecognized CSV header." };

  const byDate = new Map<string, { title: string; rows: string[][] }>();
  for (let li = 1; li < lines.length; li++) {
    const c = splitCsvLine(lines[li]);
    const dateStr = c[iDate]?.trim();
    if (!dateStr) { warnings.push(`Row ${li + 1}: missing date, skipped.`); continue; }
    const reps = Number(c[iR]); const dist = Number(c[iDist] ?? 0); const sec = Number(c[iSec] ?? 0);
    const exRaw = c[iEx]?.trim() ?? "";
    if ((!reps || reps <= 0) && (dist > 0 || sec > 0)) {
      warnings.push(`Row ${li + 1}: "${exRaw}" looks like cardio (no reps); skipped — endurance not supported in v1.`);
      continue;
    }
    const w = Number(c[iW]); const setN = Number(c[iSet]);
    if (!Number.isFinite(w) || !Number.isFinite(reps) || !Number.isFinite(setN)) {
      warnings.push(`Row ${li + 1}: non-numeric weight/reps/set; skipped.`); continue;
    }
    if (!byDate.has(dateStr)) byDate.set(dateStr, { title: c[iName]?.trim() || "Workout", rows: [] });
    byDate.get(dateStr)!.rows.push(c);
  }

  const workouts: ParsedWorkout[] = [];
  for (const [dateStr, grp] of byDate) {
    const exMap = new Map<string, ParsedExercise>();
    for (const c of grp.rows) {
      const { name, equipment } = splitNameEquipment(c[iEx].trim());
      const key = `${name}__${equipment ?? ""}`;
      if (!exMap.has(key)) exMap.set(key, { name, equipment, sets: [] });
      exMap.get(key)!.sets.push({ setNumber: Number(c[iSet]), weight: Number(c[iW]), reps: Number(c[iR]) });
    }
    const exercises = [...exMap.values()];
    const hash = createHash("sha256")
      .update(JSON.stringify({ dateStr, exercises }))
      .digest("hex");
    workouts.push({ performedAt: parseEtDate(dateStr), title: grp.title, contentHash: hash, exercises });
  }

  if (workouts.length === 0) return { workouts, warnings, error: "Couldn't read any workouts from this file." };
  return { workouts, warnings };
}
```

- [ ] **Step 6: Run to verify it passes**

Run: `npm test`
Expected: all `strong-parser` tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: Strong CSV parser (pure, tested)"
```

---

## Task 5: Trailing-load aggregator (pure module, TDD)

**Files:**
- Create: `src/lib/trailing-load.ts`, `tests/trailing-load.test.ts`

- [ ] **Step 1: Write the failing test**

`tests/trailing-load.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { computeTrailingLoad, type SetRow } from "@/lib/trailing-load";

const now = new Date("2026-05-14T12:00:00Z");
const rows: SetRow[] = [
  { exerciseName: "Bench Press", performedAt: new Date("2026-05-13T12:35:00Z"), weight: 115, reps: 8 },
  { exerciseName: "Bench Press", performedAt: new Date("2026-05-13T12:35:00Z"), weight: 135, reps: 8 },
  { exerciseName: "Squat", performedAt: new Date("2026-05-13T12:35:00Z"), weight: 185, reps: 5 },
  { exerciseName: "Old", performedAt: new Date("2026-05-01T12:00:00Z"), weight: 100, reps: 5 }, // outside 72h
];

describe("computeTrailingLoad", () => {
  it("aggregates only sets inside the window", () => {
    const r = computeTrailingLoad(rows, now, 72);
    expect(r.windowHours).toBe(72);
    expect(r.setCount).toBe(3);
    expect(r.sessions).toBe(1);
    expect(r.totalVolume).toBe(115 * 8 + 135 * 8 + 185 * 5); // 2925
  });
  it("breaks volume down per exercise", () => {
    const r = computeTrailingLoad(rows, now, 72);
    expect(r.perExercise).toContainEqual({ exerciseName: "Bench Press", volume: 2000, setCount: 2 });
  });
  it("reports rest days and last session", () => {
    const r = computeTrailingLoad(rows, now, 72);
    expect(r.lastSessionAt?.toISOString()).toBe("2026-05-13T12:35:00.000Z");
    expect(r.restDays).toBe(1); // ~23.4h -> floor 0? assert via helper below
  });
  it("returns empty summary when no rows in window", () => {
    const r = computeTrailingLoad([], now, 72);
    expect(r.setCount).toBe(0);
    expect(r.sessions).toBe(0);
    expect(r.lastSessionAt).toBeNull();
  });
});
```
> Note: `restDays` is `floor((now - lastSessionAt)/86400000)`; for the data above that is `0`. Fix the assertion in Step 1 to `expect(r.restDays).toBe(0);` before running (kept here to show the intended formula).

- [ ] **Step 2: Run to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

`src/lib/trailing-load.ts`:
```ts
export type SetRow = { exerciseName: string; performedAt: Date; weight: number; reps: number };
export type PerExercise = { exerciseName: string; volume: number; setCount: number };
export type TrailingLoad = {
  windowHours: number; sessions: number; setCount: number; totalVolume: number;
  perExercise: PerExercise[]; lastSessionAt: Date | null; restDays: number;
};

export function computeTrailingLoad(rows: SetRow[], now: Date, windowHours: number): TrailingLoad {
  const cutoff = now.getTime() - windowHours * 3600_000;
  const inWin = rows.filter(r => r.performedAt.getTime() >= cutoff && r.performedAt.getTime() <= now.getTime());
  const perMap = new Map<string, PerExercise>();
  let totalVolume = 0;
  for (const r of inWin) {
    const v = r.weight * r.reps; totalVolume += v;
    const e = perMap.get(r.exerciseName) ?? { exerciseName: r.exerciseName, volume: 0, setCount: 0 };
    e.volume += v; e.setCount += 1; perMap.set(r.exerciseName, e);
  }
  const sessionKeys = new Set(inWin.map(r => r.performedAt.toISOString()));
  const lastSessionAt = inWin.length
    ? new Date(Math.max(...inWin.map(r => r.performedAt.getTime()))) : null;
  const restDays = lastSessionAt
    ? Math.floor((now.getTime() - lastSessionAt.getTime()) / 86_400_000) : -1;
  return {
    windowHours, sessions: sessionKeys.size, setCount: inWin.length, totalVolume,
    perExercise: [...perMap.values()], lastSessionAt, restDays: lastSessionAt ? restDays : 0,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test`
Expected: all `trailing-load` tests PASS.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: trailing-load aggregator (pure, tested)"
```

---

## Task 6: AI engine (schema + prompt + analyze, TDD with mocked model)

**Files:**
- Create: `src/lib/ai-engine.ts`, `tests/ai-engine.test.ts`
- Modify: `package.json`

- [ ] **Step 1: Install AI SDK**

Run: `npm i ai @ai-sdk/anthropic zod`

- [ ] **Step 2: Write the failing test**

`tests/ai-engine.test.ts`:
```ts
import { describe, it, expect, vi } from "vitest";
import { buildPrompt, analyzeReadiness, ReadinessSchema, type AnalyzeInput } from "@/lib/ai-engine";

const input: AnalyzeInput = {
  plannedSession: { title: "Heavy Lower", description: "Squat 5x5, RDL 3x8", modality: "strength" },
  trailingLoad: { windowHours: 72, sessions: 1, setCount: 12, totalVolume: 8200,
    perExercise: [{ exerciseName: "Squat", volume: 4625, setCount: 5 }],
    lastSessionAt: new Date("2026-05-13T12:35:00Z"), restDays: 1 },
};

describe("ai-engine", () => {
  it("buildPrompt is deterministic and includes plan + load facts", () => {
    const a = buildPrompt(input); const b = buildPrompt(input);
    expect(a).toBe(b);
    expect(a).toContain("Heavy Lower");
    expect(a).toContain("8200");
    expect(a).toContain("modifications empty"); // v1 instruction
  });

  it("analyzeReadiness validates model output against the schema", async () => {
    const fakeModel = vi.fn().mockResolvedValue({
      verdict: "reduce_intensity", headline: "Ease off today",
      rationale: "High trailing volume with only one rest day.", modifications: [],
    });
    const r = await analyzeReadiness(input, { generate: fakeModel });
    expect(r.verdict).toBe("reduce_intensity");
    expect(ReadinessSchema.safeParse(r).success).toBe(true);
  });

  it("retries once then throws a friendly error on persistent schema failure", async () => {
    const bad = vi.fn().mockResolvedValue({ verdict: "nonsense" });
    await expect(analyzeReadiness(input, { generate: bad })).rejects.toThrow(/couldn't analyze/i);
    expect(bad).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `npm test`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

`src/lib/ai-engine.ts`:
```ts
import { z } from "zod";

export const ReadinessSchema = z.object({
  verdict: z.enum(["push_harder", "proceed_as_planned", "reduce_intensity", "rest"]),
  headline: z.string().min(1),
  rationale: z.string().min(1),
  modifications: z.array(z.object({ exercise: z.string(), change: z.string() })).default([]),
});
export type Readiness = z.infer<typeof ReadinessSchema>;

export type AnalyzeInput = {
  plannedSession: { title: string; description: string; modality: string };
  trailingLoad: {
    windowHours: number; sessions: number; setCount: number; totalVolume: number;
    perExercise: { exerciseName: string; volume: number; setCount: number }[];
    lastSessionAt: Date | null; restDays: number;
  };
};

export function buildPrompt(i: AnalyzeInput): string {
  const tl = i.trailingLoad;
  const per = tl.perExercise.map(e => `${e.exerciseName}: vol ${e.volume} (${e.setCount} sets)`).join("; ");
  return [
    "You are a strength coach. Auto-regulate today's planned session using only the data below.",
    `Planned (${i.plannedSession.modality}): ${i.plannedSession.title} — ${i.plannedSession.description}`,
    `Trailing ${tl.windowHours}h: ${tl.sessions} session(s), ${tl.setCount} sets, total volume ${tl.totalVolume}.`,
    `Per exercise: ${per || "none"}. Rest days since last session: ${tl.restDays}.`,
    "No RPE is available. Base fatigue judgment on volume, frequency and rest only.",
    "v1: leave modifications empty.",
  ].join("\n");
}

type GenerateFn = (prompt: string) => Promise<unknown>;
export const MODEL_ID = "claude-sonnet-4-6";

// Default generate uses Vercel AI SDK; injected in tests.
async function defaultGenerate(prompt: string): Promise<unknown> {
  const { generateObject } = await import("ai");
  const { anthropic } = await import("@ai-sdk/anthropic");
  const { object } = await generateObject({
    model: anthropic(MODEL_ID), schema: ReadinessSchema, prompt,
  });
  return object;
}

export async function analyzeReadiness(
  i: AnalyzeInput, deps: { generate?: GenerateFn } = {},
): Promise<Readiness> {
  const generate = deps.generate ?? defaultGenerate;
  const prompt = buildPrompt(i);
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await generate(prompt);
    const parsed = ReadinessSchema.safeParse(raw);
    if (parsed.success) return parsed.data;
  }
  throw new Error("Sorry, we couldn't analyze your readiness right now. Please try again.");
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test`
Expected: all tests PASS (parser, trailing-load, ai-engine).

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat: AI readiness engine (schema, prompt, analyze)"
```

---

## Task 7: Import server action + upload page

**Files:**
- Create: `src/app/actions/import.ts`, `src/app/import/page.tsx`

- [ ] **Step 1: Server action**

`src/app/actions/import.ts`:
```ts
"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { workout, workoutSet } from "@/db/schema";
import { parseStrongCsv } from "@/lib/strong-parser";

export async function importCsv(formData: FormData): Promise<
  { added: number; skipped: number; warnings: string[]; error?: string }
> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { added: 0, skipped: 0, warnings: [], error: "Not authenticated." };
  const userId = session.user.id;

  const file = formData.get("file") as File | null;
  if (!file) return { added: 0, skipped: 0, warnings: [], error: "No file provided." };
  const text = await file.text();

  const { workouts, warnings, error } = parseStrongCsv(text);
  if (error) return { added: 0, skipped: 0, warnings, error };

  let added = 0, skipped = 0;
  for (const w of workouts) {
    try {
      const [row] = await db.insert(workout).values({
        userId, performedAt: w.performedAt, title: w.title,
        source: "strong_csv", contentHash: w.contentHash,
      }).onConflictDoNothing({ target: [workout.userId, workout.contentHash] }).returning();
      if (!row) { skipped++; continue; }
      const sets = w.exercises.flatMap(e =>
        e.sets.map(s => ({
          workoutId: row.id, userId, exerciseName: e.name, equipment: e.equipment,
          setNumber: s.setNumber, weight: String(s.weight), reps: s.reps,
        })));
      if (sets.length) await db.insert(workoutSet).values(sets);
      added++;
    } catch { skipped++; }
  }
  return { added, skipped, warnings };
}
```

- [ ] **Step 2: Upload page**

`src/app/import/page.tsx`:
```tsx
"use client";
import { useState } from "react";
import { importCsv } from "@/app/actions/import";

export default function ImportPage() {
  const [res, setRes] = useState<Awaited<ReturnType<typeof importCsv>> | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="ds-container p-8 max-w-lg">
      <h1>Import Strong CSV</h1>
      <p style={{ color: "var(--ds-text-muted)" }}>Export from Strong → Settings → Export Data, then upload the CSV.</p>
      <form onSubmit={async (e) => { e.preventDefault(); setBusy(true);
        setRes(await importCsv(new FormData(e.currentTarget))); setBusy(false); }}>
        <input className="my-3 block" type="file" name="file" accept=".csv" required />
        <button className="ds-btn ds-btn-primary" disabled={busy} type="submit">
          {busy ? "Importing…" : "Upload"}</button>
      </form>
      {res && (res.error
        ? <p style={{ color: "var(--ds-error)" }}>{res.error}</p>
        : <div className="ds-panel mt-4 p-4">
            <p>Added {res.added} workout(s), skipped {res.skipped} duplicate(s).</p>
            {res.warnings.length > 0 && <ul className="ds-mono-note">{res.warnings.map((w,i)=><li key={i}>{w}</li>)}</ul>}
          </div>)}
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Run `npm run dev`, sign in, go to `/import`, upload `tests/fixtures/strong_sample.csv`. Expect: "Added 2 workout(s), skipped 0", a warning mentioning Treadmill. Re-upload the same file → "Added 0, skipped 2". Stop server.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: Strong CSV import action and upload page"
```

---

## Task 8: Weekly plan entry

**Files:**
- Create: `src/app/actions/plan.ts`, `src/app/plan/page.tsx`

- [ ] **Step 1: Upsert action**

`src/app/actions/plan.ts`:
```ts
"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { plannedSession } from "@/db/schema";
import { eq, and } from "drizzle-orm";

export async function getPlan() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return [];
  return db.select().from(plannedSession).where(eq(plannedSession.userId, session.user.id));
}

export async function savePlanDay(fd: FormData) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return;
  const userId = session.user.id;
  const dayOfWeek = Number(fd.get("dayOfWeek"));
  const values = {
    userId, dayOfWeek,
    title: String(fd.get("title") ?? ""),
    description: String(fd.get("description") ?? ""),
    modality: String(fd.get("modality") ?? "strength"),
  };
  await db.insert(plannedSession).values(values)
    .onConflictDoUpdate({ target: [plannedSession.userId, plannedSession.dayOfWeek],
      set: { title: values.title, description: values.description, modality: values.modality } });
}
```

- [ ] **Step 2: Plan page (server component + form per day)**

`src/app/plan/page.tsx`:
```tsx
import { getPlan, savePlanDay } from "@/app/actions/plan";

const DAYS = ["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"];

export default async function PlanPage() {
  const plan = await getPlan();
  const byDay = new Map(plan.map(p => [p.dayOfWeek, p]));
  return (
    <main className="ds-container p-8">
      <h1>Weekly plan</h1>
      {DAYS.map((name, dow) => {
        const p = byDay.get(dow);
        return (
          <form key={dow} action={savePlanDay} className="ds-panel p-4 my-3">
            <input type="hidden" name="dayOfWeek" value={dow} />
            <strong>{name}</strong>
            <input className="border rounded p-2 w-full my-1" name="title" placeholder="Title" defaultValue={p?.title ?? ""} />
            <textarea className="border rounded p-2 w-full my-1" name="description" placeholder="e.g. Squat 5x5, bench 5x5" defaultValue={p?.description ?? ""} />
            <select className="border rounded p-2 my-1" name="modality" defaultValue={p?.modality ?? "strength"}>
              <option value="strength">Strength</option>
              <option value="endurance">Endurance</option>
              <option value="rest">Rest</option>
            </select>
            <button className="ds-btn ds-btn-secondary ml-2" type="submit">Save {name}</button>
          </form>
        );
      })}
    </main>
  );
}
```

- [ ] **Step 3: Manual verification**

Run dev, visit `/plan`, fill Wednesday "Heavy Lower" / "Squat 5x5" / strength, Save. Reload — value persists.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat: weekly plan entry"
```

---

## Task 9: Dashboard — today's session, activity feed, Analyze Readiness

**Files:**
- Create: `src/app/actions/analyze.ts`
- Modify: `src/app/page.tsx`

- [ ] **Step 1: Analyze server action**

`src/app/actions/analyze.ts`:
```ts
"use server";
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { plannedSession, workout, workoutSet, readinessAnalysis } from "@/db/schema";
import { eq, and, gte } from "drizzle-orm";
import { computeTrailingLoad, type SetRow } from "@/lib/trailing-load";
import { analyzeReadiness, MODEL_ID } from "@/lib/ai-engine";
import { APP_TZ } from "@/lib/units";

function todayInfo() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: APP_TZ,
    year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(now);
  const date = `${parts.find(p=>p.type==="year")!.value}-${parts.find(p=>p.type==="month")!.value}-${parts.find(p=>p.type==="day")!.value}`;
  const map: Record<string,number> = { Sun:0,Mon:1,Tue:2,Wed:3,Thu:4,Fri:5,Sat:6 };
  return { now, date, dow: map[parts.find(p=>p.type==="weekday")!.value] };
}

export async function analyzeToday() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { error: "Not authenticated." };
  const userId = session.user.id;
  const { now, date, dow } = todayInfo();

  const [planned] = await db.select().from(plannedSession)
    .where(and(eq(plannedSession.userId, userId), eq(plannedSession.dayOfWeek, dow)));
  if (!planned) return { error: "No planned session for today. Add one on the Plan page first." };

  const cutoff = new Date(now.getTime() - 72 * 3600_000);
  const rows = await db
    .select({
      exerciseName: workoutSet.exerciseName,
      performedAt: workout.performedAt,
      weight: workoutSet.weight,
      reps: workoutSet.reps,
    })
    .from(workoutSet)
    .innerJoin(workout, eq(workoutSet.workoutId, workout.id))
    .where(and(eq(workoutSet.userId, userId), gte(workout.performedAt, cutoff)));
  const setRows: SetRow[] = rows.map((r) => ({
    exerciseName: r.exerciseName,
    performedAt: r.performedAt,
    weight: Number(r.weight),
    reps: r.reps,
  }));

  const load = computeTrailingLoad(setRows, now, 72);
  try {
    const result = await analyzeReadiness({
      plannedSession: { title: planned.title, description: planned.description, modality: planned.modality },
      trailingLoad: load,
    });
    await db.insert(readinessAnalysis).values({
      userId, analysisDate: date, planSnapshot: planned, loadSnapshot: load as any,
      verdict: result.verdict, headline: result.headline, rationale: result.rationale,
      modifications: result.modifications as any, model: MODEL_ID,
    });
    return { result };
  } catch (e: any) {
    return { error: e.message ?? "Analysis failed." };
  }
}
```

- [ ] **Step 2: Dashboard page**

`src/app/page.tsx`:
```tsx
import { auth } from "@/auth/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { plannedSession, workout, readinessAnalysis } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { APP_TZ } from "@/lib/units";
import { AnalyzeButton } from "./analyze-button";

const DOW: Record<string, number> = { Sun:0, Mon:1, Tue:2, Wed:3, Thu:4, Fri:5, Sat:6 };

export default async function Home() {
  const session = await auth.api.getSession({ headers: await headers() });
  const userId = session!.user.id;
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: APP_TZ, weekday: "short" })
    .format(new Date());
  const dow = DOW[weekday];
  const [planned] = await db.select().from(plannedSession)
    .where(and(eq(plannedSession.userId, userId), eq(plannedSession.dayOfWeek, dow)));
  const recentWorkouts = await db.select().from(workout)
    .where(eq(workout.userId, userId)).orderBy(desc(workout.performedAt)).limit(10);
  const pastAnalyses = await db.select().from(readinessAnalysis)
    .where(eq(readinessAnalysis.userId, userId)).orderBy(desc(readinessAnalysis.createdAt)).limit(5);

  return (
    <main className="ds-container p-8">
      <h1>Today</h1>
      <section className="ds-panel p-4 my-3">
        <h2>Planned session</h2>
        {planned ? <p>{planned.title} — {planned.description}</p>
                 : <p>No plan set. <a href="/plan">Add one</a>.</p>}
        <AnalyzeButton />
      </section>
      <section className="my-6">
        <h2>Activity feed</h2>
        {recentWorkouts.length === 0
          ? <p>No workouts yet. <a href="/import">Import your Strong CSV</a>.</p>
          : <ul>{recentWorkouts.map(w =>
              <li key={w.id} className="ds-mono-note">{w.performedAt.toDateString()} — {w.title}</li>)}</ul>}
        <h3 className="mt-4">Recent readiness checks</h3>
        <ul>{pastAnalyses.map(a =>
          <li key={a.id} className="ds-panel p-3 my-2"><strong>{a.headline}</strong> — {a.rationale}</li>)}</ul>
      </section>
    </main>
  );
}
```

- [ ] **Step 3: Analyze button (client component, one in-flight)**

`src/app/analyze-button.tsx`:
```tsx
"use client";
import { useState } from "react";
import { analyzeToday } from "@/app/actions/analyze";

export function AnalyzeButton() {
  const [busy, setBusy] = useState(false);
  const [out, setOut] = useState<any>(null);
  return (
    <div className="mt-3">
      <button className="ds-btn ds-btn-primary" disabled={busy}
        onClick={async () => { setBusy(true); setOut(await analyzeToday()); setBusy(false); }}>
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
```

- [ ] **Step 4: Add `ANTHROPIC_API_KEY` to `.env.local`**

```
ANTHROPIC_API_KEY=sk-ant-...
```
(User supplies. `@ai-sdk/anthropic` reads it automatically.)

- [ ] **Step 5: End-to-end verification**

Run dev. With a user that has imported the fixture and set Wednesday's plan: on a Wednesday (or temporarily set the plan to today's weekday), click "Analyze readiness". Expect a verdict card. Reload — past analysis appears in the feed. Click again while pending → button disabled (no double call).

- [ ] **Step 6: Run full test suite**

Run: `npm test`
Expected: all parser/trailing-load/ai-engine tests PASS.

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: dashboard with activity feed and Analyze Readiness"
```

---

## Task 10: Deploy to Vercel + README

**Files:**
- Create: `README.md`
- Modify: `.gitignore` (ensure `.env.local` ignored)

- [ ] **Step 1: README with env + deploy notes**

`README.md`: document required env vars (`DATABASE_URL`, `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY`), `npx drizzle-kit push`, `npm test`, and the design-system migration pointer (spec §11).

- [ ] **Step 2: Deploy**

Run: `npx vercel` (link project), set the four env vars in the Vercel dashboard, set `BETTER_AUTH_URL` to the deployed URL, redeploy.
Expected: a tester can sign up, import, plan, and analyze on the deployed URL.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README and deployment notes"
```

---

## Deferred (not in this plan)

- **Design-system package migration** — spec §11. Scheduled when `@dustinriley/design` publishes; replace the shim block in `globals.css` with the three package imports + visual-parity check. Off critical path.
- **Progression view** — spec §10. Top-set weight charts; v1.1.
- **AI `modifications[]`** — spec §1. Prompt enrichment only; schema/UI already support it.
- **Strava + endurance model** — spec v2 (`endurance_activity` + `activity_split`).

### Post-MVP follow-ups (surfaced in final review — tracked, non-blocking for a few-tester v1)

- **`middleware`→`proxy` rename** — Next.js 16 deprecates the `middleware` file convention (build warns, still works as `ƒ Proxy (Middleware)`). Rename `src/middleware.ts` → the `proxy` convention before a future Next major.
- **Server-side concurrency guard for Analyze** — the one-in-flight guard is client-side only (`analyze-button.tsx`); two tabs/devices could double-bill the LLM. Add a per-user advisory lock or same-day short-circuit in v1.1. (Deliberately not a `unique(userId, analysisDate)` constraint — that would block legitimate same-day re-analysis.)
- **Import loop perf** — `import-persist.ts` awaits per-workout sequentially; a multi-year Strong history (hundreds of workouts) could be slow / approach serverless timeouts. Batch/chunk in v1.1 if large histories appear.
- **Billed-but-lost analysis** — if the `readiness_analysis` insert fails after a successful (billed) LLM call, the user sees a generic error and the result is lost (`readiness.ts` catch). Rare; consider persist-then-return or a more specific error in v1.1.

---

## Self-Review

- **Spec coverage:** §0 shim → Task 1; §2/§2a stack → Tasks 1–6; §3 units → Tasks 4 (parser), 5 (aggregator), 6 (AI), 3 (auth); §4 data model → Task 2; §5 CSV format → Task 4 (fixture mirrors real header incl. cardio row); §6 data flow → Tasks 3,7,8,9; §7 AI schema/prompt → Task 6; §8 error handling → parser errors (T4), dedupe (T7), AI retry/friendly error (T6/T9), auth redirect (T3), empty states (T9); §9 testing → Tasks 4,5,6 TDD; §10 open items → resolved in header (auth=email+pw, model=sonnet-4-6, progression deferred); §11 migration → Deferred section + Task 10 README pointer.
- **Placeholder scan:** no TBD/TODO; every code step has complete code; the one `restDays` assertion ambiguity in Task 5 Step 1 is explicitly resolved in the note.
- **Type consistency:** `ParsedWorkout`/`ParsedExercise`/`ParsedSet` (T4) consumed unchanged in T7; `SetRow`/`TrailingLoad` (T5) consumed in T9; `AnalyzeInput`/`Readiness`/`ReadinessSchema`/`MODEL_ID` (T6) consumed in T9; `analyzeReadiness(input, {generate})` signature consistent T6↔T9 (T9 uses default generate).
