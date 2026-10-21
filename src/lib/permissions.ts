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
  /** Set for pages listed in another item's dropdown instead of the top bar. */
  parent?: string;
  /** Business pages with client data, hidden from Administration accounts. */
  businessOnly?: boolean;
};

/**
 * Modules whose permission codes exist in the backend today (permissions
 * table, dev branch). Add "CLAIM" and "RENEWAL" when the backend adds
 * CLAIM_READ and RENEWAL_READ — then those menus follow the backend too.
 */
const BACKEND_MODULES = ["CLIENT", "USER", "ROLE"];

const CLAIM_ROLES: readonly Role[] = [
  "MD",
  "DMD",
  "Technical Director",
  "Finance Director",
  "Risk & Compliance Manager",
  "Claims Manager",
  "Claims Underwriter",
  "Internal Audit Manager",
];

/** Everyone with a step in GRAL's onboarding SOP, plus oversight. PROVISIONAL. */
const ONBOARDING_ROLES: readonly Role[] = [
  "MD",
  "DMD",
  "Commercial Director",
  "CRM Manager",
  "Accounts Executive",
  "Client Relation Records Officer",
  "Technical Director",
  "GI Underwriting Manager",
  "Risk & Compliance Manager",
  "Internal Audit Manager",
];

const RENEWAL_ROLES: readonly Role[] = [
  "MD",
  "DMD",
  // Approves renewals under RWF 1M commission, so needs to see the case.
  "Technical Director",
  "Commercial Director",
  "Finance Director",
  "Accounts Executive",
  "CRM Manager",
  "Client Relation Records Officer",
  "GI Underwriting Manager",
];

// CLIENT_READ is a real backend code. CLAIM_READ and RENEWAL_READ are
// proposed names — confirm them with the backend team (PLN-02).
// Items with a parent appear in that item's dropdown, not in the top bar.
/** Parent for pages listed in the name menu at the top right. */
export const ACCOUNT_MENU = "account";

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", href: "/", permission: null, roles: ROLES, businessOnly: true },
  // Everyone has work assigned to them; the list only shows what they may see.
  { label: "My Work", href: "/my-work", permission: null, roles: ROLES, parent: "/" },
  // Everyone can follow the requests they sent; deciding depends on the step's role.
  { label: "Approvals", href: "/approvals", permission: null, roles: ROLES, parent: "/" },
  { label: "Claims", href: "/claims", permission: "CLAIM_READ", roles: CLAIM_ROLES, businessOnly: true },
  { label: "All Claims", href: "/claims/all", permission: "CLAIM_READ", roles: CLAIM_ROLES, parent: "/claims", businessOnly: true },
  { label: "Clients", href: "/clients", permission: "CLIENT_READ", roles: ROLES, businessOnly: true },
  { label: "All Clients", href: "/clients/all", permission: "CLIENT_READ", roles: ROLES, parent: "/clients", businessOnly: true },
  { label: "Leads", href: "/clients/leads", permission: "CLIENT_READ", roles: ONBOARDING_ROLES, parent: "/clients", businessOnly: true },
  { label: "Renewals", href: "/renewals", permission: "RENEWAL_READ", roles: RENEWAL_ROLES, businessOnly: true },
  // Admin pages sit in the name (account) menu, not the top bar. Real backend
  // permissions; in demo mode only the MD sees them.
  { label: "Users", href: "/admin", permission: "USER_READ", roles: ["MD"], parent: ACCOUNT_MENU },
  { label: "Roles & Permissions", href: "/admin/roles", permission: "ROLE_READ", roles: ["MD"], parent: ACCOUNT_MENU },
];

/** Pages without a menu item of their own, and the menu item that controls them. */
const PAGE_OWNERS: Record<string, string> = {
  "/policies": "/clients",
};

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

/** The technical Administration account (manages users and roles, no client data). */
export function isAdministrationAccount(user: SessionUser) {
  return user.role === "Administrator";
}

function canSee(user: SessionUser, item: NavItem) {
  if (item.businessOnly && isAdministrationAccount(user)) return false;
  if (item.permission === null) return true;
  if (usesBackendPermissions(user) && BACKEND_MODULES.includes(moduleOf(item.permission))) {
    return hasPermission(user, item.permission);
  }
  return item.roles.includes(user.role);
}

/** Top-bar items this user can see. */
export function navItemsFor(user: SessionUser) {
  return NAV_ITEMS.filter((item) => !item.parent && canSee(user, item));
}

/** Dropdown entries under a top-bar item that this user can see. */
export function navChildrenFor(user: SessionUser, parentHref: string) {
  return NAV_ITEMS.filter((item) => item.parent === parentHref && canSee(user, item));
}

/** Whether the user may open a given path (matches the menu item that owns it). */
export function canAccessPath(user: SessionUser, pathname: string) {
  const owner = Object.keys(PAGE_OWNERS).find((p) => pathname.startsWith(p));
  if (owner) pathname = PAGE_OWNERS[owner]!;
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

/**
 * Who can work on claims. PROVISIONAL — the design's roles plus the SOP's
 * claims roles; replace with CLAIM_* permissions once the backend has them.
 * DMD chairs the Claims Committee; the fraud flag is limited to Technical
 * Director, Risk & Compliance Manager and MD (data-shapes proposal).
 */
export function claimPermissions(role: Role) {
  return {
    canUpdateClaims: ["Technical Director", "DMD", "MD", "Claims Manager", "Claims Underwriter"].includes(role),
    canDecideDisputes: role === "DMD" || role === "MD",
    canSeeFraudFlag: ["Technical Director", "Risk & Compliance Manager", "MD"].includes(role),
    seesDocumentDetail: role !== "Finance Director",
    /** Whether this role may give the next settlement sign-off. */
    canSign: (signer: string | null) => !!signer && (signer === role || (signer === "Board" && role === "MD")),
  };
}

/** Fine-grained permissions used inside the client screens (from the design). */
export function clientPermissions(role: Role) {
  return {
    canFlagNonCompliant: role === "Risk & Compliance Manager",
    seesDocumentDetail: role !== "Finance Director",
  };
}

/**
 * Approvals. PROVISIONAL until the backend has APPROVAL_* permissions. Who
 * decides is set per step by the approval rules (lib/approvals.ts); these
 * roles can also see every request, for oversight and audit.
 */
export function approvalPermissions(role: Role) {
  return {
    seesAllRequests: ["MD", "DMD", "Technical Director", "Risk & Compliance Manager", "Internal Audit Manager"].includes(role),
  };
}

/** My Work. PROVISIONAL until the backend has TASK_* permissions (WFL-02). */
export function taskPermissions(role: Role) {
  return {
    /** Can see the whole team's tasks and hand them to someone else. */
    managesTeamWork: [
      "MD",
      "DMD",
      "Technical Director",
      "Commercial Director",
      "Claims Manager",
      "CRM Manager",
      "GI Underwriting Manager",
    ].includes(role),
  };
}

/**
 * Documents. With the backend, uploading needs DOCUMENT_UPLOAD (not granted to
 * any role yet — ask TC). In demo mode, everyone except the read-only
 * oversight roles may upload.
 */
export function documentPermissions(user: SessionUser) {
  return {
    canUpload: usesBackendPermissions(user)
      ? hasPermission(user, "DOCUMENT_UPLOAD")
      : user.role !== "Internal Audit Manager" && user.role !== "Finance Director",
  };
}

/**
 * Administration actions, straight from the backend's permission codes. In
 * demo mode the MD can do everything, so the screens can be shown.
 */
export function adminPermissions(user: SessionUser) {
  const has = (code: string) => (usesBackendPermissions(user) ? hasPermission(user, code) : user.role === "MD");
  return {
    canInvite: has("USER_CREATE") && has("USER_ASSIGN_ROLES"),
    canResendInvite: has("USER_INVITE"),
    canAssignRoles: has("USER_ASSIGN_ROLES"),
    canDeactivate: has("USER_DEACTIVATE"),
    canCreateRole: has("ROLE_CREATE"),
    canUpdateRole: has("ROLE_UPDATE"),
  };
}

/** Where "home" is for this person: Overview, or the first page they can open. */
export function homePathFor(user: SessionUser) {
  return ["/", "/admin", "/my-work"].find((p) => canAccessPath(user, p)) ?? "/my-work";
}

/**
 * Onboarding. PROVISIONAL until the backend has onboarding permissions. Each
 * step has an owner in the SOP; these roles can record steps, and oversight
 * roles can only view. The KYC Approval Form and internal approval are
 * decided in Approvals, by the Risk & Compliance Manager and the TD / MD.
 */
export function onboardingPermissions(role: Role) {
  return {
    canUpdate: [
      "MD",
      "DMD",
      "Commercial Director",
      "CRM Manager",
      "Accounts Executive",
      "Client Relation Records Officer",
      "Technical Director",
      "GI Underwriting Manager",
      "Risk & Compliance Manager",
    ].includes(role),
    /** Lead registration: the Commercial Director (or Sales & Marketing) and the CRM Manager, who assigns the AE. */
    canRegisterLead: ["MD", "DMD", "Commercial Director", "CRM Manager"].includes(role),
  };
}
