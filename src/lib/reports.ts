// Reports worked out from the lists the app already loads (clients with their
// policies, claims and renewals). PROVISIONAL: GRAL has not supplied its report
// templates yet (backend G06), so these follow the dashboard requirements and
// the SOPs. Saved report runs come with the backend's RPT-03.

import { policyFinancials } from "./api";
import { claimStatus, CLAIM_STATUSES } from "./dashboard";
import { displayToIso } from "./format";
import { isLostRenewal, renewalStage, todayIso } from "./renewals";
import type { Claim, Client, Policy, RenewalCase } from "./types";

export type Period = { key: string; label: string; from: string; to: string };

/** Opens the client report for one client, e.g. from the client file. */
export const clientReportHref = (clientId: string) => `/reports?report=client&client=${encodeURIComponent(clientId)}`;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m, d)).toISOString().slice(0, 10);

const validIso = (d: string) => !Number.isNaN(Date.parse(`${d}T00:00:00Z`)) && iso(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, Number(d.slice(8))) === d;

/** A custom range as a period key: "2026-01-05_2026-03-01". */
export const customKey = (from: string, to: string) => `${from}_${to}`;
export const isCustomKey = (key: string) => /^\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}$/.test(key);

/** "1 Oct 2026 – 31 Dec 2026", the exact days a period covers. */
export const rangeLabel = (p: Pick<Period, "from" | "to">) => (p.from === p.to ? shortDate(p.from) : `${shortDate(p.from)} – ${shortDate(p.to)}`);

/**
 * "2026-Q4", "2026-11", "2026" (year to date) or a custom "from_to" range as
 * dates, both ends included.
 */
export function periodFor(key: string, today = todayIso()): Period | null {
  if (isCustomKey(key)) {
    const [a, b] = key.split("_") as [string, string];
    if (!validIso(a) || !validIso(b)) return null;
    const [from, to] = a <= b ? [a, b] : [b, a];
    return { key: customKey(from, to), label: rangeLabel({ from, to }), from, to };
  }
  const q = /^(\d{4})-Q([1-4])$/.exec(key);
  if (q) {
    const y = Number(q[1]);
    const n = Number(q[2]);
    return { key, label: `Q${n} ${y}`, from: iso(y, (n - 1) * 3, 1), to: iso(y, n * 3, 0) };
  }
  const m = /^(\d{4})-(\d{2})$/.exec(key);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]) - 1;
    return { key, label: `${MONTH_NAMES[mo]} ${y}`, from: iso(y, mo, 1), to: iso(y, mo + 1, 0) };
  }
  if (/^\d{4}$/.test(key)) {
    return { key, label: `${key} to date`, from: `${key}-01-01`, to: key === today.slice(0, 4) ? today : `${key}-12-31` };
  }
  return null;
}

/** The choices offered: this and the last three quarters, the last six months, and the year so far. */
export function periodOptions(today = todayIso()): Period[] {
  const [y, mo] = today.split("-").map(Number) as [number, number];
  const quarters = Array.from({ length: 4 }, (_, i) => {
    const index = Math.floor((mo - 1) / 3) - i;
    const year = y + Math.floor(index / 4);
    return `${year}-Q${((index % 4) + 4) % 4 + 1}`;
  });
  const months = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
  });
  return [...quarters, ...months, String(y)].map((k) => periodFor(k, today)!);
}

export const inPeriod = (date: string | undefined, p: Period) => !!date && date >= p.from && date <= p.to;

const policyDates = (p: Policy) => ({ start: displayToIso(p.start), end: displayToIso(p.renewal) });

/** In force at some point in the period. */
export function coversPeriod(p: Policy, period: Period) {
  const { start, end } = policyDates(p);
  return !!start && !!end && start <= period.to && end >= period.from && p.status !== "Cancelled";
}

export function shortDate(isoDate: string) {
  const [y, m, d] = isoDate.split("-");
  return `${Number(d)} ${MONTHS[Number(m) - 1]} ${y}`;
}

/* ---------------------------- Quarterly client report ---------------------------- */

export type ClientReport = {
  policies: { policy: Policy; premium: number | null; paid: number | null; balance: number | null }[];
  claims: Claim[];
  /** Policies whose cover ends within 120 days after the period, the renewal window in GRAL's SOP. */
  upcoming: { policy: Policy; expiry: string }[];
  totals: { premium: number; paid: number; balance: number; claimed: number; openClaims: number };
};

export function clientReport(client: Client, claims: Claim[], period: Period): ClientReport {
  const policies = client.policies
    .filter((p) => coversPeriod(p, period))
    .map((policy) => {
      const f = policyFinancials(policy);
      return { policy, premium: f.totalPremium, paid: f.amountPaid, balance: f.balance };
    });
  const own = claims.filter((c) => c.clientId === client.id);
  const reported = own.filter((c) => inPeriod(c.dateReported, period) || (c.dateReported <= period.to && !c.closure));
  const windowEnd = iso(Number(period.to.slice(0, 4)), Number(period.to.slice(5, 7)) - 1, Number(period.to.slice(8)) + 120);
  const upcoming = client.policies
    .map((policy) => ({ policy, expiry: policyDates(policy).end }))
    .filter((x) => x.expiry > period.to && x.expiry <= windowEnd)
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const sum = (xs: (number | null)[]) => xs.reduce<number>((s, x) => s + (x ?? 0), 0);
  return {
    policies,
    claims: reported,
    upcoming,
    totals: {
      premium: sum(policies.map((p) => p.premium)),
      paid: sum(policies.map((p) => p.paid)),
      balance: sum(policies.map((p) => p.balance)),
      claimed: sum(reported.map((c) => c.amount)),
      openClaims: reported.filter((c) => !c.closure).length,
    },
  };
}

/* --------------------------------- Renewals report -------------------------------- */

export type RenewalLine = { client: Client; policy: Policy; expiry: string; premium: number | null; status: string };

/** What happened to the renewal of each policy ending in the period. */
export function renewalStatus(policy: Policy, cases: RenewalCase[]) {
  const c = cases.find((r) => r.policyId === policy.id);
  if (!c) return "Not started";
  if (isLostRenewal(c)) return "Not renewed";
  const stage = renewalStage(c);
  return stage === "Completed" ? "Renewed" : stage;
}

export function renewalsReport(clients: Client[], cases: RenewalCase[], period: Period) {
  const lines: RenewalLine[] = clients
    .flatMap((client) =>
      client.policies.map((policy) => ({ client, policy, expiry: policyDates(policy).end, premium: policyFinancials(policy).totalPremium })),
    )
    .filter((l) => inPeriod(l.expiry, period))
    .map((l) => ({ ...l, status: renewalStatus(l.policy, cases) }))
    .sort((a, b) => a.expiry.localeCompare(b.expiry));
  const count = (status: string) => lines.filter((l) => l.status === status).length;
  return {
    lines,
    totals: {
      due: lines.length,
      renewed: count("Renewed"),
      lost: count("Not renewed"),
      notStarted: count("Not started"),
      inProgress: lines.length - count("Renewed") - count("Not renewed") - count("Not started"),
      premium: lines.reduce((s, l) => s + (l.premium ?? 0), 0),
    },
  };
}

/* ---------------------------------- Claims report --------------------------------- */

export function claimsReport(claims: Claim[], period: Period) {
  const reported = claims.filter((c) => inPeriod(c.dateReported, period)).sort((a, b) => a.dateReported.localeCompare(b.dateReported));
  const settled = claims.filter((c) => c.closure?.outcome === "SETTLED" && inPeriod(c.closure.closedAt, period));
  return {
    reported,
    byStatus: CLAIM_STATUSES.map((label) => ({ label, count: reported.filter((c) => claimStatus(c) === label).length })),
    totals: {
      reported: reported.length,
      amount: reported.reduce((s, c) => s + c.amount, 0),
      settled: settled.length,
      stillOpen: reported.filter((c) => !c.closure).length,
    },
  };
}

/* -------------------------------- Portfolio report -------------------------------- */

/** The book as it stands on a day: live policies by class and by insurer. */
export function portfolioReport(clients: Client[], today = todayIso()) {
  const day: Period = { key: today, label: today, from: today, to: today };
  const live = clients.flatMap((client) => client.policies.filter((p) => coversPeriod(p, day)).map((policy) => ({ client, policy })));
  const group = (keyOf: (p: Policy) => string) => {
    const m = new Map<string, { label: string; policies: number; premium: number }>();
    for (const { policy } of live) {
      const k = keyOf(policy) || "Not recorded";
      const row = m.get(k) ?? { label: k, policies: 0, premium: 0 };
      row.policies += 1;
      row.premium += policyFinancials(policy).totalPremium ?? 0;
      m.set(k, row);
    }
    return [...m.values()].sort((a, b) => b.premium - a.premium || b.policies - a.policies);
  };
  return {
    byClass: group((p) => p.classOfInsurance),
    byInsurer: group((p) => p.insurer),
    totals: {
      clients: new Set(live.map((l) => l.client.id)).size,
      policies: live.length,
      premium: live.reduce((s, l) => s + (policyFinancials(l.policy).totalPremium ?? 0), 0),
      kycApproved: clients.filter((c) => c.kyc).length,
      allClients: clients.length,
    },
  };
}
