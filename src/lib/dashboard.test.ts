import { describe, expect, it } from "vitest";
import {
  claimStatus,
  clientsByCategory,
  expiringBetween,
  hasActivePolicy,
  newThisMonth,
  overdueClaims,
  overdueRenewals,
  policyRows,
  settledPerMonth,
  topClientsByPremium,
  unpaidPolicies,
} from "./dashboard";
import type { Claim, Client, ClientType, Policy } from "./types";

const TODAY = "2026-10-29";

function policy(id: string, start: string, renewal: string, extra: Partial<Policy> = {}): Policy {
  return { id, classOfInsurance: "Motor", insurer: "UAP", premium: 1000, start, renewal, status: "Active", ...extra };
}

function client(id: string, type: ClientType, policies: Policy[], createdAt?: string): Client {
  return {
    id, name: id, type, sector: "", createdAt, activePolicies: 0, kyc: true, policiesOk: true, claimsOk: true,
    correspondenceOk: true, docsFiled: 4, docsTotal: 4, nonCompliant: false, manager: "", documents: [], policies,
    correspondence: [],
  };
}

const clients = [
  client("A", "Corporate", [
    policy("P1", "10 Nov 2025", "10 Nov 2026", { amountPaid: 1000 }), // 12 days left, paid
    policy("P2", "15 Dec 2025", "15 Dec 2026", { amountPaid: 0 }), // 47 days left, unpaid after 30 days
    policy("P3", "01 Oct 2025", "01 Oct 2026", { status: "In Renewal", amountPaid: 1000 }), // overdue renewal
  ], "2026-10-02"),
  client("B", "State Enterprise", [policy("P4", "15 Sep 2026", "15 Sep 2027", { premium: 5000, amountPaid: 0 })]), // 44 days in, within 60
  client("C", "SME", [policy("P5", "01 Jan 2025", "01 Jan 2026", { status: "Lapsed" })], "2026-09-30"),
];

describe("renewal figures", () => {
  const rows = policyRows(clients, TODAY);

  it("splits expiring policies into 0–30 and 31–60 days", () => {
    expect(expiringBetween(rows, 0, 30).map((r) => r.policy.id)).toEqual(["P1"]);
    expect(expiringBetween(rows, 31, 60).map((r) => r.policy.id)).toEqual(["P2"]);
  });

  it("flags live policies past expiry but not lapsed ones", () => {
    expect(overdueRenewals(rows).map((r) => r.policy.id)).toEqual(["P3"]);
  });

  it("uses the payment deadline for the client type", () => {
    expect(unpaidPolicies(rows, TODAY).map((r) => r.policy.id)).toEqual(["P2"]);
  });
});

describe("client figures", () => {
  it("counts active clients, new clients and categories", () => {
    expect(clients.filter((c) => hasActivePolicy(c, TODAY)).map((c) => c.id)).toEqual(["A", "B"]);
    expect(newThisMonth(clients, TODAY).map((c) => c.id)).toEqual(["A"]);
    expect(clientsByCategory(clients)).toHaveLength(3);
  });

  it("ranks clients by premium in force", () => {
    expect(topClientsByPremium(clients, 15, TODAY).map((t) => [t.client.id, t.premium])).toEqual([["B", 5000], ["A", 2000]]);
  });
});

describe("claim figures", () => {
  const base = { dateReported: "2026-10-20", step: "REGISTER" } as Claim;
  const settled = { ...base, dateReported: "2026-08-01", step: "CLOSE", closure: { closedAt: "2026-10-05", by: "", outcome: "SETTLED", evidence: "" } } as Claim;

  it("maps our steps to GRAL's status names", () => {
    expect(claimStatus(base)).toBe("Reported");
    expect(claimStatus({ ...base, step: "SUBMIT" })).toBe("Under Assessment");
    expect(claimStatus({ ...base, step: "FOLLOW_UP" })).toBe("Pending Insurer");
    expect(claimStatus(settled)).toBe("Settled");
    expect(claimStatus({ ...base, dispute: { raisedAt: "", reason: "" } })).toBe("Rejected");
  });

  it("finds open claims older than 30 days and counts settlements by month", () => {
    const old = { ...base, dateReported: "2026-09-01" };
    expect(overdueClaims([base, old, settled], TODAY)).toEqual([old]);
    expect(settledPerMonth([settled], 6, TODAY).at(-1)).toEqual({ month: "Oct", count: 1 });
  });
});
