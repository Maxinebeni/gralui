// The claim lifecycle on GRAL's backend (CLM-03 to CLM-06), as one list of
// actions. Each action is POST /api/v1/claims/{id}/workflow/{action}; the
// server checks the permission, role, state, evidence and fields. These specs
// mirror its rules (ClaimWorkflowApplicationService, 8 Nov 2026) so the screen
// only offers what can succeed and asks for exactly what the server needs.

import type { DocumentClassification, SessionUser } from "./types";

export type ClaimServerState =
  | "REGISTERED"
  | "DOCUMENTS_PENDING"
  | "READY_FOR_SUBMISSION"
  | "SUBMITTED_TO_INSURER"
  | "UNDER_FOLLOW_UP"
  | "SETTLEMENT_ADVISED"
  | "DISPUTED_REJECTED"
  | "CLAIMS_COMMITTEE_REVIEW"
  | "APPEAL_IN_PROGRESS"
  | "FINAL_DECISION"
  | "SETTLED"
  | "CLOSED";

export const CLAIM_STATE_LABEL: Record<string, string> = {
  REGISTERED: "Registered",
  DOCUMENTS_PENDING: "Collecting documents",
  READY_FOR_SUBMISSION: "Ready to submit",
  SUBMITTED_TO_INSURER: "Submitted to the insurer",
  UNDER_FOLLOW_UP: "Following up with the insurer",
  SETTLEMENT_ADVISED: "Settlement advised",
  DISPUTED_REJECTED: "Disputed or rejected",
  CLAIMS_COMMITTEE_REVIEW: "With the Claims Committee",
  APPEAL_IN_PROGRESS: "Appeal in progress",
  FINAL_DECISION: "Final decision recorded",
  SETTLED: "Settled",
  CLOSED: "Closed",
};

export type ClaimFieldKind = "date" | "text" | "textarea" | "money" | "select" | "file";

export type ClaimFieldSpec = {
  key: "occurredAt" | "summary" | "externalReference" | "amount" | "outcome" | "file";
  label: string;
  kind: ClaimFieldKind;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
};

export type ClaimActionSpec = {
  /** The action path, e.g. insurer-submitted. */
  path: string;
  /** The server's action name, as it appears in history. */
  code: string;
  label: string;
  help: string;
  states: ClaimServerState[];
  permission: string;
  /** Only these backend roles may do it, on top of the permission. */
  roles?: string[];
  /** Grouping on the screen. */
  stage: "Prepare" | "Insurer" | "Dispute" | "Settlement" | "Close";
  evidence?: { purpose: string; classification: DocumentClassification; required: boolean; label: string };
  fields: ClaimFieldSpec[];
};

const WHEN: ClaimFieldSpec = { key: "occurredAt", label: "Date it happened", kind: "date", required: true };
const SUMMARY: ClaimFieldSpec = { key: "summary", label: "What happened", kind: "textarea", required: true };
const NOTE: ClaimFieldSpec = { key: "summary", label: "Note", kind: "textarea" };
const AMOUNT: ClaimFieldSpec = { key: "amount", label: "Amount (RWF)", kind: "money", required: true };
const letter = (required: boolean, label = "Letter or email"): ClaimActionSpec["evidence"] => ({
  purpose: "CORRESPONDENCE",
  classification: "CORRESPONDENCE",
  required,
  label,
});
const record = (label: string): ClaimActionSpec["evidence"] => ({
  purpose: "CLAIM_EVIDENCE",
  classification: "CLAIM_EVIDENCE",
  required: true,
  label,
});
const choose = (...pairs: [string, string][]) => pairs.map(([value, label]) => ({ value, label }));

const FOLLOW_UP_STATES: ClaimServerState[] = ["SUBMITTED_TO_INSURER", "UNDER_FOLLOW_UP"];

export const CLAIM_ACTIONS: ClaimActionSpec[] = [
  {
    path: "readiness-recorded",
    code: "READINESS_RECORDED",
    label: "Mark the documents pack ready",
    help: "Every required document in the checklist must be attached. Not applicable does not count for a required item.",
    states: ["REGISTERED", "DOCUMENTS_PENDING"],
    permission: "CLAIM_READINESS_RECORD",
    stage: "Prepare",
    fields: [WHEN, NOTE],
  },
  {
    path: "insurer-submitted",
    code: "INSURER_SUBMITTED",
    label: "Submit the claim to the insurer",
    help: "Record the formal intimation sent to the insurer. A follow-up task is created for 10 working days later.",
    states: ["READY_FOR_SUBMISSION"],
    permission: "CLAIM_SUBMIT",
    stage: "Insurer",
    evidence: { purpose: "INSURER_SUBMISSION", classification: "CORRESPONDENCE", required: true, label: "Formal intimation sent" },
    fields: [
      WHEN,
      { key: "externalReference", label: "Insurer's claim reference", kind: "text", required: true },
      NOTE,
    ],
  },
  {
    path: "insurer-acknowledged",
    code: "INSURER_ACKNOWLEDGED",
    label: "Record the insurer's acknowledgement",
    help: "A routine acknowledgement. It does not stop the response clock.",
    states: FOLLOW_UP_STATES,
    permission: "CLAIM_ACKNOWLEDGEMENT_RECORD",
    stage: "Insurer",
    evidence: letter(true, "Acknowledgement"),
    fields: [WHEN, { key: "externalReference", label: "Insurer's claim reference", kind: "text", required: true }, NOTE],
  },
  {
    path: "follow-up-recorded",
    code: "FOLLOW_UP_RECORDED",
    label: "Record a follow-up",
    help: "Record the contact with the insurer. The next follow-up is set 10 working days later.",
    states: FOLLOW_UP_STATES,
    permission: "CLAIM_FOLLOW_UP_RECORD",
    stage: "Insurer",
    fields: [WHEN, { ...SUMMARY, label: "Who you spoke to and what they said" }],
  },
  {
    path: "insurer-response-recorded",
    code: "INSURER_RESPONSE_RECORDED",
    label: "Record the insurer's response",
    help: "A substantive response stops the wait. An information request pauses it until you send the information.",
    states: FOLLOW_UP_STATES,
    permission: "CLAIM_RESPONSE_RECORD",
    stage: "Insurer",
    evidence: letter(false),
    fields: [
      WHEN,
      {
        key: "outcome",
        label: "Type of response",
        kind: "select",
        required: true,
        options: choose(["SUBSTANTIVE", "A decision or substantive answer"], ["INFORMATION_REQUEST", "They asked for more information"]),
      },
      SUMMARY,
    ],
  },
  {
    path: "insurer-information-sent",
    code: "INSURER_INFORMATION_SENT",
    label: "Record the information sent to the insurer",
    help: "Restarts the response clock and sets the next follow-up.",
    states: FOLLOW_UP_STATES,
    permission: "CLAIM_RESPONSE_RECORD",
    stage: "Insurer",
    evidence: letter(true, "What was sent"),
    fields: [WHEN, NOTE],
  },
  {
    path: "escalated-to-technical-director",
    code: "ESCALATED_TO_TECHNICAL_DIRECTOR",
    label: "Escalate to the Technical Director",
    help: "Only after 15 working days without a substantive response, once per wait, and not while information is owed to the insurer. Claims Manager only.",
    states: FOLLOW_UP_STATES,
    permission: "CLAIM_ESCALATE",
    roles: ["CLAIMS_MANAGER"],
    stage: "Insurer",
    evidence: record("Escalation note"),
    fields: [WHEN, NOTE],
  },
  {
    path: "settlement-advised",
    code: "SETTLEMENT_ADVISED",
    label: "Record the insurer's settlement offer",
    help: "The amount the insurer has advised.",
    states: FOLLOW_UP_STATES,
    permission: "CLAIM_SETTLEMENT_RECORD",
    stage: "Settlement",
    evidence: letter(true, "Settlement advice"),
    fields: [WHEN, AMOUNT, SUMMARY],
  },
  {
    path: "dispute-recorded",
    code: "DISPUTE_RECORDED",
    label: "Record a dispute or rejection",
    help: "Creates a Claims Committee review task for the DMD, due in 5 working days.",
    states: ["SUBMITTED_TO_INSURER", "UNDER_FOLLOW_UP", "SETTLEMENT_ADVISED"],
    permission: "CLAIM_DISPUTE_RECORD",
    stage: "Dispute",
    evidence: letter(true, "Rejection or dispute letter"),
    fields: [WHEN, SUMMARY],
  },
  {
    path: "committee-referred",
    code: "COMMITTEE_REFERRED",
    label: "Refer to the Claims Committee",
    help: "For a significant coverage question during follow-up.",
    states: ["UNDER_FOLLOW_UP"],
    permission: "CLAIM_COMMITTEE_ROUTE",
    stage: "Dispute",
    fields: [WHEN, SUMMARY],
  },
  {
    path: "committee-convened",
    code: "COMMITTEE_CONVENED",
    label: "Record the committee meeting",
    help: "The DMD records the actual meeting. Members vote after this.",
    states: ["DISPUTED_REJECTED", "CLAIMS_COMMITTEE_REVIEW", "APPEAL_IN_PROGRESS"],
    permission: "CLAIM_COMMITTEE_ROUTE",
    roles: ["DMD"],
    stage: "Dispute",
    fields: [WHEN, SUMMARY],
  },
  {
    path: "committee-vote-recorded",
    code: "COMMITTEE_VOTE_RECORDED",
    label: "Record my committee vote",
    help: "The DMD, Technical Director and Claims Manager each vote once per meeting.",
    states: ["CLAIMS_COMMITTEE_REVIEW", "APPEAL_IN_PROGRESS"],
    permission: "CLAIM_COMMITTEE_OUTCOME_RECORD",
    roles: ["DMD", "TECHNICAL_DIRECTOR", "CLAIMS_MANAGER"],
    stage: "Dispute",
    fields: [
      WHEN,
      {
        key: "outcome",
        label: "Vote",
        kind: "select",
        required: true,
        options: choose(
          ["APPEAL", "Appeal the insurer's position"],
          ["NO_APPEAL", "Do not appeal"],
          ["COUNTER_DECLINE_APPROVE", "Approve the counter-decline"],
          ["COUNTER_DECLINE_REJECT", "Reject the counter-decline"],
        ),
      },
      SUMMARY,
    ],
  },
  {
    path: "committee-decision",
    code: "COMMITTEE_DECISION",
    label: "Record the committee decision",
    help: "The DMD records it. At least two members must have voted the same way.",
    states: ["CLAIMS_COMMITTEE_REVIEW"],
    permission: "CLAIM_COMMITTEE_OUTCOME_RECORD",
    roles: ["DMD"],
    stage: "Dispute",
    evidence: record("Committee minutes"),
    fields: [
      WHEN,
      { key: "outcome", label: "Decision", kind: "select", required: true, options: choose(["APPEAL", "Appeal"], ["NO_APPEAL", "Do not appeal"]) },
      SUMMARY,
    ],
  },
  {
    path: "appeal-recorded",
    code: "APPEAL_RECORDED",
    label: "Record the appeal sent to the insurer",
    help: "",
    states: ["APPEAL_IN_PROGRESS"],
    permission: "CLAIM_APPEAL_RECORD",
    stage: "Dispute",
    evidence: letter(true, "Appeal letter"),
    fields: [WHEN, SUMMARY],
  },
  {
    path: "counter-decline-recorded",
    code: "COUNTER_DECLINE_RECORDED",
    label: "Record a counter-decline letter",
    help: "Claims Manager only. The Technical Director reviews it next.",
    states: ["APPEAL_IN_PROGRESS"],
    permission: "CLAIM_APPEAL_RECORD",
    roles: ["CLAIMS_MANAGER"],
    stage: "Dispute",
    evidence: letter(true, "Counter-decline letter"),
    fields: [WHEN, SUMMARY],
  },
  {
    path: "counter-decline-reviewed",
    code: "COUNTER_DECLINE_REVIEWED",
    label: "Review the counter-decline",
    help: "Technical Director only. If approved, the DMD convenes a fresh committee meeting.",
    states: ["APPEAL_IN_PROGRESS"],
    permission: "CLAIM_COMMITTEE_OUTCOME_RECORD",
    roles: ["TECHNICAL_DIRECTOR"],
    stage: "Dispute",
    evidence: record("Review note"),
    fields: [
      WHEN,
      { key: "outcome", label: "Review", kind: "select", required: true, options: choose(["APPROVED", "Approve"], ["RETURNED", "Return for changes"]) },
      SUMMARY,
    ],
  },
  {
    path: "counter-decline-committee-decision",
    code: "COUNTER_DECLINE_COMMITTEE_DECISION",
    label: "Record the committee decision on the counter-decline",
    help: "DMD only, after the meeting and at least two matching votes.",
    states: ["APPEAL_IN_PROGRESS"],
    permission: "CLAIM_COMMITTEE_OUTCOME_RECORD",
    roles: ["DMD"],
    stage: "Dispute",
    fields: [
      WHEN,
      { key: "outcome", label: "Decision", kind: "select", required: true, options: choose(["APPROVED", "Approve"], ["REJECTED", "Reject"]) },
      SUMMARY,
    ],
  },
  {
    path: "final-decision-recorded",
    code: "FINAL_DECISION_RECORDED",
    label: "Record the final decision",
    help: "DMD only. Creates a closure task due in 5 working days.",
    states: ["APPEAL_IN_PROGRESS"],
    permission: "CLAIM_COMMITTEE_OUTCOME_RECORD",
    roles: ["DMD"],
    stage: "Dispute",
    evidence: letter(true, "Final decision letter"),
    fields: [WHEN, { key: "outcome", label: "Final decision", kind: "text", required: true, placeholder: "e.g. ACCEPTED or DECLINED" }, SUMMARY],
  },
  {
    path: "settlement-acknowledged",
    code: "SETTLEMENT_ACKNOWLEDGED",
    label: "Record the client's acknowledgement",
    help: "The client has accepted the settlement offer.",
    states: ["SETTLEMENT_ADVISED"],
    permission: "CLAIM_SETTLEMENT_RECORD",
    stage: "Settlement",
    evidence: letter(true, "Client's acknowledgement"),
    fields: [WHEN, SUMMARY],
  },
  {
    path: "settlement-recorded",
    code: "SETTLEMENT_RECORDED",
    label: "Record the settlement paid",
    help: "Creates a closure task due in 5 working days.",
    states: ["SETTLEMENT_ADVISED"],
    permission: "CLAIM_SETTLEMENT_RECORD",
    stage: "Settlement",
    evidence: record("Proof of payment"),
    fields: [WHEN, AMOUNT, NOTE],
  },
  {
    path: "closed",
    code: "CLOSED",
    label: "Close the claim",
    help: "Needs an outcome and the closing record.",
    states: ["SETTLED", "FINAL_DECISION"],
    permission: "CLAIM_CLOSE",
    stage: "Close",
    evidence: record("Closing record"),
    fields: [
      WHEN,
      {
        key: "outcome",
        label: "Outcome",
        kind: "select",
        required: true,
        options: choose(["SETTLED", "Settled"], ["DECLINED", "Declined"], ["WITHDRAWN", "Withdrawn"]),
      },
      SUMMARY,
    ],
  },
];

/** Plain words for the server's claim error codes. */
export const CLAIM_MESSAGES: Record<string, string> = {
  CLAIM_DOCUMENTS_INCOMPLETE: "Some required documents are still missing from the checklist.",
  INVALID_CLAIM_STATE: "This step does not fit where the claim is now. Refresh and check the current stage.",
  STALE_VERSION: "Someone else changed this claim since you opened it. Refresh and try again.",
  EVIDENCE_REQUIRED: "Attach the document for this step.",
  INVALID_EVIDENCE: "That document cannot be used for this step. Upload it again from this form.",
  INSURER_REFERENCE_REQUIRED: "Enter the insurer's claim reference.",
  OUTCOME_REQUIRED: "Choose an outcome.",
  SUMMARY_REQUIRED: "Describe what happened.",
  SETTLEMENT_AMOUNT_REQUIRED: "Enter the settlement amount.",
  CLOSURE_OUTCOME_REQUIRED: "Choose how the claim ended.",
  FINAL_DECISION_OUTCOME_REQUIRED: "Enter the final decision.",
  ESCALATION_NOT_DUE: "Escalation is allowed only after 15 working days without a substantive response.",
  NO_RESPONSE_ALREADY_ESCALATED: "This wait has already been escalated.",
  INSURER_RESPONSE_RECEIVED: "The insurer has already responded, so there is nothing to escalate.",
  INSURER_INFORMATION_PENDING: "Send the information the insurer asked for before escalating.",
  CLAIM_NOT_SUBMITTED: "The claim has not been submitted to the insurer yet.",
  COMMITTEE_NOT_CONVENED: "The DMD must record the committee meeting first.",
  COMMITTEE_VOTE_ALREADY_RECORDED: "You have already voted in this meeting.",
  COMMITTEE_MAJORITY_REQUIRED: "At least two committee members must have voted for this outcome.",
  COMMITTEE_MEMBER_REQUIRED: "Only the DMD, Technical Director and Claims Manager vote.",
  DMD_CHAIR_REQUIRED: "Only the DMD can do this.",
  DMD_FINAL_AUTHORITY_REQUIRED: "Only the DMD can record this decision.",
  TECHNICAL_DIRECTOR_REVIEW_REQUIRED: "Only the Technical Director can review a counter-decline.",
  COUNTER_DECLINE_TD_REVIEW_REQUIRED: "The Technical Director must approve the counter-decline first.",
  COUNTER_DECLINE_NOT_RECORDED: "Record the counter-decline letter first.",
  COUNTER_DECLINE_ALREADY_REVIEWED: "This counter-decline has already been reviewed.",
  COUNTER_DECLINE_COMMITTEE_REVIEW_REQUIRED: "The DMD must convene a new committee meeting after the review.",
  COUNTER_DECLINE_COMMITTEE_APPROVAL_REQUIRED: "The committee must decide on the counter-decline first.",
  COMMITTEE_APPEAL_DECISION_REQUIRED: "A final decision needs a committee decision to appeal first.",
  NO_ELIGIBLE_CLAIM_TASK_ASSIGNEE: "No staff member is set up to receive the next task for this claim. Ask an administrator.",
  INVALID_COMMITTEE_OUTCOME: "That outcome is not allowed here.",
  INVALID_COUNTER_DECLINE_REVIEW: "Choose Approve or Return.",
  INVALID_COUNTER_DECLINE_COMMITTEE_DECISION: "Choose Approve or Reject.",
  INVALID_INSURER_RESPONSE_TYPE: "Choose the type of response.",
  INVALID_FOLLOW_UP_DUE_DATE: "The next follow-up date is set by the system.",
  CLAIM_REQUIREMENTS_FROZEN: "Documents can only be added before the pack is marked ready.",
  DUPLICATE_REQUIREMENT: "That document is already in the checklist.",
  ACCESS_DENIED: "Your role cannot do this step.",
};

/** Action names in history, in plain words. */
export function claimEventLabel(code: string): string {
  if (code === "REGISTERED") return "Claim registered";
  if (code === "REQUIREMENT_ADDED") return "Document added to the checklist";
  return CLAIM_ACTIONS.find((a) => a.code === code)?.label.replace(/^Record (the |a |my )?/, "").replace(/^./, (c) => c.toUpperCase()) ?? code;
}

/** Whether this user could do the action, from their backend permissions and roles. Demo users see everything. */
export function canDoClaimAction(user: SessionUser, a: ClaimActionSpec): boolean {
  if (!user.permissions) return true;
  if (!user.permissions.includes(a.permission)) return false;
  if (a.roles && !(user.backendRoles ?? []).some((r) => a.roles!.includes(r))) return false;
  return true;
}

/** Actions allowed in this state for this user, grouped as the server allows them. */
export function claimActionsFor(user: SessionUser, state: string): ClaimActionSpec[] {
  return CLAIM_ACTIONS.filter((a) => a.states.includes(state as ClaimServerState) && canDoClaimAction(user, a));
}