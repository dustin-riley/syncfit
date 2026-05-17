# SyncFit Navigation — Design Spec

**Date:** 2026-05-17
**Status:** Implemented (2026-05-17)
**Relationship to prior specs:** Additive. The MVP spec
(`2026-05-16-syncfit-mvp-design.md`) and the dashboard/auth/design-system specs
all stand unchanged. This spec only adds shared in-app navigation; it changes no
data model, AI I/O, auth model, or page logic. The single-timezone, no-RPE,
Strong-CSV-only, per-action-scoping decisions are untouched.

## 1. Goal & Scope

The three signed-in pages — Today/dashboard (`/`), Weekly plan (`/plan`), and
Import (`/import`) — are currently isolated: there is no way to move between
them in the UI and no sign-out anywhere. This adds one shared navigation
component across the signed-in app and a sign-out path.

### In scope

- An `(app)` route group containing the three signed-in pages and a shared
  layout that renders the nav.
- A `SiteNav` client component: brand wordmark, three nav links with active
  state, and a user-menu dropdown containing the signed-in email and sign-out.
- Responsive behavior down to ~360px (the M1 treatment, below).
- Sign-out via Better Auth's client.

### Out of scope (deferred, not oversights)

- Settings/account page (the dropdown reserves a visual slot only — no link,
  no page).
- M2 "bottom-dock on mobile" treatment. Recorded here as the chosen fallback
  if M1 feels cramped in practice; not built now.
- Nav on the `(auth)` login/signup pages — deliberately nav-free.
- Any nav on a future unauthenticated marketing/landing surface (none exists).
- Breadcrumbs, secondary/in-page nav, command palette.

## 2. Layout & component architecture

**Route group.** `src/app/page.tsx`, `src/app/plan/`, and `src/app/import/`
move into `src/app/(app)/`. Route groups do not affect URLs, so `/`, `/plan`,
and `/import` are unchanged. The `(auth)` group and the root layout
(`src/app/layout.tsx`) are untouched, so login/signup remain nav-free.

**`src/app/(app)/layout.tsx`** — server component. Resolves the session via
`auth.api.getSession({ headers: await headers() })`; if absent,
`redirect("/login")`. Renders `<SiteNav email={session.user.email} />` above
`{children}`. The individual pages keep their own `getSession` calls — they
still need `session.user.id` for scoped queries, and per the CLAUDE.md
per-action scoping rule the security boundary stays in each
page/action, not the layout. The layout's session fetch exists only to supply
the nav's email and to centralize the redirect; the duplicate `getSession` per
request is accepted for the MVP (no shared session context introduced).

**`src/app/(app)/site-nav.tsx`** — `"use client"`. Needs `usePathname()` for
active state, local state for the dropdown, and `authClient.signOut()`. Props:
`{ email: string }`.

## 3. Visual & responsive spec (direction B / M1)

- A centered **pill** at the top of the page, rendered inside the content
  container (not a full-bleed bar), `position: sticky` to the top on scroll.
- Contents left → right: **SyncFit** wordmark linking to `/` (Today); the three
  links — "Today" (`/`), "Weekly plan" (`/plan`), "Import" (`/import`); then the
  user-menu trigger (a circular avatar showing the email's first initial).
- **Active link** = filled inset pill (surface fill + border, primary-colored
  text). Match logic: exact match for `/`; prefix match (`startsWith`) for
  `/plan` and `/import`.
- **Tokens only.** Built from `.ds-*` primitives and `--ds-*` tokens:
  `--ds-radius-pill` for the pill and avatar, `--ds-radius-sm` for the dropdown,
  the package's warm shadow, and surface/border/text/primary tokens. The avatar
  uses `--ds-accent-ochre`. No hex or px literals anywhere; nothing added to
  `globals.css` (site furniture is built per-project from primitives, per the
  design-system rules). Sentence-case copy ("Weekly plan", "Import",
  "Sign out"); no emoji.
- **M1 responsive (one row everywhere).** The pill stays centered and
  top-anchored at all widths. Below a small breakpoint: link labels shorten
  ("Weekly plan" → "Plan") via two spans toggled with Tailwind responsive
  visibility classes (no JS, no width measurement), and the inter-item
  gap/padding tighten. The email text beside the avatar is hidden below `sm`
  (avatar only); it returns at `sm` and up, truncated.

## 4. User menu & sign-out behavior

- Trigger: a `<button>` with `aria-haspopup="menu"` and `aria-expanded`
  reflecting open state, showing the avatar (and the truncated email at `sm`+).
- Dropdown panel: a `.ds-panel` (`--ds-radius-sm`, warm shadow) anchored to the
  trigger, containing — (1) the full signed-in email as a non-interactive
  header row, (2) a **Sign out** button. One empty slot is reserved visually
  for a future settings link; it renders nothing now.
- Dismissal: closes on outside pointer-down, on `Escape`, and on selecting an
  item. Focus returns to the trigger on close.
- **Sign out:** `await authClient.signOut()`, then a hard navigation —
  `window.location.assign("/login")` — so all server components re-evaluate
  against the cleared session cookie (a client `router.push` would not
  guarantee the server tree re-renders unauthenticated). Approved during
  brainstorming.

## 5. Error handling & edge cases

- No session at the layout → `redirect("/login")` (same behavior the pages
  already have; no user-visible nav is ever rendered unauthenticated).
- `authClient.signOut()` rejects (network) → keep the menu open, surface a
  brief inline error in the dropdown; the user can retry. No silent failure,
  no partial-signed-out limbo (the hard navigation only runs after the
  promise resolves).
- Unknown/empty email (should not happen with email+password auth) → avatar
  falls back to a neutral initial; nav still renders.

## 6. Testing & verification

No pure business logic is added and the project has **no React component test
harness** (`npm test` is offline pure-module unit tests only — DB/network/LLM
excluded). Adding component-test infrastructure for one nav is out of scope
(YAGNI). Verification is the standard gate suite, all green:

- `npx tsc --noEmit`, `npm run lint`, `npm run format:check`, `npm run build`.
- `npm test` stays green (unaffected; no lib changes).
- Manual checks: nav renders on `/`, `/plan`, `/import`; absent on `/login`
  and `/signup`; active state correct on each route; dropdown opens/closes via
  click, `Escape`, and outside-click; sign-out clears the session and lands on
  `/login` with no back-button re-entry; the pill holds one row and stays
  legible at ~360px.

The integration suite (`npm run test:integration`) is not required: no
server-action or DB path changes.

## 7. Docs to update on implementation

- This spec is the decision record. The implementation plan goes to
  `docs/superpowers/plans/2026-05-17-navigation.md`.
- `CLAUDE.md` "Architecture" gets a short note that signed-in pages live under
  the `(app)` route group with a shared layout-rendered `SiteNav`, and that
  `(auth)` stays nav-free — so the route-group move is not later "fixed" by
  mistake.
