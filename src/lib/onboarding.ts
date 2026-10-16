// GRAL's client onboarding (SOP Handbook v3, section 3 "Client Acquisition
// SOP"): 11 steps from lead to welcome letter, with the owner and deadline the
// SOP gives each one. Deadlines are in working days (weekends skipped; public
// holidays once the backend calendar is connected).
//
// Key controls from the SOP:
// - No quotation without the signed KYC Approval Form (step 3).
// - KYC approval within 3 working days of receiving all documents.
// - Quotes from at least 3 insurers, unless justified in writing and approved by the MD.
// - Written client acceptance before placement.
// - Full onboarding in 10 to 15 working days.

import { addWorkingDays, workingDaysBetween } from "./claims";
import { todayIso } from "./renewals";
import type { ClientType, KycItem, OnboardingCase, OnboardingStepCode } from "./types";

export type OnboardingStepDef = {
  code: OnboardingStepCode;
  n: number;
  name: string;
  /** Role responsible, as the SOP names it. */
  owner: string;
  /** Working days allowed, counted from `from`. */
  days: number;
  /** The step whose completion starts the clock (null = the lead's date). */
  from: OnboardingStepCode | null;
  deadlineLabel: string;
  /** What has to be done, in one line. */
  task: string;
  /** The record to attach when completing the step. */
  evidenceHint?: string;
};

export const ONBOARDING_STEPS: OnboardingStepDef[] = [
  {
    code: "LEAD", n: 1, name: "Lead registration", owner: "Commercial Director", days: 0, from: null,
    deadlineLabel: "Same day", task: "Record the lead and assign an Accounts Executive (CRM Manager)",
  },
  {
    code: "MEETING", n: 2, name: "Meeting & needs assessment", owner: "Accounts Executive", days: 3, from: "LEAD",
    deadlineLabel: "3 working days", task: "Send the pre-meeting document request, meet the client, send the meeting summary",
    evidenceHint: "Meeting summary note, e.g. Meeting summary.pdf",
  },
  {
    code: "KYC", n: 3, name: "KYC & AML verification", owner: "Accounts Executive", days: 3, from: "MEETING",
    deadlineLabel: "3 working days after all documents",
    task: "Collect the KYC documents, screen against sanctions lists, get the KYC Approval Form signed",
  },
  {
    code: "RISK_SURVEY", n: 4, name: "Risk survey", owner: "Technical Director", days: 5, from: "MEETING",
    deadlineLabel: "5 working days after the meeting", task: "Site visit, hazards and controls, risk grade, written report",
    evidenceHint: "Risk survey report, e.g. Risk survey report.pdf",
  },
  {
    code: "DESIGN", n: 5, name: "Insurance programme design", owner: "Technical Director", days: 3, from: "RISK_SURVEY",
    deadlineLabel: "3 working days", task: "Decide the recommended covers and draft the programme proposal",
    evidenceHint: "Insurance programme proposal, e.g. Programme proposal.pdf",
  },
  {
    code: "QUOTES", n: 6, name: "Quotation request", owner: "GI Underwriting Manager", days: 1, from: "DESIGN",
    deadlineLabel: "24 hours", task: "Send the terms of reference to at least 3 licensed insurers and record their quotes",
  },
  {
    code: "COMPARISON", n: 7, name: "Comparative analysis", owner: "GI Underwriting Manager", days: 2, from: "QUOTES",
    deadlineLabel: "2 working days", task: "Compare premium, deductibles, limits, exclusions and claims support; recommend one",
    evidenceHint: "Quotation comparison matrix, e.g. Comparison matrix.xlsx",
  },
  {
    code: "APPROVAL", n: 8, name: "Internal approval", owner: "Technical Director / MD", days: 2, from: "COMPARISON",
    deadlineLabel: "Before the presentation", task: "Approval by commission: under RWF 1M the TD, up to 10M the MD, above that the MD and the Board",
  },
  {
    code: "ACCEPTANCE", n: 9, name: "Presentation & acceptance", owner: "Accounts Executive", days: 3, from: "APPROVAL",
    deadlineLabel: "3 working days", task: "Present the comparison to the client and get written acceptance",
    evidenceHint: "Written acceptance (email or letter), e.g. Client acceptance.pdf",
  },
  {
    code: "PLACEMENT", n: 10, name: "Policy placement", owner: "GI Underwriting Manager", days: 2, from: "ACCEPTANCE",
    deadlineLabel: "2 working days", task: "Instruct the insurer, receive the policy schedule and check it matches the quote",
    evidenceHint: "Verified policy schedule, e.g. Policy schedule.pdf",
  },
  {
    code: "WELCOME", n: 11, name: "Welcome & filing", owner: "Accounts Executive", days: 2, from: "PLACEMENT",
    deadlineLabel: "2 working days", task: "Send the welcome letter, deliver the documents, open the client file",
    evidenceHint: "Welcome letter, e.g. Welcome letter.pdf",
  },
];

/** Working days the SOP allows for the whole onboarding (10 to 15). */
export const ONBOARDING_TARGET_DAYS = 15;

export function stepOf(code: OnboardingStepCode) {
  return ONBOARDING_STEPS.find((s) => s.code === code)!;
}

/** The step being worked on, or null once onboarding is complete. */
export function currentStep(c: OnboardingCase): OnboardingStepDef | null {
  return ONBOARDING_STEPS[c.completed.length] ?? null;
}

export function isComplete(c: OnboardingCase) {
  return c.completed.length >= ONBOARDING_STEPS.length;
}

function completedAt(c: OnboardingCase, code: OnboardingStepCode) {
  return c.completed.find((r) => r.code === code)?.completedAt;
}

/** Date all required KYC documents were in, or null while some are missing. */
export function kycDocumentsCompleteAt(c: OnboardingCase): string | null {
  const required = c.kyc.items.filter((i) => i.required);
  if (required.some((i) => !i.receivedAt)) return null;
  return required.map((i) => i.receivedAt!).sort().at(-1) ?? null;
}

/** When a step is due. KYC counts from when the last document arrived. */
export function stepDue(c: OnboardingCase, def: OnboardingStepDef): string {
  if (def.code === "KYC") {
    const docs = kycDocumentsCompleteAt(c);
    if (docs) return addWorkingDays(docs, def.days);
  }
  const start = def.from ? completedAt(c, def.from) : undefined;
  return addWorkingDays(start ?? c.createdAt, def.days);
}

export type OnboardingHealth = "complete" | "overdue" | "due-soon" | "on-track";

export function onboardingHealth(c: OnboardingCase): OnboardingHealth {
  const step = currentStep(c);
  if (!step) return "complete";
  const left = workingDaysBetween(todayIso(), stepDue(c, step));
  if (left < 0) return "overdue";
  if (left <= 1) return "due-soon";
  return "on-track";
}

/** Working days since the lead was registered (or until the case finished). */
export function onboardingAge(c: OnboardingCase) {
  const end = isComplete(c) ? c.completed.at(-1)!.completedAt : todayIso();
  return workingDaysBetween(c.createdAt, end);
}

export function kycApproved(c: OnboardingCase) {
  return !!completedAt(c, "KYC");
}

/** Why KYC can't be sent for approval yet, or null. */
export function kycSubmitBlocker(c: OnboardingCase): string | null {
  const missing = c.kyc.items.filter((i) => i.required && !i.receivedAt);
  if (missing.length) return `Still missing: ${missing.map((i) => i.name).join(", ")}.`;
  const noExpiry = c.kyc.items.filter((i) => i.receivedAt && i.hasExpiry && !i.expiry);
  if (noExpiry.length) return `Enter the expiry date for: ${noExpiry.map((i) => i.name).join(", ")}.`;
  if (!c.kyc.screening) return "Record the sanctions and watchlist screening result.";
  return null;
}

/* ------------------------------ KYC checklists ------------------------------- */
// PROVISIONAL: the SOP names only the core documents (Certificate of
// Incorporation, ID/passport, TIN/VAT registration) plus sanctions screening.
// The rest is a sensible list per client type for GRAL to confirm.

const ID_OF_REPRESENTATIVE = "ID or passport of the company representative";
const TIN = "TIN / VAT registration certificate";
const OWNERS = "Beneficial owners list (25% or more)";
const AML_FORM = "Signed AML / KYC questionnaire";

export const KYC_CHECKLISTS: Record<ClientType, Omit<KycItem, "receivedAt" | "fileName" | "expiry">[]> = {
  Corporate: [
    { name: "Certificate of Incorporation", required: true },
    { name: TIN, required: true },
    { name: ID_OF_REPRESENTATIVE, required: true },
    { name: OWNERS, required: true },
    { name: "Trading licence", required: true, hasExpiry: true },
    { name: AML_FORM, required: true },
  ],
  SME: [
    { name: "Business registration certificate", required: true },
    { name: TIN, required: true },
    { name: "ID or passport of the owner", required: true },
    { name: "Trading licence", required: false, hasExpiry: true },
  ],
  NGO: [
    { name: "RGB registration certificate", required: true },
    { name: TIN, required: true },
    { name: ID_OF_REPRESENTATIVE, required: true },
    { name: "Board resolution naming authorised signatories", required: true },
  ],
  "State Enterprise": [
    { name: "Establishment instrument (law or order)", required: true },
    { name: TIN, required: true },
    { name: "Authorised signatory list", required: true },
    { name: ID_OF_REPRESENTATIVE, required: true },
  ],
  "Financial Institution": [
    { name: "Certificate of Incorporation", required: true },
    { name: "BNR operating licence", required: true, hasExpiry: true },
    { name: TIN, required: true },
    { name: OWNERS, required: true },
    { name: "Authorised signatory list", required: true },
    { name: AML_FORM, required: true },
  ],
};

export function checklistFor(type: ClientType): KycItem[] {
  return KYC_CHECKLISTS[type].map((i) => ({ ...i }));
}
