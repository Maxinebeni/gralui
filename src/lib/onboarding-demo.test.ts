import { beforeEach, expect, it, vi } from "vitest";

beforeEach(() => { vi.resetModules(); vi.stubEnv("NEXT_PUBLIC_MOCK_AUTH", "true"); });

it("demo KYC enforces reviewer assignment and reviewer-only screening/decisions", async () => {
  const api = await import("./api");
  const { DEMO_KYC_REVIEWS } = await import("./mock-leads");
  let review = { ...structuredClone(DEMO_KYC_REVIEWS.find((r) => r.status === "APPROVED")!), id: "KYC-DEMO-TEST", status: "DRAFT" as const, reviewerId: undefined } as import("./types").KycReview;
  DEMO_KYC_REVIEWS.unshift(review);
  api.setDemoRole("Accounts Executive");
  await expect(api.submitKycReview(review)).rejects.toThrow(/assign an active compliance reviewer/);
  api.setDemoRole("CRM Manager");
  review = await api.assignKycReviewer(review, api.DEMO_REVIEWER, "Independent test review");
  api.setDemoRole("Accounts Executive");
  review = await api.submitKycReview(review);
  const evidence = { file: new File(["signed"], "signed.pdf", { type: "application/pdf" }), occurredAt: "2026-01-01" };
  await expect(api.recordKycScreening(review, { result: "CLEAR", notes: "Synthetic screening", evidence })).rejects.toThrow(/assigned compliance reviewer/);
  api.setDemoRole("Risk & Compliance Manager");
  review = await api.recordKycScreening(review, { result: "CLEAR", notes: "Synthetic screening", evidence });
  review = await api.decideKycReview(review, { decision: "APPROVE", reason: "Synthetic approval", evidence });
  expect(review.status).toBe("APPROVED");
});

it("demo strategic approval keeps the Board recording as a second MD step", async () => {
  const api = await import("./api");
  const { DEMO_TRACKS } = await import("./mock-leads");
  const base = structuredClone(DEMO_TRACKS.find((t) => t.clientId === "CLT-P008")!);
  const test = { ...base, id: "TRK-DEMO-BOARD", stage: 8, status: "OPEN" as const, approvalRequests: {}, recommendation: { quoteId: "test-quote", quoteVersion: 1, annualCommissionRwf: 15000000, basis: "Synthetic", comparison: "Two quotes", rationale: "Test", tier: "STRATEGIC" as const } };
  DEMO_TRACKS.push(test);
  api.setDemoRole("GI Underwriting Manager");
  let track = await api.runTrackAction((await api.getTrack(test.id))!.track, { action: "REQUEST_APPROVAL" });
  let approval = await api.getOnboardingApproval(track.approvalRequests.RECOMMENDATION);
  expect(approval.steps.map((s) => s.role)).toEqual(["MD", "MD"]);
  expect(approval.steps[1].requiredPermission).toBe("ONBOARDING_BOARD_EVIDENCE");
  api.setDemoRole("MD");
  approval = await api.addApprovalEvidence(approval.id, { name: "Signed MD review", documentId: "signed-md", version: 1 }, "MD");
  approval = await api.decideApproval(approval.id, { decision: "APPROVE", expectedVersion: approval.version, comment: "MD synthetic review" }, { role: "MD", name: "MD" });
  expect(approval.status).toBe("PENDING"); expect(approval.currentStepNumber).toBe(2);
  track = (await api.getTrack(test.id))!.track;
  expect(track.stage).toBe(8); expect(track.availableActions).toContain("RECORD_BOARD_EVIDENCE");
  track = await api.runTrackAction(track, { action: "RECORD_BOARD_EVIDENCE", evidence: { main: { file: new File(["board"], "board.pdf", { type: "application/pdf" }), occurredAt: "2026-01-01" } } });
  expect(track.stage).toBe(9); expect(track.boardApproval?.authority).toBe("BOARD_OF_DIRECTORS");
  expect((await api.getOnboardingApproval(approval.id)).status).toBe("APPROVED");
});
