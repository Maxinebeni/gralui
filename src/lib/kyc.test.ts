import { describe, expect, it } from "vitest";
import { isKycBlocker, kycBadge, kycBlockedReasons, kycHref } from "./kyc";
import { filterRenewals, renewalStage, RENEWAL_MILESTONES } from "./renewals";
import type { RenewalCase } from "./types";

describe("KYC badge", () => {
  it("is approved only when the gate is open", () => {
    expect(kycBadge({ status: "APPROVED", gateStatus: "READY" })).toEqual({ label: "Approved", tone: "success" });
    expect(kycBadge({ status: "APPROVED", gateStatus: "KYC_IDENTITY_CHANGED" }).label).toBe("Out of date");
    expect(kycBadge({ status: "APPROVED", gateStatus: "KYC_TEMPLATE_CHANGED" }).label).toBe("Out of date");
  });

  it("follows the review status while the gate is closed", () => {
    expect(kycBadge({ status: "NOT_STARTED", gateStatus: "KYC_APPROVAL_REQUIRED" }).label).toBe("Not started");
    expect(kycBadge({ status: "SUBMITTED", gateStatus: "KYC_APPROVAL_REQUIRED" }).label).toBe("In review");
    expect(kycBadge({ status: "REJECTED", gateStatus: "KYC_APPROVAL_REQUIRED" }).tone).toBe("danger");
  });

  it("falls back for records with no summary", () => {
    expect(kycBadge({ gateStatus: "UNAVAILABLE" }).label).toBe("Unknown");
    expect(kycBadge({ kyc: true }).label).toBe("Approved");
    expect(kycBadge({ kyc: false }).label).toBe("Not approved");
  });
});

describe("KYC blocked messages", () => {
  it("picks out gate blockers and removes repeats", () => {
    expect(isKycBlocker("KYC_NOT_READY")).toBe(true);
    expect(isKycBlocker("QUOTE_REQUIRED")).toBe(false);
    expect(kycBlockedReasons(["QUOTE_REQUIRED", "KYC_NOT_READY", "KYC_NOT_READY"])).toHaveLength(1);
    expect(kycBlockedReasons(["QUOTE_REQUIRED"])).toEqual([]);
  });

  it("links to the review, or to starting one", () => {
    expect(kycHref("CLT-1", "KYC-9")).toBe("/clients/kyc/KYC-9");
    expect(kycHref("CLT-1")).toBe("/clients/kyc/CLT-1?mode=client");
  });
});

describe("renewal filters", () => {
  const renewal = (done: number, over: Partial<RenewalCase> = {}) =>
    ({
      id: "R",
      owner: "Amina",
      insurer: "SONARWA",
      classOfInsurance: "Motor",
      completed: RENEWAL_MILESTONES.slice(0, done).map((m) => ({ code: m.code })),
      quotes: [],
      ...over,
    }) as unknown as RenewalCase;

  it("names the stage from the milestone reached", () => {
    expect(renewalStage(renewal(0))).toBe("Preparation");
    expect(renewalStage(renewal(3))).toBe("Quotes & approval");
    expect(renewalStage(renewal(6))).toBe("Placement");
    expect(renewalStage(renewal(9))).toBe("Delivery");
    expect(renewalStage(renewal(10))).toBe("Completed");
  });

  it("combines filters and ignores empty ones", () => {
    const cases = [renewal(0), renewal(6, { owner: "Jean" }), renewal(6, { owner: "Jean", insurer: "RADIANT" })];
    expect(filterRenewals(cases, {})).toHaveLength(3);
    expect(filterRenewals(cases, { owner: "Jean" })).toHaveLength(2);
    expect(filterRenewals(cases, { owner: "Jean", insurer: "RADIANT", stage: "Placement" })).toHaveLength(1);
    expect(filterRenewals(cases, { stage: "Delivery" })).toHaveLength(0);
  });
});
