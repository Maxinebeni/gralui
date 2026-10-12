// Approval rules and helpers shared by the Approvals inbox and My Work.
// The backend (APR-01 to APR-04) becomes the source of truth: it builds the
// steps from the approval policy, checks who may decide, and rejects a
// decision on an out-of-date request.

import type { ApprovalRequest, ApprovalStep, ApprovalSubjectType } from "./types";

/** Version label of the rules below. Stored on each request so old decisions stay explainable. */
export const APPROVAL_POLICY_VERSION: Record<ApprovalSubjectType, string> = {
  RENEWAL: "RENEWAL-2026.1",
  CLAIM_SETTLEMENT: "CLAIM-2026.1",
  KYC: "KYC-2026.1",
  POLICY_ENDORSEMENT: "ENDORSEMENT-2026.1",
};

export const SUBJECT_LABEL: Record<ApprovalSubjectType, string> = {
  RENEWAL: "Renewal",
  CLAIM_SETTLEMENT: "Claim settlement",
  KYC: "KYC readiness",
  POLICY_ENDORSEMENT: "Endorsement",
};

/** Working days an approver has to decide. PROVISIONAL. */
export const DECISION_DAYS = 2;

/**
 * Renewal approval by GRAL's yearly commission on the account (SOP, quoted in
 * the data-shapes note): under RWF 1M the Technical Director; RWF 1M to 10M
 * the MD; over 10M the MD, and the Board is informed.
 */
export function renewalApprovers(commission: number): Pick<ApprovalStep, "role" | "informOnly">[] {
  if (commission < 1_000_000) return [{ role: "Technical Director" }];
  if (commission <= 10_000_000) return [{ role: "MD" }];
  return [{ role: "MD" }, { role: "Board", informOnly: true }];
}

/** Builds the ordered steps: the first one is waiting for a decision, the rest wait their turn. */
export function buildSteps(approvers: Pick<ApprovalStep, "role" | "informOnly">[]): ApprovalStep[] {
  return approvers.map((a, i) => ({ ...a, order: i + 1, status: i === 0 ? "PENDING" : "WAITING" }));
}

/** The step waiting for a decision, or null once the request is finished. */
export function currentStep(r: ApprovalRequest): ApprovalStep | null {
  if (r.status !== "PENDING") return null;
  return r.steps.find((s) => s.status === "PENDING") ?? null;
}

/** Whether this role can decide the request now (only the current step's role). The MD records Board steps. */
export function canDecide(r: ApprovalRequest, role: string) {
  const step = currentStep(r);
  return !!step && (step.role === role || (step.role === "Board" && role === "MD"));
}

/** The role that acts on a step: the MD records the Board's decision. */
export function actingRole(stepRole: string) {
  return stepRole === "Board" ? "MD" : stepRole;
}

/** Why the approve button is not available yet, or null. */
export function approveBlocker(r: ApprovalRequest): string | null {
  if (r.evidenceRequired && r.evidence.length === 0) return "Attach the written or signed evidence first.";
  return null;
}

export function statusTone(r: ApprovalRequest): "warning" | "success" | "danger" | "neutral" {
  if (r.status === "PENDING") return "warning";
  if (r.status === "APPROVED") return "success";
  if (r.status === "REJECTED") return "danger";
  return "neutral";
}

export function statusLabel(r: ApprovalRequest) {
  const step = currentStep(r);
  if (step) return `Waiting for ${step.role}`;
  return { APPROVED: "Approved", REJECTED: "Rejected", RETURNED: "Returned", PENDING: "Pending" }[r.status];
}
