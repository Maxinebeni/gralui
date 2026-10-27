// Shared front-end types. Keep these in line with the backend's OpenAPI
// contract once the Spring Boot team publishes it.
 
// The first six come from the original design. The rest are GRAL roles the
// backend defines (roles table, migration V9). Commercial and Finance Director
// exist only in the design so far — confirm with GRAL whether they are real.
export const ROLES = [
  "MD",
  "DMD",
  "Technical Director",
  "Commercial Director",
  "Finance Director",
  "Risk & Compliance Manager",
  "Accounts Executive",
  "CRM Manager",
  "Client Relation Records Officer",
  "GI Underwriting Manager",
  "Claims Manager",
  "Claims Underwriter",
  "Internal Audit Manager",
] as const;

/**
 * "Staff" is for accounts whose backend roles this app does not know yet
 * (for example a custom role an administrator created). Their menus follow
 * their backend permissions only. "Administrator" is the technical
 * Administration account: it manages users and roles and sees no client data.
 */
export type Role = (typeof ROLES)[number] | "Staff" | "Administrator";

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
  /** The policy number issued by the insurer, shown on screen. */
  id: string;
  /** Backend policy ID (UUID). Only set for policies loaded from the backend. */
  uuid?: string;
  /** Backend ID of the current cover period. Only set for backend policies. */
  periodId?: string;
  /** Backend version. Only set for backend policies. */
  version?: number;
  classOfInsurance: string;
  insurer: string;
  /** Optional: the backend's first policy API does not record amounts yet. */
  sumInsured?: number;
  premium?: number;
  start: string;
  renewal: string;
  status: PolicyStatus;
  /** Financial terms from the import template. Optional: older sample records do not have them. */
  netPremium?: number;
  amountPaid?: number;
  /** For example 0.15 for 15%. */
  commissionRate?: number;
};
 
/** Primary contact person at the client (requirements doc, section 4). */
export type ClientContact = {
  name: string;
  title: string;
  email: string;
  phone: string;
};
 
export type Client = {
  /** The client reference shown on screen, e.g. CLT-001. */
  id: string;
  /** Backend client ID (UUID). Only set for clients loaded from the backend. */
  uuid?: string;
  /** Backend version number, needed when saving changes. Only set for backend clients. */
  version?: number;
  /** Backend ID of the assigned relationship manager. */
  managerId?: string;
  name: string;
  type: ClientType;
  sector: string;
  /** Physical address. Optional because the older sample records do not have one. */
  address?: string;
  /** Free text remarks stored on the backend client profile. */
  remarks?: string;
  /** Primary contact person. Optional because the older sample records do not have one. */
  contact?: ClientContact;
  activePolicies: number;
  kyc: boolean;
  /** Backend gate status returned by GET /clients/{clientId}/kyc-summary. */
  kycGateStatus?: string;
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
  /** Where the claim is, e.g. "4 · Follow up" or "Closed · settled". */
  stage: string;
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
 
/** Written client acceptance, required before placement. */
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
 
/* ---------------------------------- Claims ----------------------------------- */
// Proposed contract for the claims API (backlog CLM-01 to CLM-07), following
// GRAL's SOP: six steps plus a dispute path to the Claims Committee. Agree the
// final field names with the backend team before connecting.
 
export type ClaimStepCode = "REGISTER" | "DOCUMENTS" | "SUBMIT" | "FOLLOW_UP" | "SETTLEMENT" | "CLOSE";
 
export type ClaimPriority = "P1" | "P2" | "P3";
 
export type ClaimDocument = {
  name: string;
  required: boolean;
  filedAt?: string; // ISO date; missing = not received yet
  evidence?: string;
};
 
export type ClaimFollowUp = {
  date: string; // ISO date
  by: string;
  channel: "Email" | "Call" | "Letter" | "Meeting";
  note: string;
  insurerResponded: boolean;
};
 
/** Rejected claim sent to the Claims Committee (DMD chairs). */
export type ClaimDispute = {
  raisedAt: string;
  reason: string;
  decision?: "APPEAL" | "ACCEPT_REJECTION";
  decidedAt?: string;
  decidedBy?: string;
  note?: string;
};
 
export type ClaimSettlement = {
  advisedAt: string;
  amount: number;
  /** Roles that have signed off, in order (see claimSignOffChain). */
  signedBy: string[];
  paidToClientAt?: string;
  evidence?: string;
};
 
export type ClaimClosure = {
  closedAt: string;
  by: string;
  outcome: "SETTLED" | "REJECTION_ACCEPTED";
  evidence: string;
};
 
export type ClaimEvent = { at: string; by: string; text: string };
 
export type Claim = {
  id: string; // e.g. CLM-2025-089
  /** Backend claim ID (UUID). Only set for claims loaded from the backend. */
  uuid?: string;
  /** Backend version. Only set for backend claims. */
  version?: number;
  clientId: string;
  client: string;
  policyId?: string; // unknown at registration is allowed
  /** Backend policy period the claim is registered on. Only set for backend claims. */
  policyPeriodId?: string;
  /** Currency of the amount, e.g. RWF. Only set for backend claims. */
  currency?: string;
  classOfInsurance: string;
  insurer: string;
  dateOfLoss: string; // ISO date
  dateReported: string; // ISO date
  amount: number; // estimated loss in RWF
  priority: ClaimPriority;
  step: ClaimStepCode;
  stepStartedAt: string; // ISO date the current step began
  handler: string;
  description: string;
  documents: ClaimDocument[];
  submission?: { submittedAt: string; insurerClaimNo?: string; evidence: string };
  followUps: ClaimFollowUp[];
  dispute?: ClaimDispute;
  settlement?: ClaimSettlement;
  closure?: ClaimClosure;
  /** Visible only to Technical Director, Risk & Compliance Manager and MD. */
  fraudFlag?: boolean;
  notes: ClaimEvent[];
  history: ClaimEvent[];
};
 
/* --------------------------------- Approvals --------------------------------- */
// Proposed contract for the approvals API (backlog APR-01 to APR-04,
// Christian). See docs/approvals-and-my-work-fields.md.

export type ApprovalSubjectType =
  | "RENEWAL"
  | "CLAIM_SETTLEMENT"
  | "KYC"
  | "POLICY_ENDORSEMENT"
  /** Internal approval of a policy track's recommendation or single-source request (onboarding step 8). */
  | "NEW_BUSINESS";
export type ApprovalStatus = "PENDING" | "APPROVED" | "REJECTED" | "RETURNED";
export type ApprovalDecision = "APPROVE" | "REJECT" | "RETURN";
 
export type ApprovalStep = {
  requiredPermission?: string;
  evidencePurpose?: string;
  order: number;
  /** Role that must decide this step, e.g. "Technical Director". */
  role: string;
  /** "Board" steps are informed, not asked to decide. */
  informOnly?: boolean;
  status: "WAITING" | "PENDING" | "APPROVED" | "REJECTED" | "RETURNED" | "INFORMED";
  decidedBy?: string;
  decidedAt?: string; // ISO date
  comment?: string;
};
 
/** A document attached as evidence, pinned to an exact version (APR-03). */
export type EvidenceRef = { name: string; documentId?: string; version?: number };
 
export type ApprovalRequest = {
  action?: string;
  currentStepNumber?: number;
  boardEvidence?: { documentId: string; version: number }[] | null;
  id: string; // e.g. APR-2026-014
  subjectType: ApprovalSubjectType;
  /** ID of the record being approved (renewal, claim, client or policy). */
  subjectId: string;
  /** Reference shown on screen, e.g. REN-2026-004. */
  subjectRef: string;
  /** Revision of the record when approval was requested; a changed record needs a new approval. */
  subjectRevision: number;
  title: string;
  summary: string;
  clientId?: string;
  client?: string;
  amount?: number;
  /** What the amount means, e.g. "Annual commission" or "Settlement". */
  amountLabel?: string;
  /** Version of the approval rules used to build the steps, e.g. "RENEWAL-2026.1". */
  policyVersion: string;
  requestedBy: string;
  requestedAt: string; // ISO date
  dueAt: string; // ISO date
  status: ApprovalStatus;
  steps: ApprovalStep[];
  evidenceRequired: boolean;
  evidence: EvidenceRef[];
  /** Changes when the request changes; sent back with each decision. */
  version: number;
  history: ClaimEvent[];
};
 
/* --------------------------------- My Work ----------------------------------- */
// Proposed contract for workflow tasks (backlog WFL-02 and WFL-04, Christian).
 
export type TaskType =
  | "CLAIM_STEP"
  | "CLAIM_FOLLOW_UP"
  | "CLAIM_DISPUTE"
  | "CLAIM_SIGN_OFF"
  | "RENEWAL_MILESTONE"
  | "APPROVAL"
  | "KYC_DOCUMENT"
  | "ONBOARDING_STEP"
  | "MANUAL";

export type TaskResourceType = "CLAIM" | "RENEWAL" | "CLIENT" | "POLICY" | "APPROVAL" | "LEAD" | "ONBOARDING" | "KYC_REVIEW";

export type WorkTask = {
  id: string;
  /** Logical key, so the same piece of work never appears twice, e.g. CLAIM:CLM-2025-089:DOCUMENTS. */
  key: string;
  type: TaskType;
  title: string;
  detail?: string;
  resourceType: TaskResourceType;
  resourceId: string;
  resourceRef: string;
  client?: string;
  /** Person the task is assigned to. Empty when it belongs to a role (e.g. "MD"). */
  owner?: string;
  ownerRole?: string;
  dueDate: string; // ISO date
  status: "OPEN" | "DONE";
  /** SYSTEM tasks close when the record moves on; MANUAL tasks are completed by hand. */
  source: "SYSTEM" | "MANUAL";
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
  history: ClaimEvent[];
};
 
/* ------------------------------- Policy detail ------------------------------- */
// Proposed contract for policy detail (backlog POL-02 to POL-05, TC).
 
export type PolicyMovementType = "NEW" | "RENEWAL" | "ENDORSEMENT" | "END_R" | "END_N" | "CANCELLATION";
 
/** One cover period. A renewal adds a new period of the same policy. */
export type PolicyPeriod = {
  periodId: string;
  from: string; // ISO date
  to: string; // ISO date
  sumInsured: number | null;
  netPremium: number | null;
  totalPremium: number | null;
  movement: PolicyMovementType;
  bookingNote?: string;
  current: boolean;
};
 
export type PolicyMovement = {
  id: string;
  date: string; // ISO date the change takes effect
  type: PolicyMovementType;
  description: string;
  premiumChange?: number;
  evidence?: string;
  by: string;
};
 
/**
 * Balance and commission are worked out by the system, never typed in (Import
 * Template v3.1). null means the value has not been recorded yet.
 */
export type PolicyFinancials = {
  sumInsured: number | null;
  totalPremium: number | null;
  netPremium: number | null;
  amountPaid: number | null;
  /** For example 0.15 for 15%. */
  commissionRate: number | null;
  balance: number | null; // totalPremium − amountPaid
  commission: number | null; // netPremium × commissionRate
};
 
export type PolicyDetail = {
  policy: Policy;
  clientId: string;
  client: string;
  financials: PolicyFinancials;
  /** Newest first; the first one is the current period. */
  periods: PolicyPeriod[];
  /** Newest first. */
  movements: PolicyMovement[];
  claims: ClientClaim[];
  renewalCaseId?: string;
};
 
/* --------------------------------- Documents --------------------------------- */
// Matches the backend's document API (DOC-01 to DOC-03, /api/v1/documents).
 
export type DocumentClassification =
  | "KYC"
  | "POLICY_SCHEDULE"
  | "CLAIM_EVIDENCE"
  | "CLIENT_ACCEPTANCE"
  | "APPROVAL_EVIDENCE"
  | "CORRESPONDENCE";
 
/** The record a document belongs to. */
export type DocumentSubject = {
  type: "CLIENT" | "POLICY" | "CLAIM" | "RENEWAL" | "APPROVAL" | "LEAD" | "ONBOARDING" | "KYC";
  /** Backend UUID when the record comes from the backend, otherwise its reference. */
  id: string;
};
 
export type StoredDocument = {
  id: string;
  version: number;
  originalFileName: string;
  mediaType: string;
  sizeBytes: number;
  classification: DocumentClassification;
  purpose: string;
  uploadedAt: string; // ISO date-time
  /** Earlier versions, newest first (kept when a file is replaced). */
  previous: { version: number; originalFileName: string; uploadedAt: string }[];
};

/* ---------------------------- Leads and onboarding ---------------------------- */
// The backend's model (ADR-027, docs/api/onboarding.md in the backend repo).
// A lead is the prospect (SOP steps 1 and 2). Each policy being placed for it
// is a separate policy track (steps 3 to 11) that moves on its own. KYC is a
// review of the client, shared by all of its tracks. These shapes match the
// backend's LeadView, OnboardingView and KycView, so screens read them as-is.

export type LeadStatus = "OPEN" | "CONVERTED" | "CLOSED_LOST" | "CANCELLED";
export type LeadType = "CORPORATE" | "INDIVIDUAL";

/** A document recorded as proof of an action, pinned to an exact version. */
export type Proof = {
  purpose: string;
  documentId: string;
  documentVersion: number;
  occurredAt: string; // ISO date-time
  /** Shown on screen when known (demo mode, or a file uploaded in this tab). */
  fileName?: string;
};

export type Lead = {
  id: string;
  name: string;
  type: LeadType;
  industry: string;
  source: string;
  sourceReference?: string;
  contactName: string;
  email?: string;
  phone?: string;
  ownerId?: string;
  clientId?: string;
  status: LeadStatus;
  version: number;
  /** The Commercial Director confirmed the registration. */
  confirmed: boolean;
  receivedAt: string;
  respondedAt?: string;
  assessed: boolean;
  convertedAt?: string;
  /** e.g. OWNER_REQUIRED, LEAD_CONFIRMATION_REQUIRED, ASSESSMENT_REQUIRED, CLIENT_IDENTITY_REQUIRED. */
  blockers: string[];
  assessment?: {
    meetingAt: string;
    needs: string;
    assets: string;
    employeeCount?: number;
    existingCover: string;
    evidence: Proof[];
  };
  possibleDuplicateLeadIds: string[];
  responseDueAt?: string;
  needsDueAt?: string;
  work: { kind: string; taskId: string; status: string }[];
  responseEvidence?: Proof;
  registeredAt: string;
  updatedAt: string;
  /** Front-end additions: names resolved from IDs. */
  ownerName?: string;
  clientName?: string;
};

export type TrackStatus = "OPEN" | "ON_HOLD" | "COMPLETED" | "CLOSED_LOST" | "CANCELLED";

export type TrackMilestone = {
  /** KYC, SURVEY, PROGRAM, RFQ, COMPARISON, APPROVAL, ACCEPTANCE, PLACEMENT, WELCOME. */
  code: string;
  stage: number;
  dueAt?: string;
  status: string; // OPEN | COMPLETED | CANCELLED
  assigneeId?: string;
};

export type PolicyTerms = {
  insurerId: string;
  productId: string;
  insuredName: string;
  effectDate: string; // ISO date
  expiryDate: string;
  netPremium: number;
  totalPremium: number;
  currency: string;
  /** Fraction, e.g. 0.15 for 15%. */
  commissionRate: number;
  sumsInsured: string;
  limits: string;
  deductibles: string;
  exclusions: string;
  claimsSupport: string;
};

export type TrackQuote = {
  id: string;
  version: number;
  terms: PolicyTerms;
  insurerReference?: string;
  receivedAt: string;
  documentId?: string;
  documentVersion?: number;
};

export type TrackInvitation = {
  insurerId: string;
  sentAt: string;
  responseDue: string; // ISO date
  /** QUOTED, DECLINED or NO_RESPONSE; empty while waiting. */
  response?: string;
  resolvedAt?: string;
  responseDetail?: string;
};

/** The client's KYC as a policy track sees it: whether quotes may go ahead. */
export type KycGate = {
  clientId: string;
  caseId?: string;
  /** NOT_STARTED, DRAFT, SUBMITTED, RETURNED, APPROVED, REJECTED. */
  status: string;
  /** READY when the track may go ahead; otherwise why not. */
  gateStatus: string;
  completeDocumentsAt?: string;
  dueAt?: string;
  revisedDueAt?: string;
  missingRequirements: string[];
};

export type PolicyTrack = {
  id: string;
  leadId: string;
  clientId: string;
  ownerId?: string;
  productId: string;
  /** GI_UNDERWRITING_MANAGER or MEDICAL_UNDERWRITING_MANAGER. */
  underwritingRole: string;
  /** SOP step, 3 to 11. */
  stage: number;
  status: TrackStatus;
  version: number;
  materialRevision: number;
  milestones: TrackMilestone[];
  quotes: TrackQuote[];
  recommendation?: {
    quoteId: string;
    quoteVersion: number;
    annualCommissionRwf: number;
    basis: string;
    comparison: string;
    rationale: string;
    /** STANDARD (under RWF 1m), LARGE (RWF 1m to 10m) or STRATEGIC (above). */
    tier: string;
  };
  /** Approval request IDs by purpose: RECOMMENDATION, SINGLE_SOURCE. */
  approvalRequests: Record<string, string>;
  evidence: Proof[];
  observedSchedule?: PolicyTerms;
  discrepancies: string[];
  policyId?: string;
  policyPeriodId?: string;
  renewalId?: string;
  convertedAt?: string;
  blockers: string[];
  /** The buttons the backend allows the signed-in person right now. */
  availableActions: string[];
  riskGrade?: string;
  surveyFindings?: string;
  programTerms?: string;
  invitations: TrackInvitation[];
  renewalProfile?: string;
  /** People by responsibility: OWNER, TECHNICAL, UNDERWRITING. */
  assignees: Record<string, string>;
  kyc?: KycGate;
  boardApproval?: { authority: string; recordedBy: string; recordedAt: string; decisionAt: string };
  /** Front-end additions. */
  productName?: string;
  leadName?: string;
};

/** One entry of a lead's, track's or KYC review's history. */
export type CommandHistory = { action: string; actorId?: string; actorName?: string; reason?: string; occurredAt: string };

export type KycReviewStatus = "DRAFT" | "SUBMITTED" | "RETURNED" | "APPROVED" | "REJECTED";

export type KycRequirement = { code: string; label: string; required: boolean };

/** GRAL's KYC checklist for a client type, set up in the system and versioned. */
export type KycTemplate = { code: string; version: number; clientType: LeadType; requirements: KycRequirement[] };

/** A KYC review of one client. */
export type KycReview = {
  reviewerId?: string;
  id: string;
  clientId: string;
  version: number;
  status: KycReviewStatus;
  templateCode: string;
  templateVersion: number;
  items: (KycRequirement & { documentId?: string; documentVersion?: number })[];
  /** CLEAR, REVIEW_REQUIRED or REJECTED. */
  screeningResult?: string;
  completeDocumentsAt?: string;
  /** Review deadline: 3 working days after the last required document. */
  dueAt?: string;
  revisedDueAt?: string;
  decidedBy?: string;
  decidedAt?: string;
  blockers: string[];
  screeningNotes?: string;
  decisionReason?: string;
  evidence: (Proof & { receivedAt?: string })[];
  /** Front-end addition. */
  clientName?: string;
};

/* ------------------------------ Administration ------------------------------- */
// Matches the backend's /api/v1/admin endpoints (users, roles, permissions).

/** Every account and role is one or the other, fixed when it is created. */
export type AccessCategory = "BUSINESS" | "ADMINISTRATION";

export type ManagedUser = {
  id: string;
  email: string;
  fullName: string;
  status: "INVITED" | "ACTIVE" | "INACTIVE";
  profileCategory: AccessCategory;
  /** Role codes, e.g. CLAIMS_MANAGER. */
  roles: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
};

/** A signed-in browser session (GET /api/v1/admin/sessions). Cookie IDs are never sent. */
export type ManagedSession = {
  /** Administrative reference used to end the session; not the browser cookie. */
  sessionReference: string;
  userId: string;
  email: string;
  fullName: string;
  /** May be empty for sessions that started before session monitoring. */
  authenticatedAt?: string;
  lastAccessedAt?: string;
  expiresAt?: string;
};

export type ManagedRole = {
  id: string;
  code: string;
  name: string;
  category: AccessCategory;
  /** Permission codes, e.g. CLIENT_READ. */
  permissions: string[];
  version: number;
};

export type PermissionDefinition = {
  code: string;
  name: string;
  category: AccessCategory;
  description: string;
};

/* ------------------------------ Overview extras ------------------------------ */
 
export type ClaimStep = { n: number; name: string; sla: string };
export type ClaimMonth = { month: string; amount: number; count: number };
/** One thing someone did, for Recent Activity. `at` is an ISO date or date-time. */
export type ActivityItem = { at: string; who: string; what: string; module: "Claims" | "Renewals"; href: string };

export type SessionUser = {
  /** Backend user ID (UUID). */
  id?: string;
  email: string;
  name: string;
  role: Role;
  /** Role codes exactly as the backend sends them, e.g. ADMINISTRATOR. */
  backendRoles?: string[];
  /** Effective permission codes from the backend, e.g. CLIENT_CREATE. */
  permissions?: string[];
};
