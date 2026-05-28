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
      style={{ padding: "var(--space-4) var(--space-4) 0" }}
    >
      <nav
        aria-label="Primary"
        className="flex items-center"
        style={{
          gap: "var(--space-3)",
          padding: "var(--space-2) var(--space-4)",
          background: "var(--bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-pill)",
          boxShadow: "var(--shadow-md)",
        }}
      >
        <Link
          href="/"
          style={{
            fontFamily: "var(--font-display)",
            fontWeight: 600,
            fontSize: "var(--fs-body)",
            color: "var(--text)",
          }}
        >
          SyncFit
        </Link>

        <ul
          className="flex items-center list-none m-0 p-0"
          style={{
            gap: "var(--space-2)",
          }}
        >
          {NAV_ITEMS.map((item) => {
            const active = isActivePath(pathname, item.href);
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className="btn btn--ghost"
                  style={{
                    borderRadius: "var(--radius-pill)",
                    color: active ? "var(--link)" : "var(--text-muted)",
                    fontWeight: active ? 600 : 400,
                    background: active ? "var(--surface)" : "transparent",
                    border: active
                      ? "1px solid var(--border)"
                      : "1px solid transparent",
                  }}
                >
                  <span className="sm:hidden">{item.shortLabel}</span>
                  <span className="hidden sm:inline">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>

        <div ref={menuRef} className="relative">
          <button
            ref={triggerRef}
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            // Only reference the panel while it is mounted; aria-controls
            // must not point at a non-existent element (WAI-ARIA).
            aria-controls={menuOpen ? "account-menu" : undefined}
            aria-label="Account menu"
            className="btn btn--ghost flex items-center"
            style={{
              gap: "var(--space-2)",
              borderRadius: "var(--radius-pill)",
            }}
          >
            <span
              aria-hidden="true"
              className="flex items-center justify-center h-7 w-7"
              style={{
                borderRadius: "var(--radius-pill)",
                background: "var(--accent-ochre)",
                color: "var(--on-primary)",
                fontWeight: 600,
                fontSize: "var(--fs-caption)",
              }}
            >
              {initial}
            </span>
            <span
              className="hidden sm:inline max-w-48"
              style={{
                color: "var(--text-muted)",
                fontSize: "var(--fs-body-sm)",
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
              id="account-menu"
              role="menu"
              aria-label="Account"
              className="card card--soft absolute right-0 z-50 min-w-56"
              style={{
                top: "calc(100% + var(--space-2))",
                borderRadius: "var(--radius-sm)",
                boxShadow: "var(--shadow-lg)",
                padding: "var(--space-2)",
              }}
            >
              <div role="none">
                <p
                  className="caption"
                  style={{
                    margin: 0,
                    padding: "var(--space-2) var(--space-3)",
                    color: "var(--text-muted)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {email}
                </p>
              </div>
              <Link
                href="/settings/devices"
                role="menuitem"
                className="btn btn--ghost w-full justify-start"
                style={{ borderRadius: "var(--radius-sm)" }}
                onClick={() => setMenuOpen(false)}
              >
                Devices
              </Link>
              <button
                type="button"
                role="menuitem"
                onClick={onSignOut}
                disabled={signingOut}
                className="btn btn--ghost w-full justify-start disabled:cursor-not-allowed disabled:opacity-60"
                style={{ borderRadius: "var(--radius-sm)" }}
              >
                {signingOut ? "Signing out…" : "Sign out"}
              </button>
              {signOutError ? (
                <p
                  role="alert"
                  className="caption"
                  style={{
                    margin: 0,
                    padding: "var(--space-1) var(--space-3)",
                    color: "var(--error)",
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
