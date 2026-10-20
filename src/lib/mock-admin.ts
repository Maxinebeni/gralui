// Sample users, roles and permissions for demo mode. Codes, names and
// categories copy the backend's migrations (dev branch, 13 Oct 2026); the
// people are the backend's synthetic seed accounts.

import type { ManagedRole, ManagedUser, PermissionDefinition } from "./types";

export const PERMISSIONS: PermissionDefinition[] = [
  // Administration
  { code: "USER_READ", name: "Read users", category: "ADMINISTRATION", description: "List internal users" },
  { code: "USER_CREATE", name: "Provision users", category: "ADMINISTRATION", description: "Provision internal users" },
  { code: "USER_ASSIGN_ROLES", name: "Assign account roles", category: "ADMINISTRATION", description: "Assign roles to internal users" },
  { code: "USER_DEACTIVATE", name: "Deactivate users", category: "ADMINISTRATION", description: "Deactivate internal users" },
  { code: "USER_INVITE", name: "Resend invitations", category: "ADMINISTRATION", description: "Resend invitations within assigned grant authority" },
  { code: "ROLE_READ", name: "Read roles and permissions", category: "ADMINISTRATION", description: "List roles and permission definitions" },
  { code: "ROLE_CREATE", name: "Create roles", category: "ADMINISTRATION", description: "Create custom roles" },
  { code: "ROLE_UPDATE", name: "Edit role names and permissions", category: "ADMINISTRATION", description: "Update custom role names and grants" },
  { code: "CALENDAR_MANAGE", name: "Manage business calendar", category: "ADMINISTRATION", description: "Maintain versioned Rwanda business holidays" },
  { code: "DOCUMENT_LIBRARY_UPLOAD", name: "Upload administrator library documents", category: "ADMINISTRATION", description: "Upload documents to the administrator document library" },
  // Business
  { code: "CLIENT_READ", name: "Read clients", category: "BUSINESS", description: "Read currently authorized clients" },
  { code: "CLIENT_CREATE", name: "Register clients", category: "BUSINESS", description: "Register clients" },
  { code: "CLIENT_UPDATE", name: "Update clients", category: "BUSINESS", description: "Update client profiles" },
  { code: "CLIENT_CONTACT_UPDATE", name: "Manage client contacts", category: "BUSINESS", description: "Update primary client contacts" },
  { code: "CLIENT_ASSIGN", name: "Assign clients", category: "BUSINESS", description: "Assign client ownership" },
  { code: "CLIENT_RESTRICT", name: "Restrict clients", category: "BUSINESS", description: "Change restricted client visibility" },
  { code: "POLICY_READ", name: "Read policies", category: "BUSINESS", description: "Read authorized policy periods" },
  { code: "POLICY_CREATE", name: "Register policies", category: "BUSINESS", description: "Register policy identity and initial coverage period" },
  { code: "CLAIM_READ", name: "Read claims", category: "BUSINESS", description: "Read claims authorized by client scope" },
  { code: "CLAIM_REGISTER", name: "Register claims", category: "BUSINESS", description: "Register claims against known policy periods" },
  { code: "DOCUMENT_READ", name: "Read documents", category: "BUSINESS", description: "Read evidence linked to an authorized business resource" },
  { code: "DOCUMENT_UPLOAD", name: "Upload documents", category: "BUSINESS", description: "Upload or link evidence to an authorized business resource" },
  { code: "INSURER_REFERENCE_UPDATE", name: "Maintain insurer catalog", category: "BUSINESS", description: "Maintain insurer references" },
  { code: "PRODUCT_REFERENCE_UPDATE", name: "Maintain product catalog", category: "BUSINESS", description: "Maintain insurance product references" },
];

const ADMIN_PERMISSIONS = PERMISSIONS.filter((p) => p.category === "ADMINISTRATION").map((p) => p.code);
const CLIENT_BASIC = ["CLIENT_READ", "POLICY_READ", "DOCUMENT_READ"];
const CLAIMS_VIEW = ["CLIENT_READ", "POLICY_READ", "CLAIM_READ", "DOCUMENT_READ"];

let roleSeq = 0;
function role(code: string, name: string, category: ManagedRole["category"], permissions: string[]): ManagedRole {
  roleSeq += 1;
  return { id: `00000000-0000-0000-0000-${String(roleSeq).padStart(12, "0")}`, code, name, category, permissions, version: 1 };
}

export const ROLES_DATA: ManagedRole[] = [
  role("ADMINISTRATOR", "System Administrator", "ADMINISTRATION", ADMIN_PERMISSIONS),
  role("ACCOUNTS_EXECUTIVE", "Accounts Executive", "BUSINESS", [...CLIENT_BASIC, "CLIENT_CREATE", "CLIENT_UPDATE", "CLIENT_CONTACT_UPDATE"]),
  role("CLIENT_RELATION_RECORDS_OFFICER", "Client Relation Records Officer", "BUSINESS", CLIENT_BASIC),
  role("CRM_MANAGER", "CRM Manager", "BUSINESS", [...CLIENT_BASIC, "CLIENT_CREATE", "CLIENT_UPDATE", "CLIENT_CONTACT_UPDATE", "CLIENT_ASSIGN", "CLIENT_RESTRICT"]),
  role("GI_UNDERWRITING_MANAGER", "GI Underwriting Manager", "BUSINESS", [...CLIENT_BASIC, "POLICY_CREATE", "INSURER_REFERENCE_UPDATE", "PRODUCT_REFERENCE_UPDATE"]),
  role("CLAIMS_UNDERWRITER", "Claims Underwriter", "BUSINESS", CLAIMS_VIEW),
  role("CLAIMS_MANAGER", "Claims Manager", "BUSINESS", [...CLAIMS_VIEW, "CLAIM_REGISTER"]),
  role("TECHNICAL_DIRECTOR", "Technical Director", "BUSINESS", CLAIMS_VIEW),
  role("MD", "Managing Director", "BUSINESS", CLAIMS_VIEW),
  role("DMD", "Deputy Managing Director", "BUSINESS", CLAIMS_VIEW),
  role("RISK_COMPLIANCE_MANAGER", "Risk & Compliance Manager", "BUSINESS", CLAIMS_VIEW),
  role("INTERNAL_AUDIT_MANAGER", "Internal Audit Manager", "BUSINESS", CLAIMS_VIEW),
];

let userSeq = 0;
function user(
  email: string,
  fullName: string,
  roles: string[],
  status: ManagedUser["status"] = "ACTIVE",
  category: ManagedUser["profileCategory"] = "BUSINESS",
): ManagedUser {
  userSeq += 1;
  const at = `2026-10-${String(Math.min(13, 1 + userSeq)).padStart(2, "0")}T08:00:00Z`;
  return {
    id: `10000000-0000-0000-0000-${String(userSeq).padStart(12, "0")}`,
    email,
    fullName,
    status,
    profileCategory: category,
    roles,
    version: 1,
    createdAt: at,
    updatedAt: at,
  };
}

export const USERS_DATA: ManagedUser[] = [
  user("platform.admin@globalrisk.rw", "Platform Administrator", ["ADMINISTRATOR"], "ACTIVE", "ADMINISTRATION"),
  user("seed-crm@globalrisk.rw", "Synthetic CRM Tester", ["CRM_MANAGER"]),
  user("seed-ae-one@globalrisk.rw", "Synthetic Accounts Executive One", ["ACCOUNTS_EXECUTIVE"]),
  user("seed-ae-two@globalrisk.rw", "Synthetic Accounts Executive Two", ["ACCOUNTS_EXECUTIVE"]),
  user("seed-client-relation@globalrisk.rw", "Synthetic Client Relation Records Officer", ["CLIENT_RELATION_RECORDS_OFFICER"]),
  user("seed-gi-underwriting@globalrisk.rw", "Synthetic GI Underwriting Manager", ["GI_UNDERWRITING_MANAGER"]),
  user("seed-claims-underwriter@globalrisk.rw", "Synthetic Claims Underwriter", ["CLAIMS_UNDERWRITER"]),
  user("seed-claims-manager@globalrisk.rw", "Synthetic Claims Manager", ["CLAIMS_MANAGER"]),
  user("seed-technical-director@globalrisk.rw", "Synthetic Technical Director", ["TECHNICAL_DIRECTOR"]),
  user("seed-md@globalrisk.rw", "Synthetic Managing Director", ["MD"]),
  user("seed-dmd@globalrisk.rw", "Synthetic Deputy Managing Director", ["DMD"]),
  user("seed-risk-compliance@globalrisk.rw", "Synthetic Risk Compliance Manager", ["RISK_COMPLIANCE_MANAGER"]),
  user("seed-internal-audit@globalrisk.rw", "Synthetic Internal Audit Manager", ["INTERNAL_AUDIT_MANAGER"]),
  user("new.underwriter@globalrisk.rw", "Aline Uwase", ["CLAIMS_UNDERWRITER"], "INVITED"),
  user("former.exec@globalrisk.rw", "Didier Habimana", ["ACCOUNTS_EXECUTIVE"], "INACTIVE"),
];

/** The demo sign-in acts as this administrator account (for the "your own account" rules). */
export const DEMO_ADMIN_ID = USERS_DATA[0]!.id;
