// Shared front-end types. Keep these in line with the backend's OpenAPI
// contract once the Spring Boot team publishes it.

export const ROLES = [
  "MD",
  "DMD",
  "Technical Director",
  "Commercial Director",
  "Finance Director",
  "Risk & Compliance Manager",
] as const;

export type Role = (typeof ROLES)[number];

export type ClientType = "Corporate" | "State Enterprise" | "NGO" | "Financial Institution" | "SME";

export type ClientDoc = {
  name: string;
  filed: boolean;
  expiry?: string;
  status?: "ok" | "soon" | "expired";
};

/** Policy statuses. Active, Lapsed and Cancelled come from the requirements document. */
export const POLICY_STATUSES = ["Active", "In Renewal", "Lapsed", "Cancelled"] as const;
export type PolicyStatus = (typeof POLICY_STATUSES)[number];

export type Policy = {
  id: string;
  classOfInsurance: string;
  insurer: string;
  sumInsured: number;
  premium: number;
  start: string;
  renewal: string;
  status: PolicyStatus;
};

/** Primary contact person at the client (requirements doc, section 4). */
export type ClientContact = {
  name: string;
  title: string;
  email: string;
  phone: string;
};

export type Client = {
  id: string;
  name: string;
  type: ClientType;
  sector: string;
  /** Physical address. Optional because the older sample records do not have one. */
  address?: string;
  /** Primary contact person. Optional because the older sample records do not have one. */
  contact?: ClientContact;
  activePolicies: number;
  kyc: boolean;
  policiesOk: boolean;
  claimsOk: boolean;
  correspondenceOk: boolean;
  docsFiled: number;
  docsTotal: number;
  nonCompliant: boolean;
  manager: string;
  documents: ClientDoc[];
  policies: Policy[];
  correspondence: { date: string; subject: string; channel: string }[];
};

/** Claim summary as shown on a client's profile (Claims tab). */
export type ClientClaim = {
  id: string;
  client: string;
  classOfInsurance: string;
  amount: number;
  step: number;
  sla: "breached" | "approaching" | "ontrack";
};

export type InsurerSummary = { insurer: string; policies: number; premium: number };

/* --------------------------------- Renewals ---------------------------------- */
// Proposed contract for the renewal API (backlog REN-01 to REN-06). Agree the
// final field names with the backend team (PLN-03) before connecting.

/** GRAL's renewal milestones from the SOP, in order (see lib/renewals.ts). */
export type RenewalMilestoneCode =
  | "BRIEF"
  | "VISIT"
  | "NOTICE"
  | "RFQ"
  | "QUOTES"
  | "APPROVAL"
  | "ACCEPTANCE"
  | "SCHEDULE"
  | "DELIVERY"
  | "COMPLETION";

/** One milestone that has been completed on a renewal case. */
export type CompletedMilestone = {
  code: RenewalMilestoneCode;
  completedAt: string; // ISO date
  completedBy: string;
  note: string;
  evidence?: string; // document name or reference
};

export type RenewalQuote = {
  id: string;
  insurer: string;
  premium: number;
  terms: string;
  recommended: boolean;
};

/** Written client acceptance — required before placement. */
export type RenewalAcceptance = {
  quoteId: string;
  acceptedAt: string; // ISO date
  recordedBy: string;
  evidence: string;
};

export type RenewalCase = {
  id: string; // renewal case reference, e.g. REN-2026-001
  policyId: string;
  clientId: string;
  client: string;
  classOfInsurance: string;
  insurer: string;
  premium: number;
  expiryDate: string; // ISO date the current cover ends
  owner: string; // Accounts Executive responsible
  completed: CompletedMilestone[];
  quotes: RenewalQuote[];
  acceptance?: RenewalAcceptance;
};

export type RenewalMonth = { month: string; premium: number; policies: number };

/* ------------------------------ Overview extras ------------------------------ */

export type ClaimStep = { n: number; name: string; sla: string };
export type ClaimMonth = { month: string; amount: number; count: number };
export type ActivityItem = { who: string; what: string; when: string };

export type SessionUser = {
  email: string;
  name: string;
  role: Role;
};