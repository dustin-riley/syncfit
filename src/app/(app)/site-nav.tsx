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
