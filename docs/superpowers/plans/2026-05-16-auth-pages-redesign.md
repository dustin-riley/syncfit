# Auth Pages Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. For the visual component tasks (3, 4, 5, 6) implementers should also invoke the **frontend-design** skill — but stay strictly within this plan's specified markup/classes; frontend-design informs polish, it does not license scope expansion or hard-coded hex/px.

**Goal:** Replace the bare MVP login/signup pages with a polished, accessible, on-brand pair built on `@dustin-riley/design`, sharing one layout shell and one `AuthForm`.

**Architecture:** A Next.js `(auth)` route group (URLs stay `/login`, `/signup`). `(auth)/layout.tsx` is a server component owning the centered card + "SyncFit" wordmark/tagline. `AuthForm` is one client component switched by a `mode` prop; `Field` is a reusable token-styled labeled input. No backend/auth-config/schema changes.

**Tech Stack:** Next.js 16 App Router, React 19, Better Auth client, `@dustin-riley/design` (token-backed Tailwind bridge utilities), `lucide-react` (icons).

**Spec:** `docs/superpowers/specs/2026-05-16-auth-pages-redesign-design.md`

**Testing note:** These are client components making Better Auth network calls. Per the spec they are intentionally outside the offline `npm test` unit harness (consistent with the pages they replace). Per-task verification is `npx tsc --noEmit` + `npm run lint`; a full build + manual smoke is the final gate (Task 7). There are no unit-test steps by design — do not add a test runner or mock Better Auth.

**Design-rule guardrails (apply to every task):** reference `--ds-*` tokens / `.ds-*` classes / token-backed bridge utilities (`bg-card`, `text-foreground`, `border-input`, `border-destructive`, `text-destructive`, `text-muted-foreground`, `ring-ring`); radii via `rounded-md` (→8px) / `rounded-lg` (→16px) / `.ds-panel`; **never** a literal hex color or a literal `px` in CSS/`style`. Sentence case, no emoji.

---

## Task 1: Add the `lucide-react` dependency

**Files:**

- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Install (caret-pinned, per spec Decision 5)**

Run:

```bash
npm i lucide-react
```

Expected: install succeeds; `package.json` `dependencies` gains a caret-ranged `"lucide-react": "^1.x.x"` entry.

- [ ] **Step 2: Verify it is a caret range under dependencies**

Run:

```bash
node -e "const d=require('./package.json').dependencies['lucide-react']; if(!d||!d.startsWith('^')){console.error('BAD: '+d);process.exit(1)} console.log('ok '+d)"
```

Expected: prints `ok ^1.x.x` (some caret version). If it errors, the dependency is missing or not caret-ranged — re-run Step 1.

- [ ] **Step 3: Verify the icons resolve**

Run:

```bash
node -e "import('lucide-react').then(m=>console.log(typeof m.Eye, typeof m.EyeOff))"
```

Expected: prints `function function` (or `object object` depending on build) — both named exports exist, no resolution error.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add lucide-react for UI icons"
```

---

## Task 2: Create the `Field` component

**Files:**

- Create: `src/app/(auth)/field.tsx`

`Field` is a generic controlled labeled input: a real `<label htmlFor>`, a full-width token-styled input, an optional persistent `hint` (wired via `aria-describedby`), and an optional `trailing` slot (used for the show-password button). It owns no business logic.

- [ ] **Step 1: Write the component**

Create `src/app/(auth)/field.tsx` with exactly:

```tsx
"use client";

import { useId, type ReactNode } from "react";

export function Field({
  label,
  name,
  value,
  onChange,
  type = "text",
  autoComplete,
  required,
  error,
  hint,
  describedById,
  trailing,
}: {
  label: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  required?: boolean;
  /** Visual error state (red border + aria-invalid). */
  error?: boolean;
  /** Persistent helper text shown under the input. */
  hint?: string;
  /** Extra element id to merge into aria-describedby (e.g. the form error). */
  describedById?: string;
  /** Optional control rendered inside the input box (e.g. show-password). */
  trailing?: ReactNode;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const describedBy =
    [hintId, describedById].filter(Boolean).join(" ") || undefined;
  return (
    <div className="mb-4">
      <label htmlFor={id} className="ds-caption mb-1 block">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          name={name}
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          required={required}
          aria-invalid={error || undefined}
          aria-describedby={describedBy}
          className={`w-full rounded-md bg-card px-3 py-2 text-foreground border ${
            trailing ? "pr-11" : ""
          } ${error ? "border-destructive" : "border-input"}`}
        />
        {trailing ? (
          <div className="absolute inset-y-0 right-0 flex items-center pr-2">
            {trailing}
          </div>
        ) : null}
      </div>
      {hint ? (
        <p id={hintId} className="ds-caption mt-1 text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}
```

Notes for the implementer: the global `:focus-visible` ring ships in the package's `tokens.css`, so the input gets a visible focus ring with no extra classes. All colors/radii here are token-backed bridge utilities — do not substitute hex or literal px.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 errors (the pre-existing `no-explicit-any` warning in `src/lib/readiness.ts` may remain; no new errors/warnings from this file).

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/field.tsx"
git commit -m "feat: add Field component for auth forms"
```

---

## Task 3: Create the `AuthForm` component

**Files:**

- Create: `src/app/(auth)/auth-form.tsx`

One client component, switched by `mode`. Encapsulates state, the Better Auth call, submit lifecycle (disabled + relabel), the show-password toggle (Lucide `Eye`/`EyeOff`), errors, the signup-only password hint, and the cross-link. The mode label is an `<h2>` (the layout owns the page `<h1>` wordmark).

- [ ] **Step 1: Write the component**

Create `src/app/(auth)/auth-form.tsx` with exactly:

```tsx
"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { authClient } from "@/auth/client";
import { Field } from "./field";

type Mode = "signin" | "signup";

const COPY: Record<
  Mode,
  {
    heading: string;
    submit: string;
    submitting: string;
    fallback: string;
    passwordAutoComplete: "current-password" | "new-password";
    hint?: string;
    link: { href: string; text: string };
  }
> = {
  signin: {
    heading: "Sign in",
    submit: "Sign in",
    submitting: "Signing in…",
    fallback: "Couldn't sign in. Check your email and password.",
    passwordAutoComplete: "current-password",
    link: { href: "/signup", text: "Create an account" },
  },
  signup: {
    heading: "Create account",
    submit: "Create account",
    submitting: "Creating account…",
    fallback: "Couldn't create your account.",
    passwordAutoComplete: "new-password",
    hint: "At least 8 characters.",
    link: { href: "/login", text: "Have an account? Sign in" },
  },
};

export function AuthForm({ mode }: { mode: Mode }) {
  const c = COPY[mode];
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const errorId = "auth-error";
  const describedById = error ? errorId : undefined;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const { error: authError } =
        mode === "signin"
          ? await authClient.signIn.email({ email, password })
          : await authClient.signUp.email({ email, password, name: email });
      if (authError) {
        setError(authError.message ?? c.fallback);
        setSubmitting(false);
        return;
      }
      router.push("/");
    } catch {
      setError(c.fallback);
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit} noValidate>
      <h2 className="ds-lede mb-4">{c.heading}</h2>

      <Field
        label="Email"
        name="email"
        type="email"
        value={email}
        onChange={setEmail}
        autoComplete="email"
        required
        error={!!error}
        describedById={describedById}
      />

      <Field
        label="Password"
        name="password"
        type={showPassword ? "text" : "password"}
        value={password}
        onChange={setPassword}
        autoComplete={c.passwordAutoComplete}
        required
        hint={c.hint}
        error={!!error}
        describedById={describedById}
        trailing={
          <button
            type="button"
            onClick={() => setShowPassword((s) => !s)}
            aria-pressed={showPassword}
            aria-label={showPassword ? "Hide password" : "Show password"}
            className="ds-btn ds-btn-ghost p-1"
          >
            {showPassword ? (
              <EyeOff size={18} aria-hidden="true" />
            ) : (
              <Eye size={18} aria-hidden="true" />
            )}
          </button>
        }
      />

      {error ? (
        <p
          id={errorId}
          role="alert"
          aria-live="polite"
          className="mb-3 text-destructive"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={submitting}
        className="ds-btn ds-btn-primary w-full justify-center disabled:cursor-not-allowed disabled:opacity-60"
      >
        {submitting ? c.submitting : c.submit}
      </button>

      <p className="ds-caption mt-4">
        <a href={c.link.href}>{c.link.text}</a>
      </p>
    </form>
  );
}
```

Notes: behavior parity with the old pages is intentional — `signUp.email` keeps `name: email` (MVP spec defers a real name field); success still `router.push("/")`. `size={18}` is a lucide prop (not a CSS px literal). The disabled utilities are Tailwind opacity/cursor (no hex/px literal).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors. (If Better Auth's client types reject the `signIn`/`signUp` shapes, match the exact call shape used in the current `src/app/login/page.tsx` / `src/app/signup/page.tsx` — it is identical to the calls above; do not change auth config.)

- [ ] **Step 3: Lint**

Run: `npm run lint`
Expected: 0 new errors/warnings from this file.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(auth)/auth-form.tsx"
git commit -m "feat: add AuthForm (shared signin/signup, UX polish, a11y)"
```

---

## Task 4: Create the `(auth)` layout shell

**Files:**

- Create: `src/app/(auth)/layout.tsx`

Server component. Centers a `.ds-panel` card on the warm background (the package base already sets `--ds-bg` on `body`), renders the "SyncFit" wordmark `<h1>` + tagline, then `children`. No `<html>`/`<body>` (the root `src/app/layout.tsx` owns those).

- [ ] **Step 1: Write the layout**

Create `src/app/(auth)/layout.tsx` with exactly:

```tsx
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="ds-panel w-full max-w-md p-8">
        <div className="mb-6 text-center">
          <h1 className="ds-display">SyncFit</h1>
          <p className="ds-caption text-muted-foreground">
            Train smart. Progress on purpose.
          </p>
        </div>
        {children}
      </div>
    </main>
  );
}
```

Note: use `.ds-panel` as-is for the card surface/radius/border/shadow — it is the design system's panel primitive; do not add a manual shadow or hex/px. `min-h-screen`, `max-w-md`, spacing utilities are the project's existing idiom (cf. `ds-container p-8` in `src/app/page.tsx`).

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(auth)/layout.tsx"
git commit -m "feat: add (auth) layout shell with SyncFit wordmark"
```

---

## Task 5: Add the route-group pages and remove the old ones

**Files:**

- Create: `src/app/(auth)/login/page.tsx`
- Create: `src/app/(auth)/signup/page.tsx`
- Delete: `src/app/login/page.tsx` and the now-empty `src/app/login/` directory
- Delete: `src/app/signup/page.tsx` and the now-empty `src/app/signup/` directory

- [ ] **Step 1: Create the new login page**

Create `src/app/(auth)/login/page.tsx` with exactly:

```tsx
import { AuthForm } from "../auth-form";

export default function LoginPage() {
  return <AuthForm mode="signin" />;
}
```

- [ ] **Step 2: Create the new signup page**

Create `src/app/(auth)/signup/page.tsx` with exactly:

```tsx
import { AuthForm } from "../auth-form";

export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
```

- [ ] **Step 3: Delete the old pages**

Run:

```bash
git rm src/app/login/page.tsx src/app/signup/page.tsx
```

Expected: both files staged for deletion. Confirm the directories are now empty and gone:

```bash
ls src/app/login src/app/signup 2>&1
```

Expected: "No such file or directory" for both (Next.js route is now served from the `(auth)` group).

- [ ] **Step 4: Type-check**

Run: `npx tsc --noEmit`
Expected: no errors (no remaining import of the deleted files; nothing else imported them — they were route entrypoints only).

- [ ] **Step 5: Commit**

```bash
git add "src/app/(auth)/login/page.tsx" "src/app/(auth)/signup/page.tsx" src/app/login src/app/signup
git commit -m "feat: serve /login and /signup from the (auth) route group"
```

---

## Task 6: Verification gate + manual smoke

**Files:** none (verification only)

- [ ] **Step 1: Green gate**

Run each; all must pass:

```bash
npm run build
npx tsc --noEmit
npm run lint
npm run format:check
npm test
```

Expected: build succeeds and the route list shows `/login` and `/signup` (served from the group, URLs unchanged); tsc clean; lint 0 errors (the single pre-existing `no-explicit-any` warning in `src/lib/readiness.ts` is acceptable, nothing new); `format:check` clean (run `npm run format` and commit `chore: prettier formatting` if it flags the new files, then re-check); `npm test` still 19/19 offline (unchanged — no unit tests added by design).

- [ ] **Step 2: No hard-coded hex/px leaked**

Run:

```bash
grep -rnE '#[0-9a-fA-F]{3,6}\b|[0-9]+px' "src/app/(auth)" --include="*.tsx"
```

Expected: no output. (`size={18}` is a numeric prop, not `px`, and will not match. Any real hit is a design-rule violation — replace with the appropriate token-backed utility / `--ds-*` reference.)

- [ ] **Step 3: Route-group URL sanity**

Run:

```bash
grep -RngE 'app/\(auth\)/(login|signup)/page' .next 2>/dev/null | head -1 || true
ls "src/app/(auth)/login/page.tsx" "src/app/(auth)/signup/page.tsx"
```

Expected: both source files exist; the build output references the `(auth)` group serving `login`/`signup`. (Definitive URL check is the manual smoke below.)

- [ ] **Step 4: Manual smoke (record results in the task notes)**

Start the app: `npm run dev`, then in a browser verify:

1. `http://localhost:3000/login` loads unauthenticated — centered card, "SyncFit" wordmark + "Train smart. Progress on purpose." tagline, "Sign in" sub-heading, Email + Password fields with visible labels.
2. `http://localhost:3000/signup` loads — same shell, "Create account" sub-heading, and the persistent "At least 8 characters." hint under the password field (and NOT on `/login`).
3. Show/hide password toggle flips the field between dots and clear text; `aria-label` switches Show↔Hide (inspect or screen-reader).
4. Submit with empty/invalid input or wrong credentials → a friendly error appears in the `role="alert"` region, fields keep their values, the button re-enables; while the request is in flight the button is disabled and reads "Signing in…" / "Creating account…".
5. Valid sign-in (or sign-up of a fresh email) → redirected to `/`.
6. Keyboard: Tab order is label→input→toggle→submit→cross-link; a focus ring is visible on each; Enter submits.
7. Cross-links: `/login` ↔ `/signup` navigate correctly.

- [ ] **Step 5: Final commit if Step 1 required formatting**

```bash
git add -A
git commit -m "chore: prettier formatting for auth redesign" || echo "nothing to commit"
```

---

## Notes

- **No auth-config / schema / server-action changes** — `src/auth/*`, `src/proxy.ts`, `src/db/*` are untouched. `proxy.ts` gates `/`, `/import`, `/plan`; `/login` and `/signup` stay public and their URLs are unchanged by the route group. `npm run test:integration` is therefore not required.
- **Behavior parity** with the replaced pages is deliberate: same Better Auth calls (`name: email` retained on signup), same `router.push("/")` on success. The additions are purely UX/a11y/visual per the spec.
- **Frontend-design skill:** for Tasks 3–6 use it to sharpen visual execution (spacing rhythm, hierarchy, the card composition) — but only within the classes/markup specified here and the design-rule guardrails. It does not authorize new components, new copy, hex/px, or scope beyond the spec.
