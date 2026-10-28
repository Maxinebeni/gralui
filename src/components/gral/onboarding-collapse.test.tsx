import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import type { KycReview, PolicyTrack, SessionUser } from "@/lib/types";
import { user, review, track, reviewerId } from "@/test/onboarding-fixtures";
import { OnboardingError } from "@/lib/command-attempt";

const state = vi.hoisted(() => ({ user: {} as SessionUser, refresh: vi.fn() }));
const mock = vi.hoisted(() => ({
  assignKycReviewer: vi.fn(), getKycReview: vi.fn(), listKycReviewers: vi.fn(), recordKycScreening: vi.fn(), attachKycDocument: vi.fn(),
  onboardingOptions: vi.fn(), runTrackAction: vi.fn(), listDocuments: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ ...mock, MOCK_AUTH: false, DEMO_REVIEWER: "Risk & Compliance Manager" }));
vi.mock("@/lib/auth-context", () => ({ useCurrentUser: () => ({ user: state.user }) }));
vi.mock("@/lib/queries", () => ({ useRefresh: () => state.refresh }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("./documents", () => ({ FilePickButton: ({ onFile, children }: { onFile: (file: File) => void; children: React.ReactNode }) => <button type="button" onClick={() => onFile(new File(["proof"], "proof.pdf", { type: "application/pdf" }))}>{children}</button> }));
vi.mock("./document-preview", () => ({ DocumentPreviewButton: () => <button type="button">Preview document</button> }));

import { ActionPanel, type TrackOptions } from "./track-forms";
import type { TrackActionInput } from "@/lib/api";
import { TrackWorkspace } from "./track-workspace";
import { KycReviewerAssignment } from "./kyc-reviewer-assignment";
import { KycReviewPage } from "./kyc-review";
import { ActionDisclosure, ActionForm } from "./onboarding-ui";

const options: TrackOptions = { products: [], accountExecutives: [], insurers: [{ id: "insurer-1", name: "First Insurer" }, { id: "insurer-2", name: "Second Insurer" }] };
const quote = { id: "quote-1", version: 1, receivedAt: "2026-10-20", terms: { insurerId: "insurer-1", productId: track.productId, insuredName: "Example", effectDate: "2026-11-01", expiryDate: "2027-11-01", netPremium: 1000, totalPremium: 1180, currency: "RWF", commissionRate: 0.15, sumsInsured: "10000", limits: "10000", deductibles: "100", exclusions: "None", claimsSupport: "Direct" } };
const quoting: PolicyTrack = { ...track, stage: 7, availableActions: ["QUOTE", "RECOMMEND"], invitations: options.insurers.map((i) => ({ insurerId: i.id, sentAt: "2026-10-20", responseDue: "2026-10-21" })) };
const insurerName = (id: string) => options.insurers.find((i) => i.id === id)?.name ?? id;
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
function fillQuote() {
  for (const [label, value] of Object.entries({ "Insured name": "Example", "Cover from": "2026-11-01", "Cover to": "2027-11-01", "Total premium (RWF)": "1180", "Net premium (RWF)": "1000", "Sums insured": "10000", Limits: "10000", Deductibles: "100", Exclusions: "None", "Claims support": "Direct" })) change(label, value);
  fireEvent.click(screen.getByRole("button", { name: "Attach the document" }));
}
const panel = (t: PolicyTrack, run: (input: TrackActionInput) => Promise<void>, action = "QUOTE") => <ActionPanel action={action} track={t} options={options} insurerName={insurerName} run={run} leadName="Example" collapsed={action === "INSURER_RESPONSE"} />;
const kyc = (r: KycReview, changed: () => void | Promise<void> = vi.fn()) => <KycReviewPage review={r} history={[]} onChanged={changed} />;
beforeEach(() => {
  vi.resetAllMocks(); state.user = { ...user };
  mock.listKycReviewers.mockResolvedValue([{ id: reviewerId, fullName: "Compliance Test" }]);
  mock.assignKycReviewer.mockResolvedValue({ ...review, reviewerId });
  mock.onboardingOptions.mockResolvedValue(options); mock.listDocuments.mockResolvedValue([]);
});

describe("quote and insurer-response disclosures", () => {
  it("keeps quotes and outstanding insurers visible while the next recommendation form is expanded", async () => {
    render(<TrackWorkspace detail={{ track: { ...quoting, quotes: [quote], invitations: [{ ...quoting.invitations[0], response: "QUOTED" }, quoting.invitations[1]] }, lead: null, history: [] }} onChanged={vi.fn()} />);
    expect(await screen.findByRole("button", { name: "Record another quote" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Record the quote" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Recommend a quote" })).toBeInTheDocument();
    expect(screen.getByText("Quoted")).toBeInTheDocument();
    expect(screen.getAllByText("1 insurer response outstanding: Second Insurer.").length).toBeGreaterThan(0);
  });
  it("collapses after a confirmed quote and refresh, then opens a fresh form for the next insurer", async () => {
    const save = vi.fn().mockResolvedValue(undefined);
    function Harness() {
      const [t, setTrack] = useState(quoting);
      return panel(t, async (input) => { await save(input); setTrack({ ...quoting, version: 5, quotes: [quote], invitations: [{ ...quoting.invitations[0], response: "QUOTED" }, quoting.invitations[1]] }); });
    }
    render(<Harness />); fillQuote(); change("Insurer's quote reference (optional)", "FIRST-REF");
    fireEvent.click(screen.getByRole("button", { name: "Record the quote" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Record another quote" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.getByRole("button", { name: "Record another quote" })).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Record another quote" }));
    expect(screen.getByLabelText("Insurer")).toHaveValue("insurer-2");
    expect(screen.getByLabelText("Insurer's quote reference (optional)")).toHaveValue("");
    expect(screen.getByRole("button", { name: "Attach the document" })).toBeInTheDocument();
  });
  it("keeps validation errors open", async () => {
    const run = vi.fn(); render(panel(quoting, run));
    fireEvent.click(screen.getByRole("button", { name: "Record the quote" }));
    await screen.findByRole("alert");
    expect(screen.getByRole("button", { name: "Record a quote" })).toHaveAttribute("aria-expanded", "true");
    expect(run).not.toHaveBeenCalled();
  });
  it("locks collapse after an uncertain response and retains the attempt across a version refresh", async () => {
    const attempts: unknown[] = [];
    const run = vi.fn().mockImplementationOnce(async (input: TrackActionInput) => { attempts.push(input.attempt); input.attempt!.uncertain = true; throw new Error("Response lost"); }).mockImplementationOnce(async (input: TrackActionInput) => { attempts.push(input.attempt); });
    const view = render(panel(quoting, run)); fillQuote();
    fireEvent.click(screen.getByRole("button", { name: "Record the quote" }));
    await screen.findByRole("button", { name: "Retry same submission" });
    view.rerender(panel({ ...quoting, version: 5, quotes: [quote] }, run));
    expect(screen.getByRole("button", { name: "Record another quote" })).toBeDisabled();
    expect(screen.getByLabelText("Insured name")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Retry same submission" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Record another quote" })).toHaveAttribute("aria-expanded", "false"));
    expect(attempts[1]).toBe(attempts[0]);
  });
  it("keeps stale-version errors visible until reconciliation", async () => {
    render(panel(quoting, vi.fn().mockRejectedValue(new OnboardingError("Refresh the case", "STALE_VERSION", 409)))); fillQuote();
    fireEvent.click(screen.getByRole("button", { name: "Record the quote" }));
    await screen.findByRole("button", { name: "Refresh current state" });
    expect(screen.getByRole("button", { name: "Record a quote" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Record a quote" })).toHaveAttribute("aria-expanded", "true");
  });
  it("collapses a saved decline while identifying remaining insurers", async () => {
    function Harness() {
      const [t, setTrack] = useState(quoting);
      return panel(t, async () => setTrack({ ...quoting, invitations: [{ ...quoting.invitations[0], response: "DECLINED" }, quoting.invitations[1]] }), "INSURER_RESPONSE");
    }
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: "Record a decline or no reply" }));
    change("Details", "Insurer declined this cover"); fireEvent.click(screen.getByRole("button", { name: "Record" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Record another response" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.getByText("1 insurer response outstanding: Second Insurer.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record another response" }));
    expect(screen.getByLabelText("Insurer")).toHaveValue("insurer-2"); expect(screen.getByLabelText("Details")).toHaveValue("");
  });
});

describe("KYC disclosures", () => {
  it("shows the assigned reviewer and offers reassignment collapsed", async () => {
    render(<KycReviewerAssignment review={{ ...review, reviewerId }} />);
    expect(await screen.findByText(/Compliance Test/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Reassign reviewer" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("combobox", { name: "Eligible compliance reviewer" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reassign reviewer" }));
    expect(screen.getByRole("combobox", { name: "Eligible compliance reviewer" })).toBeInTheDocument();
  });
  it("collapses a new reviewer assignment only after its refresh succeeds", async () => {
    render(<KycReviewerAssignment review={review} onChanged={vi.fn()} />);
    await screen.findByRole("option", { name: "Compliance Test" });
    change("Eligible compliance reviewer", reviewerId); change("Reason for assignment", "Independent review");
    fireEvent.click(screen.getByRole("button", { name: "Assign reviewer" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Reassign reviewer" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.getByText(/Compliance Test/)).toBeInTheDocument();
  });
  it("retains assignment details when post-command refresh fails", async () => {
    mock.assignKycReviewer.mockImplementation(async (_r, _id, _reason, attempt) => { attempt.uncertain = true; return { ...review, reviewerId }; });
    render(<KycReviewerAssignment review={review} onChanged={vi.fn().mockRejectedValue(new Error("Refresh unavailable"))} />);
    await screen.findByRole("option", { name: "Compliance Test" }); change("Eligible compliance reviewer", reviewerId); change("Reason for assignment", "Independent review");
    fireEvent.click(screen.getByRole("button", { name: "Assign reviewer" })); await screen.findByRole("button", { name: "Retry same submission" });
    expect(screen.getByLabelText("Reason for assignment")).toHaveValue("Independent review");
    expect(screen.getByRole("button", { name: "Assign the review" })).toBeDisabled();
  });
  it.each(["CLEAR", "REVIEW_REQUIRED", "REJECTED"])("leaves a recorded %s screening visible and its form collapsed", (result) => {
    state.user = { ...user, id: reviewerId, permissions: ["KYC_READ", "KYC_SCREEN", "KYC_DECIDE"] };
    render(kyc({ ...review, reviewerId, status: "SUBMITTED", screeningResult: result, screeningNotes: "Recorded screening details" }));
    expect(screen.getByText("Recorded screening details")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Record a new screening" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("textbox", { name: "Lists checked and what was found" })).not.toBeInTheDocument();
    expect(screen.getByText("Your decision")).toBeInTheDocument();
  });
  it("collapses a successful screening and leaves the decision form open", async () => {
    state.user = { ...user, id: reviewerId, permissions: ["KYC_READ", "KYC_SCREEN", "KYC_DECIDE"] };
    function Harness() {
      const [r, setReview] = useState<KycReview>({ ...review, reviewerId, status: "SUBMITTED" });
      return kyc(r, async () => setReview({ ...r, screeningResult: "CLEAR", screeningNotes: "No matches" }));
    }
    render(<Harness />); change("Lists checked and what was found", "No matches"); fireEvent.click(screen.getAllByRole("button", { name: "Attach the document" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Record the screening" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Record a new screening" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.getByText("Your decision")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Record a new screening" }));
    expect(screen.getByLabelText("Lists checked and what was found")).toHaveValue("");
  });
  it("summarizes required completion without treating optional documents as received", () => {
    render(kyc({ ...review, items: [...review.items, { code: "OPTIONAL", label: "Optional attachment", required: false }] }));
    expect(screen.getByRole("button", { name: "View checklist" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("1 of 2 documents received. All required documents received.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "View checklist" }));
    expect(screen.getByText("Optional attachment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "File the document" })).toBeInTheDocument();
  });
  it("keeps missing required documents expanded, then collapses after the last upload and refresh", async () => {
    function Harness() {
      const [r, setReview] = useState<KycReview>({ ...review, items: [{ ...review.items[0], documentId: undefined }] });
      return kyc(r, async () => setReview({ ...r, items: review.items }));
    }
    render(<Harness />);
    expect(screen.getByRole("button", { name: "Checklist documents" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "File the document" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach the document" })); fireEvent.click(screen.getByRole("button", { name: "File it" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "View checklist" })).toHaveAttribute("aria-expanded", "false"));
    expect(screen.getByText("1 of 1 documents received. All required documents received.")).toBeInTheDocument();
  });
  it("does not hide an upload or discard its proof when refresh is uncertain", async () => {
    mock.attachKycDocument.mockImplementation(async (_r, _code, _proof, attempt) => { attempt.uncertain = true; });
    render(kyc({ ...review, items: [{ ...review.items[0], documentId: undefined }] }, vi.fn().mockRejectedValue(new Error("Refresh unavailable"))));
    fireEvent.click(screen.getByRole("button", { name: "File the document" })); fireEvent.click(screen.getByRole("button", { name: "Attach the document" })); fireEvent.click(screen.getByRole("button", { name: "File it" }));
    await screen.findByRole("button", { name: "Retry same submission" });
    expect(screen.getByRole("button", { name: "Checklist documents" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    expect(screen.getByText("proof.pdf")).toBeInTheDocument();
  });
  it("leaves a partially filed checklist expanded until every required document is received", async () => {
    let filed = "";
    mock.attachKycDocument.mockImplementation(async (_r, code) => { filed = code; });
    function Harness() {
      const [r, setReview] = useState<KycReview>({ ...review, items: [{ code: "FIRST", label: "First document", required: true }, { code: "SECOND", label: "Second document", required: true }] });
      return kyc(r, async () => setReview({ ...r, items: r.items.map((item) => item.code === filed ? { ...item, documentId: `doc-${filed}`, documentVersion: 1 } : item) }));
    }
    render(<Harness />);
    fireEvent.click(screen.getAllByRole("button", { name: "File the document" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Attach the document" })); fireEvent.click(screen.getByRole("button", { name: "File it" }));
    await screen.findByText("1 of 2 documents received. 1 required document missing.");
    expect(screen.getByRole("button", { name: "Checklist documents" })).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("button", { name: "File the document" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach the document" })); fireEvent.click(screen.getByRole("button", { name: "File it" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "View checklist" })).toHaveAttribute("aria-expanded", "false"));
  });
  it("does not hide a failed optional upload inside an otherwise complete checklist", async () => {
    mock.attachKycDocument.mockRejectedValue(new Error("Upload unavailable"));
    render(kyc({ ...review, items: [...review.items, { code: "OPTIONAL", label: "Optional attachment", required: false }] }));
    fireEvent.click(screen.getByRole("button", { name: "View checklist" }));
    fireEvent.click(screen.getByRole("button", { name: "File the document" }));
    fireEvent.click(screen.getByRole("button", { name: "Attach the document" })); fireEvent.click(screen.getByRole("button", { name: "File it" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Upload unavailable");
    expect(screen.getByRole("button", { name: "View checklist" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("proof.pdf")).toBeInTheDocument();
  });
  it("keeps an unsuccessful repeat screening open with its entered notes", async () => {
    state.user = { ...user, id: reviewerId, permissions: ["KYC_READ", "KYC_SCREEN"] };
    mock.recordKycScreening.mockRejectedValue(new Error("Screening unavailable"));
    render(kyc({ ...review, reviewerId, status: "SUBMITTED", screeningResult: "CLEAR", screeningNotes: "Original screening" }));
    fireEvent.click(screen.getByRole("button", { name: "Record a new screening" }));
    change("Lists checked and what was found", "Updated screening");
    fireEvent.click(screen.getByRole("button", { name: "Attach the document" })); fireEvent.click(screen.getByRole("button", { name: "Record the screening" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Screening unavailable");
    expect(screen.getByRole("button", { name: "Record a new screening" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByLabelText("Lists checked and what was found")).toHaveValue("Updated screening");
  });
});

it("does not collapse a group while another form is pending or has failed", async () => {
  let first!: () => void; let second!: (error: Error) => void;
  render(<ActionDisclosure label="Grouped forms">{(controls) => <>
    <ActionForm {...controls} submitLabel="First" success="Saved" onSubmit={() => new Promise<void>((resolve) => { first = resolve; })} />
    <ActionForm {...controls} submitLabel="Second" success="Saved" onSubmit={() => new Promise<void>((_resolve, reject) => { second = reject; })} />
  </>}</ActionDisclosure>);
  fireEvent.click(screen.getByRole("button", { name: "First" })); fireEvent.click(screen.getByRole("button", { name: "Second" }));
  await act(async () => first()); expect(screen.getByRole("button", { name: "Grouped forms" })).toBeDisabled();
  await act(async () => second(new Error("Second failed")));
  expect(screen.getByRole("alert")).toHaveTextContent("Second failed");
  expect(screen.getByRole("button", { name: "Grouped forms" })).toHaveAttribute("aria-expanded", "true");
});
