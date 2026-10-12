// What each signed-in user can see. The backend (Spring Security) is the real
// gatekeeper; this only decides what the UI shows.
//
// For each menu item:
// - If the backend already defines that module's permissions (BACKEND_MODULES)
//   and the user signed in through it, the item follows the backend exactly.
// - Otherwise (module not built yet, sample login, or the older ft-auth
//   backend that sends no permissions) it follows the provisional role lists.

import { ROLES, type Role, type SessionUser } from "./types";

export type NavItem = {
  label: string;
  href: string;
  /** Backend permission code that shows this item. null = every signed-in user. */
  permission: string | null;
  /** Used until the backend defines this module's permissions. PROVISIONAL. */
  roles: readonly Role[];
};

/**
 * Modules whose permission codes exist in the backend today (permissions
 * table, dev branch). Add "CLAIM" and "RENEWAL" when the backend adds
 * CLAIM_READ and RENEWAL_READ — then those menus follow the backend too.
 */
const BACKEND_MODULES = ["CLIENT"];

// CLIENT_READ is a real backend code. CLAIM_READ and RENEWAL_READ are
// proposed names — confirm them with the backend team (PLN-02).
export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", permission: null, roles: ROLES },
  {
    label: "Claims",
    href: "/claims",
    permission: "CLAIM_READ",
    roles: [
      "MD",
      "DMD",
      "Technical Director",
      "Finance Director",
      "Risk & Compliance Manager",
      "Claims Manager",
      "Claims Underwriter",
      "Internal Audit Manager",
    ],
  },
  { label: "Clients", href: "/clients", permission: "CLIENT_READ", roles: ROLES },
  {
    label: "Renewals",
    href: "/renewals",
    permission: "RENEWAL_READ",
    roles: [
      "MD",
      "DMD",
      "Commercial Director",
      "Finance Director",
      "Accounts Executive",
      "CRM Manager",
      "Client Relation Records Officer",
      "GI Underwriting Manager",
    ],
  },
];

/** True when the user signed in through a backend that sends permissions. */
export function usesBackendPermissions(user: SessionUser) {
  return (user.permissions ?? []).length > 0;
}

/** Whether the user holds a backend permission code. */
export function hasPermission(user: SessionUser, code: string) {
  return (user.permissions ?? []).includes(code);
}

function moduleOf(permission: string) {
  return permission.split("_")[0]!;
}

function canSee(user: SessionUser, item: NavItem) {
  if (item.permission === null) return true;
  if (usesBackendPermissions(user) && BACKEND_MODULES.includes(moduleOf(item.permission))) {
    return hasPermission(user, item.permission);
  }
  return item.roles.includes(user.role);
}

export function navItemsFor(user: SessionUser) {
  return NAV_ITEMS.filter((item) => canSee(user, item));
}

/** Whether the user may open a given path (matches the menu item that owns it). */
export function canAccessPath(user: SessionUser, pathname: string) {
  const item = [...NAV_ITEMS]
    .sort((a, b) => b.href.length - a.href.length)
    .find((i) => (i.href === "/" ? pathname === "/" : pathname.startsWith(i.href)));
  return item ? canSee(user, item) : true;
}

/**
 * Who can update renewal cases (complete milestones, add quotes, record
 * acceptance). PROVISIONAL — the design's roles plus the SOP milestone
 * owners; replace with RENEWAL_* permissions once the backend has them.
 */
export function renewalPermissions(role: Role) {
  return {
    canUpdateRenewals: [
      "Commercial Director",
      "DMD",
      "MD",
      "Accounts Executive",
      "CRM Manager",
      "GI Underwriting Manager",
    ].includes(role),
  };
}

/** Fine-grained permissions used inside the client screens (from the design). */
export function clientPermissions(role: Role) {
  return {
    canFlagNonCompliant: role === "Risk & Compliance Manager",
    seesDocumentDetail: role !== "Finance Director",
  };
}
