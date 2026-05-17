# SyncFit

SyncFit is a hybrid-athlete training-readiness MVP. Import your strength history from a [Strong](https://www.strong.app/) CSV export, set a lightweight weekly plan, and get an AI-generated "Analyze Readiness" assessment that weighs recent trailing load against the day's planned session.

## Tech stack

- **Next.js 16** (App Router, TypeScript)
- **Tailwind CSS v4**
- **Neon Postgres** + **Drizzle ORM**
- **Better Auth** (email + password)
- **Vercel AI SDK** + **Anthropic** (`claude-sonnet-4-6`)
- **Vitest** (unit + integration)

The design system is currently a vendored shim pending the `@dustinriley/design` package (see spec §11).

## Prerequisites

- **Node.js v22** (developed on v22.22.2)
- A **Neon Postgres** database
- An **Anthropic API key**

## Environment variables

All four are required. Create `.env.local` at the project root. **`.env.local` is gitignored and must never be committed.**

| Name                 | Purpose                                                                                                                                                         | Example / where to get                                                                                                                   |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`       | Neon **pooled** connection string, must include `?sslmode=require`. Used by both the neon-http read client and the neon-serverless Pool (transactional import). | `postgresql://user:pass@ep-xxx-pooler.region.aws.neon.tech/db?sslmode=require` (Neon dashboard → Connection Details → Pooled connection) |
| `BETTER_AUTH_SECRET` | Signing secret for Better Auth sessions.                                                                                                                        | `openssl rand -base64 32`                                                                                                                |
| `BETTER_AUTH_URL`    | App origin used by Better Auth.                                                                                                                                 | `http://localhost:3000` locally; the deployed origin in production                                                                       |
| `ANTHROPIC_API_KEY`  | Auth for the LLM calls; read automatically by `@ai-sdk/anthropic`.                                                                                              | `sk-ant-...` from [console.anthropic.com](https://console.anthropic.com)                                                                 |

## Local setup

```bash
npm install

# Create .env.local with the four variables above, then apply the schema:
node --env-file=.env.local ./node_modules/.bin/drizzle-kit push

npm run dev
```

Open http://localhost:3000.

## Testing

Two suites:

- **`npm test`** — fast, offline unit tests (parser, trailing-load, AI engine; the LLM is mocked). 13 tests.
- **`npm run test:integration`** — live integration tests against the real `DATABASE_URL` (import / plan / readiness). The LLM is injected/mocked, **not** called for real. This suite is excluded from `npm test` by `vitest.config.ts` and runs via `vitest.integration.config.ts`; it self-cleans its synthetic `itest-*` rows after each run.

## Architecture notes

- **Pure, testable modules:** `src/lib/strong-parser.ts`, `src/lib/trailing-load.ts`, `src/lib/ai-engine.ts`, `src/lib/readiness.ts`, `src/lib/import-persist.ts`, `src/lib/plan-store.ts`.
- **Two Drizzle clients:** `src/db/index.ts` (neon-http, used for reads) and `src/db/tx.ts` (neon-serverless `Pool`, used only for the atomic multi-statement CSV import).
- **Auth:** `src/proxy.ts` (Next 16 `proxy` file convention) is a presence-only UX gate. Server actions re-validate the session via Better Auth and scope every query by `userId`.
- **Timezone:** a single fixed timezone, `America/New_York` (spec §0).

## Vercel deploy runbook

The deploy is interactive and tied to your Vercel account plus the Neon↔Vercel integration. Run these steps yourself:

1. **Push & merge.** Push the `syncfit-mvp` branch, open a PR, and merge to `main` (repo: `github.com/dustin-riley/syncfit`).
2. **Import the project into Vercel** (Vercel dashboard → Add New → Project), or run `npx vercel link` from the project root.
3. **Neon↔Vercel integration env var.** Connect the Neon integration and ensure the injected DB variable is named **exactly** `DATABASE_URL`. The integration's "Custom Prefix" must **not** produce `STORAGE_URL` — the app reads `process.env.DATABASE_URL`. Mark it **Sensitive**. Environments: **Production + Preview** (not Development).
4. **Set the other env vars in Vercel:** `BETTER_AUTH_SECRET`, `ANTHROPIC_API_KEY`, and `BETTER_AUTH_URL`. `BETTER_AUTH_URL` **must equal the exact deployed origin** — scheme + host only, no trailing slash and no path (e.g. `https://syncfit.vercel.app`). If it does not match the origin the browser sends, Better Auth rejects sign-up/sign-in with `403 "Invalid origin"`. After the first deploy, update `BETTER_AUTH_URL` to the real assigned production domain and redeploy. Preview deploys are already covered by the built-in `https://*.vercel.app` trusted origin, so they work without per-deploy config.
5. **Ensure the production DB has the schema.** Run `node --env-file=.env.local ./node_modules/.bin/drizzle-kit push` once against the production `DATABASE_URL`. (If the Neon integration shares the same database you already pushed to, this is already done.)
6. **Deploy** with `npx vercel --prod` (or via Git push). **Smoke test:** visit `/` → you should be redirected to `/login`; sign up; go to `/import` and upload a Strong CSV; go to `/plan` and set today's session; on the dashboard click **"Analyze readiness"**.

## Deferred / not in v1

The following are intentionally out of scope for v1 (see `docs/superpowers/specs/2026-05-16-syncfit-mvp-design.md` and the implementation plan):

- **Design-system package migration** — vendored shim now; migrate to `@dustinriley/design` later (spec §11).
- **Progression charts** — deferred to v1.1 (spec §10).
- **AI `modifications[]` population** — the field exists but is unpopulated in v1; deferred to v1.1 (spec §1).
- **Strava integration + endurance model** — deferred to v2 (spec, v2 section).

## Production build

`npm run build` compiles cleanly (TypeScript checks pass). Route summary:

```
Route (app)
┌ ƒ /                      (Dynamic — server-rendered, Better Auth session via headers)
├ ○ /_not-found
├ ƒ /api/auth/[...all]     (Dynamic — Better Auth handler)
├ ○ /import
├ ○ /login
├ ƒ /plan                  (Dynamic — server-rendered, Better Auth session via headers)
└ ○ /signup

ƒ Proxy (Middleware)

○  (Static)   prerendered as static content
ƒ  (Dynamic)  server-rendered on demand
```

The route gate (`src/proxy.ts`) is reported as `ƒ Proxy (Middleware)` above.
