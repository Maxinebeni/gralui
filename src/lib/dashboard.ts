// Figures for the Overview page's Clients, Renewals and Claims views, as
// GRAL asked for them in "GRAL Dashboard Requirements". Everything is worked
// out from the client, policy and claim lists the app already loads.

import { policyFinancials } from "./api";
import { isClosed } from "./claims";
import { displayToIso } from "./format";
import { daysBetween, todayIso } from "./renewals";
import type { Claim, Client, ClientType, Policy } from "./types";

export type PolicyRow = {
  clientId: string;
  client: string;
  clientType: ClientType;
  policy: Policy;
  /** ISO date the current cover ends. */
  expiry: string;
  /** Days until expiry, negative once expired. */
  daysLeft: number;
  /** Premium still owed (total premium − amount paid), or null when not recorded. */
  balance: number | null;
};

/**
 * Days after cover starts before an unpaid premium counts as overdue
 * (GRAL: Corporate 30 days, Government 60 days, Individuals immediately).
 * State Enterprise is GRAL's government client type.
 */
export const PAYMENT_DAYS: Record<ClientType, number> = {
  Corporate: 30,
  SME: 30,
  NGO: 30,
  "Financial Institution": 30,
  "State Enterprise": 60,
};

/** Policies still being looked after (not cancelled or lapsed). */
function isLive(p: Policy) {
  return p.status === "Active" || p.status === "In Renewal";
}

export function policyRows(clients: Client[], today = todayIso()): PolicyRow[] {
  return clients.flatMap((c) =>
    c.policies.flatMap((p) => {
      const expiry = displayToIso(p.renewal);
      if (!expiry) return [];
      return [{
        clientId: c.id,
        client: c.name,
        clientType: c.type,
        policy: p,
        expiry,
        daysLeft: daysBetween(today, expiry),
        balance: policyFinancials(p).balance,
      }];
    }),
  );
}

/** Policies currently in force. */
export function inForce(rows: PolicyRow[]) {
  return rows.filter((r) => isLive(r.policy) && r.daysLeft >= 0);
}

/** Live policies expiring between `from` and `to` days from today, soonest first. */
export function expiringBetween(rows: PolicyRow[], from: number, to: number) {
  return rows
    .filter((r) => isLive(r.policy) && r.daysLeft >= from && r.daysLeft <= to)
    .sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Past expiry with no renewal recorded, longest overdue first. */
export function overdueRenewals(rows: PolicyRow[]) {
  return rows.filter((r) => isLive(r.policy) && r.daysLeft < 0).sort((a, b) => a.daysLeft - b.daysLeft);
}

/** Premium still owed after the client type's payment deadline. */
export function unpaidPolicies(rows: PolicyRow[], today = todayIso()) {
  return rows.filter((r) => {
    if (!isLive(r.policy) || r.balance === null || r.balance <= 0) return false;
    const start = displayToIso(r.policy.start);
    return !!start && daysBetween(start, today) > PAYMENT_DAYS[r.clientType];
  });
}

/* --------------------------------- Clients ---------------------------------- */

export function clientPremium(c: Client, today = todayIso()) {
  return inForce(policyRows([c], today)).reduce((s, r) => s + (r.policy.premium ?? 0), 0);
}

export function hasActivePolicy(c: Client, today = todayIso()) {
  return inForce(policyRows([c], today)).length > 0;
}

export function newThisMonth(clients: Client[], today = todayIso()) {
  return clients.filter((c) => c.createdAt?.startsWith(today.slice(0, 7)));
}

export function clientsByCategory(clients: Client[]) {
  const counts = new Map<ClientType, number>();
  for (const c of clients) counts.set(c.type, (counts.get(c.type) ?? 0) + 1);
  return [...counts].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
}

export function topClientsByPremium(clients: Client[], limit = 15, today = todayIso()) {
  return clients
    .map((c) => ({ client: c, premium: clientPremium(c, today) }))
    .filter((x) => x.premium > 0)
    .sort((a, b) => b.premium - a.premium)
    .slice(0, limit);
}

/* --------------------------------- Claims ----------------------------------- */

export const CLAIM_STATUSES = ["Reported", "Under Assessment", "Pending Insurer", "Settled", "Rejected"] as const;
export type ClaimStatusLabel = (typeof CLAIM_STATUSES)[number];

/** Expected time to resolve a claim (GRAL: 30 days). */
export const CLAIM_RESOLUTION_DAYS = 30;

/**
 * GRAL's status names for our six SOP steps. Settled covers claims the
 * insurer has agreed to pay that are in sign-off or payment; Rejected
 * covers insurer rejections, including those with the Claims Committee.
 */
export function claimStatus(c: Claim): ClaimStatusLabel {
  if (isClosed(c)) return c.closure!.outcome === "SETTLED" ? "Settled" : "Rejected";
  if (c.dispute) return "Rejected";
  switch (c.step) {
    case "REGISTER":
      return "Reported";
    case "DOCUMENTS":
    case "SUBMIT":
      return "Under Assessment";
    case "FOLLOW_UP":
      return "Pending Insurer";
    default:
      return "Settled";
  }
}

export function claimsByStatus(claims: Claim[]) {
  return CLAIM_STATUSES.map((label) => ({ label, count: claims.filter((c) => claimStatus(c) === label).length }));
}

export function claimsOpenedThisMonth(claims: Claim[], today = todayIso()) {
  return claims.filter((c) => c.dateReported.startsWith(today.slice(0, 7)));
}

/** Open longer than the 30-day resolution window, oldest first. */
export function overdueClaims(claims: Claim[], today = todayIso()) {
  return claims
    .filter((c) => !isClosed(c) && daysBetween(c.dateReported, today) > CLAIM_RESOLUTION_DAYS)
    .sort((a, b) => a.dateReported.localeCompare(b.dateReported));
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Claims closed as settled in each of the last `months` months. */
export function settledPerMonth(claims: Claim[], months = 6, today = todayIso()) {
  const [y, m] = today.split("-").map(Number);
  return Array.from({ length: months }, (_, i) => {
    const d = new Date(Date.UTC(y!, m! - 1 - (months - 1 - i), 1));
    const key = d.toISOString().slice(0, 7);
    const settled = claims.filter((c) => c.closure?.outcome === "SETTLED" && c.closure.closedAt.startsWith(key));
    return {
      month: MONTHS[d.getUTCMonth()]!,
      count: settled.length,
    };
  });
}
