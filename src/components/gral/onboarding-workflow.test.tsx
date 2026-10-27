import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { user as defaultUser, review, track, approval, lead, reviewerId } from "@/test/onboarding-fixtures";
import type { PolicyTrack, SessionUser } from "@/lib/types";

const state = vi.hoisted(() => ({ user: {} as SessionUser, push: vi.fn(), refresh: vi.fn() }));
const mock = vi.hoisted(() => ({
  assignKycReviewer: vi.fn(), getKycReview: vi.fn(), listKycReviewers: vi.fn(), getOnboardingApproval: vi.fn(), listTrackAssignees: vi.fn(),
  getOnboardingClient: vi.fn(), onboardingOptions: vi.fn(), listKycTemplates: vi.fn(), startKycReview: vi.fn(), runTrackAction: vi.fn(),
  checkProspectDuplicates: vi.fn(), openProspect: vi.fn(), linkProspectCandidate: vi.fn(), listClients: vi.fn(), loadCommandHistory: vi.fn(), listDocuments: vi.fn(),
  getTrack: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ ...mock, MOCK_AUTH: false, DEMO_REVIEWER: "Risk & Compliance Manager" }));
vi.mock("@/lib/auth-context", () => ({ useCurrentUser: () => ({ user: state.user }) }));
vi.mock("@/lib/queries", () => ({ useRefresh: () => state.refresh }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: state.push, replace: state.push }) }));
vi.mock("./documents", () => ({ FilePickButton: ({ onFile, children }: { onFile: (f: File) => void; children: React.ReactNode }) => <button type="button" onClick={() => onFile(new File(["signed"], "signed.pdf", { type: "application/pdf" }))}>{children}</button> }));
vi.mock("./document-preview", () => ({ DocumentPreviewButton: () => <span>Document preview</span> }));

import { KycReviewerAssignment } from "./kyc-reviewer-assignment";
import { KycReviewPage, StartKycReview } from "./kyc-review";
import { BoardApprovalForm, isBoardStep } from "./board-approval-form";
import { DeadlineForm, SingleSourceRequest, SingleSourceStatus, TrackAssignmentForm } from "./track-workflow-actions";
import { ProspectClientForm } from "./prospect-client-form";
import { ActionForm, HistoryList } from "./onboarding-ui";
import { TrackWorkspace } from "./track-workspace";
import { OnboardingCaseView } from "./onboarding-case";
import { ActionPanel } from "./track-forms";
import { OnboardingError } from "@/lib/command-attempt";
import { ApprovalPanel } from "./approval-panel";
import { canAccessPath } from "@/lib/permissions";

beforeEach(() => {
  vi.clearAllMocks(); state.user = { ...defaultUser };
  mock.listKycReviewers.mockResolvedValue([{ id: reviewerId, fullName: "Compliance Test" }]);
  mock.assignKycReviewer.mockResolvedValue({ ...review, reviewerId });
  mock.getOnboardingApproval.mockResolvedValue(approval);
  mock.listTrackAssignees.mockResolvedValue([{ id: "technical-1", fullName: "Technical Test" }]);
  mock.getOnboardingClient.mockResolvedValue({ clientType: "CORPORATE", managerId: "ae-1" });
  mock.onboardingOptions.mockResolvedValue({ products: [], insurers: [], accountExecutives: [{ id: "ae-1", name: "Account Test" }] });
  mock.listKycTemplates.mockResolvedValue([{ code: "CORPORATE", version: 1, clientType: "CORPORATE", requirements: [] }, { code: "INDIVIDUAL", version: 1, clientType: "INDIVIDUAL", requirements: [] }]);
  mock.runTrackAction.mockResolvedValue(track);
  mock.getTrack.mockResolvedValue({ track: { ...track, stage: 8, approvalRequests: { RECOMMENDATION: approval.id } }, lead: null, history: [] });
  mock.listDocuments.mockResolvedValue([]);
});

describe.each(["lead", "standalone"])("%s workflow handoffs", (entry) => {
  const accepted = (underwritingRole = "GI_UNDERWRITING_MANAGER"): PolicyTrack => ({
    ...track, stage: 9, underwritingRole, availableActions: [],
    milestones: [{ code: "PLACEMENT", stage: 9, status: "OPEN" }],
    evidence: ["CLIENT_PRESENTATION", "CLIENT_ACCEPTANCE"].map((purpose) => ({ purpose, documentId: purpose, documentVersion: 1, occurredAt: "2026-10-20T09:00:00Z" })),
  });
  const show = (t: PolicyTrack) => {
    state.user = { ...defaultUser, id: "ae-1", role: "Accounts Executive", permissions: ["CLIENT_READ", "LEAD_READ", "ONBOARDING_READ", "TASK_READ"] };
    const readyLead = { ...lead, clientId: t.clientId, respondedAt: "2026-10-20T09:00:00Z" };
    return render(entry === "lead"
      ? <OnboardingCaseView detail={{ lead: readyLead, tracks: [t], kyc: null, history: [] }} track={{ track: t, lead: readyLead, history: [] }} onSelectTrack={vi.fn()} onChanged={vi.fn()} />
      : <TrackWorkspace detail={{ track: t, lead: null, history: [] }} onChanged={vi.fn()} />);
  };
  it.each([
    ["GI_UNDERWRITING_MANAGER", "GI Underwriting Manager"],
    ["MEDICAL_UNDERWRITING_MANAGER", "Medical Underwriting Manager"],
  ])("hands completed acceptance to %s without granting the AE placement access", async (role, owner) => {
    show(accepted(role));
    await screen.findByText(`Waiting for the ${owner} to instruct the insurer.`);
    expect(screen.getByText(owner)).toBeInTheDocument();
    expect(screen.getByText("Presentation and acceptance complete.")).toBeInTheDocument();
    expect(screen.getByText(/Step 9 of 11/i)).toBeInTheDocument();
    expect(screen.queryByText("Waiting for the Accounts Executive.")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Instruct the insurer" })).not.toBeInTheDocument();
  });
  it("uses the placement milestone when acceptance evidence is concealed", async () => {
    show({ ...accepted(), evidence: [] });
    await screen.findByText("Presentation and acceptance complete.");
    expect(screen.getByText("Waiting for the GI Underwriting Manager to instruct the insurer.")).toBeInTheDocument();
  });
  it("keeps unrecorded acceptance with the AE", async () => {
    show({ ...accepted(), evidence: [], milestones: [{ code: "ACCEPTANCE", stage: 9, status: "OPEN" }], blockers: ["WRITTEN_ACCEPTANCE_REQUIRED"] });
    await screen.findByText("The client's written acceptance is needed. A verbal yes is not enough.");
    expect(screen.queryByText("Presentation and acceptance complete.")).not.toBeInTheDocument();
    expect(screen.queryByText("Waiting for the GI Underwriting Manager to instruct the insurer.")).not.toBeInTheDocument();
  });
  it("explains the property asset-list prerequisite after acceptance", async () => {
    show({ ...accepted(), blockers: ["PROPERTY_ASSET_LIST_REQUIRED"] });
    await screen.findByText("Waiting for the GI Underwriting Manager to record the property's asset list before instructing the insurer.");
    expect(screen.getByText("GI Underwriting Manager")).toBeInTheDocument();
  });
  it("shows the placement action when the backend authorizes the underwriter", async () => {
    const t = { ...accepted(), availableActions: ["PLACE"] };
    // Render the same server-authorized action list after switching to the underwriter.
    state.user = { ...defaultUser, role: "GI Underwriting Manager", permissions: ["CLIENT_READ", "ONBOARDING_READ", "ONBOARDING_PLACE", "TASK_READ"] };
    const readyLead = { ...lead, clientId: t.clientId, respondedAt: "2026-10-20T09:00:00Z" };
    render(entry === "lead"
      ? <OnboardingCaseView detail={{ lead: readyLead, tracks: [t], kyc: null, history: [] }} track={{ track: t, lead: readyLead, history: [] }} onSelectTrack={vi.fn()} onChanged={vi.fn()} />
      : <TrackWorkspace detail={{ track: t, lead: null, history: [] }} onChanged={vi.fn()} />);
    await screen.findByRole("button", { name: "Instruct the insurer" });
    expect(screen.queryByText("Waiting for the GI Underwriting Manager to instruct the insurer.")).not.toBeInTheDocument();
  });
  it("hands schedule checking to the Technical Director", async () => {
    show({ ...accepted(), stage: 10, milestones: [{ code: "PLACEMENT", stage: 10, status: "OPEN" }], blockers: ["TECHNICAL_VERIFICATION_REQUIRED"] });
    await screen.findByText("Waiting for the Technical Director to check the policy schedule.");
    expect(screen.getByText("Technical Director")).toBeInTheDocument();
    expect(screen.queryByText("Presentation and acceptance complete.")).not.toBeInTheDocument();
  });
  it("hands the final schedule verification back to underwriting", async () => {
    show({ ...accepted("MEDICAL_UNDERWRITING_MANAGER"), stage: 10, blockers: ["POLICY_VERIFICATION_REQUIRED"] });
    await screen.findByText("Waiting for the Medical Underwriting Manager to complete the final schedule verification.");
    expect(screen.getByText("Medical Underwriting Manager")).toBeInTheDocument();
  });
  it("does not show a live handoff on a completed track", async () => {
    show({ ...accepted(), status: "COMPLETED" });
    await screen.findByRole("heading", { name: entry === "lead" ? "Example Company" : "Property" });
    expect(screen.queryByText("Waiting for the GI Underwriting Manager to instruct the insurer.")).not.toBeInTheDocument();
    expect(screen.queryByText("Presentation and acceptance complete.")).not.toBeInTheDocument();
  });
});

describe("KYC assignment and review", () => {
  it("assigns an eligible reviewer with a reason and refreshes the case", async () => {
    const changed = vi.fn(); render(<KycReviewerAssignment review={review} onChanged={changed} />);
    await screen.findByRole("option", { name: "Compliance Test" });
    fireEvent.change(screen.getByLabelText("Eligible compliance reviewer"), { target: { value: reviewerId } });
    fireEvent.change(screen.getByLabelText("Reason for assignment"), { target: { value: "Independent review" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign reviewer" }));
    await waitFor(() => expect(mock.assignKycReviewer).toHaveBeenCalledWith(review, reviewerId, "Independent review", expect.anything()));
    await waitFor(() => expect(changed).toHaveBeenCalled());
    expect(state.refresh).toHaveBeenCalledWith("leads", "approvals");
  });
  it("explains an empty eligible-reviewer list", async () => {
    mock.listKycReviewers.mockResolvedValue([]); render(<KycReviewerAssignment review={review} />);
    expect(await screen.findByText(/No eligible compliance reviewers/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Assign reviewer" })).toBeDisabled();
  });
  it("requires reconciliation if reviewer assignment has become stale", async () => {
    mock.assignKycReviewer.mockRejectedValueOnce(new OnboardingError("The review changed", "STALE_VERSION", 409));
    render(<KycReviewerAssignment review={review} />);
    await screen.findByRole("option", { name: "Compliance Test" });
    fireEvent.change(screen.getByLabelText("Eligible compliance reviewer"), { target: { value: reviewerId } });
    fireEvent.change(screen.getByLabelText("Reason for assignment"), { target: { value: "Independent review" } });
    fireEvent.click(screen.getByRole("button", { name: "Assign reviewer" }));
    await screen.findByRole("button", { name: "Refresh current state" });
    expect(screen.getByRole("button", { name: "Assign reviewer" })).toBeDisabled();
  });
  it("does not load a staff directory for an Accounts Executive", async () => {
    state.user = { ...defaultUser, id: "ae-1", role: "Accounts Executive", permissions: ["CLIENT_READ", "KYC_READ", "KYC_PREPARE"] };
    render(<KycReviewPage review={review} history={[]} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Send for decision" })).toBeDisabled();
    expect(mock.listKycReviewers).not.toHaveBeenCalled();
  });
  it("hides screening and decision controls from an unassigned compliance user", () => {
    state.user = { ...defaultUser, id: "other-reviewer", role: "Risk & Compliance Manager", permissions: ["CLIENT_READ", "KYC_READ", "KYC_SCREEN", "KYC_DECIDE"] };
    render(<KycReviewPage review={{ ...review, reviewerId, status: "SUBMITTED" }} history={[]} onChanged={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Record the screening" })).not.toBeInTheDocument();
    expect(screen.queryByText("Your decision")).not.toBeInTheDocument();
  });
  it("shows screening and decisions to the assigned reviewer", () => {
    state.user = { ...defaultUser, id: reviewerId, role: "Risk & Compliance Manager", permissions: ["CLIENT_READ", "KYC_READ", "KYC_SCREEN", "KYC_DECIDE"] };
    render(<KycReviewPage review={{ ...review, reviewerId, status: "SUBMITTED" }} history={[]} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Record the screening" })).toBeInTheDocument();
    expect(screen.getByText("Your decision")).toBeInTheDocument();
  });
  it.each(["KYC_IDENTITY_CHANGED", "KYC_TEMPLATE_CHANGED"])("offers a new review for %s", (blocker) => {
    render(<KycReviewPage review={{ ...review, status: "APPROVED", blockers: [blocker] }} history={[]} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start a new KYC review" })).toBeInTheDocument();
  });
  it("offers a new review after rejection", () => {
    render(<KycReviewPage review={{ ...review, status: "REJECTED" }} history={[]} onChanged={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Start a new KYC review" })).toBeInTheDocument();
  });
  it("filters new review checklists to the actual client type", async () => {
    render(<StartKycReview clientId={review.clientId} reviews={[]} onStarted={vi.fn()} />);
    await screen.findByRole("option", { name: /CORPORATE/ });
    expect(screen.queryByRole("option", { name: /INDIVIDUAL/ })).not.toBeInTheDocument();
  });
  it("shows template-loading errors instead of an empty-checklist message", async () => {
    mock.listKycTemplates.mockRejectedValue(new Error("Checklist unavailable"));
    render(<StartKycReview clientId={review.clientId} reviews={[]} onStarted={vi.fn()} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("Checklist unavailable");
    expect(screen.queryByText("No KYC checklist set up yet")).not.toBeInTheDocument();
  });
});

describe("approval and assignment recovery", () => {
  it.each(["shared", "stage panel"])("requires and submits the single-source justification from the %s form", async (entry) => {
    state.user = { ...defaultUser, role: "GI Underwriting Manager", permissions: ["ONBOARDING_RECOMMEND"] };
    const run = vi.fn().mockResolvedValue(undefined);
    render(entry === "shared" ? <SingleSourceRequest track={track} run={run} /> : <ActionPanel action="SINGLE_SOURCE" track={track} options={{ products: [], insurers: [], accountExecutives: [] }} insurerName={(id) => id} leadName="Example Company" run={run} />);
    expect(screen.queryByText("Note (optional)")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attach the document" }));
    fireEvent.change(screen.getByLabelText("Written justification"), { target: { value: "   " } });
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("explain why the exception is needed");
    expect(run).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Written justification"), { target: { value: "  Only one insurer offers this cover.  " } });
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ action: "SINGLE_SOURCE", evidence: { main: expect.objectContaining({ file: expect.any(File), detail: "Only one insurer offers this cover." }) } })));
  });
  it.each(["PENDING", "RETURNED", "REJECTED", "APPROVED"])("only an approved exception relaxes invitations: %s", async (status) => {
    mock.getOnboardingApproval.mockResolvedValue({ ...approval, status }); const accepted = vi.fn();
    render(<SingleSourceStatus track={{ ...track, approvalRequests: { SINGLE_SOURCE: "ss-1" } }} onApproved={accepted} />);
    await screen.findByText(status.toLowerCase());
    expect(accepted).toHaveBeenLastCalledWith(status === "APPROVED");
  });
  it.each(["RETURNED", "REJECTED"])("allows a replacement exception after %s", async (status) => {
    state.user = { ...defaultUser, role: "GI Underwriting Manager", permissions: ["ONBOARDING_RECOMMEND"] };
    mock.getOnboardingApproval.mockResolvedValue({ ...approval, status });
    render(<SingleSourceRequest track={{ ...track, approvalRequests: { SINGLE_SOURCE: "ss-1" } }} run={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Send for approval" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Send for approval" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Attach the justification");
  });
  it("identifies Board steps from backend metadata", () => {
    expect(isBoardStep(approval)).toBe(true);
    expect(isBoardStep({ ...approval, action: "RECOMMEND_LARGE" })).toBe(false);
    expect(isBoardStep({ ...approval, currentStepNumber: 1 })).toBe(false);
  });
  it("uses onboarding Board recording from the approval inbox", async () => {
    state.user = { ...defaultUser, role: "MD" };
    const changed = vi.fn(); render(<ApprovalPanel request={approval} onClose={vi.fn()} onChanged={changed} />);
    await screen.findByRole("button", { name: "Record Board approval" });
    expect(screen.queryByRole("button", { name: "Approve" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Attach the document" }));
    fireEvent.click(screen.getByRole("button", { name: "Record Board approval" }));
    await waitFor(() => expect(mock.runTrackAction).toHaveBeenCalledWith(expect.objectContaining({ id: track.id }), expect.objectContaining({ action: "RECORD_BOARD_EVIDENCE", evidence: { main: expect.objectContaining({ file: expect.any(File) }) } })));
    await waitFor(() => expect(changed).toHaveBeenCalled());
  });
  it("recovers Board recording with the original evidence version", async () => {
    mock.getOnboardingApproval.mockResolvedValue({ ...approval, status: "APPROVED", boardEvidence: [{ documentId: "original", version: 8 }] });
    const run = vi.fn().mockResolvedValue(undefined);
    render(<BoardApprovalForm track={{ ...track, approvalRequests: { RECOMMENDATION: approval.id } }} run={run} />);
    await screen.findByRole("option", { name: /original/ });
    expect(screen.queryByRole("button", { name: "Attach the document" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Actual Board decision date"), { target: { value: "2026-01-01" } });
    fireEvent.click(screen.getByRole("button", { name: "Record Board approval" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ existingEvidence: { main: { documentId: "original", documentVersion: 8, occurredAt: "2026-01-01T09:00:00Z" } } })));
  });
  it("fails closed if original Board evidence is hidden", async () => {
    mock.getOnboardingApproval.mockResolvedValue({ ...approval, status: "APPROVED", boardEvidence: null });
    render(<BoardApprovalForm track={{ ...track, approvalRequests: { RECOMMENDATION: approval.id } }} />);
    await screen.findByText(/original Board evidence is unavailable/);
    expect(screen.getByRole("button", { name: "Record Board approval" })).toBeDisabled();
  });
  it("surfaces an unavailable specialist lookup without a UUID input", async () => {
    mock.listTrackAssignees.mockRejectedValue(new Error("Specialist lookup unavailable"));
    render(<TrackAssignmentForm track={track} run={vi.fn()} />);
    await screen.findByText("Specialist lookup unavailable");
    expect(screen.getByRole("button", { name: "Assign" })).toBeDisabled();
    expect(screen.getByLabelText("Eligible person").tagName).toBe("SELECT");
  });
  it("looks up medical underwriting staff for the selected responsibility", async () => {
    render(<TrackAssignmentForm track={{ ...track, underwritingRole: "MEDICAL_UNDERWRITING_MANAGER" }} run={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Responsibility"), { target: { value: "UNDERWRITING" } });
    await waitFor(() => expect(mock.listTrackAssignees).toHaveBeenCalledWith(track.id, "UNDERWRITING"));
    expect(screen.getByRole("option", { name: "Medical Underwriting Manager" })).toBeInTheDocument();
  });
  it("sends an explicit deadline and reason for an open milestone", async () => {
    const run = vi.fn().mockResolvedValue(undefined); render(<DeadlineForm track={track} run={run} />);
    fireEvent.change(screen.getByLabelText("New deadline (local date and time)"), { target: { value: "2026-11-01T12:00" } });
    fireEvent.change(screen.getByLabelText("Reason for adjustment"), { target: { value: "Client extension" } });
    fireEvent.click(screen.getByRole("button", { name: "Save deadline" }));
    await waitFor(() => expect(run).toHaveBeenCalledWith(expect.objectContaining({ action: "DEADLINE", reason: "Client extension", fields: { milestone: "RFQ", dueAt: new Date("2026-11-01T12:00").toISOString() } })));
  });
  it("disables deadline changes while held", () => {
    render(<DeadlineForm track={{ ...track, status: "ON_HOLD" }} run={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Save deadline" })).toBeDisabled();
    expect(screen.getByText(/Resume the case/)).toBeInTheDocument();
  });
});

describe("duplicate reviews and command recovery", () => {
  it("invalidates duplicate review when submitted identity fields change", async () => {
    mock.checkProspectDuplicates.mockResolvedValue({ fingerprint: "reviewed", candidates: [] });
    render(<ProspectClientForm lead={lead} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "Kigali" } });
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Director" } });
    fireEvent.click(screen.getByRole("button", { name: "Review matching clients" }));
    await screen.findByText("No matching clients found for these details.");
    fireEvent.change(screen.getByLabelText("Registered name"), { target: { value: "Different company" } });
    expect(screen.getByRole("button", { name: "Review matching clients" })).toBeInTheDocument();
    expect(screen.queryByText("No matching clients found for these details.")).not.toBeInTheDocument();
  });
  it("requires a reason and sends the reviewed fingerprint for a separate client", async () => {
    mock.checkProspectDuplicates.mockResolvedValue({ fingerprint: "fingerprint-1", candidates: [{ id: "client-match", reference: "CLT-1", name: "Existing company", matches: ["email"], managerId: lead.ownerId }] });
    mock.openProspect.mockResolvedValue(lead);
    render(<ProspectClientForm lead={lead} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "Kigali" } });
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Director" } });
    fireEvent.click(screen.getByRole("button", { name: "Review matching clients" }));
    await screen.findByText("Existing company · CLT-1");
    fireEvent.click(screen.getByRole("button", { name: "Open the prospect client" }));
    await screen.findByRole("alert"); expect(mock.openProspect).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Reason for creating a separate client"), { target: { value: "Separate legal entity" } });
    fireEvent.click(screen.getByRole("button", { name: "Open the prospect client" }));
    await waitFor(() => expect(mock.openProspect).toHaveBeenCalledWith(lead, expect.objectContaining({ reviewFingerprint: "fingerprint-1", duplicateReason: "Separate legal entity" }), expect.anything()));
  });
  it("allows a reviewed eligible candidate to be linked instead", async () => {
    mock.checkProspectDuplicates.mockResolvedValue({ fingerprint: "fingerprint-1", candidates: [{ id: "client-match", reference: "CLT-1", name: "Existing company", matches: ["email"], managerId: lead.ownerId }] });
    mock.linkProspectCandidate.mockResolvedValue(lead);
    render(<ProspectClientForm lead={lead} onDone={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Address"), { target: { value: "Kigali" } });
    fireEvent.change(screen.getByLabelText("Job title"), { target: { value: "Director" } });
    fireEvent.click(screen.getByRole("button", { name: "Review matching clients" }));
    await screen.findByText("Existing company · CLT-1");
    fireEvent.click(screen.getByRole("button", { name: "Link this existing client" }));
    await waitFor(() => expect(mock.linkProspectCandidate).toHaveBeenCalledWith(lead, "client-match", "Existing company", expect.anything()));
    expect(mock.openProspect).not.toHaveBeenCalled();
  });
  it("freezes fields and retains the attempt after a lost response", async () => {
    let calls = 0; const ids: string[] = [];
    render(<ActionForm submitLabel="Save" success="Saved" onSubmit={async (attempt) => {
      ids.push(attempt.value("id", () => crypto.randomUUID()));
      if (++calls === 1) { attempt.uncertain = true; throw new TypeError("Lost response"); }
    }}><input aria-label="Editable details" /></ActionForm>);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("button", { name: "Retry same submission" });
    expect(screen.getByLabelText("Editable details")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same submission" }));
    await waitFor(() => expect(ids).toHaveLength(2)); expect(ids[1]).toBe(ids[0]);
    await waitFor(() => expect(screen.getByLabelText("Editable details")).not.toBeDisabled());
  });
  it("requires refresh after a stale-version conflict", async () => {
    render(<ActionForm submitLabel="Save" success="Saved" onSubmit={async () => { throw new OnboardingError("Refresh the case", "STALE_VERSION", 409); }} />);
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Refresh current state" })).toBeInTheDocument();
  });
  it("appends history only after the next page succeeds", async () => {
    mock.loadCommandHistory.mockRejectedValueOnce(new Error("Page unavailable")).mockResolvedValue([{ action: "OLDER_ACTION", occurredAt: "2026-01-01" }]);
    render(<HistoryList items={Array.from({ length: 50 }, (_, i) => ({ action: `ACTION_${i}`, occurredAt: "2026-10-20" }))} resource={{ type: "KYC", id: review.id }} />);
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    await screen.findByText("Page unavailable");
    fireEvent.click(screen.getByRole("button", { name: "Load more history" }));
    await screen.findByText("Older action");
    expect(mock.loadCommandHistory).toHaveBeenLastCalledWith("KYC", review.id, 1);
  });
  it("renders an assigned track without parent lead navigation", async () => {
    render(<TrackWorkspace detail={{ track: { ...track, stage: 4, availableActions: [] }, lead: null, history: [] }} onChanged={vi.fn()} />);
    await screen.findByText(/Assigned policy track/);
    expect(screen.queryByRole("link", { name: "Open parent lead" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to My Work" })).toBeInTheDocument();
  });
  it("gates direct track and KYC routes independently from the lead menu", () => {
    const specialist = { ...defaultUser, permissions: ["CLIENT_READ", "ONBOARDING_READ"] };
    expect(canAccessPath(specialist, `/clients/leads/tracks/${track.id}`)).toBe(true);
    expect(canAccessPath(specialist, `/clients/leads/${lead.id}`)).toBe(false);
    expect(canAccessPath(specialist, `/clients/kyc/${review.id}`)).toBe(false);
  });
});
