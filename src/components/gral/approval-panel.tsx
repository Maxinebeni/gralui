"use client";

// Decision panel for one approval request (APR-02 to APR-04): what is being
// approved, the ordered steps, the evidence, the decision form and the history.

import { useState } from "react";
import Link from "next/link";
import { Check, Circle, Clock, CornerUpLeft, FileText, Paperclip, X, XCircle } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import { addApprovalEvidence, decideApproval, resubmitApproval, uploadDocument } from "@/lib/api";
import { SUBJECT_LABEL, approveBlocker, canDecide, currentStep, statusLabel, statusTone } from "@/lib/approvals";
import { useCurrentUser } from "@/lib/auth-context";
import { recordHref } from "@/lib/links";
import { canAccessPath } from "@/lib/permissions";
import { formatDate } from "@/lib/renewals";
import type { ApprovalDecision, ApprovalRequest, ApprovalStep } from "@/lib/types";
import { FilePickButton } from "./documents";
import { Chip, NavyButton, SegmentedTabs } from "./ui";

const INPUT =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

const DECISION_LABEL: Record<ApprovalDecision, string> = { APPROVE: "Approve", RETURN: "Return", REJECT: "Reject" };

export function ApprovalPanel({
  request: r,
  onClose,
  onChanged,
}: {
  request: ApprovalRequest;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useCurrentUser();
  const decides = canDecide(r, user.role);
  const isClaim = r.subjectType === "CLAIM_SETTLEMENT";
  const open = r.status === "PENDING";
  const step = currentStep(r);

  async function attach(file: File) {
    try {
      const doc = await uploadDocument({ type: "APPROVAL", id: r.id }, file, {
        classification: "APPROVAL_EVIDENCE",
        purpose: "APPROVAL_EVIDENCE",
      });
      await addApprovalEvidence(r.id, { name: doc.originalFileName, documentId: doc.id, version: doc.version }, user.name);
      toast.success(`${doc.originalFileName} attached.`);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not attach the file.");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">{r.id}</span>
            <Chip tone={statusTone(r) === "warning" ? "warning" : statusTone(r)}>{statusLabel(r)}</Chip>
          </div>
          <p className="mt-1.5 text-sm text-foreground">{r.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {SUBJECT_LABEL[r.subjectType]} ·{" "}
            {canAccessPath(user, recordHref(r.subjectType, r.subjectId).split("?")[0]!) ? (
              <Link href={recordHref(r.subjectType, r.subjectId)} className="text-primary underline underline-offset-2">
                {r.subjectRef}
              </Link>
            ) : (
              r.subjectRef
            )}
            {r.client ? ` · ${r.client}` : ""}
          </p>
          {r.amount !== undefined ? (
            <p className="mt-1 text-xs text-muted-foreground">
              {r.amountLabel}: <span className="font-medium text-foreground">{formatRwf(r.amount)}</span>
            </p>
          ) : null}
        </div>
        <button
          type="button"
          aria-label="Close approval"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-6">
        <p className="rounded-xl bg-secondary px-3 py-2.5 text-xs">{r.summary}</p>

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Approval steps</h3>
          <ol className="mt-3 space-y-2">
            {r.steps.map((s) => (
              <StepRow key={s.order} step={s} />
            ))}
          </ol>
          <p className="mt-2 text-[11px] text-subtle">
            Requested by {r.requestedBy} on {formatDate(r.requestedAt)} · decide by {formatDate(r.dueAt)} · rules{" "}
            {r.policyVersion} · record revision {r.subjectRevision}
          </p>
        </section>

        <section>
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              Evidence{r.evidenceRequired ? " (required)" : ""}
            </h3>
            {open && !isClaim ? (
              <FilePickButton onFile={attach} destination={`Evidence for ${r.id} · ${r.title}`}>
                <Paperclip className="size-3.5" /> Attach
              </FilePickButton>
            ) : null}
          </div>
          <div className="mt-2 space-y-1.5">
            {r.evidence.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                {isClaim ? "Settlement documents are on the claim." : "Nothing attached yet."}
              </p>
            ) : (
              r.evidence.map((e, i) => (
                <p key={`${e.name}-${i}`} className="flex items-center gap-1.5 text-xs text-primary">
                  <FileText className="size-3.5" /> {e.name}
                  {e.version ? <span className="text-subtle">· version {e.version}</span> : null}
                </p>
              ))
            )}
          </div>
        </section>

        {decides ? (
          <DecisionForm request={r} isClaim={isClaim} userName={user.name} role={user.role} onChanged={onChanged} />
        ) : open && step ? (
          <p className="rounded-xl border border-border px-3 py-2.5 text-xs text-muted-foreground">
            Waiting for the {step.role === "Board" ? "MD to record the Board's decision" : step.role}. You can follow it here.
          </p>
        ) : null}

        {r.status === "RETURNED" && !isClaim ? <ResubmitForm request={r} userName={user.name} onChanged={onChanged} /> : null}

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">History</h3>
          <ol className="mt-3 space-y-3">
            {[...r.history].reverse().map((e, i) => (
              <li key={`${e.at}-${i}`} className="flex gap-3">
                <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky" />
                <div>
                  <p className="text-xs">{e.text}</p>
                  <p className="text-[11px] text-subtle">
                    {formatDate(e.at)} · {e.by}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}

function StepRow({ step: s }: { step: ApprovalStep }) {
  const icon = {
    APPROVED: <Check className="size-4 text-success" />,
    INFORMED: <Check className="size-4 text-success" />,
    PENDING: <Clock className="size-4 text-warning" />,
    REJECTED: <XCircle className="size-4 text-danger" />,
    RETURNED: <CornerUpLeft className="size-4 text-warning" />,
    WAITING: <Circle className="size-4 text-subtle" />,
  }[s.status];
  const label = {
    APPROVED: "Approved",
    INFORMED: "Informed",
    PENDING: "Deciding now",
    REJECTED: "Rejected",
    RETURNED: "Returned",
    WAITING: "Waits for the step before",
  }[s.status];
  return (
    <li className={cn("rounded-xl border px-3 py-2.5", s.status === "PENDING" ? "border-sky/40 bg-pale" : "border-border")}>
      <div className="flex items-center justify-between gap-3">
        <span className="flex items-center gap-2 text-xs font-medium">
          {icon} {s.order}. {s.role}
          {s.informOnly ? <span className="font-normal text-subtle">(informed)</span> : null}
        </span>
        <span className="text-[11px] text-muted-foreground">{label}</span>
      </div>
      {s.decidedBy ? (
        <p className="mt-1 text-[11px] text-muted-foreground">
          {s.decidedBy}
          {s.decidedAt ? ` · ${formatDate(s.decidedAt)}` : ""}
          {s.comment ? ` · “${s.comment}”` : ""}
        </p>
      ) : null}
    </li>
  );
}

function DecisionForm({
  request: r,
  isClaim,
  userName,
  role,
  onChanged,
}: {
  request: ApprovalRequest;
  isClaim: boolean;
  userName: string;
  role: string;
  onChanged: () => void;
}) {
  const choices: ApprovalDecision[] = isClaim ? ["APPROVE", "RETURN"] : ["APPROVE", "RETURN", "REJECT"];
  const [decision, setDecision] = useState<ApprovalDecision>("APPROVE");
  const [comment, setComment] = useState("");
  const [saving, setSaving] = useState(false);
  const blocker = decision === "APPROVE" ? approveBlocker(r) : null;
  const tabs = choices.map((c) => DECISION_LABEL[c]);

  async function submit() {
    setSaving(true);
    try {
      await decideApproval(r.id, { decision, comment, expectedVersion: r.version }, { name: userName, role });
      toast.success(
        decision === "APPROVE" ? `${r.id} approved.` : decision === "RETURN" ? `${r.id} returned to ${r.requestedBy}.` : `${r.id} rejected.`,
      );
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not record the decision.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-2xl bg-pale p-4">
      <h3 className="text-sm font-semibold">Your decision</h3>
      <div className="mt-3">
        <SegmentedTabs
          tabs={tabs}
          value={DECISION_LABEL[decision]}
          onChange={(label) => setDecision(choices.find((c) => DECISION_LABEL[c] === label)!)}
        />
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        {decision === "APPROVE"
          ? "Approve this step. The request moves to the next approver, or finishes if this is the last step."
          : decision === "RETURN"
            ? "Send it back to the requester to fix and send again."
            : "Stop the request. The business action stays blocked."}
      </p>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={3}
        placeholder={decision === "APPROVE" ? "Comment (optional)" : "Reason (required)"}
        aria-label="Decision comment"
        className={cn(INPUT, "mt-3")}
      />
      {blocker ? <p className="mt-2 text-[11px] font-medium text-warning">{blocker}</p> : null}
      <NavyButton className="mt-3" disabled={saving || !!blocker} onClick={submit}>
        {saving ? "Saving…" : DECISION_LABEL[decision]}
      </NavyButton>
    </section>
  );
}

function ResubmitForm({ request: r, userName, onChanged }: { request: ApprovalRequest; userName: string; onChanged: () => void }) {
  const [note, setNote] = useState("");
  return (
    <section className="rounded-2xl border border-border p-4">
      <h3 className="text-sm font-semibold">Fix and send again</h3>
      <p className="mt-1 text-[11px] text-muted-foreground">Say what you changed. All steps decide again on the new revision.</p>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="e.g. Valuation report attached"
        aria-label="What was changed"
        className={cn(INPUT, "mt-2")}
      />
      <NavyButton
        className="mt-2"
        onClick={async () => {
          try {
            await resubmitApproval(r.id, note, userName);
            toast.success(`${r.id} sent again.`);
            onChanged();
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Could not send it again.");
          }
        }}
      >
        Send again
      </NavyButton>
    </section>
  );
}
