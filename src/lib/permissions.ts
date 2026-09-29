// Role → what each role can see. This is the single place to edit when GRAL
// confirms the role-permission matrix. The backend (Spring Security) is the
// real gatekeeper; this only decides what the UI shows.

import { ROLES, type Role } from "./types";

export type NavItem = { label: string; href: string; roles: readonly Role[] };

// PROVISIONAL — not yet confirmed by GRAL. Update once the matrix is agreed.
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", roles: ROLES },
  {
    label: "Claims",
    href: "/claims",
    roles: ["MD", "DMD", "Technical Director", "Finance Director", "Risk & Compliance Manager"],
  },
  { label: "Clients", href: "/clients", roles: ROLES },
  {
    label: "Renewals",
    href: "/renewals",
    roles: ["MD", "DMD", "Commercial Director", "Finance Director"],
  },
];

export function navItemsFor(role: Role) {
  return NAV_ITEMS.filter((item) => item.roles.includes(role));
}

/** Whether a role may open a given path (matches the nav item that owns it). */
export function canAccessPath(role: Role, pathname: string) {
  const item = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  return item ? item.roles.includes(role) : true;
}

/** Fine-grained permissions used inside the client screens (from the design). */
export function clientPermissions(role: Role) {
  return {
    canFlagNonCompliant: role === "Risk & Compliance Manager",
    seesDocumentDetail: role !== "Finance Director",
  };
}
