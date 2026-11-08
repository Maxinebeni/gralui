// Renewal actions on GRAL's backend (REN-01 to REN-06).
//
// Each action the server offers on a renewal case is described here once:
// the names it uses in availableActions, the milestone it belongs to, the
// form fields and how they become the request body. One form component
// (renewal-actions.tsx) draws every action from this table. Field names and
// required fields follow the backend's API docs (v3/api-docs, 2 Nov 2026) and
// the renewals update handed over on 4 Nov 2026 (recommendation commission,
// specialist assignment, loss details and recovery plans).

import type { EvidenceInput, RenewalActionInput } from "./api";
import { RENEWAL_MILESTONES } from "./renewals";
import type { DocumentClassification, RenewalCase, RenewalMilestoneCode } from "./types";

export type FieldKind =
  | "text"
  | "textarea"
  | "number"
  | "percent"
  | "date"
  | "select"
  | "insurer"
  | "insurers"
  | "product"
  | "quote"
  | "owner"
  | "assignee"
  | "milestone"
  | "file"
  | "lines";

export type FieldSpec = {
  key: string;
  label: string;
  kind: FieldKind;
  required?: boolean;
  options?: { value: string; label: string }[];
  /** Options that depend on the case, used instead of options. */
  optionsFor?: (c: RenewalCase) => { value: string; label: string }[];
  hint?: string;
  placeholder?: string;
};

export type FieldValue = string | string[] | File | null;
export type Values = Record<string, FieldValue>;

type Read = {
  text: (key: string) => string | undefined;
  number: (key: string) => number | undefined;
  /** A percentage field as a fraction, e.g. 10 becomes 0.1. */
  fraction: (key: string) => number | undefined;
  list: (key: string) => string[];
};

type Helpers = Parameters<RenewalActionInput["body"]>[0];

export type RenewalActionSpec = {
  key: string;
  /** Names the server may use for this action in availableActions. */
  names: string[];
  label: string;
  /** The milestone whose row shows this action. null: listed under "More actions". */
  step: RenewalMilestoneCode | null;
  path: string;
  /** A sentence under the form title. A function when it depends on the case. */
  help: string | ((c: RenewalCase) => string);
  fields: FieldSpec[];
  classification?: DocumentClassification;
  /** The exact purpose the server expects on the evidence file (backend docs/api/renewals.md). */
  evidencePurpose?: string;
  body: (h: Helpers, r: Read, c: RenewalCase) => Record<string, unknown>;
  /** Values to start the form with, e.g. the current insurer. */
  prefill?: (c: RenewalCase) => Values;
};

/* ------------------------------- Reusable fields ------------------------------ */

const DATE: FieldSpec = { key: "occurredAt", label: "Date it happened", kind: "date", required: true };
const DETAIL: FieldSpec = { key: "detail", label: "Note", kind: "textarea", placeholder: "Optional" };
const FILE: FieldSpec = { key: "file", label: "Evidence (PDF, PNG or JPEG)", kind: "file", required: true };
const EVIDENCE: FieldSpec[] = [FILE, DATE, DETAIL];
const REASON: FieldSpec = { key: "reason", label: "Reason", kind: "textarea", required: true };

/** The common evidence body: { command, documentId, documentVersion, occurredAt, detail }. */
const evidence = (h: Helpers) => ({ command: h.command(), ...h.proof("file") });

/** The policy terms a quote or a checked schedule carries. */
const TERMS: FieldSpec[] = [
  { key: "insurerId", label: "Insurer", kind: "insurer", required: true },
  { key: "productId", label: "Class of insurance", kind: "product", required: true },
  { key: "effectDate", label: "Cover starts", kind: "date", required: true },
  { key: "expiryDate", label: "Cover ends", kind: "date", required: true },
  { key: "premium", label: "Total premium (RWF)", kind: "number", required: true },
  { key: "terms", label: "Main terms", kind: "textarea", required: true, placeholder: "Cover, limits, deductibles, exclusions" },
  { key: "netPremium", label: "Net premium (RWF)", kind: "number", hint: "Fill net premium, amount paid and commission together, or leave all three empty." },
  { key: "amountPaid", label: "Amount paid (RWF)", kind: "number" },
  { key: "commissionRate", label: "Commission rate (%)", kind: "percent" },
];

function termsBody(r: Read) {
  const net = r.number("netPremium");
  const paid = r.number("amountPaid");
  const rate = r.fraction("commissionRate");
  return {
    insurerId: r.text("insurerId"),
    productId: r.text("productId"),
    effectDate: r.text("effectDate"),
    expiryDate: r.text("expiryDate"),
    premium: r.number("premium"),
    currency: "RWF",
    terms: r.text("terms"),
    ...(net !== undefined && paid !== undefined && rate !== undefined
      ? { financials: { netPremium: net, amountPaid: paid, commissionRate: rate } }
      : {}),
  };
}

function addYear(iso: string, days = 0) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCFullYear(d.getUTCFullYear() + 1);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function nextDay(iso: string) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** A new quote starts the day after expiry and runs for a year, with the current insurer and class. */
const prefillTerms = (c: RenewalCase): Values => {
  const start = nextDay(c.expiryDate);
  return {
    insurerId: c.backend?.insurerId ?? "",
    productId: c.backend?.productId ?? "",
    effectDate: start,
    expiryDate: addYear(start, -1),
  };
};

/** The schedule check starts from the recommended quote. */
const prefillFromProposal = (c: RenewalCase): Values => {
  const q = c.backend?.quotes.find((x) => x.id === c.backend?.proposalQuoteId);
  if (!q) return prefillTerms(c);
  return {
    insurerId: q.insurerId,
    productId: q.productId,
    effectDate: q.effectDate,
    expiryDate: q.expiryDate,
    premium: String(q.premium),
    terms: q.terms,
  };
};

/* --------------------------------- The actions -------------------------------- */

export const RENEWAL_ACTIONS: RenewalActionSpec[] = [
  {
    key: "activate",
    names: ["ACTIVATE"],
    label: "Activate the renewal",
    step: "BRIEF",
    path: "activate",
    help: "Starts the renewal once its activation date has come.",
    fields: [],
    body: (h) => h.command(),
  },
  {
    key: "visit",
    names: ["VISIT_RECORD"],
    label: "Record the strategic visit",
    step: "VISIT",
    path: "record-visit",
    evidencePurpose: "VISIT",
    help: "Attach the visit report or meeting note.",
    fields: EVIDENCE,
    classification: "CORRESPONDENCE",
    body: evidence,
  },
  {
    key: "notice",
    names: ["NOTICE_RECORD", "NOTICE_ISSUE", "ISSUE_NOTICE"],
    label: "Record the renewal notice",
    step: "NOTICE",
    path: "issue-notice",
    evidencePurpose: "NOTICE",
    help: "Attach the formal renewal notice sent to the client.",
    fields: EVIDENCE,
    classification: "CORRESPONDENCE",
    body: evidence,
  },
  {
    key: "rfq",
    names: ["RFQ_RECORD", "RFQ_DISPATCH", "DISPATCH_RFQ"],
    label: "Send the request for quotes",
    step: "RFQ",
    path: "dispatch-rfq",
    evidencePurpose: "RFQ",
    help: "Record which insurers were asked, when they must reply, and attach the request.",
    fields: [
      { key: "insurerIds", label: "Insurers asked", kind: "insurers", required: true },
      { key: "expectedResponseDate", label: "Reply due by", kind: "date", required: true },
      ...EVIDENCE,
    ],
    classification: "CORRESPONDENCE",
    body: (h, r) => ({ evidence: evidence(h), insurerIds: r.list("insurerIds"), expectedResponseDate: r.text("expectedResponseDate") }),
  },
  {
    key: "quote",
    names: ["QUOTE_UPDATE", "QUOTE_RECORD", "QUOTE"],
    label: "Record an insurer's quote",
    step: "QUOTES",
    path: "quotes",
    evidencePurpose: "QUOTE",
    help: "Record each quote received, with the insurer's quote document.",
    // The recommended quote must carry net premium, amount paid and commission before approval.
    fields: [
      ...TERMS.map((f) =>
        ["netPremium", "amountPaid", "commissionRate"].includes(f.key) ? { ...f, required: true, hint: undefined } : f,
      ),
      { key: "insurerReference", label: "Insurer's quote reference", kind: "text" },
      FILE,
    ],
    classification: "CORRESPONDENCE",
    prefill: prefillTerms,
    body: (h, r) => {
      const p = h.proof("file");
      return {
        command: h.command(),
        ...termsBody(r),
        insurerReference: r.text("insurerReference"),
        documentId: p.documentId,
        documentVersion: p.documentVersion,
      };
    },
  },
  {
    key: "recommend",
    names: ["RECOMMEND", "COMPARISON_UPDATE", "RECOMMENDATION_RECORD"],
    label: "Recommend a quote",
    step: "QUOTES",
    path: "recommend",
    evidencePurpose: "COMPARISON",
    help: "Compare the quotes and recommend one, with the comparison matrix.",
    fields: [
      { key: "quoteId", label: "Recommended quote", kind: "quote", required: true },
      { key: "comparison", label: "Comparison", kind: "textarea", required: true },
      { key: "rationale", label: "Why this quote", kind: "textarea", required: true },
      {
        key: "annualCommissionRwf",
        label: "Annual commission (RWF)",
        kind: "number",
        required: true,
        hint: "This decides who approves: below 1 million the Technical Director; 1 to 10 million the TD then the MD; above 10 million the MD with Board evidence.",
      },
      {
        key: "commissionBasis",
        label: "How the commission was worked out",
        kind: "textarea",
        required: true,
        placeholder: "e.g. 10% of RWF 5,000,000 net premium",
      },
      { ...FILE, label: "Comparison matrix (PDF, PNG or JPEG)" },
    ],
    classification: "CORRESPONDENCE",
    body: (h, r, c) => {
      const p = h.proof("file");
      const quoteId = r.text("quoteId");
      return {
        command: h.command(),
        quoteId,
        quoteVersion: c.backend?.quotes.find((q) => q.id === quoteId)?.version,
        comparison: r.text("comparison"),
        rationale: r.text("rationale"),
        annualCommissionRwf: r.number("annualCommissionRwf"),
        commissionBasis: r.text("commissionBasis"),
        documentId: p.documentId,
        documentVersion: p.documentVersion,
      };
    },
  },
  {
    key: "approval",
    names: ["APPROVAL_REQUEST", "REQUEST_APPROVAL"],
    label: "Send for internal approval",
    step: "APPROVAL",
    path: "request-approval",
    help: (c) => `Sends the recommended terms to the approvers. ${approvalRoute(c.backend?.annualCommissionRwf)} The request then appears in their Approvals inbox, where each approver attaches signed evidence.`,
    fields: [],
    body: (h) => h.command(),
  },
  {
    key: "presentation",
    names: ["PRESENTATION_RECORD", "PRESENT"],
    label: "Record the presentation to the client",
    step: "APPROVAL",
    path: "record-presentation",
    evidencePurpose: "CLIENT_PRESENTATION",
    help: "Record when the approved terms were presented, with the presentation.",
    fields: EVIDENCE,
    classification: "CORRESPONDENCE",
    body: evidence,
  },
  {
    key: "acceptance",
    names: ["ACCEPTANCE_RECORD", "ACCEPT"],
    label: "Record the client's written acceptance",
    step: "ACCEPTANCE",
    path: "record-client-acceptance",
    evidencePurpose: "CLIENT_ACCEPTANCE",
    help: "No placement without written acceptance. Attach the signed acceptance.",
    fields: EVIDENCE,
    classification: "CLIENT_ACCEPTANCE",
    body: evidence,
  },
  {
    key: "place",
    names: ["PLACE", "PLACEMENT_RECORD"],
    label: "Record the placement",
    step: "ACCEPTANCE",
    path: "place",
    evidencePurpose: "PLACEMENT",
    help: "After approval, written acceptance and KYC. Attach the placement instruction to the insurer.",
    fields: EVIDENCE,
    classification: "CORRESPONDENCE",
    body: evidence,
  },
  {
    key: "receive-schedule",
    names: ["SCHEDULE_RECEIVE", "RECEIVE_SCHEDULE"],
    label: "Record the schedule from the insurer",
    step: "SCHEDULE",
    path: "receive-schedule",
    evidencePurpose: "SCHEDULE",
    help: "Attach the policy schedule exactly as received.",
    fields: EVIDENCE,
    classification: "POLICY_SCHEDULE",
    body: evidence,
  },
  {
    key: "verify",
    names: ["VERIFY", "VERIFY_SCHEDULE", "SCHEDULE_VERIFY"],
    label: "Check the schedule against the agreed terms",
    step: "SCHEDULE",
    path: "verify-schedule",
    help: "Enter the terms as printed on the schedule. Anything that does not match the agreed terms blocks delivery until it is fixed.",
    fields: [
      ...TERMS,
      { key: "discrepancies", label: "Differences found", kind: "lines", hint: "One per line. Leave empty if it all matches." },
    ],
    prefill: prefillFromProposal,
    body: (h, r) => ({ command: h.command(), observedTerms: termsBody(r), discrepancies: r.list("discrepancies") }),
  },
  {
    key: "deliver",
    names: ["DELIVER", "DELIVERY_RECORD"],
    label: "Record delivery to the client",
    step: "DELIVERY",
    path: "record-delivery",
    evidencePurpose: "SCHEDULE_DELIVERY",
    help: "Attach proof the verified schedule reached the client.",
    fields: EVIDENCE,
    classification: "CORRESPONDENCE",
    body: evidence,
  },
  {
    key: "complete",
    names: ["COMPLETE"],
    label: "Complete the renewal",
    step: "COMPLETION",
    path: "complete",
    help: "Records the next policy period from the verified schedule and closes the case.",
    fields: [],
    body: (h) => h.command(),
  },

  // Any milestone
  {
    key: "assign",
    names: ["ASSIGN"],
    label: "Assign people to this renewal",
    step: null,
    path: "assignment",
    help: "Only the CRM Manager or the MD can assign. The underwriter handles quotes, placement and the schedule; the Technical Director handles approval.",
    fields: [
      {
        key: "target",
        label: "Role",
        kind: "select",
        required: true,
        optionsFor: (c) => [
          // A ready step with nobody on it is what the server blocks on, so it comes first.
          ...unassignedSteps(c).map((m) => ({ value: m.serverCode, label: `Current step: ${stepName(m.code)}` })),
          { value: "UNDERWRITER", label: "Underwriter" },
          { value: "TECHNICAL_DIRECTOR", label: "Technical Director" },
          { value: "OWNER", label: "Case owner (Accounts Executive)" },
        ],
      },
      { key: "assigneeId", label: "Person", kind: "assignee", required: true, hint: "Only people the server allows for this role are listed." },
      REASON,
    ],
    prefill: (c) => ({ target: unassignedSteps(c)[0]?.serverCode ?? "UNDERWRITER" }),
    body: (h, r) => {
      const target = r.text("target");
      return {
        command: h.command(r.text("reason")),
        assigneeId: r.text("assigneeId"),
        ...(target && target !== "OWNER" ? { milestoneCode: target } : {}),
      };
    },
  },
  {
    key: "replan",
    names: ["REPLAN"],
    label: "Adjust a deadline",
    step: null,
    path: "replan",
    help: "Move one milestone's due date, with a reason.",
    fields: [
      { key: "milestoneCode", label: "Milestone", kind: "milestone", required: true },
      { key: "dueDate", label: "New due date", kind: "date", required: true },
      REASON,
    ],
    body: (h, r) => ({ command: h.command(r.text("reason")), milestoneCode: r.text("milestoneCode"), dueDate: r.text("dueDate") }),
  },
  {
    key: "revise",
    names: ["REVISE"],
    label: "Withdraw the terms for revision",
    step: null,
    path: "revise",
    help: "Before placement only. Approval and acceptance must then be done again.",
    fields: [REASON],
    body: (h, r) => h.command(r.text("reason")),
  },
  {
    key: "loss",
    names: ["LOSS_RECORD", "RECORD_LOSS"],
    label: "Record that the client is not renewing",
    step: null,
    path: "record-loss",
    help: "Closes the case as lost. The details go into the Exit Register.",
    fields: [
      {
        key: "category",
        label: "Why the client left",
        kind: "select",
        required: true,
        options: [
          { value: "PRICE", label: "Price" },
          { value: "SERVICE", label: "Service" },
          { value: "COMPETITOR", label: "Went to a competitor" },
          { value: "OTHER", label: "Other" },
        ],
      },
      { key: "detail", label: "What happened", kind: "textarea", required: true },
      { key: "intelligenceSource", label: "Where this came from", kind: "text", required: true, placeholder: "e.g. Client email, meeting with the CFO" },
      REASON,
    ],
    body: (h, r) => ({
      command: h.command(r.text("reason")),
      category: r.text("category"),
      detail: r.text("detail"),
      intelligenceSource: r.text("intelligenceSource"),
    }),
  },
  {
    key: "recovery",
    names: ["EXCEPTION_RECORD", "RECORD_EXCEPTION", "RECOVERY_RECORD", "RECOVERY"],
    label: "Record a recovery plan",
    step: null,
    path: "record-exception",
    help: "For a late renewal that is not placed yet. CRM only. The case keeps its current step, approval and KYC rules.",
    fields: [
      { key: "dueDate", label: "Recovery deadline", kind: "date", required: true, hint: "A working day, today or later." },
      REASON,
    ],
    body: (h, r) => ({ command: h.command(r.text("reason")), dueDate: r.text("dueDate") }),
  },
];

/** Ready milestones with nobody assigned: the server reports these as ASSIGNEE_REQUIRED. */
export function unassignedSteps(c: RenewalCase) {
  return (c.backend?.milestones ?? []).filter((m) => m.status.toUpperCase() === "READY" && !m.assigneeId);
}

function stepName(code: RenewalMilestoneCode) {
  return RENEWAL_MILESTONES.find((m) => m.code === code)?.name ?? code;
}

/** Who approves, from the annual commission on the recommendation. */
export function approvalRoute(annualCommissionRwf: number | undefined): string {
  if (annualCommissionRwf === undefined) return "Who approves depends on the annual commission on the recommendation.";
  const amount = `RWF ${annualCommissionRwf.toLocaleString("en-US")}`;
  if (annualCommissionRwf < 1_000_000) return `Annual commission is ${amount}, so the Technical Director approves.`;
  if (annualCommissionRwf <= 10_000_000) return `Annual commission is ${amount}, so the Technical Director approves, then the MD.`;
  return `Annual commission is ${amount}, so the MD approves and records the Board's approval.`;
}

/* ---------------------------- Which actions to show --------------------------- */

const normalize = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, "");

function offered(spec: RenewalActionSpec, available: string[]) {
  const names = new Set(available.map(normalize));
  return spec.names.some((n) => names.has(normalize(n)));
}

/** The actions the server allows right now, for one milestone (or "More actions" when step is null). */
export function renewalActionsFor(c: RenewalCase, step: RenewalMilestoneCode | null): RenewalActionSpec[] {
  const available = c.backend?.availableActions ?? [];
  return RENEWAL_ACTIONS.filter((a) => a.step === step && offered(a, available));
}

/** Server actions this screen does not know yet, so they can be listed instead of silently hidden. */
export function unknownRenewalActions(c: RenewalCase): string[] {
  const available = c.backend?.availableActions ?? [];
  return available.filter((name) => !RENEWAL_ACTIONS.some((a) => a.names.some((n) => normalize(n) === normalize(name))));
}

/* -------------------------------- Building one -------------------------------- */

/** Checks the form before anything is uploaded. Returns field errors by key. */
export function checkRenewalValues(spec: RenewalActionSpec, values: Values): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const f of spec.fields) {
    const v = values[f.key];
    const empty = v === null || v === undefined || v === "" || (Array.isArray(v) && v.length === 0);
    if (f.required && empty) {
      errors[f.key] = f.kind === "file" ? "Attach the file." : `Enter ${f.label.toLowerCase()}.`;
      continue;
    }
    if (!empty && (f.kind === "number" || f.kind === "percent")) {
      const n = Number(String(v).replace(/[,\s]/g, ""));
      if (!Number.isFinite(n) || n < 0) errors[f.key] = "Numbers only.";
      else if (f.kind === "percent" && n > 100) errors[f.key] = "Enter a percentage up to 100.";
    }
  }
  const money = ["netPremium", "amountPaid", "commissionRate"];
  if (spec.fields.some((f) => f.key === "netPremium")) {
    const filled = money.filter((k) => typeof values[k] === "string" && (values[k] as string).trim());
    if (filled.length > 0 && filled.length < 3) {
      for (const k of money) if (!filled.includes(k)) errors[k] = "Fill this too, or leave all three empty.";
    }
  }
  const start = values.effectDate;
  const end = values.expiryDate;
  if (typeof start === "string" && typeof end === "string" && start && end && end <= start) {
    errors.expiryDate = "Cover must end after it starts.";
  }
  return errors;
}

/** Turns a filled form into what runRenewalAction sends. */
export function buildRenewalInput(c: RenewalCase, spec: RenewalActionSpec, values: Values): RenewalActionInput {
  const str = (key: string) => {
    const v = values[key];
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
  };
  const num = (key: string) => {
    const v = str(key);
    return v === undefined ? undefined : Number(v.replace(/[,\s]/g, ""));
  };
  const read: Read = {
    text: str,
    number: num,
    fraction: (key) => {
      const n = num(key);
      return n === undefined ? undefined : n / 100;
    },
    list: (key) => {
      const v = values[key];
      if (Array.isArray(v)) return v;
      return typeof v === "string" ? v.split("\n").map((l) => l.trim()).filter(Boolean) : [];
    },
  };

  const files: Record<string, EvidenceInput> = {};
  for (const f of spec.fields) {
    const v = values[f.key];
    if (f.kind === "file" && v instanceof File) {
      files[f.key] = { file: v, occurredAt: str("occurredAt") ?? new Date().toISOString().slice(0, 10), detail: str("detail") };
    }
  }

  return {
    path: spec.path,
    files,
    classification: spec.classification ?? "CORRESPONDENCE",
    purpose: spec.evidencePurpose ?? spec.key.toUpperCase().replace(/-/g, "_"),
    body: (h) => spec.body(h, read, c),
  };
}