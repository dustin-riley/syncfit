# Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared in-app navigation (a centered floating "pill" with brand, three links, and a user-menu dropdown with sign-out) across the three signed-in pages, while keeping login/signup nav-free.

**Architecture:** Move the three signed-in pages into a new `(app)` route group (URLs unchanged) with a shared server `layout.tsx` that resolves the session and renders a `SiteNav` client component above page content. Active-link logic is a pure, unit-tested helper in `src/lib/nav.ts` (consistent with the project's "pure logic in `src/lib`, tested offline" pattern). Styling uses only `@dustin-riley/design` `--ds-*` tokens and `.ds-*` primitives.

**Tech Stack:** Next.js 16 App Router (route groups), TypeScript, Tailwind v4, Better Auth client (`authClient.signOut`), lucide-react icons, Vitest (pure helper only).

**Spec:** `docs/superpowers/specs/2026-05-17-navigation-design.md`. Read it first. Note §6: the project has **no React component test harness** and one is explicitly **not** added here (YAGNI) — UI tasks are verified by `tsc`/`lint`/`build`/manual checks, not fabricated component tests. Only the pure `src/lib/nav.ts` helper gets a unit test (Task 2).

---

## File Structure

| File | Responsibility |
|---|---|
| `src/app/(app)/page.tsx` | Today/dashboard (moved from `src/app/page.tsx`, unchanged) |
| `src/app/(app)/dashboard/*` | Dashboard widgets (moved from `src/app/dashboard/`, unchanged) — moved so `./dashboard/...` relative imports in `page.tsx` keep resolving |
| `src/app/(app)/plan/*` | Weekly-plan page + editor (moved from `src/app/plan/`, unchanged) |
| `src/app/(app)/import/*` | Import page (moved from `src/app/import/`, unchanged) |
| `src/app/(app)/layout.tsx` | **New.** Server component: session resolve + `redirect`, renders `SiteNav` + children |
| `src/app/(app)/site-nav.tsx` | **New.** `"use client"` pill nav: brand, links, user-menu dropdown, sign-out |
| `src/lib/nav.ts` | **New.** Pure: `NAV_ITEMS` + `isActivePath()` (no React, no DOM) |
| `tests/nav.test.ts` | **New.** Unit tests for `isActivePath` (offline, Vitest) |
| `CLAUDE.md` | Modify: architecture note about the `(app)` route group |
| `docs/superpowers/specs/2026-05-17-navigation-design.md` | Modify: status → implemented |

The `src/proxy.ts` matcher (`["/", "/import/:path*", "/plan/:path*"]`) needs **no change** — route groups do not change URLs. The root layout and `(auth)` layout are **not touched**, so login/signup stay nav-free.

---

## Task 1: Move signed-in pages into the `(app)` route group

No URL changes. Relative imports (`page.tsx` → `./dashboard/...`) keep resolving because `dashboard/` moves alongside `page.tsx`. All other imports are `@/...` absolute and unaffected.

**Files:**
- Move: `src/app/page.tsx` → `src/app/(app)/page.tsx`
- Move: `src/app/dashboard/` → `src/app/(app)/dashboard/`
- Move: `src/app/plan/` → `src/app/(app)/plan/`
- Move: `src/app/import/` → `src/app/(app)/import/`

- [ ] **Step 1: Confirm nothing imports these via the `@/` alias**

Run: `grep -rn "@/app/\(page\|dashboard\|plan/\|import/\)" src --include="*.ts" --include="*.tsx"`
Expected: no output (only `page.tsx`'s relative `./dashboard/...` imports exist, and they move together).

- [ ] **Step 2: Create the route group directory and move the files with git**

```bash
mkdir -p "src/app/(app)"
git mv src/app/page.tsx "src/app/(app)/page.tsx"
git mv src/app/dashboard "src/app/(app)/dashboard"
git mv src/app/plan "src/app/(app)/plan"
git mv src/app/import "src/app/(app)/import"
```

- [ ] **Step 3: Type-check and build to prove imports/routes are intact**

Run: `npx tsc --noEmit && npm run build`
Expected: PASS. Build output lists routes `/`, `/plan`, `/import` (route group does not appear in the URL).

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor(app): move signed-in pages into (app) route group

URLs unchanged; prepares for a shared (app) layout-rendered nav.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Pure active-path helper (TDD)

`NAV_ITEMS` is the single source of truth for nav links; `isActivePath` decides which is highlighted. Exact match for `/` (so it is not "active" on every page); prefix match for the others.

**Files:**
- Create: `src/lib/nav.ts`
- Test: `tests/nav.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/nav.test.ts
import { describe, it, expect } from "vitest";
import { NAV_ITEMS, isActivePath } from "@/lib/nav";

describe("NAV_ITEMS", () => {
  it("lists the three signed-in routes in order with short labels", () => {
    expect(NAV_ITEMS).toEqual([
      { href: "/", label: "Today", shortLabel: "Today" },
      { href: "/plan", label: "Weekly plan", shortLabel: "Plan" },
      { href: "/import", label: "Import", shortLabel: "Import" },
    ]);
  });
});

describe("isActivePath", () => {
  it("matches '/' only exactly, not as a prefix of every route", () => {
    expect(isActivePath("/", "/")).toBe(true);
    expect(isActivePath("/plan", "/")).toBe(false);
    expect(isActivePath("/import", "/")).toBe(false);
  });

  it("matches non-root routes by prefix (covers nested paths)", () => {
    expect(isActivePath("/plan", "/plan")).toBe(true);
    expect(isActivePath("/plan/anything", "/plan")).toBe(true);
    expect(isActivePath("/import", "/import")).toBe(true);
    expect(isActivePath("/import", "/plan")).toBe(false);
  });

  it("does not treat a string-prefix as a path match", () => {
    expect(isActivePath("/planner", "/plan")).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/nav.test.ts`
Expected: FAIL — cannot resolve `@/lib/nav` / `NAV_ITEMS is not defined`.

- [ ] **Step 3: Write the minimal implementation**

```typescript
// src/lib/nav.ts
// Pure nav model: single source of truth for the in-app links and the
// active-state rule. No React, no DOM — unit-tested offline (tests/nav.test.ts).

export type NavItem = {
  /** Route path; also the value compared against the current pathname. */
  href: string;
  /** Full label, shown at the `sm` breakpoint and up. */
  label: string;
  /** Compact label, shown below `sm` so the pill holds one row at ~360px. */
  shortLabel: string;
};

export const NAV_ITEMS: readonly NavItem[] = [
  { href: "/", label: "Today", shortLabel: "Today" },
  { href: "/plan", label: "Weekly plan", shortLabel: "Plan" },
  { href: "/import", label: "Import", shortLabel: "Import" },
];

/**
 * Is `href` the active nav item for `pathname`?
 * "/" matches only when pathname is exactly "/". Other items match the
 * exact path or a nested child ("/plan/x"), but never a mere string
 * prefix ("/planner" is not under "/plan").
 */
export function isActivePath(pathname: string, href: string): boolean {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(href + "/");
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `npx vitest run tests/nav.test.ts`
Expected: PASS (all cases green).

- [ ] **Step 5: Commit**

```bash
git add src/lib/nav.ts tests/nav.test.ts
git commit -m "feat(nav): pure NAV_ITEMS + isActivePath helper (unit-tested)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: `SiteNav` client component

The pill: brand wordmark, the three links (active = filled inset pill, responsive label), and a user-menu dropdown (email header + sign-out, dismiss on outside-click / `Escape` / select). Styling uses only `--ds-*` tokens / `.ds-*` classes via inline `style={{ ... var(--ds-*) }}` — the same pattern already used in `src/app/(app)/page.tsx` (`style={{ color: "var(--ds-link)" }}`). No hex/px literals, sentence-case copy, no emoji.

**Files:**
- Create: `src/app/(app)/site-nav.tsx`

- [ ] **Step 1: Write the component**

```tsx
// src/app/(app)/site-nav.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { authClient } from "@/auth/client";
import { NAV_ITEMS, isActivePath } from "@/lib/nav";

export function SiteNav({ email }: { email: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  // Dismiss the menu on outside pointer-down and on Escape; return focus to
  // the trigger so keyboard users are not stranded.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setMenuOpen(false);
      }
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setMenuOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [menuOpen]);

  async function onSignOut() {
    setSigningOut(true);
    setSignOutError("");
    try {
      const { error } = await authClient.signOut();
      if (error) {
        setSignOutError("Couldn't sign out. Try again.");
        setSigningOut(false);
        return;
      }
      // Hard navigation so all server components re-render unauthenticated
      // against the cleared session cookie (spec §4).
      window.location.assign("/login");
    } catch {
      setSignOutError("Couldn't sign out. Try again.");
      setSigningOut(false);
    }
  }

  return (
    <div
      className="sticky top-0 z-40 flex justify-center"
      style={{ padding: "var(--ds-space-4) var(--ds-space-4) 0" }}
    >
      <nav
        aria-label="Primary"
        className="flex items-center"
        style={{
          gap: "var(--ds-space-3)",
          padding: "var(--ds-space-2) var(--ds-space-4)",
          background: "var(--ds-bg)",
          border: "var(--ds-border-width) solid var(--ds-border)",
          borderRadius: "var(--ds-radius-pill)",
          boxShadow: "var(--ds-shadow-md)",
        }}
      >
        <Link
          href="/"
          className="ds-display"
          style={{ fontSize: "1rem", color: "var(--ds-text)" }}
        >
          SyncFit
        </Link>

        <ul
          className="flex items-center"
          style={{ listStyle: "none", margin: 0, padding: 0, gap: "var(--ds-space-2)" }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="ds-btn ds-btn-ghost"
                  style={{
                    borderRadius: "var(--ds-radius-pill)",
                    color: active ? "var(--ds-primary)" : "var(--ds-text-muted)",
                    fontWeight: active ? 600 : 400,
                    background: active ? "var(--ds-surface)" : "transparent",
                    border: active
                      ? "var(--ds-border-width) solid var(--ds-border)"
                      : "var(--ds-border-width) solid transparent",
                  }}
                >
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div ref={menuRef} style={{ position: "relative" }}>
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label="Account menu"
            className="ds-btn ds-btn-ghost flex items-center"
            style={{ gap: "var(--ds-space-2)", borderRadius: "var(--ds-radius-pill)" }}
          >
            <span
              aria-hidden="true"
              className="flex items-center justify-center"
              style={{
                width: "1.75rem",
                height: "1.75rem",
                borderRadius: "var(--ds-radius-pill)",
                background: "var(--ds-accent-ochre)",
                color: "var(--ds-on-primary)",
                fontWeight: 600,
                fontSize: "0.8rem",
              }}
            >
              {initial}
            </span>
            <span
              className="hidden sm:inline"
              style={{
                color: "var(--ds-text-muted)",
                fontSize: "0.85rem",
                maxWidth: "12rem",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {email}
            </span>
            <ChevronDown size={16} aria-hidden="true" />
          </button>

          {menuOpen ? (
            <div
              role="menu"
              aria-label="Account"
              className="ds-panel"
              style={{
                position: "absolute",
                right: 0,
                top: "calc(100% + var(--ds-space-2))",
                minWidth: "14rem",
                borderRadius: "var(--ds-radius-sm)",
                boxShadow: "var(--ds-shadow-lg)",
                padding: "var(--ds-space-2)",
                zIndex: 50,
              }}
            >
              <p
                className="ds-mono-note"
                style={{
                  margin: 0,
                  padding: "var(--ds-space-2) var(--ds-space-3)",
                  color: "var(--ds-text-muted)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {email}
              </p>
              {/* Reserved slot for a future settings link (spec §1) — intentionally empty. */}
              <button
                type="button"
                role="menuitem"
                onClick={onSignOut}
                disabled={signingOut}
                className="ds-btn ds-btn-ghost w-full justify-start disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderRadius: "var(--ds-radius-sm)" }}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
              {signOutError ? (
                <p
                  role="alert"
                  className="ds-mono-note"
                  style={{
                    margin: 0,
                    padding: "var(--ds-space-1) var(--ds-space-3)",
                    color: "var(--ds-error)",
                  }}
                >
                  {signOutError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 2: Type-check and lint**

Run: `npx tsc --noEmit && npm run lint`
Expected: PASS, no errors for `src/app/(app)/site-nav.tsx`.

- [ ] **Step 3: Commit**

```bash
git add "src/app/(app)/site-nav.tsx"
git commit -m "feat(nav): SiteNav pill — links, active state, user menu, sign-out

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: `(app)` shared layout

Server component that resolves the session, redirects unauthenticated users, and renders `SiteNav` above page content. Mirrors the existing session pattern in `src/app/(app)/page.tsx` (`auth.api.getSession({ headers: await headers() })`).

**Files:**
- Create: `src/app/(app)/layout.tsx`

- [ ] **Step 1: Write the layout**

```tsx
// src/app/(app)/layout.tsx
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/auth/auth";
import { SiteNav } from "./site-nav";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // Supplies the nav's email and centralizes the redirect. Pages still call
  // getSession independently for userId-scoped queries (security boundary
  // stays per-page/per-action, per CLAUDE.md) — spec §2.
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <>
      <SiteNav email={session.user.email} />
      {children}
    </>
  );
}
```

- [ ] **Step 2: Type-check, lint, and build**

Run: `npx tsc --noEmit && npm run lint && npm run build`
Expected: PASS. Build still lists `/`, `/plan`, `/import`.

- [ ] **Step 3: Manual verification**

Run: `npm run dev`, then in a browser (signed in):
- `/`, `/plan`, `/import` each show the pill; the current page's link is the filled/primary one (`aria-current="page"`).
- `/login` and `/signup` show **no** pill (they are not under `(app)`).
- The account button opens the dropdown; it closes on outside-click, on `Escape` (focus returns to the trigger), and on clicking an item.
- "Sign out" lands on `/login`; pressing Back does not re-enter the app (proxy redirects with the cookie cleared).
- Narrow the window to ~360px: the pill stays one centered row, link labels read "Today / Plan / Import", and the email text next to the avatar is hidden (avatar only).

Expected: all checks pass. Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add "src/app/(app)/layout.tsx"
git commit -m "feat(nav): (app) layout renders SiteNav for signed-in pages

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Documentation

**Files:**
- Modify: `CLAUDE.md` (the "Architecture" section)
- Modify: `docs/superpowers/specs/2026-05-17-navigation-design.md` (status line)

- [ ] **Step 1: Add the route-group note to `CLAUDE.md`**

In `CLAUDE.md`, find the `**Auth & scoping.**` paragraph in the "Architecture" section. Immediately after that paragraph, add this new paragraph:

```markdown
**Shared nav & the `(app)` route group.** Signed-in pages live under `src/app/(app)/` (`page.tsx` + `dashboard/`, `plan/`, `import/`). The route group does **not** change URLs (`/`, `/plan`, `/import`). `src/app/(app)/layout.tsx` resolves the session (redirects to `/login` if absent) and renders `src/app/(app)/site-nav.tsx` — the floating "pill" nav (brand, links, user-menu dropdown with sign-out) — above page content. `(auth)` and the root layout are intentionally nav-free; don't move these pages back to `src/app/` or add nav to the root layout. Active-link logic is the pure, unit-tested `src/lib/nav.ts` (`NAV_ITEMS`/`isActivePath`); the `proxy.ts` matcher is unchanged because route groups don't affect paths.
```

- [ ] **Step 2: Mark the spec implemented**

In `docs/superpowers/specs/2026-05-17-navigation-design.md`, change the status line:

From:
```markdown
**Status:** Approved (brainstorming) — pending implementation plan
```
To:
```markdown
**Status:** Implemented (2026-05-17)
```

- [ ] **Step 3: Verify formatting**

Run: `npm run format:check`
Expected: PASS (if it fails, run `npm run format` then re-check, and `git add -A`).

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-05-17-navigation-design.md
git commit -m "docs(nav): record (app) route group + mark spec implemented

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Final verification gate

- [ ] **Step 1: Run the full offline gate suite**

Run: `npm test && npx tsc --noEmit && npm run lint && npm run format:check && npm run build`
Expected: all PASS. `npm test` includes the new `tests/nav.test.ts`; the build lists `/`, `/plan`, `/import`.

- [ ] **Step 2: Confirm no integration suite needed**

No server-action or DB path changed (only a route-group move + new layout/component/helper), so `npm run test:integration` is **not** required per spec §6. Do not run it.

- [ ] **Step 3: Confirm a clean tree**

Run: `git status --porcelain`
Expected: empty (everything committed across Tasks 1–5).
```
