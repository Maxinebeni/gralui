import { describe, expect, it } from "vitest";
import { claimStatusFromState } from "./api";
import { isClosed, isDisputed } from "./claims";
import { currentMilestone, daysOverdue, renewalHealth, renewalStage, RENEWAL_MILESTONES } from "./renewals";
import type { Claim, RenewalCase } from "./types";

describe("backend claim state", () => {
  const claimIn = (state: string) =>
    ({ ...claimStatusFromState({ state, createdAt: "2026-11-01T08:00:00Z", updatedAt: "2026-11-08T08:00:00Z" }) }) as Claim;

  it("a closed claim is closed", () => {
    expect(isClosed(claimIn("CLOSED"))).toBe(true);
    expect(isClosed(claimIn("SETTLED"))).toBe(false);
  });

  it("a dispute counts until an appeal is under way", () => {
    expect(isDisputed(claimIn("DISPUTED_REJECTED"))).toBe(true);
    expect(isDisputed(claimIn("CLAIMS_COMMITTEE_REVIEW"))).toBe(true);
    expect(isDisputed(claimIn("APPEAL_IN_PROGRESS"))).toBe(false);
    expect(isDisputed(claimIn("UNDER_FOLLOW_UP"))).toBe(false);
  });

  it("dates the dispute from the last change", () => {
    expect(claimIn("DISPUTED_REJECTED").dispute?.raisedAt).toBe("2026-11-08");
  });
});

describe("lost renewals", () => {
  const renewal = (state: string, done = 2) =>
    ({
      id: "R",
      expiryDate: "2026-01-01",
      completed: RENEWAL_MILESTONES.slice(0, done).map((m) => ({ code: m.code })),
      quotes: [],
      backend: { state, milestones: [] },
    }) as unknown as RenewalCase;

  it("are finished, not overdue", () => {
    const lost = renewal("LOST_NON_RENEWED");
    expect(currentMilestone(lost)).toBeNull();
    expect(daysOverdue(lost)).toBe(0);
    expect(renewalHealth(lost)).toBe("lost");
    expect(renewalStage(lost)).toBe("Lost");
  });

  it("leave open cases alone", () => {
    expect(renewalHealth(renewal("ACTIVE"))).toBe("overdue");
    expect(currentMilestone(renewal("ACTIVE"))?.code).toBe(RENEWAL_MILESTONES[2]!.code);
  });
});
