import { describe, expect, it } from "vitest";
import { claimsReport, clientReport, periodFor, periodOptions, portfolioReport, renewalsReport } from "./reports";
import type { Claim, Client, Policy, RenewalCase } from "./types";

const policy = (over: Partial<Policy>): Policy => ({
  id: "POL-1",
  classOfInsurance: "Motor",
  insurer: "SONARWA",
  premium: 1_000_000,
  amountPaid: 600_000,
  start: "01 Jan 2026",
  renewal: "31 Dec 2026",
  status: "Active",
  ...over,
});

const client = (over: Partial<Client>): Client =>
  ({ id: "CLT-1", name: "Kigali Steel", type: "Corporate", kyc: true, policies: [], ...over }) as unknown as Client;

const claim = (over: Partial<Claim>): Claim =>
  ({ id: "CLM-1", clientId: "CLT-1", client: "Kigali Steel", amount: 500_000, dateReported: "2026-10-05", step: "FOLLOW_UP", ...over }) as unknown as Claim;

describe("periods", () => {
  it("reads quarters, months and the year to date", () => {
    expect(periodFor("2026-Q4")).toMatchObject({ label: "Q4 2026", from: "2026-10-01", to: "2026-12-31" });
    expect(periodFor("2026-02")).toMatchObject({ label: "February 2026", from: "2026-02-01", to: "2026-02-28" });
    expect(periodFor("2026", "2026-11-11")).toMatchObject({ from: "2026-01-01", to: "2026-11-11" });
    expect(periodFor("nonsense")).toBeNull();
  });

  it("offers the last four quarters across a year end", () => {
    const keys = periodOptions("2026-02-10").map((p) => p.key);
    expect(keys.slice(0, 4)).toEqual(["2026-Q1", "2025-Q4", "2025-Q3", "2025-Q2"]);
    expect(keys.slice(4, 6)).toEqual(["2026-02", "2026-01"]);
    expect(keys.at(-1)).toBe("2026");
  });
});

describe("client report", () => {
  const c = client({
    policies: [
      policy({ id: "POL-1" }),
      policy({ id: "POL-OLD", start: "01 Jan 2025", renewal: "31 Dec 2025" }),
      policy({ id: "POL-NEXT", start: "15 Feb 2026", renewal: "14 Feb 2027" }),
    ],
  });
  const q4 = periodFor("2026-Q4")!;

  it("lists the cover in force and the renewals due in the next 120 days", () => {
    const r = clientReport(c, [], q4);
    expect(r.policies.map((p) => p.policy.id)).toEqual(["POL-1", "POL-NEXT"]);
    expect(r.upcoming.map((u) => u.policy.id)).toEqual(["POL-NEXT"]);
    expect(r.totals).toMatchObject({ premium: 2_000_000, paid: 1_200_000, balance: 800_000 });
  });

  it("includes claims reported in the period and older ones still open", () => {
    const claims = [
      claim({ id: "IN" }),
      claim({ id: "OLD-OPEN", dateReported: "2026-03-01" }),
      claim({ id: "OLD-CLOSED", dateReported: "2026-03-01", closure: { closedAt: "2026-05-01", by: "x", outcome: "SETTLED", evidence: "" } }),
      claim({ id: "OTHER", clientId: "CLT-2" }),
    ];
    const r = clientReport(c, claims, q4);
    expect(r.claims.map((x) => x.id)).toEqual(["IN", "OLD-OPEN"]);
    expect(r.totals.openClaims).toBe(2);
  });
});

describe("renewals report", () => {
  it("shows what happened to each renewal due in the period", () => {
    const clients = [
      client({
        policies: [
          policy({ id: "A", renewal: "10 Nov 2026" }),
          policy({ id: "B", renewal: "20 Nov 2026" }),
          policy({ id: "C", renewal: "25 Nov 2026" }),
          policy({ id: "D", renewal: "10 Jan 2027" }),
        ],
      }),
    ];
    const cases = [
      { policyId: "A", completed: Array(10).fill({}), backend: { state: "COMPLETED" } },
      { policyId: "B", completed: [], backend: { state: "LOST_NON_RENEWED" } },
    ] as unknown as RenewalCase[];
    const r = renewalsReport(clients, cases, periodFor("2026-11")!);
    expect(r.lines.map((l) => `${l.policy.id}:${l.status}`)).toEqual(["A:Completed", "B:Lost", "C:No renewal case"]);
    expect(r.totals).toMatchObject({ due: 3, renewed: 1, lost: 1, notStarted: 1, inProgress: 0, premium: 3_000_000 });
  });
});

describe("claims report", () => {
  it("counts claims reported and settled in the period", () => {
    const r = claimsReport(
      [
        claim({ id: "1" }),
        claim({ id: "2", dateReported: "2026-11-02", closure: { closedAt: "2026-11-09", by: "x", outcome: "SETTLED", evidence: "" } }),
        claim({ id: "3", dateReported: "2026-08-01", closure: { closedAt: "2026-10-20", by: "x", outcome: "SETTLED", evidence: "" } }),
      ],
      periodFor("2026-Q4")!,
    );
    expect(r.totals).toEqual({ reported: 2, amount: 1_000_000, settled: 2, stillOpen: 1 });
    expect(r.byStatus.find((s) => s.label === "Settled")?.count).toBe(1);
  });
});

describe("portfolio report", () => {
  it("groups the live book by class and insurer", () => {
    const clients = [
      client({ policies: [policy({ id: "1" }), policy({ id: "2", insurer: "RADIANT", premium: 3_000_000 }), policy({ id: "3", status: "Cancelled" })] }),
      client({ id: "CLT-2", kyc: false, policies: [policy({ id: "4", classOfInsurance: "Fire" })] }),
    ];
    const r = portfolioReport(clients, "2026-11-11");
    expect(r.totals).toEqual({ clients: 2, policies: 3, premium: 5_000_000, kycApproved: 1, allClients: 2 });
    expect(r.byInsurer[0]).toEqual({ label: "RADIANT", policies: 1, premium: 3_000_000 });
    expect(r.byClass.find((x) => x.label === "Motor")?.policies).toBe(2);
  });
});
