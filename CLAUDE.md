# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

SyncFit — a hybrid-athlete training-readiness MVP. A user signs in, uploads their Strong app CSV export, enters a recurring weekly plan, and clicks "Analyze readiness" to get an AI verdict on today's session based on trailing 72h strength load. Next.js 16 (App Router, TypeScript) + Tailwind v4, Neon Postgres via Drizzle, Better Auth (email+password), Vercel AI SDK + Anthropic, deployed on Vercel.

The authoritative scope/architecture decisions and deferred work live in `docs/superpowers/specs/2026-05-16-syncfit-mvp-design.md` and the task plan in `docs/superpowers/plans/2026-05-16-syncfit-mvp.md`. Read the spec before changing behavior — many "missing" things (endurance/Strava, progression charts, AI `modifications[]`, per-user timezone, RPE) are deliberately deferred there, not oversights.

## Commands

- `npm run dev` / `npm run build` / `npm run start` — Next dev/prod. `next dev`/`next build` auto-load `.env.local`.
- `npm test` — offline unit tests (Vitest). Pure modules only; the LLM is mocked; no DB/network. Must stay green and offline.
- Single unit test: `npx vitest run tests/strong-parser.test.ts` or filter `npx vitest run -t "computeTrailingLoad"`.
- `npm run test:integration` — live integration tests against the real `DATABASE_URL` (import/plan/readiness server-action paths; LLM still injected/mocked). Excluded from `npm test` via `vitest.config.ts`; collected by `vitest.integration.config.ts`. Self-cleaning: creates and deletes synthetic `itest-*` users; safe to re-run; idempotent.
- `npx tsc --noEmit` — type check (no test runner needed).
- DB schema apply/generate: `node --env-file=.env.local ./node_modules/.bin/drizzle-kit push` (apply to live Neon) / `... drizzle-kit generate` (offline SQL). Better Auth tables are regenerated with `npx @better-auth/cli@latest generate --config src/auth/auth.ts --output src/db/auth-schema.ts` then pushed.

**CLI tools do not auto-load `.env.local`** (only `next` does). Any drizzle-kit / integration-test / one-off DB script must be run via `node --env-file=.env.local …` or it will throw "DATABASE_URL env var is required" (intentional guard in `src/db/index.ts`).

## Environment

`.env.local` (gitignored, never commit; CLI needs `--env-file` to see it). `.env.example` documents the four required vars: `DATABASE_URL` (Neon **pooled** string incl. `?sslmode=require`), `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, `ANTHROPIC_API_KEY`. In production `BETTER_AUTH_URL` MUST equal the exact deployed origin (scheme+host, no trailing slash) or Better Auth's origin check returns 403 on signup; Vercel preview origins are covered by the `https://*.vercel.app` entry in `src/auth/trusted-origins.ts`.

## Architecture (the parts that span files)

**Thin server actions over pure libs.** `src/app/actions/*.ts` are intentionally thin `"use server"` wrappers: they resolve the session, scope by `userId`, and delegate to a testable module in `src/lib/`. Business logic lives in `src/lib/` (`strong-parser`, `trailing-load`, `ai-engine`, `readiness`, `import-persist`, `plan-store`) so it can be unit/integration tested without HTTP/auth mocking. Put new logic in a lib, not in an action or component.

**Two Drizzle clients — use the right one.** `src/db/index.ts` (`db`, neon-http driver) for normal single-statement reads/writes. `src/db/tx.ts` (`txDb`, neon-serverless `Pool`+`ws`) is used **only** by `src/lib/import-persist.ts` because the Strong-CSV import must wrap each workout + its sets in one interactive transaction, and the neon-http driver cannot do interactive transactions. Don't introduce `txDb` for single-statement work.

**Auth & scoping.** Better Auth email+password. `src/middleware.ts` is a presence-only cookie gate (UX, not the security boundary) over `/`, `/import/:path*`, `/plan/:path*`. Every server action independently calls `auth.api.getSession` and filters all queries by `session.user.id`; unauthenticated server actions `redirect("/login")`. App tables are in `src/db/schema.ts`; Better Auth tables are generated into `src/db/auth-schema.ts` and re-exported from `schema.ts`. Trusted origins are computed in `src/auth/trusted-origins.ts` (localhost wildcard is dev-only by design).

**Analyze Readiness flow.** middleware → `/` page or `analyze-button` → `actions/analyze.ts` → `src/lib/readiness.ts` `runReadinessAnalysis({userId, now?, generate?})`: resolves today's weekday in `APP_TZ`, loads that day's `planned_session`, joins `workout_set ⋈ workout` within 72h, `computeTrailingLoad`, then `analyzeReadiness`. The `now` and `generate` params are injected only by tests (prod uses real clock + real Anthropic). `readiness_analysis` is persisted **only on success** — an AI failure returns `{error}` and writes nothing (spec §8). `src/lib/ai-engine.ts` dynamically imports `ai`/`@ai-sdk/anthropic` inside `defaultGenerate` so unit tests stay offline; it retries once then throws a friendly `/couldn't analyze/i` error.

**Strong CSV import.** `src/lib/strong-parser.ts` is pure: groups rows by `Date` into workouts, splits `(Equipment)` from exercise name, skips cardio rows (no reps + distance/seconds) with warnings, and computes a sha256 `contentHash` per workout. Dedup is enforced by the `unique(userId, contentHash)` constraint + `onConflictDoNothing`; a real DB failure surfaces as a warning, never a false "skipped duplicate".

## Non-obvious gotchas

- **Plan editor must stay controlled.** `src/app/plan/plan-editor.tsx` is a controlled client component on purpose: React 19 calls native `HTMLFormElement.reset()` after any `<form action={serverAction}>` submit, so uncontrolled (`defaultValue`) fields visually revert to their defaults after Save. Controlled inputs (value+onChange from `useState`) are the fix. Don't convert plan/auth form fields back to uncontrolled `defaultValue`, and don't rename the `title-/description-/modality-{0..6}` field names (the bulk `savePlanWeek` action reads them by name).
- **Single timezone.** All date math uses `APP_TZ` (`America/New_York`) from `src/lib/units.ts`. No per-user timezone (deliberate).
- **Design system is a vendored shim on this branch.** `src/app/globals.css` carries an inline `--ds-*` token + shadcn-bridge shim (spec §0). Adoption of the published `@dustin-riley/design` package is a separate branch/PR, not here. Per the design rules: reference `--ds-*` tokens / `.ds-*` classes, never hard-code hex/px; 3 radii (8/16/999) and warm shadows only; sentence-case UI copy; no emoji.
- **Next 16, not 15** (accepted; recorded in the plan). Production build emits a known non-blocking `middleware`→`proxy` deprecation warning.

## Workflow notes

Tests-and-build must be green before a branch is considered done (`npm test` + `npx tsc --noEmit` + `npm run build`; `npm run test:integration` when touching server-action/DB paths). Commits are scoped and frequent. The repo uses the superpowers spec→plan→implement workflow; specs/plans in `docs/superpowers/` are the decision record — update them when scope changes rather than silently diverging.
