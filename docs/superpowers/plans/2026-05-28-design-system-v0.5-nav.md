# Design-system v0.5 nav migration + conformance pass — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate SyncFit's signed-in nav off the pre-v0.5 floating pill onto the canonical `.site-nav` design-system recipe, and close the one structural conformance gap the v0.5 UI audit found.

**Architecture:** Vendor the new `.site-nav` CSS recipe into the SyncFit-vendored design-system copy (`src/styles/design/components.css`), then swap `src/app/(app)/site-nav.tsx` for the bundle's drop-in component (behavior contract preserved, all chrome from recipe classes). Separately, the workout-kind toggle in `log/page.tsx` adopts the existing `.seg` recipe. No `tokens.css` change (already at v0.5 parity); no copy changes (deferred by decision).

**Tech Stack:** Next.js 16 (App Router) + React 19 + TypeScript, Tailwind v4, the vendored Dustin Riley design system (`src/styles/design/`). No new dependencies; `lucide-react` stays (used elsewhere).

**Spec:** `docs/superpowers/specs/2026-05-28-design-system-v0.5-nav-design.md`

---

## A note on testing for this plan

This change is CSS + JSX markup. The only unit-testable logic in the nav is
`src/lib/nav.ts` (`NAV_ITEMS` / `isActivePath`), which is **reused unchanged** —
its existing tests (`tests/nav.test.ts` or similar) must stay green but get no
new cases. There is no pure function to TDD here. "Tests" for each task are
therefore the project gate: existing unit tests stay green, plus
`tsc --noEmit`, `lint`, `format:check`, and `build`. The nav's interactive
behavior (outside-click/Escape dismissal, sign-out) is verified manually at the
end. Each task is committed independently.

---

## File Structure

- **Modify** `src/styles/design/components.css` — append the new `.site-nav`
  recipe block (~335 lines). Self-contained; no other rule in the file
  references `.site-nav*` selectors.
- **Replace** `src/app/(app)/site-nav.tsx` — the v0.5 handoff component.
- **Modify** `src/app/(app)/log/page.tsx` — workout-kind toggle adopts `.seg`.
- **Unchanged (verify only)** `src/lib/nav.ts`, `src/proxy.ts`, the nav unit
  tests.

---

### Task 1: Vendor the `.site-nav` recipe into `components.css`

**Files:**
- Modify: `src/styles/design/components.css` (append at end of file, currently 1530 lines)

The recipe is self-contained and its selectors (`.site-nav*`) appear nowhere
else in the file, so appending at the end is safe (CSS source order is
irrelevant for non-conflicting selectors). All tokens it references already
exist in `src/styles/design/tokens.css`.

- [ ] **Step 1: Append the recipe block**

Append the following verbatim to the end of `src/styles/design/components.css`
(after the existing "Bold Text · iOS-only" comment block):

```css

/* ============================================================
   .site-nav · canonical top navigation

   Anchored hard-edge bar. Sticky-positioned. Carries the brand,
   the in-app primary links, the account cluster, and — below the
   phone breakpoint — a horizontally-scrolling rail of short labels.

   The account menu (.site-nav__menu) is a "connected chip": it
   structurally extends from the .site-nav__account trigger,
   sharing its 1.5px --rule border rather than floating off as a
   separate object. The consumer sets data-open="true" on the
   account wrap when the menu is mounted; the wrap flattens its
   bottom corners and the menu's top border merges cleanly.

   Below --bp-phone the metaphor scales up: the avatar is too small
   to be a connecting surface at that width, so the BAR becomes it
   — the nav's bottom rule hands off to the menu's top rule via a
   :has() rule. The consumer still only sets data-open on the wrap;
   CSS handles the rest.

   Container-query driven so the nav adapts to its OWN inline size
   rather than the viewport — the recipe Just Works inside any
   parent (including the preview card).

   ANATOMY
     <header class="site-nav">
       <a class="site-nav__brand">…</a>
       <ul class="site-nav__links">…li > a (desktop links)…</ul>
       <div class="site-nav__account" data-open="true|false">
         <button class="site-nav__trigger">
           <span class="site-nav__avatar">D</span>
           <span class="site-nav__email">…</span>
           <span class="site-nav__chev" aria-hidden="true">…</span>
         </button>
       </div>
       {open && (
         <div class="site-nav__menu" role="menu">
           <div class="site-nav__menu-email">…</div>
           <a class="site-nav__menu-item" role="menuitem">…</a>
           <div class="site-nav__menu-separator" role="separator"></div>
           <button class="site-nav__menu-item" role="menuitem">…</button>
         </div>
       )}
       <nav class="site-nav__rail">…a (mobile rail)…</nav>
     </header>

   The menu is a SIBLING of .site-nav__account (not nested) so it
   can flow as its own row on mobile, beneath the bar's first row
   and above the rail. On desktop it stacks directly under the
   account wrap (col 3, row 2 of the grid) and visually connects
   via the negative top margin.
   ============================================================ */
.site-nav {
  container-type: inline-size;
  position: sticky;
  top: 0;
  z-index: 40;
  display: grid;
  grid-template-columns: auto 1fr auto;
  grid-template-rows: auto auto auto;
  align-items: center;
  column-gap: var(--space-6);
  width: 100%;
  padding: 13px 28px;
  background: var(--bg);
  border-bottom: var(--rule-width) solid var(--rule);
  font-family: var(--font-body);
  box-sizing: border-box;
}

.site-nav__brand {
  grid-column: 1; grid-row: 1;
  display: inline-flex;
  align-items: center;
  font-family: var(--font-display);
  font-weight: 600;
  font-size: 16px;
  letter-spacing: -0.01em;
  color: var(--text);
  text-decoration: none;
  line-height: 1;
}

.site-nav__links {
  grid-column: 2; grid-row: 1;
  display: flex;
  align-items: center;
  gap: 4px;
  list-style: none;
  margin: 0;
  padding: 0;
}
.site-nav__links a {
  font-family: var(--font-body);
  font-size: 14px;
  font-weight: 500;
  color: var(--text);
  text-decoration: none;
  padding: 7px 13px;
  border-radius: var(--radius-chip);
  line-height: 1.2;
  white-space: nowrap;
  transition: background var(--duration-fast) var(--ease-standard),
              color var(--duration-fast) var(--ease-standard);
}
.site-nav__links a:hover {
  background: var(--surface);
  color: var(--text);
}
.site-nav__links a[aria-current="page"] {
  background: var(--rule);
  color: #fff;
}
.site-nav__links a:focus-visible {
  outline: var(--focus-outline);
  outline-offset: 0;
}

/* -------- account cluster (the chip that contains the trigger) -------- */
.site-nav__account {
  grid-column: 3; grid-row: 1;
  position: relative;
  display: inline-flex;
  align-items: center;
  border: var(--rule-width) solid var(--rule);
  border-radius: var(--radius-chip);
  padding: 2px 4px 2px 2px;
  background: var(--bg);
  transition: border-radius var(--duration-fast) var(--ease-standard);
}
.site-nav__account[data-open="true"] {
  border-bottom-left-radius: 0;
  border-bottom-right-radius: 0;
}

.site-nav__trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  background: transparent;
  border: none;
  cursor: pointer;
  padding: 4px 6px 4px 4px;
  font-family: var(--font-body);
  font-size: 13px;
  color: var(--text-muted);
  line-height: 1.2;
}
.site-nav__trigger:focus-visible {
  outline: var(--focus-outline);
  outline-offset: 0;
}

.site-nav__avatar {
  width: 24px;
  height: 24px;
  background: var(--accent-ochre);
  color: #fff;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-family: var(--font-body);
  font-size: 11px;
  font-weight: 600;
  flex-shrink: 0;
  border-radius: var(--radius-chip);
}

.site-nav__email {
  max-width: 180px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-nav__chev {
  font-size: 11px;
  color: var(--text-muted);
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  transition: transform var(--duration-fast) var(--ease-standard);
}
/* Chevron flips to point up while the menu is open. The trigger is a
   persistent element (only the menu unmounts), so a transition fires
   cleanly on the aria-expanded change. */
.site-nav__trigger[aria-expanded="true"] .site-nav__chev {
  transform: rotate(180deg);
}

/* -------- connected-chip dropdown --------
   Hangs flush from .site-nav__account on desktop, sharing its
   vertical rules. No shadow — the rule does the structural work.
   Adding a shadow would re-introduce the "floating panel" reading
   the connected metaphor is designed to avoid. */
.site-nav__menu {
  grid-column: 3; grid-row: 2;
  justify-self: end;
  align-self: start;
  min-width: 248px;
  margin-top: calc(var(--rule-width) * -1);
  background: var(--bg);
  border: var(--rule-width) solid var(--rule);
  border-top: none;
  border-radius: 0 0 var(--radius-chip) var(--radius-chip);
  padding: 4px;
  display: flex;
  flex-direction: column;
  z-index: 50;
  /* Unfurls downward from the chip's bottom edge on appear. The menu is
     conditionally mounted by the consumer, so this is a keyframe animation
     (plays once on mount), not a transition. clip-path wipes the panel in
     from the top without squashing the text the way scaleY would; the
     short fade softens the leading edge. duration-base = a transient
     surface settling into its resting state. */
  animation: site-nav-menu-in var(--duration-base) var(--ease-standard);
  transform-origin: top;
}
@keyframes site-nav-menu-in {
  from { opacity: 0; clip-path: inset(0 0 100% 0); }
  to   { opacity: 1; clip-path: inset(0 0 0 0); }
}
@media (prefers-reduced-motion: reduce) {
  /* Honor Reduce Motion: the menu simply appears, the chevron simply
     points up. End states are identical; only the in-between is dropped. */
  .site-nav__menu { animation: none; }
  .site-nav__chev { transition: none; }
}

.site-nav__menu-email {
  font-family: var(--font-mono);
  font-size: 11px;
  letter-spacing: 0.04em;
  color: var(--text-muted);
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  margin-bottom: 4px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.site-nav__menu-item {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  font-family: var(--font-body);
  font-size: 14px;
  color: var(--text);
  text-decoration: none;
  border: none;
  background: transparent;
  text-align: left;
  cursor: pointer;
  line-height: 1.2;
  width: 100%;
  border-radius: 0;
  transition: background var(--duration-fast) var(--ease-standard);
}
.site-nav__menu-item:hover {
  background: var(--surface);
}
.site-nav__menu-item:focus-visible {
  outline: var(--focus-outline);
  outline-offset: -3px;
}
.site-nav__menu-item:disabled {
  opacity: 0.4;
  pointer-events: none;
}

.site-nav__menu-separator {
  height: 1px;
  background: var(--border);
  margin: 4px 0;
}

/* -------- mobile rail --------
   Always present in markup; hidden by default, revealed by the
   container query below. Active marker is an ink underline so it
   reads as the same family as the desktop ink-fill but at a
   lighter weight — the rail is more navigational chrome than
   page-state assertion. */
.site-nav__rail {
  grid-column: 1 / -1; grid-row: 3;
  display: none;
  gap: 0;
  padding: 0 12px;
  background: var(--bg);
  border-bottom: var(--rule-width) solid var(--rule);
  overflow-x: auto;
  box-sizing: border-box;
}
.site-nav__rail a {
  font-family: var(--font-body);
  font-size: 13px;
  font-weight: 500;
  color: var(--text-muted);
  text-decoration: none;
  padding: 12px;
  box-shadow: inset 0 -3px 0 0 transparent;
  white-space: nowrap;
  margin-bottom: -1.5px;
  transition: color var(--duration-fast) var(--ease-standard),
              box-shadow var(--duration-fast) var(--ease-standard);
}
.site-nav__rail a:hover { color: var(--text); }
.site-nav__rail a[aria-current="page"] {
  color: var(--text);
  box-shadow: inset 0 -3px 0 0 var(--rule);
}
.site-nav__rail a:focus-visible {
  outline: var(--focus-outline);
  outline-offset: -3px;
}

/* -------- < --bp-phone container query --------
   Below 600px the nav's own inline size triggers the mobile
   layout: link row hides, rail shows, email + chev hide from the
   trigger, the connecting surface becomes the BAR instead of the
   chip, and the menu spans the full bar width edge-to-edge. */
@container (max-width: 600px) {
  .site-nav {
    column-gap: var(--space-3);
    padding: 12px 16px;
  }
  .site-nav__links { display: none; }
  .site-nav__rail { display: flex; }
  .site-nav__email,
  .site-nav__chev { display: none; }
  /* Wrap is no longer the connecting surface — the bar is.
     Keep the chip's full radius regardless of data-open. */
  .site-nav__account[data-open="true"] {
    border-bottom-left-radius: var(--radius-chip);
    border-bottom-right-radius: var(--radius-chip);
  }
  /* Email + chev are hidden here, so the chip is just the avatar.
     Match the exploration: the ink rule sits DIRECTLY on the avatar
     (no wrap border, no inset) so the ochre fills right to the rule
     with no --bg showing through. The wrap and trigger collapse to
     pure layout boxes. */
  .site-nav__account {
    padding: 0;
    border: none;
    border-radius: 0;
  }
  .site-nav__trigger { padding: 0; gap: 0; }
  .site-nav__avatar {
    box-sizing: border-box;
    width: 28px;
    height: 28px;
    font-size: 12px;
    border: var(--rule-width) solid var(--rule);
  }
  /* Menu spans full bar width; sides go to viewport edges with
     no vertical rules (nothing to share with there). Bar's bottom
     rule hands off to the menu's top rule, then a fresh bottom rule
     closes the menu off cleanly. */
  .site-nav__menu {
    grid-column: 1 / -1; grid-row: 2;
    justify-self: stretch;
    margin-top: 0;
    margin-left: -16px;
    margin-right: -16px;
    border: none;
    border-top: var(--rule-width) solid var(--rule);
    border-bottom: var(--rule-width) solid var(--rule);
    border-radius: 0;
    padding: 6px 16px 10px;
  }
  .site-nav__menu-item {
    padding: 12px 8px;
    font-size: 15px;
  }
  .site-nav__menu-email {
    padding: 8px;
  }
  .site-nav__rail {
    margin-left: -16px;
    margin-right: -16px;
  }
  /* Bar hands its bottom rule off to the menu's top rule */
  .site-nav:has(.site-nav__account[data-open="true"]) {
    border-bottom: none;
  }
}
```

- [ ] **Step 2: Verify the stylesheet still parses (build)**

Run: `npm run build`
Expected: build succeeds (Tailwind/PostCSS compiles `globals.css` → which
imports `components.css` — no CSS parse errors). The nav won't look different
yet (the component still uses the old classes), but the recipe is now available.

- [ ] **Step 3: Verify formatting is unaffected**

Run: `npm run format:check`
Expected: PASS. Note: `src/styles/design/` is Prettier-ignored (vendored), so
the appended block is not reformatted; this check confirms nothing else drifted.

- [ ] **Step 4: Commit**

```bash
git add src/styles/design/components.css
git commit -m "$(printf 'feat(design): vendor the v0.5 .site-nav recipe\n\nAppends the canonical .site-nav recipe (anchored hard-edge bar,\nconnected-chip account menu, container-query mobile rail) to the\nvendored design-system stylesheet. No tokens change (already at\nv0.5 parity). Consumer swap follows.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 2: Replace `site-nav.tsx` with the v0.5 handoff component

**Files:**
- Replace: `src/app/(app)/site-nav.tsx`
- Verify-only: `src/lib/nav.ts`, the nav unit test file

The handoff component drops every inline `style={{}}` (chrome now comes from the
`.site-nav*` classes added in Task 1), switches to the connected-chip dropdown
(sibling menu + dual containment refs), replaces Tailwind `sm:` breakpoints with
the container-query rail, and removes the `lucide-react` `ChevronDown` import.
The behavior contract is preserved exactly.

- [ ] **Step 1: Replace the file contents**

Overwrite `src/app/(app)/site-nav.tsx` entirely with:

```tsx
// src/app/(app)/site-nav.tsx
//
// v0.5 migration: the pre-v0.5 floating pill is replaced by the canonical
// `.site-nav` recipe (web/components.css). All chrome now comes from the
// design-system classes — no inline style objects. The component keeps the
// same behavior contract: outside-click + Escape dismissal, focus return,
// and the sign-out flow with inline error.
//
// Anatomy rendered (see README "Site nav API"):
//   .site-nav  >  .site-nav__brand
//                 .site-nav__links            (full labels; hidden < --bp-phone)
//                 .site-nav__account[data-open]
//                   .site-nav__trigger > avatar / email / chev
//                 .site-nav__menu             (connected-chip dropdown; mounted when open)
//                 .site-nav__rail             (short labels; shown < --bp-phone)
//
// The menu is a SIBLING of .site-nav__account, not a child — CSS grid places
// it directly under the chip on desktop and as a full-bar slice on mobile.
// `data-open` on the account wrap drives the connected-chip seam (and, via a
// :has() rule, the bar's bottom-border handoff on mobile). No extra props.

"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { authClient } from "@/auth/client";
import { NAV_ITEMS, isActivePath } from "@/lib/nav";

export function SiteNav({ email }: { email: string }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState("");
  const accountRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  // Dismiss the menu on outside pointer-down and on Escape; return focus to
  // the trigger so keyboard users are not stranded. The menu is a DOM sibling
  // of the account wrap (CSS grid positions it), so the containment test must
  // cover BOTH the wrap and the menu — otherwise a pointer-down on a menu item
  // counts as "outside" and dismisses before the item's click can land
  // (pointerdown precedes click).
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      const t = e.target as Node;
      const insideAccount = accountRef.current?.contains(t) ?? false;
      const insideMenu = menuRef.current?.contains(t) ?? false;
      if (!insideAccount && !insideMenu) {
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
    <header className="site-nav">
      <Link href="/" className="site-nav__brand">
        SyncFit
      </Link>

      {/* Desktop primary links — full labels. Hidden below --bp-phone. */}
      <ul className="site-nav__links" role="list">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <li key={item.href}>
              <Link href={item.href} aria-current={active ? "page" : undefined}>
                {item.label}
              </Link>
            </li>
          );
        })}
      </ul>

      {/* Account chip. data-open flattens the bottom corners so the menu
          connects, and (via :has() on mobile) hands the bar's bottom rule
          to the menu's top rule. */}
      <div className="site-nav__account" data-open={menuOpen} ref={accountRef}>
        <button
          ref={triggerRef}
          type="button"
          className="site-nav__trigger"
          onClick={() => setMenuOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          // Only reference the panel while it is mounted; aria-controls must
          // not point at a non-existent element (WAI-ARIA).
          aria-controls={menuOpen ? "account-menu" : undefined}
          aria-label="Account menu"
        >
          <span className="site-nav__avatar" aria-hidden="true">
            {initial}
          </span>
          <span className="site-nav__email">{email}</span>
          <span className="site-nav__chev" aria-hidden="true">
            ▾
          </span>
        </button>
      </div>

      {/* Connected-chip dropdown. Sibling of the account wrap so CSS grid can
          place it under the chip (desktop) or as a full-bar slice (mobile). */}
      {menuOpen ? (
        <div
          id="account-menu"
          role="menu"
          aria-label="Account"
          className="site-nav__menu"
          ref={menuRef}
        >
          <p className="site-nav__menu-email">{email}</p>
          <Link
            href="/settings/devices"
            role="menuitem"
            className="site-nav__menu-item"
            onClick={() => setMenuOpen(false)}
          >
            Devices
          </Link>
          <div className="site-nav__menu-separator" role="separator" />
          <button
            type="button"
            role="menuitem"
            className="site-nav__menu-item"
            onClick={onSignOut}
            disabled={signingOut}
          >
            {signingOut ? "Signing out…" : "Sign out"}
          </button>
          {signOutError ? (
            <p
              role="alert"
              className="site-nav__menu-email"
              style={{ color: "var(--error)", borderBottom: "none" }}
            >
              {signOutError}
            </p>
          ) : null}
        </div>
      ) : null}

      {/* Mobile rail — short labels. Shown below --bp-phone via container query. */}
      <nav className="site-nav__rail" aria-label="Primary">
        {NAV_ITEMS.map((item) => {
          const active = isActivePath(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              aria-current={active ? "page" : undefined}
            >
              {item.shortLabel}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
```

- [ ] **Step 2: Confirm `NAV_ITEMS` exposes `label` and `shortLabel`**

The component reads `item.label` (desktop links) and `item.shortLabel` (rail).
Verify these fields exist on the `NAV_ITEMS` type.

Run: `grep -n "label\|shortLabel" src/lib/nav.ts`
Expected: both `label` and `shortLabel` appear on each nav item. (If
`shortLabel` is missing, that's a real gap — stop and reconcile with the spec;
the old component also used `item.shortLabel`, so it should already be present.)

- [ ] **Step 3: Type check**

Run: `npx tsc --noEmit`
Expected: PASS. Confirms the removed `lucide-react` import left no dangling
reference and the new refs/props type-check.

- [ ] **Step 4: Lint**

Run: `npm run lint`
Expected: PASS with no unused-import or other errors (the `ChevronDown` import
is gone; no new lint violations).

- [ ] **Step 5: Run the unit tests (nav logic unchanged, must stay green)**

Run: `npm test`
Expected: PASS. `src/lib/nav.ts` is untouched, so its tests pass unchanged.

- [ ] **Step 6: Format check**

Run: `npm run format:check`
Expected: PASS (`site-nav.tsx` is NOT Prettier-ignored, so it must be
Prettier-clean). If it fails, run `npm run format` and re-stage.

- [ ] **Step 7: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 8: Commit**

```bash
git add src/app/(app)/site-nav.tsx
git commit -m "$(printf 'feat(design): adopt the v0.5 .site-nav recipe in site-nav.tsx\n\nReplaces the pre-v0.5 inline-style floating pill with the canonical\n.site-nav recipe classes: connected-chip account dropdown (sibling\nmenu + dual containment refs), container-query mobile rail, and a\nglyph chevron (drops the lucide-react ChevronDown import). Behavior\ncontract unchanged: outside-click + Escape dismissal, focus return,\nsign-out flow. lib/nav.ts reused as-is.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 3: Adopt `.seg` for the workout-kind toggle in `log/page.tsx`

**Files:**
- Modify: `src/app/(app)/log/page.tsx` (the `role="group"` block at ~L71–88)

The kind selector hand-rolls a two-button `aria-pressed` toggle with
`.btn`/`.btn--ghost`. The `.seg` segmented-control recipe is the canonical
primitive for exactly this (same pattern as `progress-workspace.tsx`'s
`PillToggle`). Swap to `.seg` + `.on` for consistency. Copy ("strength" /
"endurance") is unchanged.

- [ ] **Step 1: Replace the kind-selector markup**

Find this block in `src/app/(app)/log/page.tsx` (currently ~L71–88):

```tsx
      <div className="flex gap-2 my-3" role="group" aria-label="workout kind">
        <button
          type="button"
          className={`btn ${kind === "strength" ? "" : "btn--ghost"}`}
          aria-pressed={kind === "strength"}
          onClick={() => setKind("strength")}
        >
          strength
        </button>
        <button
          type="button"
          className={`btn ${kind === "endurance" ? "" : "btn--ghost"}`}
          aria-pressed={kind === "endurance"}
          onClick={() => setKind("endurance")}
        >
          endurance
        </button>
      </div>
```

Replace it with the `.seg` recipe form (matches `PillToggle`: container
`.seg` + `role="group"`, each button `aria-pressed` + `className={active ? "on" : undefined}`):

```tsx
      <div className="seg my-3" role="group" aria-label="workout kind">
        <button
          type="button"
          aria-pressed={kind === "strength"}
          className={kind === "strength" ? "on" : undefined}
          onClick={() => setKind("strength")}
        >
          strength
        </button>
        <button
          type="button"
          aria-pressed={kind === "endurance"}
          className={kind === "endurance" ? "on" : undefined}
          onClick={() => setKind("endurance")}
        >
          endurance
        </button>
      </div>
```

- [ ] **Step 2: Type check**

Run: `npx tsc --noEmit`
Expected: PASS.

- [ ] **Step 3: Lint + format**

Run: `npm run lint && npm run format:check`
Expected: PASS. (If format fails, run `npm run format` and re-stage.)

- [ ] **Step 4: Build**

Run: `npm run build`
Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
git add src/app/(app)/log/page.tsx
git commit -m "$(printf 'refactor(design): use the .seg recipe for the log workout-kind toggle\n\nThe strength/endurance toggle hand-rolled a .btn/.btn--ghost pair;\nadopt the canonical .seg segmented-control recipe (matches the\nPillToggle pattern in progress-workspace). Behavior and copy\nunchanged.\n\nCo-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>')"
```

---

### Task 4: Final verification gate + manual nav check

**Files:** none (verification only)

- [ ] **Step 1: Run the full offline gate**

Run each and confirm all PASS:

```bash
npm test
npx tsc --noEmit
npm run lint
npm run format:check
npm run build
```

Expected: all green. Integration tests and the iOS build are NOT required — no
server-action / DB / iOS paths changed.

- [ ] **Step 2: Manual visual check (dev server)**

Run: `npm run dev`, sign in, and verify on a signed-in page (e.g. `/`):

- **Desktop (wide window):** the nav is a full-width anchored bar with a 1.5px
  bottom rule (not a floating pill). Active link shows the ink fill. Opening the
  account chip: the chip's bottom corners flatten and the dropdown hangs flush
  beneath it sharing the rule (no shadow, no gap). Devices link navigates;
  sign-out works; clicking outside and pressing Escape both dismiss the menu
  and return focus to the trigger.
- **Mobile (narrow the window below ~600px):** the desktop links disappear and
  a horizontally-scrolling rail of short labels appears with an underline on the
  active item; the chip collapses to just the ochre avatar; opening the menu
  spans the full bar width with the bar's bottom rule handing off to the menu.

- [ ] **Step 3: Confirm the spec's deferred items are untouched**

Run: `git diff --stat main`
Expected: only `src/styles/design/components.css`, `src/app/(app)/site-nav.tsx`,
`src/app/(app)/log/page.tsx`, and the two `docs/superpowers/` files. No copy
changes, no `tokens.css` change, no edits to the deferred-cosmetic files
(`training-week.tsx`, `chart-card.tsx`, `progress-workspace.tsx`, `import/page.tsx`,
`devices-client.tsx`, `auth-form.tsx`).

- [ ] **Step 4: Finish the branch**

The branch `design-system-v0.5-nav` is ready. Use the
superpowers:finishing-a-development-branch skill to choose how to integrate
(PR vs merge). Suggested PR title: "Design-system v0.5: nav migration +
conformance pass".

---

## Self-Review (completed by plan author)

- **Spec coverage:** §1 vendor recipe → Task 1. §2 swap component → Task 2. §3
  `.seg` fix → Task 3. §"Verification" → Task 4. §"Decisions" (no tokens change,
  no copy, no re-vendor, chart stroke unchanged) → enforced by Task 4 Step 3.
  §"Audit findings · Deferred" → explicitly out of scope, guarded by Task 4
  Step 3. Full coverage.
- **Placeholder scan:** none — all CSS and TSX is included verbatim; every step
  has a concrete command and expected result.
- **Type consistency:** the component reads `NAV_ITEMS`, `isActivePath`,
  `item.label`, `item.href`, `item.shortLabel` (Task 2 Step 2 verifies the type);
  `kind`/`setKind` in Task 3 reuse the existing component state (only markup
  changes). No new types introduced.
