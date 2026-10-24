"use client";

import { useState } from "react";
import { Check, FileText, Flag, Upload, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import { parseAmount, settlementWarnings } from "@/lib/amounts";
import {
  addClaimNote,
  closeClaim,
  confirmClaimRegistration,
  decideDispute,
  fileClaimDocument,
  logClaimFollowUp,
  markClaimReadyToSubmit,
  recordInsurerRejection,
  recordPaidToClient,
  recordSettlementOffer,
  setClaimFraudFlag,
  signClaimSettlement,
  submitClaimToInsurer,
  uploadDocument,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { claimPermissions } from "@/lib/permissions";
import {
  CLAIM_STEP_DEFS,
  COMMITTEE_DAYS,
  NO_RESPONSE_ESCALATION_DAYS,
  claimBlocker,
  claimSignOffChain,
  daysWithoutInsurerResponse,
  dueLabel,
  isClosed,
  isDisputed,
  missingDocuments,
  needsEscalation,
  nextSigner,
  stepDef,
} from "@/lib/claims";
import { formatDate } from "@/lib/renewals";
import type { Claim, ClaimFollowUp } from "@/lib/types";
import { AmountInput } from "./amount-input";
import { ClaimSlaChip } from "./claim-list";
import { DocumentPanel, FilePickButton } from "./documents";
import { ReviewDialog } from "./review-dialog";
import { Chip, Dot, NavyButton, OutlineButton, Person, PriorityPill, SegmentedTabs } from "./ui";

const TABS = ["Documents", "Follow-ups", "Activity Log", "Internal Notes"] as const;
type Tab = (typeof TABS)[number];

const INPUT =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

type Run = (action: () => Promise<Claim>, success: string) => Promise<boolean>;

export function ClaimDetailPanel({
  claim,
  onClose,
  onChanged,
}: {
  claim: Claim;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [tab, setTab] = useState<Tab>("Documents");
  const { user } = useCurrentUser();
  const perms = claimPermissions(user.role);

  async function run(action: () => Promise<Claim>, success: string) {
    try {
      await action();
      onChanged();
      toast.success(success);
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong.");
      return false;
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <PriorityPill priority={claim.priority} />
            <span className="text-lg font-semibold tracking-tight">{claim.id}</span>
            <ClaimSlaChip claim={claim} />
            {perms.canSeeFraudFlag && claim.fraudFlag ? (
              <Chip tone="danger">
                <Flag className="mr-1 size-3" /> Fraud flag
              </Chip>
            ) : null}
          </div>
          <p className="mt-1.5 text-sm text-foreground">{claim.client}</p>
          <p className="text-xs break-words text-muted-foreground">
            {claim.classOfInsurance} · {claim.insurer} · {formatRwf(claim.amount)}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Loss {formatDate(claim.dateOfLoss)} · Reported {formatDate(claim.dateReported)}
            {claim.policyId ? ` · ${claim.policyId}` : " · Policy not linked"}
            {claim.submission?.insurerClaimNo ? ` · Insurer ref ${claim.submission.insurerClaimNo}` : ""}
          </p>
          <div className="mt-2">
            <Person name={claim.handler} />
          </div>
        </div>
        <button
          type="button"
          aria-label="Close claim"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-4 pt-5 sm:px-6">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Claim progress</h3>
        <Stepper claim={claim} />
      </div>

      <div className="px-4 pt-4 sm:px-6">
        <CurrentStep claim={claim} perms={perms} role={user.role} userName={user.name} run={run} />
      </div>

      <div className="px-4 py-5 sm:px-6">
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        {tab === "Documents" ? (
          perms.seesDocumentDetail ? (
            <DocumentsTab claim={claim} canUpdate={perms.canUpdateClaims} userName={user.name} run={run} />
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              Document details are not part of the Finance Director view.
            </p>
          )
        ) : null}
        {tab === "Follow-ups" ? <FollowUpsTab claim={claim} /> : null}
        {tab === "Activity Log" ? <EventList events={[...claim.history].reverse()} empty="No activity yet." /> : null}
        {tab === "Internal Notes" ? (
          <NotesTab
            claim={claim}
            canAdd={perms.canUpdateClaims || perms.canDecideDisputes}
            userName={user.name}
            run={run}
          />
        ) : null}

        {perms.canSeeFraudFlag && !isClosed(claim) ? (
          <div className="mt-6 flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
            <div className="min-w-0">
              <p className="text-xs font-medium">Fraud flag</p>
              <p className="text-[11px] text-muted-foreground">
                Only the Technical Director, Risk &amp; Compliance Manager and MD can see this.
              </p>
            </div>
            <OutlineButton
              onClick={() =>
                run(
                  () => setClaimFraudFlag(claim.id, !claim.fraudFlag, user.name),
                  claim.fraudFlag ? "Fraud flag cleared." : "Fraud flag raised.",
                )
              }
            >
              <Flag className="size-3.5" /> {claim.fraudFlag ? "Clear flag" : "Raise flag"}
            </OutlineButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/* ---------------------------------- Stepper ---------------------------------- */

function Stepper({ claim }: { claim: Claim }) {
  const currentN = stepDef(claim.step).n;
  const closed = isClosed(claim);
  return (
    <div className="mt-4 overflow-x-auto pb-2">
      <div className="flex min-w-[520px] items-start gap-1">
        {CLAIM_STEP_DEFS.map((s) => {
          const done = s.n < currentN || closed;
          const current = s.n === currentN && !closed;
          const late = current && claimBlocker(claim) !== null && (isDisputed(claim) || needsEscalation(claim));
          return (
            <div key={s.code} className="flex-1">
              <div className="flex items-center">
                <span
                  className={cn(
                    "flex size-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                    done && "bg-primary text-primary-foreground",
                    current && !late && "bg-card text-primary ring-2 ring-sky",
                    current && late && "bg-card text-warning ring-2 ring-warning",
                    !done && !current && "bg-secondary text-subtle",
                  )}
                >
                  {done ? <Check className="size-3.5" /> : s.n}
                </span>
                {s.n < CLAIM_STEP_DEFS.length ? (
                  <span className={cn("h-0.5 flex-1", done ? "bg-primary" : "bg-border")} />
                ) : null}
              </div>
              <p
                className={cn(
                  "mt-2 pr-1 text-[10px] leading-tight",
                  current ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {s.name}
              </p>
              <p className="text-[10px] text-subtle">{s.slaLabel}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* -------------------------------- Current step ------------------------------- */

function CurrentStep({
  claim,
  perms,
  role,
  userName,
  run,
}: {
  claim: Claim;
  perms: ReturnType<typeof claimPermissions>;
  role: string;
  userName: string;
  run: Run;
}) {
  if (isClosed(claim)) {
    const c = claim.closure!;
    return (
      <Box tone="success" title={c.outcome === "SETTLED" ? "Claim closed · settled" : "Claim closed · rejection accepted"}>
        <p className="text-muted-foreground">
          Closed {formatDate(c.closedAt)} by {c.by}
          {claim.settlement ? ` · settled at ${formatRwf(claim.settlement.amount)}` : ""}
        </p>
        <Evidence name={c.evidence} />
      </Box>
    );
  }

  if (isDisputed(claim)) return <DisputeStep claim={claim} canDecide={perms.canDecideDisputes} userName={userName} run={run} />;

  const s = stepDef(claim.step);
  const blocker = claimBlocker(claim);
  const readOnly = !perms.canUpdateClaims;

  return (
    <Box
      tone={blocker ? "warning" : "sky"}
      title={`Step ${s.n} · ${s.name}`}
      right={<span className="text-[11px] text-muted-foreground">Due {dueLabel(claim)}</span>}
    >
      {blocker ? (
        <p className="flex items-center gap-1.5 font-medium text-warning">
          {blocker}
        </p>
      ) : null}
      {claim.step === "REGISTER" ? (
        <>
          <p className="text-muted-foreground">Check the claim details and confirm registration within 24 hours.</p>
          {!readOnly ? (
            <NavyButton onClick={() => run(() => confirmClaimRegistration(claim.id, userName), "Registration confirmed.")}>
              <Check className="size-3.5" /> Confirm registration
            </NavyButton>
          ) : null}
        </>
      ) : null}
      {claim.step === "DOCUMENTS" ? (
        <>
          <p className="text-muted-foreground">
            {missingDocuments(claim).length
              ? "Collect the documents listed below, then send the claim to the insurer."
              : "All required documents are in."}
          </p>
          {!readOnly ? (
            <NavyButton
              disabled={missingDocuments(claim).length > 0}
              onClick={() => run(() => markClaimReadyToSubmit(claim.id, userName), "Claim ready to submit.")}
            >
              Ready to submit
            </NavyButton>
          ) : null}
        </>
      ) : null}
      {claim.step === "SUBMIT" && !readOnly ? <SubmitForm claim={claim} userName={userName} run={run} /> : null}
      {claim.step === "FOLLOW_UP" ? <FollowUpStep claim={claim} readOnly={readOnly} userName={userName} run={run} /> : null}
      {claim.step === "SETTLEMENT" ? (
        <SettlementStep claim={claim} perms={perms} role={role} userName={userName} run={run} />
      ) : null}
      {claim.step === "CLOSE" && !readOnly ? (
        <EvidenceAction
          placeholder="Discharge voucher, e.g. Discharge voucher signed.pdf"
          label="Close claim"
          onSubmit={(evidence) => run(() => closeClaim(claim.id, evidence, userName), "Claim closed.")}
        />
      ) : null}
      {readOnly ? (
        <p className="text-[11px] text-subtle">
          View only. Claim updates are limited to the claims team, Technical Director, DMD and MD.
        </p>
      ) : null}
    </Box>
  );
}

function SubmitForm({ claim, userName, run }: { claim: Claim; userName: string; run: Run }) {
  const [ref, setRef] = useState("");
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">Send the formal claim intimation letter to {claim.insurer}.</p>
      <input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Insurer claim number (if given)" aria-label="Insurer claim number" className={INPUT} />
      <input
        value={evidence}
        onChange={(e) => setEvidence(e.target.value)}
        placeholder="Intimation letter, e.g. Claim intimation letter.pdf"
        aria-label="Intimation letter"
        className={INPUT}
      />
      <NavyButton
        disabled={saving}
        onClick={async () => {
          if (!evidence.trim()) return toast.error("Attach the intimation letter sent to the insurer.");
          setSaving(true);
          await run(
            () => submitClaimToInsurer(claim.id, { insurerClaimNo: ref.trim() || undefined, evidence: evidence.trim() }, userName),
            `Submitted to ${claim.insurer}.`,
          );
          setSaving(false);
        }}
      >
        {saving ? "Saving…" : "Mark submitted"}
      </NavyButton>
    </div>
  );
}

const FOLLOW_UP_ACTIONS = ["Log follow-up", "Settlement offer", "Rejection"] as const;
const CHANNELS: ClaimFollowUp["channel"][] = ["Email", "Call", "Letter", "Meeting"];

function FollowUpStep({ claim, readOnly, userName, run }: { claim: Claim; readOnly: boolean; userName: string; run: Run }) {
  const [action, setAction] = useState<(typeof FOLLOW_UP_ACTIONS)[number]>("Log follow-up");
  const [channel, setChannel] = useState<ClaimFollowUp["channel"]>("Email");
  const [note, setNote] = useState("");
  const [responded, setResponded] = useState(false);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  // The settlement figures to check before recording the offer.
  const [review, setReview] = useState<string[] | null>(null);
  const silent = daysWithoutInsurerResponse(claim);
  const appealed = claim.dispute?.decision === "APPEAL";

  async function save(fn: () => Promise<boolean>) {
    setSaving(true);
    const ok = await fn();
    setSaving(false);
    if (ok) {
      setNote("");
      setAmount("");
      setReason("");
      setResponded(false);
    }
  }

  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">
        Follow up with {claim.insurer} at least every 10 working days. Next follow-up due {dueLabel(claim)}.
        {silent ? ` No insurer response for ${silent} working days.` : ""}
      </p>
      {needsEscalation(claim) ? (
        <p className="font-medium text-danger">
          Escalate: no response for {NO_RESPONSE_ESCALATION_DAYS}+ working days. Raise it with the Technical Director.
        </p>
      ) : null}
      {appealed ? (
        <p className="text-muted-foreground">
          Appealing after the insurer&apos;s rejection (Claims Committee, {formatDate(claim.dispute!.decidedAt!)}).
        </p>
      ) : null}
      {!readOnly ? (
        <>
          <SegmentedTabs tabs={FOLLOW_UP_ACTIONS} value={action} onChange={setAction} />
          {action === "Log follow-up" ? (
            <>
              <select value={channel} onChange={(e) => setChannel(e.target.value as ClaimFollowUp["channel"])} aria-label="Channel" className={INPUT}>
                {CHANNELS.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="What was said or agreed?" aria-label="Follow-up note" className={INPUT} />
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={responded} onChange={(e) => setResponded(e.target.checked)} />
                The insurer responded
              </label>
              <NavyButton
                disabled={saving}
                onClick={() => {
                  if (!note.trim()) return toast.error("Add a short note about the follow-up.");
                  save(() => run(() => logClaimFollowUp(claim.id, { channel, note: note.trim(), insurerResponded: responded }, userName), "Follow-up logged."));
                }}
              >
                Save follow-up
              </NavyButton>
            </>
          ) : null}
          {action === "Settlement offer" ? (
            <>
              <AmountInput value={amount} onChange={setAmount} placeholder="Amount offered in RWF, e.g. 7,500,000" aria-label="Settlement amount" className={INPUT} />
              <NavyButton
                disabled={saving}
                onClick={() => {
                  if (!(parseAmount(amount) > 0)) return toast.error("Enter the amount the insurer offered.");
                  setReview(settlementWarnings(parseAmount(amount), claim.amount));
                }}
              >
                Review offer
              </NavyButton>
              <ReviewDialog
                open={review !== null}
                title={`Check the settlement offer on ${claim.id}`}
                rows={[
                  { label: "Amount offered", amount: parseAmount(amount) || 0 },
                  { label: "Estimated loss", amount: claim.amount },
                  { label: "Insurer", value: claim.insurer },
                ]}
                warnings={review ?? []}
                confirmLabel="Record offer"
                saving={saving}
                onConfirm={() =>
                  save(async () => {
                    const ok = await run(() => recordSettlementOffer(claim.id, parseAmount(amount), userName), "Settlement offer recorded.");
                    if (ok) setReview(null);
                    return ok;
                  })
                }
                onBack={() => setReview(null)}
              />
            </>
          ) : null}
          {action === "Rejection" ? (
            <>
              <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} placeholder="The insurer's reason for rejecting" aria-label="Rejection reason" className={INPUT} />
              <NavyButton
                disabled={saving}
                onClick={() => save(() => run(() => recordInsurerRejection(claim.id, reason.trim(), userName), "Sent to the Claims Committee."))}
              >
                Send to Claims Committee
              </NavyButton>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

function SettlementStep({
  claim,
  perms,
  role,
  userName,
  run,
}: {
  claim: Claim;
  perms: ReturnType<typeof claimPermissions>;
  role: string;
  userName: string;
  run: Run;
}) {
  const settlement = claim.settlement!;
  const chain = claimSignOffChain(settlement.amount);
  const signer = nextSigner(claim);
  return (
    <div className="space-y-2">
      <p className="text-muted-foreground">
        Offer of {formatRwf(settlement.amount)} received {formatDate(settlement.advisedAt)}. Sign-off: {chain.join(" + ")}.
      </p>
      {chain.map((s) => {
        const signed = settlement.signedBy.includes(s);
        return (
          <div key={s} className="flex items-center justify-between gap-3 rounded-xl bg-card px-3 py-2.5">
            <span className="flex items-center gap-2 font-medium">
              {signed ? <Check className="size-4 text-success" /> : <Dot tone="warning" />}
              {s === "Board" ? "Board (informed by MD)" : s}
            </span>
            {signed ? (
              <Chip tone="success">Signed</Chip>
            ) : s === signer && perms.canSign(signer) ? (
              <NavyButton onClick={() => run(() => signClaimSettlement(claim.id, role, userName), `${s} sign-off recorded.`)}>
                Sign off
              </NavyButton>
            ) : (
              <Chip tone="warning">Pending</Chip>
            )}
          </div>
        );
      })}
      {!signer && perms.canUpdateClaims ? (
        <EvidenceAction
          placeholder="Payment advice, e.g. Payment advice to client.pdf"
          label="Paid to client"
          onSubmit={(evidence) => run(() => recordPaidToClient(claim.id, evidence, userName), "Payment to client recorded.")}
        />
      ) : null}
    </div>
  );
}

function DisputeStep({ claim, canDecide, userName, run }: { claim: Claim; canDecide: boolean; userName: string; run: Run }) {
  const [decision, setDecision] = useState<"APPEAL" | "ACCEPT_REJECTION">("APPEAL");
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);
  const d = claim.dispute!;
  return (
    <Box tone="warning" title="Disputed · Claims Committee" right={<span className="text-[11px] text-muted-foreground">Decide by {dueLabel(claim)}</span>}>
      <p className="flex items-start gap-1.5">
        
        <span>
          {claim.insurer} rejected the claim on {formatDate(d.raisedAt)}: {d.reason}
        </span>
      </p>
      <p className="text-muted-foreground">The DMD chairs the committee, which decides within {COMMITTEE_DAYS} working days.</p>
      {canDecide ? (
        <div className="space-y-2">
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["APPEAL", "Appeal to the insurer"],
                ["ACCEPT_REJECTION", "Accept the rejection"],
              ] as const
            ).map(([value, label]) => (
              <label
                key={value}
                className={cn(
                  "flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-2",
                  decision === value ? "border-sky bg-card" : "border-border",
                )}
              >
                <input type="radio" name="decision" checked={decision === value} onChange={() => setDecision(value)} />
                {label}
              </label>
            ))}
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Committee's reasons" aria-label="Committee reasons" className={INPUT} />
          {decision === "ACCEPT_REJECTION" ? (
            <input
              value={evidence}
              onChange={(e) => setEvidence(e.target.value)}
              placeholder="Committee decision record, e.g. Committee minutes.pdf"
              aria-label="Committee decision record"
              className={INPUT}
            />
          ) : null}
          <NavyButton
            disabled={saving}
            onClick={async () => {
              setSaving(true);
              await run(
                () => decideDispute(claim.id, { decision, note: note.trim(), evidence: evidence.trim() || undefined }, userName),
                decision === "APPEAL" ? "Appeal recorded; back to follow-up." : "Rejection accepted; claim closed.",
              );
              setSaving(false);
            }}
          >
            Record decision
          </NavyButton>
        </div>
      ) : (
        <p className="text-[11px] text-subtle">Waiting for the Claims Committee. Only the DMD or MD can record its decision.</p>
      )}
    </Box>
  );
}

/* ----------------------------------- Tabs ------------------------------------ */

function DocumentsTab({ claim, canUpdate, userName, run }: { claim: Claim; canUpdate: boolean; userName: string; run: Run }) {
  // Bumped after a checklist upload so the file list below reloads.
  const [refresh, setRefresh] = useState(0);
  const editable = canUpdate && !isClosed(claim);
  // Backend claims upload to the backend by their UUID; sample claims stay in this tab.
  const subject = { type: "CLAIM" as const, id: claim.uuid ?? claim.id };

  async function receive(name: string, file: File) {
    try {
      await uploadDocument(subject, file, { classification: "CLAIM_EVIDENCE", purpose: "CLAIM_DOCUMENT" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the file.");
      return;
    }
    if (await run(() => fileClaimDocument(claim.id, name, file.name, userName), `${name} received.`)) {
      setRefresh((n) => n + 1);
    }
  }

  return (
    <div className="mt-4 space-y-2">
      {claim.documents.map((d) => (
        <div key={d.name} className="rounded-xl border border-border px-3 py-2.5">
          <div className="flex items-center justify-between gap-3">
            <span className="flex min-w-0 items-center gap-2 text-xs">
              {d.filedAt ? <Check className="size-4 shrink-0 text-success" /> : <Dot tone="danger" />}
              <span className="min-w-0">
                {d.name}
                {!d.required ? <span className="text-subtle"> (optional)</span> : null}
              </span>
            </span>
            {d.filedAt ? (
              <Chip tone="success">Received {formatDate(d.filedAt)}</Chip>
            ) : editable ? (
              <FilePickButton onFile={(file) => receive(d.name, file)} destination={`${d.name} · claim ${claim.id}`}>
                <Upload className="size-3.5" /> Upload
              </FilePickButton>
            ) : (
              <Chip tone="danger">Missing</Chip>
            )}
          </div>
          {d.evidence ? <Evidence name={d.evidence} /> : null}
        </div>
      ))}
      {[claim.submission?.evidence, claim.settlement?.evidence, claim.closure?.evidence].some(Boolean) ? (
        <div className="pt-2">
          <p className="text-[11px] font-semibold text-muted-foreground">Step records</p>
          {claim.submission ? <Evidence name={claim.submission.evidence} label="Intimation letter" /> : null}
          {claim.settlement?.evidence ? <Evidence name={claim.settlement.evidence} label="Payment advice" /> : null}
          {claim.closure ? <Evidence name={claim.closure.evidence} label="Closure" /> : null}
        </div>
      ) : null}
      <div className="pt-4">
        <DocumentPanel
          key={refresh}
          subject={subject}
          classification="CLAIM_EVIDENCE"
          purpose="CLAIM_DOCUMENT"
          canUpload={editable}
          title="Claim Files"
          emptyText={claim.uuid ? "No files uploaded yet." : "No files uploaded yet. Files on sample claims stay in this tab."}
        />
      </div>
    </div>
  );
}

function FollowUpsTab({ claim }: { claim: Claim }) {
  if (!claim.submission) {
    return <p className="mt-4 text-xs text-muted-foreground">Follow-ups start once the claim is submitted to the insurer.</p>;
  }
  return (
    <div className="mt-4 space-y-2">
      <div className="rounded-xl bg-secondary px-3 py-2.5 text-xs">
        Submitted to {claim.insurer} on {formatDate(claim.submission.submittedAt)}
        {claim.submission.insurerClaimNo ? ` · ref ${claim.submission.insurerClaimNo}` : ""}
      </div>
      {claim.followUps.length === 0 ? (
        <p className="text-xs text-muted-foreground">No follow-ups logged yet.</p>
      ) : (
        [...claim.followUps].reverse().map((f, i) => (
          <div key={`${f.date}-${i}`} className="rounded-xl border border-border px-3 py-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-medium">
                {formatDate(f.date)} · {f.channel}
              </span>
              <Chip tone={f.insurerResponded ? "success" : "neutral"}>{f.insurerResponded ? "Insurer responded" : "No response"}</Chip>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{f.note}</p>
            <p className="mt-1 text-[11px] text-subtle">{f.by}</p>
          </div>
        ))
      )}
    </div>
  );
}

function NotesTab({ claim, canAdd, userName, run }: { claim: Claim; canAdd: boolean; userName: string; run: Run }) {
  const [text, setText] = useState("");
  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-xl bg-secondary p-3">
        <p className="text-[11px] font-semibold text-muted-foreground">Description</p>
        <p className="mt-1 text-xs">{claim.description}</p>
      </div>
      <EventList events={[...claim.notes].reverse()} empty="No internal notes yet." />
      {canAdd ? (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Add an internal note…"
            aria-label="Internal note"
            className={cn(INPUT, "h-24 resize-none")}
          />
          <NavyButton
            onClick={async () => {
              if (await run(() => addClaimNote(claim.id, text, userName), "Internal note added.")) setText("");
            }}
          >
            Add Note
          </NavyButton>
        </>
      ) : null}
    </div>
  );
}

/* ---------------------------------- Helpers ---------------------------------- */

function EventList({ events, empty }: { events: Claim["history"]; empty: string }) {
  if (events.length === 0) return <p className="mt-4 text-xs text-muted-foreground">{empty}</p>;
  return (
    <ol className="mt-4 space-y-3">
      {events.map((e, i) => (
        <li key={`${e.at}-${i}`} className="flex gap-3">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky" />
          <div>
            <p className="text-xs text-foreground">{e.text}</p>
            <p className="text-[11px] text-subtle">
              {formatDate(e.at)} · {e.by}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

function Box({
  tone,
  title,
  right,
  children,
}: {
  tone: "sky" | "warning" | "success";
  title: string;
  right?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl p-4 text-xs",
        tone === "sky" && "bg-pale",
        tone === "warning" && "bg-warning-soft/50",
        tone === "success" && "bg-success-soft/50",
      )}
    >
      <div className="grid gap-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
        <h3 className="text-sm font-semibold">{title}</h3>
        {right}
      </div>
      <div className="mt-2 space-y-2">{children}</div>
    </div>
  );
}

function Evidence({ name, label }: { name: string; label?: string }) {
  return (
    <p className="mt-1 flex items-center gap-1 text-[11px] text-primary">
      <FileText className="size-3" /> {label ? `${label}: ` : ""}
      {name}
    </p>
  );
}

function EvidenceAction({
  placeholder,
  label,
  onSubmit,
}: {
  placeholder: string;
  label: string;
  onSubmit: (evidence: string) => Promise<boolean>;
}) {
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);
  return (
    <div className="space-y-2">
      <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder={placeholder} aria-label={label} className={INPUT} />
      <NavyButton
        disabled={saving}
        onClick={async () => {
          setSaving(true);
          await onSubmit(evidence.trim());
          setSaving(false);
        }}
      >
        {saving ? "Saving…" : label}
      </NavyButton>
    </div>
  );
}