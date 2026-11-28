// Premium payments on a policy's cover period: the instalment plan, each
// payment with its method, reference number and receipt, and what is still owed.
//
// Demo mode keeps everything in memory. On the live system it uses the routes
// proposed to the backend team (docs/backend-requests-pilot.md):
//   GET  /api/v1/policy-periods/{periodId}/payments      -> PaymentPlanView
//   PUT  /api/v1/policy-periods/{periodId}/instalments    { instalments: [{ dueDate, amount }], reason }
//   POST /api/v1/policy-periods/{periodId}/payments       { amount, currency, paidOn, method, reference,
//                                                            instalmentNumber?, receiptDocumentId, receiptDocumentVersion }
// Until those exist the server answers 404, and the screen says payments are not on the live system yet.

import { MOCK_AUTH, apiFetch, uploadDocument } from "./api";
import { todayIso } from "./renewals";

export const PAYMENT_METHODS = [
  { value: "BANK_TRANSFER", label: "Bank transfer" },
  { value: "MOBILE_MONEY", label: "Mobile money" },
  { value: "CHEQUE", label: "Cheque" },
  { value: "CARD", label: "Card" },
  { value: "CASH", label: "Cash" },
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number]["value"];
export const methodLabel = (m: string) => PAYMENT_METHODS.find((x) => x.value === m)?.label ?? m;

export type Instalment = { number: number; dueDate: string; amount: number };

export type PolicyPayment = {
  id: string;
  paidOn: string;
  amount: number;
  method: PaymentMethod;
  reference: string;
  /** Which instalment it pays, when chosen. */
  instalmentNumber?: number;
  receipt: { fileName: string; documentId?: string; version?: number };
  recordedBy: string;
  recordedAt: string;
};

export type PaymentPlan = { instalments: Instalment[]; payments: PolicyPayment[] };

export type InstalmentStatus = "PAID" | "PART_PAID" | "DUE" | "OVERDUE";
export type InstalmentLine = Instalment & { paid: number; status: InstalmentStatus };

/** The page's view of a period's payments. available: false while the server does not support them yet. */
export type PaymentsState = { available: true; plan: PaymentPlan } | { available: false };

/** Who the period belongs to, so a receipt can be filed on the policy. */
export type PeriodRef = { key: string; periodId?: string; policyUuid?: string; totalPremium: number | null; startDate?: string; amountPaid: number | null };

const DEMO = new Map<string, PaymentPlan>();

function demoPlan(ref: PeriodRef): PaymentPlan {
  let plan = DEMO.get(ref.key);
  if (!plan) {
    const total = ref.totalPremium ?? 0;
    const start = ref.startDate ?? todayIso();
    plan = {
      instalments: total > 0 ? [{ number: 1, dueDate: start, amount: total }] : [],
      // What was already recorded as paid on the policy, so the two figures agree.
      payments:
        ref.amountPaid && ref.amountPaid > 0
          ? [
              {
                id: `PAY-${ref.key}-0`,
                paidOn: start,
                amount: ref.amountPaid,
                method: "BANK_TRANSFER",
                reference: "Recorded before",
                receipt: { fileName: "Not attached" },
                recordedBy: "GRAL",
                recordedAt: start,
              },
            ]
          : [],
    };
    DEMO.set(ref.key, plan);
  }
  return plan;
}

const unavailable = (status: number) => status === 404 || status === 405 || status === 501;

async function problem(res: Response, fallback: string) {
  try {
    const body = (await res.json()) as { detail?: string; title?: string };
    return body.detail || body.title || fallback;
  } catch {
    return fallback;
  }
}

export async function getPayments(ref: PeriodRef): Promise<PaymentsState> {
  if (MOCK_AUTH || !ref.periodId) return MOCK_AUTH ? { available: true, plan: structuredClone(demoPlan(ref)) } : { available: false };
  const res = await apiFetch(`/api/v1/policy-periods/${ref.periodId}/payments`);
  if (unavailable(res.status) || res.status === 403) return { available: false };
  if (!res.ok) throw new Error(await problem(res, "Could not load the payments."));
  return { available: true, plan: (await res.json()) as PaymentPlan };
}

export async function setInstalments(ref: PeriodRef, instalments: Omit<Instalment, "number">[], reason: string): Promise<PaymentPlan> {
  const numbered = [...instalments].sort((a, b) => a.dueDate.localeCompare(b.dueDate)).map((x, i) => ({ ...x, number: i + 1 }));
  if (MOCK_AUTH) {
    const plan = demoPlan(ref);
    plan.instalments = numbered;
    return structuredClone(plan);
  }
  const res = await apiFetch(`/api/v1/policy-periods/${ref.periodId}/instalments`, {
    method: "PUT",
    body: JSON.stringify({ instalments: numbered.map(({ dueDate, amount }) => ({ dueDate, amount })), currency: "RWF", reason: reason.trim() }),
  });
  if (unavailable(res.status)) throw new Error("Instalments are not on the live system yet.");
  if (!res.ok) throw new Error(await problem(res, "Could not save the instalments."));
  return (await res.json()) as PaymentPlan;
}

export async function recordPayment(
  ref: PeriodRef,
  input: { amount: number; paidOn: string; method: PaymentMethod; reference: string; instalmentNumber?: number; receipt: File },
  by: string,
): Promise<PaymentPlan> {
  if (MOCK_AUTH) {
    const plan = demoPlan(ref);
    plan.payments.push({
      id: `PAY-${ref.key}-${plan.payments.length + 1}`,
      paidOn: input.paidOn,
      amount: input.amount,
      method: input.method,
      reference: input.reference.trim(),
      instalmentNumber: input.instalmentNumber,
      receipt: { fileName: input.receipt.name },
      recordedBy: by,
      recordedAt: todayIso(),
    });
    return structuredClone(plan);
  }
  // The receipt is filed on the policy first, then the payment points to that exact version.
  const doc = await uploadDocument({ type: "POLICY", id: ref.policyUuid ?? ref.key }, input.receipt, {
    classification: "CORRESPONDENCE",
    purpose: "PROOF_OF_PAYMENT",
  });
  const res = await apiFetch(`/api/v1/policy-periods/${ref.periodId}/payments`, {
    method: "POST",
    body: JSON.stringify({
      amount: input.amount,
      currency: "RWF",
      paidOn: input.paidOn,
      method: input.method,
      reference: input.reference.trim(),
      instalmentNumber: input.instalmentNumber ?? null,
      receiptDocumentId: doc.id,
      receiptDocumentVersion: doc.version,
    }),
  });
  if (unavailable(res.status)) throw new Error("Payments are not on the live system yet. The receipt was saved with the policy documents.");
  if (!res.ok) throw new Error(await problem(res, "Could not record the payment."));
  return (await res.json()) as PaymentPlan;
}

/**
 * Each instalment with what has been paid towards it. Payments tied to an
 * instalment count there first; the rest fill the instalments in due-date order.
 */
export function instalmentLines(plan: PaymentPlan, today = todayIso()): InstalmentLine[] {
  const ordered = [...plan.instalments].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const paid = new Map<number, number>(ordered.map((i) => [i.number, 0]));
  let loose = 0;
  for (const p of plan.payments) {
    if (p.instalmentNumber && paid.has(p.instalmentNumber)) paid.set(p.instalmentNumber, paid.get(p.instalmentNumber)! + p.amount);
    else loose += p.amount;
  }
  // Anything paid beyond an instalment's amount moves on to the next ones.
  for (const i of ordered) {
    const over = paid.get(i.number)! - i.amount;
    if (over > 0) {
      paid.set(i.number, i.amount);
      loose += over;
    }
  }
  return ordered.map((i) => {
    const top = Math.min(loose, i.amount - paid.get(i.number)!);
    loose -= top;
    const got = paid.get(i.number)! + top;
    const status: InstalmentStatus = got >= i.amount ? "PAID" : i.dueDate < today ? "OVERDUE" : got > 0 ? "PART_PAID" : "DUE";
    return { ...i, paid: got, status };
  });
}

export function paymentTotals(plan: PaymentPlan, totalPremium: number | null) {
  const paid = plan.payments.reduce((s, p) => s + p.amount, 0);
  const due = totalPremium ?? plan.instalments.reduce((s, i) => s + i.amount, 0);
  return { paid, due, owed: Math.max(0, due - paid) };
}

/** Splits the premium into equal instalments a month apart; the last takes the rounding. */
export function splitPremium(total: number, count: number, firstDue: string): Omit<Instalment, "number">[] {
  const each = Math.floor(total / count);
  const [y, m, d] = firstDue.split("-").map(Number) as [number, number, number];
  return Array.from({ length: count }, (_, i) => {
    const date = new Date(Date.UTC(y, m - 1 + i, 1));
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
    date.setUTCDate(Math.min(d, lastDay));
    return { dueDate: date.toISOString().slice(0, 10), amount: i === count - 1 ? total - each * (count - 1) : each };
  });
}
