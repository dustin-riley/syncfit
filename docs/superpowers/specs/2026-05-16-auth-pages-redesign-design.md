# Auth Pages Redesign — Login & Signup

**Date:** 2026-05-16
**Branch:** `feature/auth-pages-redesign` (stacked on `feature/design-system`)
**Status:** Approved (brainstorming) — pending spec review

## Context

`src/app/login/page.tsx` and `src/app/signup/page.tsx` are near-identical bare
MVP forms: a `max-w-sm` container, an `<h1>`, two placeholder-only inputs with
raw `border rounded p-2` (no `<label>`, no `type=email`, no `autocomplete`, no
loading state), a primary button, an inline error, and a cross-link. No SyncFit
identity, no shared layout/component, accessibility gaps. Now that
`@dustin-riley/design` is live (PR #3), this redesigns both into a polished,
accessible, on-brand pair.

**Scope:** visual redesign **plus UX/accessibility polish**. No new backend or
auth features (no password reset, no email verification, no OAuth) — that is
explicitly out of scope.

## Decisions

1. **Architecture:** route group `(auth)` + a shared `AuthForm` client
   component driven by a `mode` prop, and a shared `Field` component. The
   `(auth)/layout.tsx` server component owns the shared visual shell. Chosen
   over duplicated pages (B) and a single dynamic component (C) because the two
   flows are ~90% identical; one form unit means the UX-polish items live in
   exactly one place.
2. **Layout:** single centered card on the warm background (chosen over a
   split brand panel and a chrome-less minimal form).
3. **Identity copy:** wordmark "SyncFit"; tagline "Train smart. Progress on
   purpose." (sentence-case, no emoji, per the design system rules).
4. **Forms are app-built furniture.** `@dustin-riley/design` ships no
   form-input primitive by design (DESIGN.md: nav/footer/hero/grids/forms are
   per-project). `Field` is styled from the package's token-backed Tailwind
   bridge utilities — never hard-coded hex/px.
5. **Add `lucide-react`** (user-approved) for the show-password icon (`Eye` /
   `EyeOff`). Pinned with a caret like the other runtime deps (it is not
   design-surface, so the exact-pin rule that applies to `@dustin-riley/design`
   does not apply here). This is the project's icon library going forward.

## Architecture & Files

```
src/app/(auth)/
  layout.tsx          # server component: warm bg, centered .ds-panel card,
                       #   "SyncFit" wordmark + tagline; renders children
  login/page.tsx      # ~3 lines: renders <AuthForm mode="signin" />
  signup/page.tsx     # ~3 lines: renders <AuthForm mode="signup" />
  auth-form.tsx       # "use client": all form state/logic, both modes
  field.tsx           # "use client": presentational labeled input
```

- `(auth)` is a Next.js route group: **URLs remain `/login` and `/signup`**.
  Better Auth client calls and `src/proxy.ts` (which gates `/`, `/import`,
  `/plan` — not the auth routes) are unchanged; both routes stay public.
- The old `src/app/login/` and `src/app/signup/` directories are **deleted**
  (their pages move into the route group).
- No changes to `src/auth/*`, `src/proxy.ts`, the DB schema, or any server
  action.

## Visual Design

- **Shell (`layout.tsx`):** full-viewport flex-centered on `--ds-bg`. Card is
  a `.ds-panel` (16px radius from the design system) at a comfortable reading
  width with generous internal padding and `--ds-shadow-md`.
- **Identity:** "SyncFit" in `--ds-font-display`; tagline "Train smart.
  Progress on purpose." in `--ds-text-muted` at caption scale.
- **Field:** real `<label>` above a full-width input. Token-backed utilities
  only — `bg-card`, `border border-input`, `rounded-md` (→ 8px via the
  package `@theme` map); focus uses the design system focus ring (`ring-ring`);
  error state adds a `--ds-error`-derived border plus the message.
- **Primary action:** existing `.ds-btn ds-btn-primary`, full-width, shows a
  pending label while submitting.
- **Cross-link:** `--ds-link`-colored text link below the button.

## `AuthForm` Behavior & UX Polish

- Controlled `email` / `password` state (project rule: auth/plan form fields
  stay controlled — see CLAUDE.md).
- `mode` prop drives all differences: Better Auth call (`signIn.email` vs
  `signUp.email` with `name: email` — unchanged from current behavior; MVP spec
  defers a real name field), heading, button label, cross-link target/text,
  and the signup-only password hint.
- **Submit lifecycle:** a `submitting` state disables the button and relabels
  it ("Signing in…" / "Creating account…") for the duration, preventing
  double-submit. Success → `router.push("/")` (unchanged). Error → inline
  message, field values preserved, controls re-enabled.
- **Show-password toggle:** an icon button inside the password field toggling
  input `type` between `password` and `text`, using Lucide `Eye` / `EyeOff`
  (icons are allowed by the design rules). It is a real `<button type=
"button">` with `aria-pressed` reflecting state and an `aria-label`
  ("Show password" / "Hide password"); the icon is `aria-hidden`. Adds the
  `lucide-react` dependency (user-approved).
- **Signup password hint:** persistent helper text under the password field —
  "At least 8 characters." (matches Better Auth's default minimum). Purely
  informational; not live validation. The server remains the source of truth.

## Accessibility

- A real `<label htmlFor>` for every input.
- `type="email"` + `autocomplete="email"`; password `autocomplete=
"current-password"` (signin) / `"new-password"` (signup); `required`.
- Error container `role="alert"` + `aria-live="polite"`, linked to inputs via
  `aria-describedby`. Error state is text/icon + border, never color alone
  (design rule: color is never the only state signal).
- Visible focus ring (design system `:focus-visible` token), logical tab
  order, submit on Enter.

## Error Handling

- When Better Auth returns `{ error }`, show `error.message` if present;
  otherwise a friendly fallback ("Couldn't sign in. Check your email and
  password." / "Couldn't create your account."). Never surface raw error
  objects or status codes.
- A thrown exception / network failure (not a returned `{error}`) is caught
  and shown as the same friendly fallback; the button is re-enabled.
- No client-side format gatekeeping beyond `required` + `type=email`; the
  password hint is informational only.

## Testing & Verification

- `npm test` covers offline pure modules only. These are client components
  making Better Auth network calls, so — like the current login/signup pages —
  they are intentionally **outside the unit-test harness**. No new unit tests.
- Gate before done: `npm run build`, `npx tsc --noEmit`, `npm run lint`,
  `npm run format:check` all green.
- Manual smoke: load `/login` and `/signup`; submit invalid → friendly error +
  controls re-enable; submit valid → redirect to `/`; show-password toggle;
  keyboard tab/focus order and Enter-to-submit.
- `npm run test:integration` not required: no server-action / DB / auth-config
  changes.

## Out of Scope (YAGNI)

- Password reset / forgot-password, email verification, OAuth/social login,
  magic links.
- A real signup name field (MVP spec defers it; `name: email` is retained).
- Rate-limit / lockout UI, captcha.
- Restyling any other page (dashboard/landing redesign is a separate
  spec → plan cycle).
- Client-side password-strength meter or live email validation.

## Risks

- **Route-group move:** placing pages under `(auth)/` must not change the
  `/login` / `/signup` URLs or break the `proxy.ts` public-route assumption.
  Verified by the build + manual smoke (both routes load unauthenticated and
  redirect to `/` on success).
- **No form primitive in the package:** `Field` styling is bespoke; it must
  use only token-backed bridge utilities (`bg-card`, `border-input`,
  `ring-ring`, `rounded-md`) so it stays consistent and migration-safe — no
  hard-coded hex/px (enforced by the design rules + lint/manual review).
