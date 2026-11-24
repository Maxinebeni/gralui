// TC's operations dashboard (backend docs/api/operations-dashboard.md):
//   GET /api/v1/reports/operations-dashboard            one summary for the Overview
//   GET /api/v1/reports/operations-dashboard/lists/{m}  the records behind one figure
// Only with the real backend; demo mode works the figures out from sample data.
//
// The backend allows one report request at a time per person and a few summaries
// a minute, so requests here go one after another, and a "busy" reply (429/503)
// is retried once after the time the server asks for.

import { apiFetch, clientTypeLabel } from "./api";
import { oneReportAtATime, retryDelayMs, wait } from "./report-queue";

/** A count the person may see, or null when their permissions hide it (not zero). */
type Count = number | null;

export type DashboardItem = {
  id: string;
  clientId?: string | null;
  clientReference?: string | null;
  clientName?: string | null;
  policyId?: string | null;
  periodId?: string | null;
  /** Policy number or claim number. */
  reference?: string | null;
  product?: string | null;
  /** Expiry date for policies, registration date for claims. */
  date?: string | null;
  state?: string | null;
  premium?: number | null;
  balance?: number | null;
  currency?: string | null;
  missingRenewalCase?: boolean;
};

export type OperationsDashboard = {
  asOf: string;
  clients: {
    active: Count;
    newThisMonth: Count;
    byCategory: Record<string, number>;
    withoutActivePolicy: Count;
    slaExpiring0To30Days: Count;
    slaExpiring31To60Days: Count;
    missingSlaDates: Count;
    topByPremium: DashboardItem[];
  };
  renewals: {
    activePolicies: Count;
    expiring0To30Days: Count;
    expiring31To60Days: Count;
    unresolvedExpired: Count;
    overduePayments: Count;
    expiringSoon: DashboardItem[];
    unresolvedExpiries: DashboardItem[];
  };
  claims: {
    open: Count;
    byState: Record<string, number>;
    openedThisMonth: Count;
    agedOver30Days: Count;
    /** "2026-11" → settled that month, current and previous 11 months. */
    settledByMonth: Record<string, number>;
  };
  /** Sources the person cannot read (e.g. CLAIM): their figures are null. */
  unavailable: string[];
};

export type DashboardMetric =
  | "ACTIVE_CLIENTS"
  | "NEW_CLIENTS"
  | "CLIENTS_WITHOUT_ACTIVE_POLICY"
  | "SLA_EXPIRING_0_30"
  | "SLA_EXPIRING_31_60"
  | "ACTIVE_POLICIES"
  | "POLICIES_EXPIRING_0_30"
  | "POLICIES_EXPIRING_31_60"
  | "OVERDUE_RENEWALS"
  | "OVERDUE_PAYMENTS"
  | "OPEN_CLAIMS"
  | "CLAIMS_OPENED_THIS_MONTH"
  | "CLAIMS_AGED_OVER_30_DAYS"
  | "CLAIMS_BY_STATE"
  | "CLAIMS_SETTLED";

export type DashboardPage = { items: DashboardItem[]; hasMore: boolean; nextCursor?: string | null };

/* ------------------------- One report request at a time ------------------------- */
// The queue is shared with the client list's active-policy counts (api.ts).

async function reportGet<T>(path: string): Promise<T> {
  return oneReportAtATime(async () => {
    for (let attempt = 0; ; attempt++) {
      const res = await apiFetch(path);
      if (res.ok) return (await res.json()) as T;
      if ((res.status === 429 || res.status === 503) && attempt === 0) {
        await wait(retryDelayMs(res));
        continue;
      }
      if (res.status === 401) throw new Error("Your session has ended. Please sign in again.");
      if (res.status === 403) throw new Error("You do not have access to the dashboard figures.");
      if (res.status === 429 || res.status === 503) throw new Error("The dashboard is busy. Please try again in a moment.");
      throw new Error("Could not load the dashboard figures.");
    }
  });
}

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

function toItem(v: Record<string, unknown>): DashboardItem {
  return { ...(v as DashboardItem), premium: num(v.premium), balance: num(v.balance) };
}

export async function getOperationsDashboard(): Promise<OperationsDashboard> {
  const raw = await reportGet<Record<string, any>>("/api/v1/reports/operations-dashboard?topClientLimit=15"); // eslint-disable-line @typescript-eslint/no-explicit-any
  const c = raw.clients ?? {};
  const r = raw.renewals ?? {};
  const k = raw.claims ?? {};
  return {
    asOf: raw.asOf,
    unavailable: [...(raw.unavailable ?? [])],
    clients: {
      active: num(c.active),
      newThisMonth: num(c.newThisMonth),
      byCategory: Object.fromEntries(Object.entries(c.byCategory ?? {}).map(([key, n]) => [clientTypeLabel(key), Number(n)])),
      withoutActivePolicy: num(c.withoutActivePolicy),
      slaExpiring0To30Days: num(c.slaExpiring0To30Days),
      slaExpiring31To60Days: num(c.slaExpiring31To60Days),
      missingSlaDates: num(c.missingSlaDates),
      topByPremium: (c.topByPremium ?? []).map(toItem),
    },
    renewals: {
      activePolicies: num(r.activePolicies),
      expiring0To30Days: num(r.expiring0To30Days),
      expiring31To60Days: num(r.expiring31To60Days),
      unresolvedExpired: num(r.unresolvedExpired),
      overduePayments: num(r.overduePayments),
      expiringSoon: (r.expiringSoon ?? []).map(toItem),
      unresolvedExpiries: (r.unresolvedExpiries ?? []).map(toItem),
    },
    claims: {
      open: num(k.open),
      byState: Object.fromEntries(Object.entries(k.byState ?? {}).map(([key, n]) => [key, Number(n)])),
      openedThisMonth: num(k.openedThisMonth),
      agedOver30Days: num(k.agedOver30Days),
      settledByMonth: Object.fromEntries(Object.entries(k.settledByMonth ?? {}).map(([key, n]) => [key, Number(n)])),
    },
  };
}

/** One page of the records behind a figure. CLAIMS_BY_STATE needs a state; CLAIMS_SETTLED needs a month (YYYY-MM). */
export async function getDashboardList(
  metric: DashboardMetric,
  options: { state?: string; month?: string; cursor?: string | null; size?: number } = {},
): Promise<DashboardPage> {
  const params = new URLSearchParams({ size: String(options.size ?? 20) });
  if (options.state) params.set("state", options.state);
  if (options.month) params.set("month", options.month);
  if (options.cursor) params.set("cursor", options.cursor);
  const page = await reportGet<{ items?: Record<string, unknown>[]; hasMore?: boolean; nextCursor?: string | null }>(
    `/api/v1/reports/operations-dashboard/lists/${metric}?${params}`,
  );
  return { items: (page.items ?? []).map(toItem), hasMore: !!page.hasMore, nextCursor: page.nextCursor };
}

/** Claim workflow states in plain words, for "Claims by status". */
export const CLAIM_STATE_LABEL: Record<string, string> = {
  REGISTERED: "Registered",
  DOCUMENTS_PENDING: "Documents pending",
  READY_FOR_SUBMISSION: "Ready to submit",
  SUBMITTED_TO_INSURER: "Submitted to insurer",
  UNDER_FOLLOW_UP: "Follow-up with insurer",
  SETTLEMENT_ADVISED: "Settlement offered",
  SETTLED: "Settled, to be closed",
  DISPUTED_REJECTED: "Disputed or rejected",
  CLAIMS_COMMITTEE_REVIEW: "With the Claims Committee",
  APPEAL_IN_PROGRESS: "Appeal in progress",
  FINAL_DECISION: "Final decision",
  CLOSED: "Closed",
};
export const claimStateLabel = (s: string) => CLAIM_STATE_LABEL[s] ?? s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
