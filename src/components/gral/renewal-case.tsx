"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, Circle, Clock, FileText, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import {
  addRenewalQuote,
  completeRenewalMilestone,
  recommendRenewalQuote,
  recordRenewalAcceptance,
  renewalApproval,
  requestRenewalApproval,
} from "@/lib/api";
import { statusLabel } from "@/lib/approvals";
import type { ApprovalRequest } from "@/lib/types";
import { useCurrentUser } from "@/lib/auth-context";
import { renewalPermissions } from "@/lib/permissions";
import { INSURER_GROUPS } from "@/lib/reference-data";
import {
  RENEWAL_MILESTONES,
  completionBlocker,
  currentMilestone,
  daysOverdue,
  daysToExpiry,
  formatDate,
  milestoneDue,
  renewalHealth,
} from "@/lib/renewals";
import type { RenewalCase } from "@/lib/types";
import { Chip, NavyButton, OutlineButton, Person, SegmentedTabs } from "./ui";

const TABS = ["Milestones", "Quotes", "Acceptance"] as const;
type Tab = (typeof TABS)[number];

const INPUT =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

export function RenewalHealthChip({ renewal }: { renewal: RenewalCase }) {
  const health = renewalHealth(renewal);
  if (health === "completed") return <Chip tone="success">Completed</Chip>;
  if (health === "overdue") return <Chip tone="danger">Overdue {daysOverdue(renewal)}d</Chip>;
  if (health === "due-soon") return <Chip tone="warning">Due soon</Chip>;
  return <Chip tone="sky">On track</Chip>;
}

export function RenewalCasePanel({
  renewal,
  onClose,
  onChanged,
}: {
  renewal: RenewalCase;
  onClose: () => void;
  onChanged: (updated: RenewalCase) => void;
}) {
  const [tab, setTab] = useState<Tab>("Milestones");
  const { user } = useCurrentUser();
  const { canUpdateRenewals } = renewalPermissions(user.role);
  const days = daysToExpiry(renewal);

  async function run(action: () => Promise<RenewalCase>, success: string) {
    try {
      onChanged(await action());
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
            <span className="text-lg font-semibold tracking-tight">{renewal.client}</span>
            <RenewalHealthChip renewal={renewal} />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {renewal.id} · {renewal.policyId} · {renewal.classOfInsurance} · {renewal.insurer}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {formatRwf(renewal.premium)} · Expires {formatDate(renewal.expiryDate)} ·{" "}
            <span className={cn(days < 0 && "font-medium text-danger")}>
              {days < 0 ? `expired ${Math.abs(days)} days ago` : `${days} days to go`}
            </span>
          </p>
          <div className="mt-2">
            <Person name={renewal.owner} />
          </div>
        </div>
        <button
          type="button"
          aria-label="Close renewal case"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-4 py-5 sm:px-6">
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        {!canUpdateRenewals ? (
          <p className="mt-3 text-[11px] text-subtle">
            View only. Renewal updates are limited to the Commercial Director, DMD and MD.
          </p>
        ) : null}

        {tab === "Milestones" ? (
          <MilestonesTab renewal={renewal} canUpdate={canUpdateRenewals} userName={user.name} run={run} />
        ) : null}
        {tab === "Quotes" ? <QuotesTab renewal={renewal} canUpdate={canUpdateRenewals} run={run} /> : null}
        {tab === "Acceptance" ? (
          <AcceptanceTab renewal={renewal} canUpdate={canUpdateRenewals} userName={user.name} run={run} />
        ) : null}
      </div>
    </div>
  );
}

type Run = (action: () => Promise<RenewalCase>, success: string) => Promise<boolean>;

function MilestonesTab({
  renewal,
  canUpdate,
  userName,
  run,
}: {
  renewal: RenewalCase;
  canUpdate: boolean;
  userName: string;
  run: Run;
}) {
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);
  const current = currentMilestone(renewal);
  const blocker = completionBlocker(renewal);
  const overdue = daysOverdue(renewal);

  async function complete() {
    if (!note.trim()) {
      toast.error("Add a short note about what was done.");
      return;
    }
    setSaving(true);
    const ok = await run(
      () =>
        completeRenewalMilestone(renewal.id, {
          note: note.trim(),
          evidence: evidence.trim() || undefined,
          completedBy: userName,
        }),
      `${current?.name} marked complete.`,
    );
    setSaving(false);
    if (ok) {
      setNote("");
      setEvidence("");
    }
  }

  return (
    <ol className="mt-4 space-y-2">
      {RENEWAL_MILESTONES.map((m, i) => {
        const done = renewal.completed.find((c) => c.code === m.code);
        const isCurrent = current?.code === m.code;
        const late = isCurrent && overdue > 0;
        return (
          <li
            key={m.code}
            className={cn(
              "rounded-xl border px-3 py-2.5",
              isCurrent ? (late ? "border-danger/40 bg-danger-soft/40" : "border-sky/40 bg-pale") : "border-border",
            )}
          >
            <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5">
              <span className="mt-0.5">
                {done ? (
                  <Check className="size-4 text-success" />
                ) : late ? (
                  <Clock className="size-4 text-danger" />
                ) : (
                  <Circle className={cn("size-4", isCurrent ? "text-sky" : "text-subtle")} />
                )}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-medium">
                  {i + 1}. {m.name}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {m.owner} · {m.output}
                </p>
                {done ? (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Done {formatDate(done.completedAt)} by {done.completedBy}
                    {done.evidence ? (
                      <span className="ml-1 inline-flex items-center gap-1 text-primary">
                        · <FileText className="size-3" /> {done.evidence}
                      </span>
                    ) : null}
                  </p>
                ) : null}
              </div>
              <div className="text-right">
                <p className="text-[11px] font-medium whitespace-nowrap">
                  Day {m.offset === 0 ? "0" : `−${Math.abs(m.offset)}`}
                </p>
                <p className="text-[10px] whitespace-nowrap text-subtle">{formatDate(milestoneDue(renewal, m))}</p>
              </div>
            </div>

            {isCurrent && canUpdate ? (
              <div className="mt-3 space-y-2 border-t border-border pt-3">
                {late ? (
                  <p className="text-[11px] font-medium text-danger">Overdue by {overdue} days.</p>
                ) : null}
                {blocker ? (
                  <p className="text-[11px] text-warning">{blocker}</p>
                ) : m.code === "APPROVAL" ? (
                  <ApprovalRequestBox renewalId={renewal.id} userName={userName} />
                ) : (
                  <>
                    <textarea
                      value={note}
                      onChange={(e) => setNote(e.target.value)}
                      rows={2}
                      placeholder="What was done? e.g. Notice sent to the client by email"
                      aria-label="Completion note"
                      className={INPUT}
                    />
                    <input
                      value={evidence}
                      onChange={(e) => setEvidence(e.target.value)}
                      placeholder="Evidence document (optional), e.g. Renewal notice.pdf"
                      aria-label="Evidence document"
                      className={INPUT}
                    />
                    <NavyButton onClick={complete} disabled={saving}>
                      <Check className="size-3.5" /> {saving ? "Saving…" : `Mark ${m.name} complete`}
                    </NavyButton>
                  </>
                )}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function QuotesTab({ renewal, canUpdate, run }: { renewal: RenewalCase; canUpdate: boolean; run: Run }) {
  const [insurer, setInsurer] = useState("");
  const [premium, setPremium] = useState("");
  const [terms, setTerms] = useState("");
  const [saving, setSaving] = useState(false);
  const locked = !!renewal.acceptance;

  async function add() {
    const amount = Number(premium.replace(/[^\d]/g, ""));
    if (!insurer || !amount || !terms.trim()) {
      toast.error("Choose the insurer and enter the premium and main terms.");
      return;
    }
    setSaving(true);
    const ok = await run(
      () => addRenewalQuote(renewal.id, { insurer, premium: amount, terms: terms.trim() }),
      `Quote from ${insurer} added.`,
    );
    setSaving(false);
    if (ok) {
      setInsurer("");
      setPremium("");
      setTerms("");
    }
  }

  return (
    <div className="mt-4 space-y-3">
      {renewal.quotes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          No quotes received yet.
        </p>
      ) : (
        renewal.quotes.map((q) => (
          <div
            key={q.id}
            className={cn(
              "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border px-3 py-2.5",
              q.recommended ? "border-sky/40 bg-pale" : "border-border",
            )}
          >
            <div className="min-w-0">
              <p className="text-xs font-medium">
                {q.insurer} · {formatRwf(q.premium)}
              </p>
              <p className="text-[11px] text-muted-foreground">{q.terms}</p>
            </div>
            {q.recommended ? (
              <Chip tone="sky">Recommended</Chip>
            ) : canUpdate && !locked ? (
              <OutlineButton onClick={() => run(() => recommendRenewalQuote(renewal.id, q.id), `${q.insurer} recommended.`)}>
                Recommend
              </OutlineButton>
            ) : null}
          </div>
        ))
      )}

      {canUpdate && !locked ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <p className="text-xs font-semibold">Add a quote</p>
          <select value={insurer} onChange={(e) => setInsurer(e.target.value)} aria-label="Insurer" className={INPUT}>
            <option value="">Select an insurer</option>
            {INSURER_GROUPS.map((g) => (
              <optgroup key={g.label} label={g.label}>
                {g.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <input
            value={premium}
            onChange={(e) => setPremium(e.target.value)}
            inputMode="numeric"
            placeholder="Premium in RWF, e.g. 15000000"
            aria-label="Premium"
            className={INPUT}
          />
          <input
            value={terms}
            onChange={(e) => setTerms(e.target.value)}
            placeholder="Main terms, e.g. Same cover, deductible RWF 3m"
            aria-label="Terms"
            className={INPUT}
          />
          <NavyButton onClick={add} disabled={saving}>
            {saving ? "Saving…" : "Add Quote"}
          </NavyButton>
        </div>
      ) : null}
      {locked ? (
        <p className="text-[11px] text-subtle">Quotes are locked because the client has accepted an option.</p>
      ) : null}
    </div>
  );
}

function AcceptanceTab({
  renewal,
  canUpdate,
  userName,
  run,
}: {
  renewal: RenewalCase;
  canUpdate: boolean;
  userName: string;
  run: Run;
}) {
  const recommended = renewal.quotes.find((q) => q.recommended);
  const [quoteId, setQuoteId] = useState(recommended?.id ?? "");
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);

  if (renewal.acceptance) {
    const q = renewal.quotes.find((x) => x.id === renewal.acceptance!.quoteId);
    return (
      <div className="mt-4 rounded-xl border border-success/30 bg-success-soft/40 px-3 py-3 text-xs">
        <p className="flex items-center gap-2 font-medium">
          <Check className="size-4 text-success" /> Client accepted in writing
        </p>
        <p className="mt-1 text-muted-foreground">
          {q ? `${q.insurer} · ${formatRwf(q.premium)}` : "Selected option"} · {formatDate(renewal.acceptance.acceptedAt)} ·
          recorded by {renewal.acceptance.recordedBy}
        </p>
        <p className="mt-1 flex items-center gap-1 text-primary">
          <FileText className="size-3.5" /> {renewal.acceptance.evidence}
        </p>
      </div>
    );
  }

  async function record() {
    if (!quoteId || !evidence.trim()) {
      toast.error("Choose the accepted quote and add the written acceptance document.");
      return;
    }
    setSaving(true);
    await run(
      () => recordRenewalAcceptance(renewal.id, { quoteId, evidence: evidence.trim(), recordedBy: userName }),
      "Client acceptance recorded.",
    );
    setSaving(false);
  }

  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">
        Written client acceptance is required before the cover can be placed.
      </p>
      {renewal.quotes.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
          Add and recommend a quote first.
        </p>
      ) : canUpdate ? (
        <div className="space-y-2 rounded-xl border border-border p-3">
          <select value={quoteId} onChange={(e) => setQuoteId(e.target.value)} aria-label="Accepted quote" className={INPUT}>
            <option value="">Select the accepted quote</option>
            {renewal.quotes.map((q) => (
              <option key={q.id} value={q.id}>
                {q.insurer} · {formatRwf(q.premium)}
                {q.recommended ? " (recommended)" : ""}
              </option>
            ))}
          </select>
          <input
            value={evidence}
            onChange={(e) => setEvidence(e.target.value)}
            placeholder="Written acceptance document, e.g. Client acceptance letter.pdf"
            aria-label="Acceptance document"
            className={INPUT}
          />
          <NavyButton onClick={record} disabled={saving}>
            {saving ? "Saving…" : "Record Acceptance"}
          </NavyButton>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Not yet accepted.</p>
      )}
    </div>
  );
}

/** The renewal's internal approval goes through the Approvals inbox (APR-01). */
function ApprovalRequestBox({ renewalId, userName }: { renewalId: string; userName: string }) {
  const [request, setRequest] = useState<ApprovalRequest | null | undefined>(undefined);

  useEffect(() => {
    renewalApproval(renewalId).then(setRequest);
  }, [renewalId]);

  if (request === undefined) return null;
  const live = request && request.status === "PENDING";
  return (
    <div className="space-y-2">
      <p className="text-[11px] text-muted-foreground">
        Internal approval is decided in the Approvals inbox, by commission: under RWF 1M the Technical Director, RWF 1M to
        10M the MD, over 10M the MD with the Board informed.
      </p>
      {request ? (
        <p className="text-[11px]">
          <Link href={`/approvals?request=${encodeURIComponent(request.id)}`} className="font-medium text-primary underline underline-offset-2">
            {request.id}
          </Link>{" "}
          · {statusLabel(request)}
        </p>
      ) : null}
      {!live ? (
        <NavyButton
          onClick={async () => {
            try {
              const created = await requestRenewalApproval(renewalId, userName);
              setRequest(created);
              toast.success(`Approval requested (${created.id}).`);
            } catch (err) {
              toast.error(err instanceof Error ? err.message : "Could not request approval.");
            }
          }}
        >
          {request ? "Request approval again" : "Request approval"}
        </NavyButton>
      ) : null}
    </div>
  );
}
