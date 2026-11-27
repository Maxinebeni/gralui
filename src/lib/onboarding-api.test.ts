import { beforeEach, describe, expect, it, vi } from "vitest";
import { CommandAttempt, collectPages } from "./command-attempt";
import { track, trackId, review, reviewerId, lead } from "@/test/onboarding-fixtures";
import type * as Api from "./api";

let api: typeof Api;
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const fetchMock = vi.fn<typeof fetch>();
const documentId = "40000000-0000-4000-8000-000000000001";
function mockHttp(handler: (path: string, init?: RequestInit) => Response | Promise<Response>) {
  fetchMock.mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === "/api/v1/auth/csrf") return json({ token: "test-csrf" });
    if (path.startsWith("/api/v1/clients/managers")) return json({ items: [], totalElements: 0 });
    return handler(path, init);
  });
}

beforeEach(async () => {
  vi.resetModules(); vi.stubEnv("NEXT_PUBLIC_MOCK_AUTH", "false");
  vi.stubGlobal("fetch", fetchMock); fetchMock.mockReset();
  api = await import("./api");
});

describe("onboarding response contracts", () => {
  it("accepts a successful empty checklist response", async () => {
    mockHttp(() => new Response(null, { status: 204 }));
    await expect(api.saveKycTemplate("DEFAULT_CORPORATE", { clientType: "CORPORATE", requirements: [{ code: "IDENTITY", label: "Identity", required: true }], reason: "Updated checklist" }, 1)).resolves.toBeUndefined();
  });
  it("reads array-shaped KYC history", async () => {
    mockHttp((path) => path.includes("/history") ? json([{ action: "KYC_ASSIGNED", occurredAt: "2026-10-20T09:00:00Z" }]) : json(review));
    const found = await api.getKycReview(review.id);
    expect(found?.history).toHaveLength(1);
    expect(found?.history[0].action).toBe("KYC_ASSIGNED");
  });
  it("does not turn a forbidden KYC case into an empty client", async () => {
    mockHttp(() => json({ code: "ACCESS_DENIED" }, 403));
    await expect(api.getKycReview("hidden")).rejects.toMatchObject({ status: 403 });
    expect(fetchMock.mock.calls.some(([path]) => String(path).includes("/clients/hidden/"))).toBe(false);
  });
  it("loads every eligible-reviewer page", async () => {
    mockHttp((path) => json({ items: [{ id: path.includes("page=0") ? "first" : "last", fullName: "Eligible Reviewer" }], totalElements: 2 }));
    expect((await api.listKycReviewers()).map((p) => p.id)).toEqual(["first", "last"]);
  });
  it("rejects a later-page failure rather than returning a partial list", async () => {
    mockHttp((path) => path.includes("page=0") ? json({ items: [{ id: "first", fullName: "Reviewer" }], totalElements: 2 }) : json({ code: "UNAVAILABLE" }, 503));
    await expect(api.listKycReviewers()).rejects.toMatchObject({ status: 503 });
  });
  it("loads tracks even when the parent lead is concealed", async () => {
    mockHttp((path) => path.includes("/leads/") ? json({ code: "NOT_FOUND" }, 404) : path.includes("/history") ? json({ items: [], totalElements: 0 }) : json(track));
    expect(await api.getTrack(trackId)).toMatchObject({ lead: null, track: { id: trackId } });
  });
  it("collects lead and track pages beyond the first batch", async () => {
    mockHttp((path) => {
      if (path.startsWith("/api/v1/leads?")) return json({ items: [{ ...lead, id: path.includes("page=0") ? "lead-a" : "lead-b", ownerId: undefined }], totalElements: 2 });
      return json({ items: [{ ...track, id: path.includes("page=0") ? "track-a" : "track-b" }], totalElements: 2 });
    });
    const result = await api.listLeads();
    expect(result.leads).toHaveLength(2); expect(result.tracks).toHaveLength(2);
  });
});

describe("commands and exact evidence", () => {
  it.each(["LEAD", "CLIENT"] as const)("reads the authorized %s document page and its exact source link", async (type) => {
    const sources = [{ subjectType: "ONBOARDING", subjectId: trackId, purpose: "RECOMMENDATION" }];
    mockHttp((path) => {
      expect(path).toBe(`/api/v1/documents/related?subjectType=${type}&subjectId=${trackId}&page=1&size=20`);
      return json({ items: [{ id: documentId, version: 4, sources }], page: 1, size: 20, totalItems: 21, totalPages: 2 });
    });
    await expect(api.listRelatedDocuments({ type, id: trackId }, 1, new AbortController().signal))
      .resolves.toMatchObject({ items: [{ id: documentId, version: 4, sources }], totalItems: 21, totalPages: 2 });
  });

  it("checks authorization on each open and uses the attachment filename", async () => {
    let requests = 0;
    mockHttp((path) => {
      expect(path).toBe(`/api/v1/documents/${documentId}/versions/4/content?subjectType=ONBOARDING&subjectId=${trackId}&purpose=RECOMMENDATION`);
      return ++requests === 1 ? new Response("PDF bytes", { headers: {
        "Content-Type": "application/pdf", "Content-Disposition": "attachment; filename=report.pdf; filename*=UTF-8''Comparaison%20%C3%A9crite.pdf",
      } }) : json({ code: "FORBIDDEN" }, 403);
    });
    const subject = { type: "ONBOARDING", id: trackId } as const;
    const file = { id: documentId, version: 4, purpose: "RECOMMENDATION" };
    const content = await api.getDocumentContent(subject, file);
    expect(content.fileName).toBe("Comparaison écrite.pdf");
    expect(content.blob.type).toBe("application/pdf");
    await expect(api.getDocumentContent(subject, file)).rejects.toThrow("You do not have permission to open this file.");
    expect(requests).toBe(2);
  });

  it("reads the submitted references from the approval snapshot rather than the current track", async () => {
    const submittedDocuments = [{ documentId, version: 2, subjectType: "ONBOARDING", subjectId: trackId, purpose: "QUOTE", kind: "SELECTED_QUOTE" }];
    mockHttp((path) => {
      expect(path).toBe(`/api/v1/approvals/${trackId}`);
      return json({ submittedDocuments });
    });
    await expect(api.getApprovalSubmittedDocuments(trackId, new AbortController().signal)).resolves.toEqual(submittedDocuments);
  });

  it("explains how to recover when a saved recommendation has no comparison set", async () => {
    mockHttp(() => json({ code: "COMPARISON_QUOTES_REQUIRED" }, 409));
    await expect(api.runTrackAction(track, { action: "REQUEST_APPROVAL" })).rejects.toMatchObject({
      code: "COMPARISON_QUOTES_REQUIRED", message: expect.stringContaining("revise the recommendation"),
    });
  });

  it.each([{ comparedQuotes: [] }, { comparedQuotes: [{ quoteId: "quote-2", quoteVersion: 4 }] }])("sends the explicit comparison set with the recommendation (%#)", async ({ comparedQuotes }) => {
    mockHttp((path) => path.startsWith("/api/v1/documents?") ? json({ id: documentId, version: 4 }) : json(track));
    await api.runTrackAction(track, {
      action: "RECOMMEND",
      fields: { quoteId: "quote-1", quoteVersion: 3, comparedQuotes },
      evidence: { main: { file: new File(["proof"], "report.pdf", { type: "application/pdf" }), occurredAt: "2026-10-20" } },
    });
    const call = fetchMock.mock.calls.find(([path]) => String(path).endsWith("/recommend"))!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ quoteId: "quote-1", quoteVersion: 3, comparedQuotes, evidence: { documentId, documentVersion: 4 } });
  });

  it.each([undefined, "", "   ", "x".repeat(2001)])("rejects a missing or oversized single-source justification before uploading (%#)", async (detail) => {
    await expect(api.runTrackAction(track, { action: "SINGLE_SOURCE", evidence: { main: { file: new File(["proof"], "justification.pdf", { type: "application/pdf" }), occurredAt: "2026-10-20", detail } } })).rejects.toThrow(/justification/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("sends the single-source justification as the required flat detail field", async () => {
    mockHttp((path) => path.startsWith("/api/v1/documents?") ? json({ id: "justification-doc", version: 2 }) : json(track));
    await api.runTrackAction(track, { action: "SINGLE_SOURCE", evidence: { main: { file: new File(["proof"], "justification.pdf", { type: "application/pdf" }), occurredAt: "2026-10-20", detail: "  Only one insurer offers this cover.  " } } });
    const call = fetchMock.mock.calls.find(([p]) => String(p).endsWith("/request-single-source"))!;
    expect(JSON.parse(String(call[1]?.body))).toEqual({ command: { commandId: expect.any(String), expectedVersion: track.version }, documentId: "justification-doc", documentVersion: 2, occurredAt: "2026-10-20T09:00:00Z", detail: "Only one insurer offers this cover." });
  });
  it("assigns KYC with the flat command contract and a required reason", async () => {
    mockHttp(() => json({ ...review, reviewerId }));
    await expect(api.assignKycReviewer(review, reviewerId, " ")).rejects.toThrow();
    await api.assignKycReviewer(review, reviewerId, "Independent review", new CommandAttempt());
    const call = fetchMock.mock.calls.find(([p]) => String(p).endsWith("/assignment"))!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ expectedVersion: 3, assigneeId: reviewerId, reason: "Independent review" });
    expect(JSON.parse(String(call[1]?.body))).not.toHaveProperty("command");
  });
  it("retries the exact command payload and reuses confirmed uploaded evidence", async () => {
    const bodies: string[] = []; let uploads = 0;
    mockHttp((path, init) => {
      if (path.startsWith("/api/v1/documents?")) { uploads++; return json({ id: "doc-upload", version: 7 }); }
      if (path.endsWith("/program")) { bodies.push(String(init?.body)); if (bodies.length === 1) throw new TypeError("Connection lost after commit"); return json(track); }
      throw new Error(`Unexpected request ${path}`);
    });
    const attempt = new CommandAttempt();
    const input = { action: "PROGRAM", fields: { terms: "Property cover" }, evidence: { main: { file: new File(["proof"], "program.pdf", { type: "application/pdf" }), occurredAt: "2026-10-20" } }, attempt };
    await expect(api.runTrackAction(track, input)).rejects.toThrow("Connection lost");
    expect(attempt.uncertain).toBe(true);
    await api.runTrackAction({ ...track, version: 99 }, { ...input, fields: { terms: "Must not replace the original" } });
    expect(uploads).toBe(1); expect(bodies[1]).toBe(bodies[0]);
    expect(JSON.parse(bodies[1]).evidence).toMatchObject({ documentId: "doc-upload", documentVersion: 7, command: { expectedVersion: 4 } });
  });
  it("uses retained Board evidence without another document upload", async () => {
    mockHttp(() => json(track));
    await api.runTrackAction(track, { action: "RECORD_BOARD_EVIDENCE", existingEvidence: { main: { documentId: "signed-board", documentVersion: 5, occurredAt: "2026-10-20T09:00:00Z" } }, attempt: new CommandAttempt() });
    const call = fetchMock.mock.calls.find(([p]) => String(p).endsWith("/record-board-approval"))!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ documentId: "signed-board", documentVersion: 5 });
    expect(fetchMock.mock.calls.some(([p]) => String(p).startsWith("/api/v1/documents"))).toBe(false);
  });
  it("sends reviewed duplicate fingerprints on prospect creation", async () => {
    mockHttp(() => json({ ...lead, ownerId: undefined }));
    await api.openProspect(lead, { registeredName: "Example", clientType: "CORPORATE", sector: "Transport", address: "Kigali", contactName: "Test", jobTitle: "Director", email: "test@example.invalid", phone: "+250788123456", reviewFingerprint: "reviewed-fingerprint", duplicateReason: "Separate entity" });
    const call = fetchMock.mock.calls.find(([p]) => String(p).endsWith("/prospect"))!;
    expect(JSON.parse(String(call[1]?.body))).toMatchObject({ reviewFingerprint: "reviewed-fingerprint", duplicateReason: "Separate entity" });
  });
  it("does not accept an absent page as a complete collection", async () => {
    await expect(collectPages(async () => ({ items: [], totalElements: 2 }))).rejects.toThrow("changed while loading");
  });
});
