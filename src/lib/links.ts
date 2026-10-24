// Where each kind of record opens, so tasks, approvals and search link the same way.

import type { ApprovalSubjectType, TaskResourceType } from "./types";

export function recordHref(type: TaskResourceType | ApprovalSubjectType, id: string) {
  const ref = encodeURIComponent(id);
  switch (type) {
    case "CLAIM":
    case "CLAIM_SETTLEMENT":
      return `/claims?claim=${ref}`;
    case "RENEWAL":
      return `/renewals?case=${ref}`;
    case "CLIENT":
    case "KYC":
      return `/clients?client=${ref}`;
    case "POLICY":
    case "POLICY_ENDORSEMENT":
      return `/policies/${ref}`;
    case "APPROVAL":
      return `/approvals?request=${ref}`;
    case "LEAD":
      return `/clients/leads/${ref}`;
    case "ONBOARDING":
    case "NEW_BUSINESS":
      return `/clients/leads/tracks/${ref}`;
    case "KYC_REVIEW":
      return `/clients/kyc/${ref}`;
  }
}
