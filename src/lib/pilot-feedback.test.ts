import { describe, expect, it } from "vitest";
import { businessLine, outstandingReport, periodFor, portfolioReport } from "./reports";
import { instalmentLines, paymentTotals, splitPremium, type PaymentPlan } from "./policy-payments";
import type { Client, Policy } from "./types";

const policy = (over: Partial<Policy>): Policy => ({
  id: "POL-1",
  classOfInsurance: "Motor",
  insurer: "SONARWA",
  premium: 1_000_000,
  amountPaid: 1_000_000,
  start: "01 Jan 2026",
  renewal: "31 Dec 2026",
  status: "Active",
  ...over,
});

const client = (over: Partial<Client>): Client =>
  ({ id: "CLT-1", name: "Kigali Steel", type: "Corporate", kyc: true, policies: [], ...over }) as unknown as Client;

describe("lines of business", () => {
  it("puts medical and health cover under Medical, life and pensions under Life, the rest under Non-life", () => {
    expect(businessLine("Group Medical / Personal Health Insurance")).toBe("Medical");
    expect(businessLine("Group Life Assurance")).toBe("Life");
    expect(businessLine("Pension Fund")).toBe("Life");
    expect(businessLine("Motor Fleet")).toBe("Non-life");
  });

  it("always lists the three lines, with their share of premium", () => {
    const c = client({
      policies: [
        policy({ id: "A", classOfInsurance: "Group Medical", premium: 3_000_000 }),
        policy({ id: "B", classOfInsurance: "Motor", premium: 1_000_000 }),
      ],
    });
    const r = portfolioReport([c], "2026-06-01");
    expect(r.byLine.map((x) => [x.label, x.premium])).toEqual([
      ["Medical", 3_000_000],
      ["Life", 0],
      ["Non-life", 1_000_000],
    ]);
  });

  it("counts policies in force at any point in the chosen period", () => {
    const c = client({ policies: [policy({ id: "OLD", start: "01 Jan 2025", renewal: "31 Dec 2025" }), policy({ id: "NOW" })] });
    expect(portfolioReport([c], "2026-06-01").totals.policies).toBe(1);
    expect(portfolioReport([c], "2026-06-01", periodFor("2025")!).policies.map((l) => l.policy.id)).toEqual(["OLD"]);
  });
});

describe("outstanding payments", () => {
  it("lists only policies not fully paid, largest balance first", () => {
    const c = client({
      policies: [
        policy({ id: "PAID" }),
        policy({ id: "SMALL", amountPaid: 900_000 }),
        policy({ id: "BIG", amountPaid: 200_000 }),
      ],
    });
    const r = outstandingReport([c], periodFor("2026-Q2")!);
    expect(r.lines.map((l) => l.policy.id)).toEqual(["BIG", "SMALL"]);
    expect(r.totals.outstanding).toBe(900_000);
  });
});

describe("instalments", () => {
  it("splits the premium a month apart, the last instalment taking the rounding", () => {
    expect(splitPremium(1_000_000, 3, "2026-01-31")).toEqual([
      { dueDate: "2026-01-31", amount: 333_333 },
      { dueDate: "2026-02-28", amount: 333_333 },
      { dueDate: "2026-03-31", amount: 333_334 },
    ]);
  });

  it("fills instalments in due-date order and marks unpaid past ones overdue", () => {
    const plan: PaymentPlan = {
      instalments: [
        { number: 1, dueDate: "2026-01-01", amount: 500 },
        { number: 2, dueDate: "2026-02-01", amount: 500 },
        { number: 3, dueDate: "2026-12-01", amount: 500 },
      ],
      payments: [{ id: "P1", paidOn: "2026-01-02", amount: 700, method: "CASH", reference: "R1", receipt: { fileName: "r.pdf" }, recordedBy: "", recordedAt: "" }],
    };
    expect(instalmentLines(plan, "2026-06-01").map((l) => [l.paid, l.status])).toEqual([
      [500, "PAID"],
      [200, "OVERDUE"],
      [0, "DUE"],
    ]);
    expect(paymentTotals(plan, 1500)).toEqual({ paid: 700, due: 1500, owed: 800 });
  });

  it("counts a payment for a chosen instalment there first", () => {
    const plan: PaymentPlan = {
      instalments: [
        { number: 1, dueDate: "2026-01-01", amount: 500 },
        { number: 2, dueDate: "2026-02-01", amount: 500 },
      ],
      payments: [{ id: "P1", paidOn: "2026-01-02", amount: 500, method: "CASH", reference: "R1", instalmentNumber: 2, receipt: { fileName: "r.pdf" }, recordedBy: "", recordedAt: "" }],
    };
    expect(instalmentLines(plan, "2026-01-15").map((l) => l.status)).toEqual(["OVERDUE", "PAID"]);
  });
});
