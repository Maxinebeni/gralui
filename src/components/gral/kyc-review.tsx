"use client";

// A client's KYC review (SOP 3.2 step 3, AML section 9.2): GRAL's checklist for
// the client type with each document's actual receipt date, the compliance
// screening, and the Risk & Compliance Manager's decision with the signed KYC
// Approval Form. One review is shared by all of the client's policy tracks.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Plus, Trash2 } from "lucide-react";
import {
  attachKycDocument,
  decideKycReview,
  escalateKycReview,
  listKycTemplates,
  recordKycScreening,
  saveKycTemplate,
  startKycReview,
  submitKycReview,
  type EvidenceInput,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { KYC_STATUS_LABEL, SUGGESTED_KYC_REQUIREMENTS } from "@/lib/onboarding";
import { onboardingPermissions } from "@/lib/permissions";
import { addWorkingDays } from "@/lib/claims";
import { todayIso } from "@/lib/renewals";
import type { CommandHistory, KycRequirement, KycReview, KycTemplate, LeadType, Proof } from "@/lib/types";
import { cn } from "@/lib/utils";
import { inputClass } from "./client-form";
import { DocumentPreviewButton } from "./document-preview";
import { PageHeader } from "./shell";
import { ActionForm, EvidenceField, HistoryList, Label, SelectInput, TextInput, dateOf } from "./onboarding-ui";
import { Chip, Dot, FloatCard, OutlineButton, SegmentedTabs } from "./ui";

const EVIDENCE_LABELS: Record<string, string> = { SCREENING: "Screening record", KYC_APPROVAL: "Signed KYC Approval Form", KYC_ESCALATION: "Escalation note" };

function statusTone(status: string) {
  return status === "APPROVED" ? "success" : status === "REJECTED" ? "danger" : status === "SUBMITTED" ? "warning" : "neutral";
}

export function KycReviewPage({ review: r, history, onChanged }: { review: KycReview; history: CommandHistory[]; onChanged: () => void }) {
  const { user } = useCurrentUser();
  const perms = onboardingPermissions(user);
  const editable = r.status === "DRAFT" || r.status === "RETURNED";
  const received = r.items.filter((i) => i.documentId).length;
  const deadline = r.revisedDueAt ?? r.dueAt;
  const overdue = !!deadline && deadline.slice(0, 10) < todayIso() && !["APPROVED", "REJECTED"].includes(r.status);

  return (
    <>
      <Link href="/clients/leads" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-3.5" /> Leads
      </Link>
      <PageHeader title={`KYC · ${r.clientName ?? "Client"}`} subtitle={`Checklist ${r.templateCode} (version ${r.templateVersion})`} />

      <FloatCard className="mt-5 p-4 sm:p-5" delay={60}>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={statusTone(r.status)}>{KYC_STATUS_LABEL[r.status] ?? r.status}</Chip>
          {overdue ? <Chip tone="danger">Review overdue</Chip> : null}
          <span className="text-xs text-muted-foreground">
            {received} of {r.items.length} documents received
            {r.completeDocumentsAt ? ` · all required documents in on ${dateOf(r.completeDocumentsAt)}` : ""}
            {deadline && !["APPROVED", "REJECTED"].includes(r.status) ? ` · decision due ${dateOf(deadline)}` : ""}
            {r.decidedAt ? ` · decided on ${dateOf(r.decidedAt)}` : ""}
          </span>
        </div>
        {r.decisionReason ? <p className="mt-2 text-xs">Decision note: “{r.decisionReason}”</p> : null}
      </FloatCard>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <FloatCard className="p-4 sm:p-5" delay={100}>
            <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight">
              Checklist
            </h2>
            <ul className="mt-3 space-y-2">
              {r.items.map((item) => (
                <ChecklistRow key={item.code} review={r} item={item} canFile={editable && perms.canPrepareKyc} onChanged={onChanged} />
              ))}
            </ul>
          </FloatCard>

          <FloatCard className="p-4 sm:p-5" delay={140}>
            <h2 className="text-base font-semibold tracking-tight">Sanctions and watchlist screening</h2>
            {r.screeningResult ? (
              <p className="mt-2 text-sm">
                <Chip tone={r.screeningResult === "CLEAR" ? "success" : r.screeningResult === "REJECTED" ? "danger" : "warning"}>
                  {r.screeningResult === "CLEAR" ? "Clear · all is good" : r.screeningResult === "REJECTED" ? "Rejected" : "Review required"}
                </Chip>{" "}
                {r.screeningNotes ?? ""}
              </p>
            ) : (
              <p className="mt-2 text-xs text-muted-foreground">Not recorded yet.</p>
            )}
            {perms.canScreenKyc && (editable || r.status === "SUBMITTED") ? (
              <div className="mt-3">
                <ScreeningForm review={r} onChanged={onChanged} />
              </div>
            ) : null}
          </FloatCard>

          {editable && perms.canPrepareKyc ? (
            <ActionForm
              title="Send for the compliance decision"
              submitLabel="Send for decision"
              success="Sent to the Risk & Compliance Manager."
              onSubmit={async () => {
                await submitKycReview(r);
                onChanged();
              }}
            />
          ) : null}

          {r.status === "SUBMITTED" && perms.canDecideKyc ? <DecisionForm review={r} onChanged={onChanged} /> : null}
          {overdue && perms.canDecideKyc ? <EscalationForm review={r} onChanged={onChanged} /> : null}
        </div>

        <div className="min-w-0 space-y-4">
          <FloatCard className="p-5" delay={160}>
            <h2 className="text-base font-semibold tracking-tight">Records</h2>
            <div className="mt-3">
              {r.evidence.filter((e) => EVIDENCE_LABELS[e.purpose]).length ? (
                <ul className="space-y-2">
                  {r.evidence.filter((e) => EVIDENCE_LABELS[e.purpose]).map((proof) => (
                    <li key={`${proof.purpose}-${proof.occurredAt}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border px-3 py-2">
                      <div className="min-w-0 text-xs">
                        <p className="font-medium">{EVIDENCE_LABELS[proof.purpose]}</p>
                        <p className="text-muted-foreground">{proof.fileName ?? "Attached document"} · {dateOf(proof.occurredAt)}</p>
                      </div>
                      <KycProofPreview reviewId={r.id} proof={proof} label={EVIDENCE_LABELS[proof.purpose]} />
                    </li>
                  ))}
                </ul>
              ) : <p className="text-xs text-muted-foreground">No screening or decision records yet.</p>}
            </div>
          </FloatCard>
          <FloatCard className="p-5" delay={200}>
            <h2 className="text-base font-semibold tracking-tight">History</h2>
            <HistoryList items={history} />
          </FloatCard>
        </div>
      </div>
    </>
  );
}

function ChecklistRow({ review, item, canFile, onChanged }: { review: KycReview; item: KycReview["items"][number]; canFile: boolean; onChanged: () => void }) {
  const [filing, setFiling] = useState(false);
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  const proof = review.evidence.find((e) => e.purpose === item.code);
  return (
    <li className="rounded-xl border border-border px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2 text-sm">
          {item.documentId ? <Check className="size-4 shrink-0 text-success" /> : <Dot tone={item.required ? "danger" : "subtle"} />}
          <span className="min-w-0">
            {item.label}
            {!item.required ? <span className="text-subtle"> (optional)</span> : null}
          </span>
        </span>
        {item.documentId ? (
          <div className="flex shrink-0 items-center gap-2">
            <Chip tone="success">Received {dateOf(proof?.receivedAt ?? proof?.occurredAt)}</Chip>
            <DocumentPreviewButton
              subject={{ type: "KYC", id: review.id }}
              document={{
                id: item.documentId,
                version: item.documentVersion ?? proof?.documentVersion ?? 1,
                originalFileName: proof?.fileName ?? item.label,
                mediaType: "application/octet-stream",
                sizeBytes: 0,
                classification: "KYC",
                purpose: item.code,
                uploadedAt: proof?.occurredAt ?? new Date().toISOString(),
                previous: [],
              }}
            />
          </div>
        ) : canFile && !filing ? (
          <OutlineButton onClick={() => setFiling(true)}>File the document</OutlineButton>
        ) : (
          <Chip tone={item.required ? "danger" : "neutral"}>Missing</Chip>
        )}
      </div>
      {filing ? (
        <div className="mt-3">
          <ActionForm
            submitLabel="File it"
            success={`${item.label} filed.`}
            onCancel={() => setFiling(false)}
            onSubmit={async () => {
              if (!evidence) throw new Error("Attach the document.");
              await attachKycDocument(review, item.code, evidence);
              setFiling(false);
              onChanged();
            }}
          >
            <EvidenceField label={item.label} destination={`${item.label} · KYC for ${review.clientName ?? "the client"}`} value={evidence} onChange={setEvidence} dateLabel="Actually received on" />
          </ActionForm>
        </div>
      ) : null}
    </li>
  );
}

function KycProofPreview({ reviewId, proof, label }: { reviewId: string; proof: Proof; label: string }) {
  if (!proof.documentId) return null;
  return (
    <DocumentPreviewButton
      subject={{ type: "KYC", id: reviewId }}
      document={{
        id: proof.documentId,
        version: proof.documentVersion ?? 1,
        originalFileName: proof.fileName ?? label,
        mediaType: "application/octet-stream",
        sizeBytes: 0,
        classification: "KYC",
        purpose: proof.purpose,
        uploadedAt: proof.occurredAt,
        previous: [],
      }}
    />
  );
}

function ScreeningForm({ review, onChanged }: { review: KycReview; onChanged: () => void }) {
  const [result, setResult] = useState<"CLEAR" | "REVIEW_REQUIRED" | "REJECTED">("CLEAR");
  const [notes, setNotes] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  return (
    <ActionForm
      submitLabel={review.screeningResult ? "Record a new screening" : "Record the screening"}
      success="Screening recorded."
      onSubmit={async () => {
        if (!evidence) throw new Error("Attach the screening record.");
        await recordKycScreening(review, { result, notes, evidence });
        onChanged();
      }}
    >
      <SelectInput
        id="sc-result"
        label="Result"
        value={result}
        onChange={(v) => setResult(v as typeof result)}
        options={[
          { value: "CLEAR", label: "Clear: all is good" },
          { value: "REVIEW_REQUIRED", label: "Review required: possible match (e.g. a politically exposed person)" },
          { value: "REJECTED", label: "Rejected: a confirmed sanctions match" },
        ]}
        wide
      />
      <TextInput id="sc-notes" label="Lists checked and what was found" value={notes} onChange={setNotes} wide placeholder="e.g. UN and OFAC lists, no matches" />
      <EvidenceField label="Screening record" destination={`Screening · KYC for ${review.clientName ?? "the client"}`} value={evidence} onChange={setEvidence} dateLabel="Screened on" />
    </ActionForm>
  );
}

function DecisionForm({ review, onChanged }: { review: KycReview; onChanged: () => void }) {
  const choices = ["Approve", "Return", "Reject"] as const;
  const [choice, setChoice] = useState<(typeof choices)[number]>("Approve");
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  const decision = ({ Approve: "APPROVE", Return: "RETURN", Reject: "REJECT" } as const)[choice];
  return (
    <ActionForm
      title="Your decision"
      intro={
        <SegmentedTabs tabs={choices} value={choice} onChange={setChoice} />
      }
      submitLabel={choice}
      success={choice === "Approve" ? "KYC approved. Quotations can go ahead." : choice === "Return" ? "Returned for changes." : "KYC rejected."}
      onSubmit={async () => {
        await decideKycReview(review, { decision, reason, evidence: evidence ?? undefined });
        onChanged();
      }}
    >
      <TextInput id="kd-reason" label="Reason" value={reason} onChange={setReason} wide />
      {choice === "Approve" ? <EvidenceField label="Signed KYC Approval Form" destination={`KYC Approval Form · ${review.clientName ?? "the client"}`} value={evidence} onChange={setEvidence} dateLabel="Signed on" /> : null}
    </ActionForm>
  );
}

function EscalationForm({ review, onChanged }: { review: KycReview; onChanged: () => void }) {
  const [revised, setRevised] = useState(addWorkingDays(todayIso(), 2));
  const [reason, setReason] = useState("");
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  return (
    <ActionForm
      title="Escalate the late review"
      submitLabel="Escalate"
      success="Escalated with a revised date."
      onSubmit={async () => {
        if (!evidence) throw new Error("Attach the written escalation.");
        await escalateKycReview(review, { evidence, revisedDueAt: revised, reason });
        onChanged();
      }}
    >
      <TextInput id="ke-date" label="Revised decision date" type="date" min={todayIso()} value={revised} onChange={setRevised} />
      <TextInput id="ke-reason" label="Reason" value={reason} onChange={setReason} wide />
      <EvidenceField label="Written escalation" destination={`KYC escalation · ${review.clientName ?? "the client"}`} value={evidence} onChange={setEvidence} />
    </ActionForm>
  );
}

/* Starting a review, and GRAL's checklists */

export function StartKycReview({ clientId, clientName, reviews, onStarted }: { clientId: string; clientName?: string; reviews: KycReview[]; onStarted: (r: KycReview) => void }) {
  const { user } = useCurrentUser();
  const perms = onboardingPermissions(user);
  const [templates, setTemplates] = useState<KycTemplate[] | null>(null);
  const [code, setCode] = useState("");
  const [editing, setEditing] = useState(false);
  const load = () =>
    listKycTemplates()
      .then((t) => {
        setTemplates(t);
        setCode((c) => c || t[0]?.code || "");
      })
      .catch(() => setTemplates([]));
  useEffect(() => {
    load();
  }, []);

  return (
    <>
      <Link href="/clients/leads" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-3.5" /> Leads
      </Link>
      <PageHeader title={`KYC · ${clientName ?? "Client"}`} subtitle="No open KYC review for this client" />
      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {templates === null ? (
            <p className="text-sm text-muted-foreground">Loading GRAL&apos;s checklists…</p>
          ) : templates.length === 0 ? (
            <FloatCard className="p-5">
              <h2 className="text-base font-semibold tracking-tight">No KYC checklist set up yet</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                The system does not invent GRAL&apos;s KYC checklists: someone with the KYC policy permission (the Risk & Compliance
                Manager) sets them up once per client type. Until then a review cannot start.
              </p>
            </FloatCard>
          ) : perms.canPrepareKyc ? (
            <ActionForm
              title="Start the KYC review"
              submitLabel="Start the review"
              success="KYC review started."
              onSubmit={async () => {
                if (!code) throw new Error("Choose the checklist.");
                onStarted(await startKycReview(clientId, code));
              }}
            >
              <SelectInput id="kyc-template" label="Checklist" value={code} onChange={setCode} options={templates.map((t) => ({ value: t.code, label: `${t.code} · ${t.clientType === "INDIVIDUAL" ? "Individuals" : "Companies"} · ${t.requirements.length} documents (version ${t.version})` }))} wide />
            </ActionForm>
          ) : (
            <FloatCard className="p-5">
              <p className="text-sm text-muted-foreground">Waiting for the Accounts Executive.</p>
            </FloatCard>
          )}

          {perms.canEditKycChecklists ? (
            editing ? (
              <ChecklistEditor
                templates={templates ?? []}
                onDone={() => {
                  setEditing(false);
                  load();
                }}
                onCancel={() => setEditing(false)}
              />
            ) : (
              <OutlineButton onClick={() => setEditing(true)}>
                <Plus className="size-3.5" /> {templates?.length ? "Add or change a checklist" : "Set up GRAL's checklist"}
              </OutlineButton>
            )
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          {reviews.length ? (
            <FloatCard className="p-5">
              <h2 className="text-base font-semibold tracking-tight">Earlier reviews</h2>
              <ul className="mt-3 space-y-2">
                {reviews.map((r) => (
                  <li key={r.id}>
                    <Link href={`/clients/kyc/${encodeURIComponent(r.id)}`} className="flex items-center justify-between gap-2 rounded-xl border border-border px-3 py-2 text-xs hover:bg-secondary/60">
                      <span>{r.templateCode}</span>
                      <Chip tone={statusTone(r.status)}>{KYC_STATUS_LABEL[r.status]}</Chip>
                    </Link>
                  </li>
                ))}
              </ul>
            </FloatCard>
          ) : null}
        </div>
      </div>
    </>
  );
}

/** Set up or change GRAL's checklist for a client type. Each save is a new version; old reviews keep theirs. */
function ChecklistEditor({ templates, onDone, onCancel }: { templates: KycTemplate[]; onDone: () => void; onCancel: () => void }) {
  const [clientType, setClientType] = useState<LeadType>("CORPORATE");
  const existing = templates.find((t) => t.clientType === clientType);
  const [code, setCode] = useState(existing?.code ?? "CORPORATE_STANDARD");
  const [items, setItems] = useState<KycRequirement[]>(existing?.requirements ?? SUGGESTED_KYC_REQUIREMENTS.CORPORATE);
  const [reason, setReason] = useState(existing ? "" : "Initial checklist confirmed by GRAL");

  function switchType(t: LeadType) {
    setClientType(t);
    const found = templates.find((x) => x.clientType === t);
    setCode(found?.code ?? `${t}_STANDARD`);
    setItems(found?.requirements ?? SUGGESTED_KYC_REQUIREMENTS[t]);
  }
  const setItem = (i: number, patch: Partial<KycRequirement>) => setItems((list) => list.map((x, j) => (j === i ? { ...x, ...patch } : x)));

  return (
    <ActionForm
      title="GRAL's KYC checklist"
      submitLabel="Save the checklist"
      success="Checklist saved."
      onCancel={onCancel}
      onSubmit={async () => {
        const clean = items.filter((i) => i.label.trim()).map((i) => ({ ...i, label: i.label.trim(), code: i.code.trim() || i.label.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "_") }));
        await saveKycTemplate(code.trim(), { clientType, requirements: clean, reason }, existing?.version ?? 0);
        onDone();
      }}
    >
      <SelectInput id="ck-type" label="Client type" value={clientType} onChange={(v) => switchType(v as LeadType)} options={[{ value: "CORPORATE", label: "Companies and organisations" }, { value: "INDIVIDUAL", label: "Individuals" }]} />
      <TextInput id="ck-code" label="Checklist code" value={code} onChange={setCode} />
      <div className="space-y-2 sm:col-span-2">
        <Label>Documents</Label>
        {items.map((item, i) => (
          <div key={i} className="grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2">
            <input value={item.label} onChange={(e) => setItem(i, { label: e.target.value })} aria-label={`Document ${i + 1}`} className={inputClass()} />
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={item.required} onChange={(e) => setItem(i, { required: e.target.checked })} /> Required
            </label>
            <button type="button" aria-label="Remove" onClick={() => setItems((list) => list.filter((_, j) => j !== i))} className="rounded-full p-1.5 text-muted-foreground hover:bg-secondary hover:text-danger">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <OutlineButton onClick={() => setItems((list) => [...list, { code: "", label: "", required: true }])}>
          <Plus className="size-3.5" /> Add a document
        </OutlineButton>
      </div>
      <TextInput id="ck-reason" label="Why (kept in the history)" value={reason} onChange={setReason} wide />
    </ActionForm>
  );
}
