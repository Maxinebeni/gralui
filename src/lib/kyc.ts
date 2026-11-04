// KYC status as staff see it, and which blockers come from the KYC gate.

import { blockerText } from "./onboarding";

export type KycBadgeTone = "neutral" | "success" | "warning" | "danger" | "sky";

const STATUS_BADGE: Record<string, { label: string; tone: KycBadgeTone }> = {
  NOT_STARTED: { label: "Not started", tone: "neutral" },
  DRAFT: { label: "In preparation", tone: "sky" },
  SUBMITTED: { label: "In review", tone: "sky" },
  RETURNED: { label: "Returned", tone: "warning" },
  REJECTED: { label: "Rejected", tone: "danger" },
};

/** gateStatus is READY only when the client may go ahead; an old approval can stop being valid. */
export function kycBadge(input: { kyc?: boolean; status?: string; gateStatus?: string }): { label: string; tone: KycBadgeTone } {
  const { kyc, status, gateStatus } = input;
  if (gateStatus === "READY") return { label: "Approved", tone: "success" };
  if (gateStatus === "UNAVAILABLE") return { label: "Unknown", tone: "neutral" };
  if (gateStatus === "KYC_IDENTITY_CHANGED" || gateStatus === "KYC_TEMPLATE_CHANGED") return { label: "Out of date", tone: "warning" };
  const known = status ? STATUS_BADGE[status] : undefined;
  if (known) return known;
  if (gateStatus === "NOT_STARTED") return STATUS_BADGE.NOT_STARTED!;
  return kyc ? { label: "Approved", tone: "success" } : { label: "Not approved", tone: "warning" };
}

const GATE_BLOCKERS = ["KYC_APPROVAL_REQUIRED", "KYC_NOT_READY", "KYC_IDENTITY_CHANGED", "KYC_TEMPLATE_CHANGED"];

export function isKycBlocker(code: string) {
  return GATE_BLOCKERS.includes(code);
}

/** The reasons to show for a blocked action, without repeating the same sentence. */
export function kycBlockedReasons(codes: string[]) {
  return [...new Set(codes.filter(isKycBlocker).map(blockerText))];
}

export function kycHref(clientId: string, caseId?: string) {
  return caseId ? `/clients/kyc/${encodeURIComponent(caseId)}` : `/clients/kyc/${encodeURIComponent(clientId)}?mode=client`;
}
