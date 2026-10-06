// Sample data copied from the Lovable design. Front end only — this is
// replaced by real API calls in src/lib/api.ts once the backend is merged.

import { RENEWAL_MILESTONES, addDays, todayIso } from "./renewals";
import type {
  ActivityItem,
  ClaimMonth,
  ClaimStep,
  Client,
  ClientClaim,
  CompletedMilestone,
  InsurerSummary,
  RenewalCase,
  RenewalMonth,
} from "./types";

export const CLIENTS: Client[] = [
  {
    id: "CLT-001",
    name: "Kigali Steel Industries Ltd",
    type: "Corporate",
    sector: "Manufacturing",
    activePolicies: 4,
    kyc: true,
    policiesOk: true,
    claimsOk: false,
    correspondenceOk: true,
    docsFiled: 3,
    docsTotal: 4,
    nonCompliant: false,
    manager: "Jean-Paul Habimana",
    documents: [
      { name: "Certificate of Incorporation", filed: true, status: "ok" },
      { name: "Trading Licence", filed: true, expiry: "12 Oct 2026", status: "soon" },
      { name: "Tax Clearance (RRA)", filed: true, expiry: "31 Mar 2027", status: "ok" },
      { name: "Beneficial Ownership Register", filed: false },
    ],
    policies: [
      {
        id: "POL-2025-412",
        classOfInsurance: "Industrial All Risk",
        insurer: "SONARWA",
        sumInsured: 1800000000,
        premium: 31200000,
        start: "21 Sep 2025",
        renewal: "21 Sep 2026",
        status: "In Renewal",
      },
      {
        id: "POL-2025-418",
        classOfInsurance: "Marine Cargo",
        insurer: "SONARWA",
        sumInsured: 420000000,
        premium: 7400000,
        start: "01 Feb 2026",
        renewal: "01 Feb 2027",
        status: "Active",
      },
    ],
    correspondence: [
      { date: "18 Sep 2026", subject: "Renewal options presented", channel: "Email" },
      { date: "02 Sep 2026", subject: "FNOL acknowledgement CLM-2025-089", channel: "Email" },
    ],
  },
  {
    id: "CLT-002",
    name: "Rwanda Energy Group",
    type: "State Enterprise",
    sector: "Energy",
    activePolicies: 9,
    kyc: false,
    policiesOk: true,
    claimsOk: true,
    correspondenceOk: false,
    docsFiled: 2,
    docsTotal: 4,
    nonCompliant: false,
    manager: "Marie Claire Uwimana",
    documents: [
      { name: "Establishment Instrument", filed: true, status: "ok" },
      { name: "Board Resolution", filed: true, status: "ok" },
      { name: "Tax Clearance (RRA)", filed: false },
      { name: "Authorised Signatory List", filed: false },
    ],
    policies: [
      {
        id: "POL-2025-299",
        classOfInsurance: "Motor Fleet",
        insurer: "RADIANT",
        sumInsured: 960000000,
        premium: 8700000,
        start: "20 Oct 2025",
        renewal: "20 Oct 2026",
        status: "In Renewal",
      },
      {
        id: "POL-2025-341",
        classOfInsurance: "Public Liability",
        insurer: "CORAR",
        sumInsured: 500000000,
        premium: 3600000,
        start: "09 Nov 2025",
        renewal: "09 Nov 2026",
        status: "Active",
      },
    ],
    correspondence: [{ date: "11 Sep 2026", subject: "KYC document request", channel: "Letter" }],
  },
  {
    id: "CLT-003",
    name: "Bralirwa PLC",
    type: "Corporate",
    sector: "FMCG",
    activePolicies: 3,
    kyc: true,
    policiesOk: true,
    claimsOk: true,
    correspondenceOk: true,
    docsFiled: 4,
    docsTotal: 4,
    nonCompliant: false,
    manager: "Eric Niyonzima",
    documents: [
      { name: "Certificate of Incorporation", filed: true, status: "ok" },
      { name: "Trading Licence", filed: true, expiry: "30 Jun 2027", status: "ok" },
      { name: "Tax Clearance (RRA)", filed: true, expiry: "31 Dec 2026", status: "ok" },
      { name: "Beneficial Ownership Register", filed: true, status: "ok" },
    ],
    policies: [
      {
        id: "POL-2025-188",
        classOfInsurance: "Property All Risk",
        insurer: "UAP",
        sumInsured: 1100000000,
        premium: 14300000,
        start: "05 Dec 2025",
        renewal: "05 Dec 2026",
        status: "Active",
      },
    ],
    correspondence: [{ date: "14 Sep 2026", subject: "Assessment visit scheduled", channel: "Email" }],
  },
  {
    id: "CLT-004",
    name: "Bank of Kigali",
    type: "Financial Institution",
    sector: "Banking",
    activePolicies: 6,
    kyc: false,
    policiesOk: false,
    claimsOk: true,
    correspondenceOk: true,
    docsFiled: 2,
    docsTotal: 4,
    nonCompliant: true,
    manager: "Isabelle Mukamana",
    documents: [
      { name: "Certificate of Incorporation", filed: true, status: "ok" },
      { name: "BNR Operating Licence", filed: true, expiry: "01 Aug 2026", status: "expired" },
      { name: "Tax Clearance (RRA)", filed: false },
      { name: "Authorised Signatory List", filed: false },
    ],
    policies: [
      {
        id: "POL-2025-107",
        classOfInsurance: "Professional Indemnity",
        insurer: "SORAS",
        sumInsured: 2400000000,
        premium: 22100000,
        start: "03 Oct 2025",
        renewal: "03 Oct 2026",
        status: "In Renewal",
      },
    ],
    correspondence: [{ date: "09 Sep 2026", subject: "Licence renewal follow-up", channel: "Call" }],
  },
  {
    id: "CLT-005",
    name: "Horizon Logistics Rwanda",
    type: "SME",
    sector: "Transport",
    activePolicies: 2,
    kyc: true,
    policiesOk: true,
    claimsOk: true,
    correspondenceOk: false,
    docsFiled: 3,
    docsTotal: 4,
    nonCompliant: false,
    manager: "Eric Niyonzima",
    documents: [
      { name: "Certificate of Incorporation", filed: true, status: "ok" },
      { name: "Trading Licence", filed: true, expiry: "05 Oct 2026", status: "soon" },
      { name: "Tax Clearance (RRA)", filed: true, expiry: "28 Feb 2027", status: "ok" },
      { name: "Beneficial Ownership Register", filed: false },
    ],
    policies: [
      {
        id: "POL-2025-455",
        classOfInsurance: "Goods in Transit",
        insurer: "RADIANT",
        sumInsured: 260000000,
        premium: 4100000,
        start: "15 Jan 2026",
        renewal: "15 Jan 2027",
        status: "Active",
      },
    ],
    correspondence: [{ date: "01 Sep 2026", subject: "Fleet schedule update", channel: "Email" }],
  },
];

// Only the claim fields the client profile needs.
export const CLIENT_CLAIMS: ClientClaim[] = [
  { id: "CLM-2025-089", client: "Kigali Steel Industries Ltd", classOfInsurance: "Industrial All Risk", amount: 42000000, step: 2, sla: "breached" },
  { id: "CLM-2025-078", client: "Rwanda Energy Group", classOfInsurance: "Motor Fleet", amount: 4200000, step: 5, sla: "breached" },
  { id: "CLM-2025-071", client: "Bralirwa PLC", classOfInsurance: "Property All Risk", amount: 8500000, step: 3, sla: "approaching" },
  { id: "CLM-2025-064", client: "Bank of Kigali", classOfInsurance: "Professional Indemnity", amount: 1200000, step: 1, sla: "ontrack" },
  { id: "CLM-2025-061", client: "Rwanda Energy Group", classOfInsurance: "Public Liability", amount: 6750000, step: 5, sla: "approaching" },
  { id: "CLM-2025-057", client: "Kigali Steel Industries Ltd", classOfInsurance: "Marine Cargo", amount: 19400000, step: 4, sla: "ontrack" },
  { id: "CLM-2025-052", client: "Bralirwa PLC", classOfInsurance: "Group Personal Accident", amount: 480000, step: 6, sla: "ontrack" },
  { id: "CLM-2025-046", client: "Bank of Kigali", classOfInsurance: "Money Insurance", amount: 15300000, step: 5, sla: "approaching" },
];

export const POLICIES_BY_INSURER: InsurerSummary[] = [
  { insurer: "SONARWA", policies: 12, premium: 64 },
  { insurer: "RADIANT", policies: 9, premium: 38 },
  { insurer: "UAP", policies: 7, premium: 31 },
  { insurer: "SORAS", policies: 6, premium: 42 },
  { insurer: "CORAR", policies: 4, premium: 17 },
];

/* --------------------------------- Renewals ---------------------------------- */
// Expiry dates are set relative to today so the demo always shows one expired,
// one overdue, one due soon and the rest on track.

const EVIDENCE: Partial<Record<CompletedMilestone["code"], string>> = {
  VISIT: "Visit report.pdf",
  NOTICE: "Renewal notice letter.pdf",
  RFQ: "RFQ email to insurers.pdf",
  QUOTES: "Quote comparison.xlsx",
  APPROVAL: "Approval memo.pdf",
  ACCEPTANCE: "Client acceptance letter.pdf",
};

function completedSteps(expiry: string, count: number, by: string): CompletedMilestone[] {
  return RENEWAL_MILESTONES.slice(0, count).map((m) => ({
    code: m.code,
    completedAt: addDays(expiry, m.offset - 2),
    completedBy: by,
    note: m.output,
    evidence: EVIDENCE[m.code],
  }));
}

function renewal(
  seq: number,
  daysToExpiry: number,
  done: number,
  data: Omit<RenewalCase, "id" | "expiryDate" | "completed">,
): RenewalCase {
  const expiryDate = addDays(todayIso(), daysToExpiry);
  return {
    id: `REN-2026-${String(seq).padStart(3, "0")}`,
    expiryDate,
    completed: completedSteps(expiryDate, done, data.owner),
    ...data,
  };
}

export const RENEWAL_CASES: RenewalCase[] = [
  renewal(1, -3, 7, {
    policyId: "POL-2025-412",
    clientId: "CLT-001",
    client: "Kigali Steel Industries Ltd",
    classOfInsurance: "Industrial All Risk",
    insurer: "SONARWA",
    premium: 31200000,
    owner: "Jean-Paul Habimana",
    quotes: [
      { id: "Q1", insurer: "SONARWA", premium: 31200000, terms: "Same cover, deductible RWF 5m", recommended: true },
      { id: "Q2", insurer: "UAP", premium: 33900000, terms: "Same cover, deductible RWF 3m", recommended: false },
    ],
    acceptance: { quoteId: "Q1", acceptedAt: addDays(todayIso(), -40), recordedBy: "Jean-Paul Habimana", evidence: "Client acceptance letter.pdf" },
  }),
  renewal(2, 9, 6, {
    policyId: "POL-2025-107",
    clientId: "CLT-004",
    client: "Bank of Kigali",
    classOfInsurance: "Professional Indemnity",
    insurer: "SORAS",
    premium: 22100000,
    owner: "Isabelle Mukamana",
    quotes: [
      { id: "Q1", insurer: "SORAS", premium: 22100000, terms: "Limit RWF 2.4bn, same exclusions", recommended: true },
      { id: "Q2", insurer: "RADIANT", premium: 23400000, terms: "Limit RWF 2.4bn, cyber extension", recommended: false },
    ],
  }),
  renewal(3, 25, 7, {
    policyId: "POL-2025-299",
    clientId: "CLT-002",
    client: "Rwanda Energy Group",
    classOfInsurance: "Motor Fleet",
    insurer: "RADIANT",
    premium: 8700000,
    owner: "Marie Claire Uwimana",
    quotes: [
      { id: "Q1", insurer: "RADIANT", premium: 8700000, terms: "42 vehicles, comprehensive", recommended: true },
    ],
    acceptance: { quoteId: "Q1", acceptedAt: addDays(todayIso(), -9), recordedBy: "Marie Claire Uwimana", evidence: "Client acceptance letter.pdf" },
  }),
  renewal(4, 45, 5, {
    policyId: "POL-2025-341",
    clientId: "CLT-002",
    client: "Rwanda Energy Group",
    classOfInsurance: "Public Liability",
    insurer: "CORAR",
    premium: 3600000,
    owner: "Marie Claire Uwimana",
    quotes: [
      { id: "Q1", insurer: "CORAR", premium: 3600000, terms: "Limit RWF 500m", recommended: true },
      { id: "Q2", insurer: "SONARWA", premium: 3450000, terms: "Limit RWF 400m", recommended: false },
    ],
  }),
  renewal(5, 72, 4, {
    policyId: "POL-2025-188",
    clientId: "CLT-003",
    client: "Bralirwa PLC",
    classOfInsurance: "Property All Risk",
    insurer: "UAP",
    premium: 14300000,
    owner: "Eric Niyonzima",
    quotes: [{ id: "Q1", insurer: "UAP", premium: 14900000, terms: "Sum insured RWF 1.1bn", recommended: false }],
  }),
  renewal(6, 113, 1, {
    policyId: "POL-2025-455",
    clientId: "CLT-005",
    client: "Horizon Logistics Rwanda",
    classOfInsurance: "Goods in Transit",
    insurer: "RADIANT",
    premium: 4100000,
    owner: "Eric Niyonzima",
    quotes: [],
  }),
];

export const RENEWAL_MONTHLY: RenewalMonth[] = [
  { month: "Sep", premium: 31, policies: 1 },
  { month: "Oct", premium: 31, policies: 2 },
  { month: "Nov", premium: 4, policies: 1 },
  { month: "Dec", premium: 14, policies: 1 },
  { month: "Jan", premium: 4, policies: 1 },
  { month: "Feb", premium: 12, policies: 3 },
  { month: "Mar", premium: 26, policies: 2 },
  { month: "Apr", premium: 9, policies: 2 },
  { month: "May", premium: 18, policies: 3 },
  { month: "Jun", premium: 7, policies: 1 },
  { month: "Jul", premium: 22, policies: 4 },
  { month: "Aug", premium: 16, policies: 2 },
];

/* --------------------------------- Overview ---------------------------------- */

export const CLAIM_STEPS: ClaimStep[] = [
  { n: 1, name: "FNOL Received", sla: "24 hrs" },
  { n: 2, name: "Documentation", sla: "3 days" },
  { n: 3, name: "Assessment", sla: "2 days" },
  { n: 4, name: "Negotiation", sla: "ongoing" },
  { n: 5, name: "Adjudication", sla: "2 days" },
  { n: 6, name: "Settlement", sla: "5 days" },
  { n: 7, name: "Closed", sla: "—" },
];

export const CLAIM_MONTHLY: ClaimMonth[] = [
  { month: "Oct", amount: 128, count: 14 },
  { month: "Nov", amount: 96, count: 11 },
  { month: "Dec", amount: 174, count: 19 },
  { month: "Jan", amount: 142, count: 16 },
  { month: "Feb", amount: 88, count: 9 },
  { month: "Mar", amount: 205, count: 22 },
  { month: "Apr", amount: 163, count: 18 },
  { month: "May", amount: 121, count: 13 },
  { month: "Jun", amount: 189, count: 21 },
  { month: "Jul", amount: 154, count: 17 },
  { month: "Aug", amount: 211, count: 24 },
  { month: "Sep", amount: 178, count: 20 },
];

export const RECENT_ACTIVITY: ActivityItem[] = [
  { who: "Jean-Paul Habimana", what: "advanced CLM-2025-071 to Assessment", when: "2h ago" },
  { who: "Marie Claire Uwimana", what: "uploaded the police report for CLM-2025-064", when: "4h ago" },
  { who: "Eric Niyonzima", what: "added a UAP quote on REN-2026-005", when: "Yesterday" },
  { who: "Isabelle Mukamana", what: "flagged Bank of Kigali as non-compliant", when: "Yesterday" },
  { who: "Marie Claire Uwimana", what: "recorded client acceptance on REN-2026-003", when: "2 days ago" },
];
