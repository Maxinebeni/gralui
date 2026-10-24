// GRAL's client onboarding (SOP Handbook v3, section 3), as the backend runs it:
// a lead covers steps 1 and 2; each policy being placed is a policy track that
// runs steps 3 to 11 on its own. The backend decides deadlines, blockers and
// which actions are allowed; this file only names them in plain words.

import { workingDaysBetween } from "./claims";
import { todayIso } from "./renewals";
import type { Lead, PolicyTrack } from "./types";

export type StageDef = {
  n: number;
  /** The backend's milestone code for this step. */
  code: string;
  name: string;
  owner: string;
  deadlineLabel: string;
  task: string;
};

/** Steps 3 to 11, one policy track each. */
export const TRACK_STAGES: StageDef[] = [
  { n: 3, code: "KYC", name: "KYC & AML verification", owner: "Accounts Executive · Risk & Compliance Manager approves", deadlineLabel: "Before any quotation", task: "The client's KYC review must be approved. It is shared by all of the client's policy tracks." },
  { n: 4, code: "SURVEY", name: "Risk survey", owner: "Technical Director", deadlineLabel: "5 working days after the meeting", task: "Site visit, hazards and controls, a Low, Medium or High grade, and the written report. Not needed for individuals." },
  { n: 5, code: "PROGRAM", name: "Insurance programme", owner: "Technical Director", deadlineLabel: "3 working days", task: "The recommended covers, with the programme signed by the Technical Director." },
  { n: 6, code: "RFQ", name: "Request for quotations", owner: "Underwriting Manager", deadlineLabel: "24 hours after the programme", task: "Send the terms of reference to at least 3 licensed insurers, or ask the MD for a single-source exception." },
  { n: 7, code: "COMPARISON", name: "Quotes & comparison", owner: "Underwriting Manager", deadlineLabel: "2 working days", task: "Record every insurer's answer, compare the quotes and recommend one. Two usable quotes are enough; one needs the MD's exception." },
  { n: 8, code: "APPROVAL", name: "Internal approval", owner: "Technical Director / MD", deadlineLabel: "Before the presentation", task: "Approval by expected annual commission: under RWF 1m the TD; RWF 1m to 10m the TD then the MD; above that the MD, then the Board's written approval recorded by the MD." },
  { n: 9, code: "ACCEPTANCE", name: "Presentation & acceptance", owner: "Accounts Executive", deadlineLabel: "3 working days after approval", task: "Present the approved recommendation and get the client's written acceptance. Accepting is not cover yet." },
  { n: 10, code: "PLACEMENT", name: "Placement & verification", owner: "Underwriting Manager", deadlineLabel: "2 working days after acceptance", task: "Instruct the insurer, record its confirmation and the schedule, check the schedule matches the accepted terms, then convert it into the client's policy." },
  { n: 11, code: "WELCOME", name: "Welcome & filing", owner: "Accounts Executive", deadlineLabel: "2 working days after the schedule", task: "Send the welcome letter, deliver the verified policy documents and complete the client file checklist." },
];

/** The tracker's stages: steps 3 to 11 in three groups. */
export const TRACK_PHASES: { name: string; stages: number[] }[] = [
  { name: "Assess", stages: [3, 4, 5] },
  { name: "Quote", stages: [6, 7, 8] },
  { name: "Close", stages: [9, 10, 11] },
];

export function stageOf(n: number): StageDef {
  return TRACK_STAGES.find((s) => s.n === n) ?? TRACK_STAGES[0]!;
}

export function phaseOf(n: number) {
  return TRACK_PHASES.find((p) => p.stages.includes(n))?.name ?? "";
}

/** SOP target for the whole onboarding, in working days. */
export const ONBOARDING_TARGET_DAYS = 15;

/* ----------------------------------- Leads ----------------------------------- */

export type LeadStepKey = "ASSIGN" | "CONFIRM" | "RESPOND" | "ASSESS" | "CLIENT";

/** Steps 1 and 2 as a short checklist, in order. */
export const LEAD_STEPS: { key: LeadStepKey; step: 1 | 2; name: string; owner: string; deadline: string }[] = [
  { key: "ASSIGN", step: 1, name: "Assign the Accounts Executive", owner: "CRM Manager", deadline: "Same day" },
  { key: "CONFIRM", step: 1, name: "Confirm the registration", owner: "Commercial Director", deadline: "Same day" },
  { key: "RESPOND", step: 2, name: "First response to the prospect", owner: "Accounts Executive", deadline: "Within 24 hours" },
  { key: "ASSESS", step: 2, name: "Meeting & needs assessment", owner: "Accounts Executive", deadline: "3 working days" },
  { key: "CLIENT", step: 2, name: "Open the prospect client", owner: "Accounts Executive", deadline: "After the assessment" },
];

export function leadStepDone(l: Lead, key: LeadStepKey): boolean {
  switch (key) {
    case "ASSIGN":
      return !!l.ownerId;
    case "CONFIRM":
      return l.confirmed;
    case "RESPOND":
      return !!l.respondedAt;
    case "ASSESS":
      return l.assessed;
    case "CLIENT":
      return !!l.clientId;
  }
}

/** The first lead step still to do, or null when the lead is ready for policy tracks. */
export function nextLeadStep(l: Lead) {
  return LEAD_STEPS.find((s) => !leadStepDone(l, s.key)) ?? null;
}

export function leadReady(l: Lead) {
  return !!l.clientId && l.assessed && l.confirmed && (l.status === "OPEN" || l.status === "CONVERTED");
}

export const LEAD_STATUS_LABEL: Record<string, string> = {
  OPEN: "Open",
  CONVERTED: "Converted",
  CLOSED_LOST: "Closed: lost",
  CANCELLED: "Cancelled",
};

export const TRACK_STATUS_LABEL: Record<string, string> = {
  OPEN: "In progress",
  ON_HOLD: "On hold",
  COMPLETED: "Completed",
  CLOSED_LOST: "Closed: lost",
  CANCELLED: "Cancelled",
};

/** Working days since the lead came in (or until it converted). */
export function leadAge(l: Lead) {
  const start = l.receivedAt.slice(0, 10);
  const end = (l.convertedAt ?? new Date().toISOString()).slice(0, 10);
  return workingDaysBetween(start, end);
}

/* --------------------------------- Deadlines --------------------------------- */

/** The open milestone of a track: what is due now. */
export function openMilestone(t: PolicyTrack) {
  return t.milestones.find((m) => m.status === "OPEN") ?? null;
}

export type Health = "done" | "overdue" | "due-soon" | "on-track" | "held" | "closed";

export function trackHealth(t: PolicyTrack): Health {
  if (t.status === "COMPLETED") return "done";
  if (t.status === "ON_HOLD") return "held";
  if (t.status !== "OPEN") return "closed";
  const due = openMilestone(t)?.dueAt?.slice(0, 10);
  if (!due) return "on-track";
  const left = workingDaysBetween(todayIso(), due);
  if (left < 0) return "overdue";
  if (left <= 1) return "due-soon";
  return "on-track";
}

/** The lead's own deadline while steps 1 and 2 are open. */
export function leadHealth(l: Lead): Health {
  if (l.status === "CONVERTED") return "done";
  if (l.status !== "OPEN") return "closed";
  const due = (!l.respondedAt ? l.responseDueAt : !l.assessed ? l.needsDueAt : undefined)?.slice(0, 10);
  if (!due) return "on-track";
  const left = workingDaysBetween(todayIso(), due);
  if (left < 0) return "overdue";
  if (left <= 1) return "due-soon";
  return "on-track";
}

/* ------------------------------ Words for codes ------------------------------ */

/** The backend's blocker codes in plain words. */
const BLOCKERS: Record<string, string> = {
  OWNER_REQUIRED: "An Accounts Executive must be assigned.",
  LEAD_CONFIRMATION_REQUIRED: "The Commercial Director has not confirmed the registration yet.",
  ASSESSMENT_REQUIRED: "The needs assessment has not been recorded yet.",
  CLIENT_IDENTITY_REQUIRED: "The prospect client has not been opened or linked yet.",
  NOT_STARTED: "The client's KYC review has not been started.",
  DRAFT: "The client's KYC review is still being prepared.",
  SUBMITTED: "The client's KYC review is waiting for the Risk & Compliance Manager.",
  RETURNED: "The Risk & Compliance Manager returned the KYC review for changes.",
  REJECTED: "The client's KYC review was rejected.",
  KYC_REVIEW_OVERDUE: "The KYC review is past its 3-working-day deadline.",
  KYC_NOT_READY: "The client's KYC is not approved yet.",
  KYC_IDENTITY_CHANGED: "The client's details changed after KYC approval, so a new KYC review is needed.",
  KYC_TEMPLATE_CHANGED: "GRAL's KYC checklist changed after approval, so a new KYC review is needed.",
  SURVEY_APPLICABILITY_REQUIRED: "Record that a risk survey does not apply to this individual, with the reason.",
  RISK_SURVEY_REQUIRED: "The risk survey report is needed.",
  PROGRAM_SIGNOFF_REQUIRED: "The programme signed by the Technical Director is needed.",
  RFQ_DISPATCH_REQUIRED: "The requests for quotations have not been sent yet.",
  RFQ_RESPONSES_UNACCOUNTED: "Every insurer asked must be accounted for: a quote, a decline, or no reply after the due date.",
  QUOTE_REQUIRED: "No quotes recorded yet.",
  SINGLE_SOURCE_APPROVAL_REQUIRED: "Only one insurer quoted, so the MD must approve a single-source exception.",
  APPROVAL_REQUIRED: "The recommendation must be sent for internal approval.",
  APPROVAL_PENDING: "Waiting for the internal approval.",
  APPROVAL_RETURNED: "The approver returned the recommendation. Revise it and send it again.",
  APPROVAL_REJECTED: "The recommendation was rejected.",
  APPROVAL_STATUS_UNAVAILABLE: "The approval's status could not be checked right now.",
  APPROVAL_DISABLED: "Approvals are not switched on in the system yet, so this step cannot continue. Ask Toochukwu to enable the onboarding approval policy.",
  CLIENT_PRESENTATION_REQUIRED: "The presentation to the client has not been recorded.",
  WRITTEN_ACCEPTANCE_REQUIRED: "The client's written acceptance is needed. A verbal yes is not enough.",
  PROPERTY_ASSET_LIST_REQUIRED: "Property cover needs the client's detailed asset list before placement.",
  PLACEMENT_CONFIRMATION_REQUIRED: "Waiting for the insurer's confirmation of the placement.",
  POLICY_SCHEDULE_REQUIRED: "The insurer's policy schedule has not been received.",
  SCHEDULE_TERMS_MISMATCH: "The schedule does not match the accepted terms. Get a corrected schedule from the insurer.",
  TECHNICAL_VERIFICATION_REQUIRED: "The Technical Director must check the schedule.",
  POLICY_VERIFICATION_REQUIRED: "The underwriter's final check of the schedule is needed.",
};

export function blockerText(code: string) {
  return BLOCKERS[code] ?? code.replace(/_/g, " ").toLowerCase().replace(/^./, (c) => c.toUpperCase()) + ".";
}

/** Button and form titles for the backend's action codes. */
export const ACTION_LABEL: Record<string, string> = {
  QUALIFY_KYC: "Confirm KYC is approved",
  SURVEY: "Record the risk survey",
  SURVEY_NOT_APPLICABLE: "Survey not applicable",
  PROGRAM: "Record the signed programme",
  LICENSE: "Record an insurer licence check",
  SINGLE_SOURCE: "Ask for a single-source exception",
  RFQ: "Send requests for quotations",
  QUOTE: "Record a quote",
  RECOMMEND: "Recommend a quote",
  REQUEST_APPROVAL: "Send for internal approval",
  REVISE: "Revise the recommendation",
  RECORD_BOARD_EVIDENCE: "Record the Board's approval",
  PRESENT: "Record the presentation",
  ACCEPT: "Record the written acceptance",
  PROPERTY_ASSETS: "Record the asset list",
  PLACE: "Instruct the insurer",
  CONFIRM_PLACEMENT: "Record the insurer's confirmation",
  SCHEDULE: "Record the policy schedule",
  TECHNICAL_VERIFICATION: "Record the TD's check",
  VERIFY: "Verify the schedule",
  CONVERT: "Convert into the client's policy",
  WELCOME: "Complete welcome & filing",
  ASSIGN: "Change who is assigned",
  ON_HOLD: "Put on hold",
  RESUME: "Resume",
  CLOSE: "Close this track",
};

export const RESPONSIBILITY_LABEL: Record<string, string> = {
  OWNER: "Accounts Executive",
  TECHNICAL: "Technical Director",
  UNDERWRITING: "Underwriting Manager",
};

export const TIER_LABEL: Record<string, string> = {
  STANDARD: "Standard (under RWF 1m): the Technical Director approves",
  LARGE: "Large (RWF 1m to 10m): the Technical Director, then the MD",
  STRATEGIC: "Strategic (above RWF 10m): the MD, then the Board's written approval",
  SINGLE_SOURCE: "Single-source exception: the Technical Director, then the MD",
};

export function commissionTier(annualCommissionRwf: number) {
  return annualCommissionRwf < 1_000_000 ? "STANDARD" : annualCommissionRwf <= 10_000_000 ? "LARGE" : "STRATEGIC";
}

export const LEAD_SOURCES = [
  "Referral from an existing client",
  "Referral from a partner or insurer",
  "Direct approach",
  "Website enquiry",
  "Marketing campaign",
  "Tender invitation",
  "Other",
];

/** Client types for the prospect client. Individuals only for individual leads. */
export const PROSPECT_TYPES: { code: string; label: string; leadType: "CORPORATE" | "INDIVIDUAL" }[] = [
  { code: "CORPORATE", label: "Corporate", leadType: "CORPORATE" },
  { code: "SME", label: "SME", leadType: "CORPORATE" },
  { code: "NGO", label: "NGO", leadType: "CORPORATE" },
  { code: "STATE_ENTERPRISE", label: "State Enterprise", leadType: "CORPORATE" },
  { code: "FINANCIAL_INSTITUTION", label: "Financial Institution", leadType: "CORPORATE" },
  { code: "INDIVIDUAL", label: "Individual", leadType: "INDIVIDUAL" },
];

/* --------------------------------- KYC --------------------------------------- */

export const KYC_STATUS_LABEL: Record<string, string> = {
  NOT_STARTED: "Not started",
  DRAFT: "Being prepared",
  SUBMITTED: "Waiting for compliance",
  RETURNED: "Returned for changes",
  APPROVED: "Approved",
  REJECTED: "Rejected",
};

/**
 * A suggested starting checklist, offered when GRAL has not set one up in the
 * system yet. PROVISIONAL: the SOP names only the core documents; GRAL confirms
 * the rest before it is saved as their checklist.
 */
export const SUGGESTED_KYC_REQUIREMENTS: Record<"CORPORATE" | "INDIVIDUAL", { code: string; label: string; required: boolean }[]> = {
  CORPORATE: [
    { code: "CERTIFICATE_OF_INCORPORATION", label: "Certificate of Incorporation", required: true },
    { code: "TIN_CERTIFICATE", label: "TIN / VAT registration certificate", required: true },
    { code: "REPRESENTATIVE_ID", label: "ID or passport of the company representative", required: true },
    { code: "BENEFICIAL_OWNERS", label: "Beneficial owners list (25% or more)", required: true },
    { code: "TRADING_LICENCE", label: "Trading licence", required: false },
    { code: "AML_QUESTIONNAIRE", label: "Signed AML / KYC questionnaire", required: true },
  ],
  INDIVIDUAL: [
    { code: "NATIONAL_ID", label: "National ID or passport", required: true },
    { code: "PROOF_OF_ADDRESS", label: "Proof of address", required: true },
    { code: "TIN_CERTIFICATE", label: "TIN certificate, if registered", required: false },
  ],
};

/* ----------------------- The original 11-step journey ----------------------- */
// The Leads screens show one journey of 11 steps per lead. Steps 1 and 2 are
// the backend's lead; steps 3 to 11 are one of its policy tracks (the furthest
// one, or the one picked when there are several).

export type JourneyStep = { n: number; name: string; owner: string; deadline: string };

export const JOURNEY_STEPS: JourneyStep[] = [
  { n: 1, name: "Lead registration", owner: "Commercial Director · CRM Manager assigns", deadline: "Same day" },
  { n: 2, name: "Meeting & needs assessment", owner: "Accounts Executive", deadline: "3 working days" },
  ...TRACK_STAGES.map((s) => ({
    n: s.n,
    name: { 5: "Insurance programme design", 6: "Quotation request", 7: "Comparative analysis", 10: "Policy placement" }[s.n] ?? s.name,
    owner: s.owner,
    deadline: s.deadlineLabel,
  })),
];

export const JOURNEY_PHASES: { name: string; steps: number[] }[] = [
  { name: "Meet", steps: [1, 2] },
  { name: "Assess", steps: [3, 4, 5] },
  { name: "Quote", steps: [6, 7, 8] },
  { name: "Close", steps: [9, 10, 11] },
];

/** The track a lead's journey shows: the open one furthest along, else the latest completed. */
export function primaryTrack(tracks: PolicyTrack[]): PolicyTrack | undefined {
  const rank = (t: PolicyTrack) => (t.status === "OPEN" || t.status === "ON_HOLD" ? 100 : t.status === "COMPLETED" ? 50 : 0) + t.stage;
  return [...tracks].sort((a, b) => rank(b) - rank(a))[0];
}

/** The step being worked on (1 to 11), or null when the journey is complete. */
export function journeyStep(l: Lead, t?: PolicyTrack): number | null {
  if (!(l.ownerId && l.confirmed)) return 1;
  if (!(l.respondedAt && l.assessed && l.clientId)) return 2;
  if (!t) return 3;
  if (t.status === "COMPLETED") return null;
  return t.stage;
}

/** When the current step is due. */
export function journeyDue(l: Lead, t?: PolicyTrack): string | undefined {
  const step = journeyStep(l, t);
  if (step === 1) return l.receivedAt;
  if (step === 2) return !l.respondedAt ? l.responseDueAt : l.needsDueAt;
  return t ? openMilestone(t)?.dueAt : undefined;
}

export function journeyHealth(l: Lead, t?: PolicyTrack): Health {
  if (l.status === "CLOSED_LOST" || l.status === "CANCELLED") return "closed";
  if (journeyStep(l, t) === null) return "done";
  if (t && t.status !== "OPEN") return t.status === "ON_HOLD" ? "held" : "closed";
  const due = journeyDue(l, t)?.slice(0, 10);
  if (!due) return "on-track";
  const left = workingDaysBetween(todayIso(), due);
  return left < 0 ? "overdue" : left <= 1 ? "due-soon" : "on-track";
}

/** Short reference shown on screen: demo IDs as they are, backend UUIDs shortened. */
export function leadRef(id: string) {
  return id.length > 16 ? `LD-${id.slice(0, 8).toUpperCase()}` : id;
}
