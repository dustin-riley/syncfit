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
//                   .site-nav__menu           (connected-chip dropdown; mounted when open)
//                 .site-nav__rail             (short labels; shown < --bp-phone)
//
// The menu is a CHILD of .site-nav__account (the only positioned element it
// needs) — a plain absolutely-positioned dropdown that overlays the page;
// nothing reflows when it opens. `data-open` on the account wrap drives the
// connected-chip seam. Because the menu lives inside the wrap, a single
// containment ref on the wrap covers both the trigger and the menu.

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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const initial = (email.trim()[0] ?? "?").toUpperCase();

  // Dismiss the menu on outside pointer-down and on Escape; return focus to
  // the trigger so keyboard users are not stranded. The menu lives INSIDE
  // .site-nav__account, so a single containment test on the wrap covers both
  // the trigger and the menu — a pointer-down anywhere inside is "inside,"
  // so menu-item clicks are never dismissed before they land.
  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (
        accountRef.current &&
        !accountRef.current.contains(e.target as Node)
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
          connects seamlessly. The menu is nested inside so a single ref
          covers trigger + menu for outside-click dismissal. */}
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

        {/* Connected-chip dropdown — child of the chip, absolutely positioned,
            overlays the page. Conditionally mounted so the open animation
            replays each time. */}
        {menuOpen ? (
          <div
            id="account-menu"
            role="menu"
            aria-label="Account"
            className="site-nav__menu"
          >
            {/* role="none" — a bare <p> is not a valid owned child of
                role="menu"; the wrapper removes it from menu semantics
                while keeping the text visible (restores fix from 5e02203,
                which the v0.5 handoff dropped). */}
            <div role="none">
              <p className="site-nav__menu-email">{email}</p>
            </div>
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
              <div role="none">
                <p
                  role="alert"
                  className="site-nav__menu-email"
                  style={{ color: "var(--error)", borderBottom: "none" }}
                >
                  {signOutError}
                </p>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

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
