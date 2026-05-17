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
          style={{
            listStyle: "none",
            margin: 0,
            padding: 0,
            gap: "var(--ds-space-2)",
          }}
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
                    color: active
                      ? "var(--ds-primary)"
                      : "var(--ds-text-muted)",
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
            style={{
              gap: "var(--ds-space-2)",
              borderRadius: "var(--ds-radius-pill)",
            }}
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
