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
  { href: "/log", label: "Log workout", shortLabel: "Log" },
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
