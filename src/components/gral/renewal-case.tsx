"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, FileText, Minus, X } from "lucide-react";
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
  restartRenewal,
  setRenewalStepsNotNeeded,
  SKIPPABLE_MILESTONES,
} from "@/lib/api";
import { statusLabel } from "@/lib/approvals";
import type { ApprovalRequest } from "@/lib/types";
import { useCurrentUser } from "@/lib/auth-context";
import { renewalCompliancePermissions, renewalPermissions } from "@/lib/permissions";
import { INSURER_GROUPS } from "@/lib/reference-data";
import {
  RENEWAL_MILESTONES,
  completionBlocker,
  currentMilestone,
  daysOverdue,
  daysToExpiry,
  formatDate,
  isLostRenewal,
  milestoneDue,
  renewalHealth,
} from "@/lib/renewals";
import { kycBlockedReasons } from "@/lib/kyc";
import { useClients } from "@/lib/queries";
import type { RenewalCase, RenewalMilestoneCode } from "@/lib/types";
import { AmountInput } from "./amount-input";
import { KycBadge, KycBlockedNotice } from "./kyc-badge";
import { RenewalActions, RenewalBlockers } from "./renewal-actions";
import { renewalActionsFor } from "@/lib/renewal-actions";
import { Chip, NavyButton, OutlineButton, Person, SegmentedTabs } from "./ui";

const TABS = ["Milestones", "Quotes", "Acceptance"] as const;
type Tab = (typeof TABS)[number];

const INPUT =
  "w-full rounded-xl border border-input bg-card px-3 py-2 text-xs outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

export function RenewalHealthChip({ renewal }: { renewal: RenewalCase }) {
  const health = renewalHealth(renewal);
  if (health === "completed") return <Chip tone="success">Completed</Chip>;
  if (health === "lost") return <Chip>Lost</Chip>;
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
  /** Shows a close button. Left out on the full renewal page, which has a back link. */
  onClose?: () => void;
  onChanged: (updated: RenewalCase) => void;
}) {
  const [tab, setTab] = useState<Tab>("Milestones");
  const { user } = useCurrentUser();
  const { canUpdateRenewals } = renewalPermissions(user);
  const days = daysToExpiry(renewal);
  const { data: clients = [] } = useClients("");
  const client = clients.find((c) => c.id === renewal.clientId);

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
      <div className="flex items-start justify-between gap-3 border-b border-border px-5 pt-7 pb-6 sm:px-8">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xl font-semibold tracking-tight">{renewal.client}</span>
            <RenewalHealthChip renewal={renewal} />
            {client ? <KycBadge kyc={client.kyc} status={client.kycStatus} gateStatus={client.kycGateStatus} /> : null}
          </div>
          <p className="mt-2.5 text-xs text-muted-foreground">
            {renewal.id} · {renewal.policyId} · {renewal.classOfInsurance} · {renewal.insurer}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            {formatRwf(renewal.premium)} · Expires {formatDate(renewal.expiryDate)} ·{" "}
            <span className={cn(days < 0 && "font-medium text-danger")}>
              {days < 0 ? `expired ${Math.abs(days)} days ago` : `${days} days to go`}
            </span>
          </p>
          <div className="mt-4">
            <Person name={renewal.owner} />
          </div>
        </div>
        {onClose ? (
          <button
            type="button"
            aria-label="Close renewal case"
            onClick={onClose}
            className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        ) : null}
      </div>

      <div className="px-5 py-6 sm:px-8">
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
        {!canUpdateRenewals ? (
          <p className="mt-3 text-[11px] text-subtle">View only</p>
        ) : null}
        {renewal.backend ? <RenewalBlockers renewal={renewal} /> : null}

        {tab === "Milestones" ? (
          <MilestonesTab renewal={renewal} canUpdate={canUpdateRenewals} userName={user.name} run={run} onChanged={onChanged} kycApproved={client ? client.kyc : true} kycLink={client ? `/clients?client=${encodeURIComponent(client.id)}` : undefined} />
        ) : null}
        {/* On backend cases, quotes and acceptance are recorded from the milestone rows. */}
        {tab === "Quotes" ? <QuotesTab renewal={renewal} canUpdate={canUpdateRenewals && !renewal.backend} run={run} /> : null}
        {tab === "Acceptance" ? (
          <AcceptanceTab
            renewal={renewal}
            canUpdate={canUpdateRenewals && !renewal.backend}
            userName={user.name}
            run={run}
            onOpenMilestones={renewal.backend && canUpdateRenewals ? () => setTab("Milestones") : undefined}
          />
        ) : null}
      </div>
    </div>
  );
}

type Run = (action: () => Promise<RenewalCase>, success: string) => Promise<boolean>;

type StepState = "done" | "skipped" | "not-needed" | "current" | "late" | "upcoming";

const dayLabel = (offset: number) => `Day ${offset === 0 ? "0" : `−${Math.abs(offset)}`}`;

/**
 * The ten milestones as a step bar, like a lead's onboarding steps: the bar shows
 * where the renewal is, and the chosen step's details and actions show below it.
 */
function MilestonesTab({
  renewal,
  canUpdate,
  userName,
  run,
  onChanged,
  kycApproved,
  kycLink,
}: {
  renewal: RenewalCase;
  canUpdate: boolean;
  userName: string;
  run: Run;
  onChanged: (updated: RenewalCase) => void;
  kycApproved: boolean;
  kycLink?: string;
}) {
  const { user } = useCurrentUser();
  const current = currentMilestone(renewal);
  const overdue = daysOverdue(renewal);
  // The step the user picked; otherwise the current one (or the last when finished).
  const [picked, setPicked] = useState<RenewalMilestoneCode | null>(null);
  const selected = picked ?? current?.code ?? RENEWAL_MILESTONES.at(-1)!.code;

  const stateOf = (code: RenewalMilestoneCode): StepState => {
    const done = renewal.completed.find((c) => c.code === code);
    if (done) return done.skipped ? "skipped" : "done";
    if (current?.code === code) return overdue > 0 ? "late" : "current";
    return renewal.notNeeded?.includes(code) ? "not-needed" : "upcoming";
  };
  const { canSkipSteps, canRestart } = renewalCompliancePermissions(user);
  const [panel, setPanel] = useState<"steps" | "restart" | null>(null);
  const open = !!current;

  // After a step is recorded, follow the renewal to its next step.
  const changed = (updated: RenewalCase) => {
    setPicked(null);
    onChanged(updated);
  };
  const runAndFollow: Run = async (action, success) => {
    const ok = await run(action, success);
    if (ok) setPicked(null);
    return ok;
  };

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {current ? (
            <>
              <span className="font-medium text-foreground">{current.name}</span> · due {formatDate(milestoneDue(renewal, current))}
            </>
          ) : isLostRenewal(renewal) ? (
            "Not renewing"
          ) : (
            "All steps done"
          )}
        </span>
        {panel === null && (canSkipSteps || canRestart) ? (
          <div className="flex flex-wrap gap-2">
            {canSkipSteps && open ? <OutlineButton onClick={() => setPanel("steps")}>Choose steps needed</OutlineButton> : null}
            {canRestart && renewal.completed.length > 0 ? <OutlineButton onClick={() => setPanel("restart")}>Restart renewal</OutlineButton> : null}
          </div>
        ) : null}
      </div>

      {panel === "steps" ? (
        <StepsNeededPanel
          renewal={renewal}
          userName={userName}
          run={runAndFollow}
          onClose={() => setPanel(null)}
        />
      ) : null}
      {panel === "restart" ? <RestartPanel renewal={renewal} run={runAndFollow} onClose={() => setPanel(null)} /> : null}

      <MilestoneTracker renewal={renewal} stateOf={stateOf} selected={selected} onSelect={setPicked} />

      <MilestoneDetail
        key={selected}
        code={selected}
        state={stateOf(selected)}
        renewal={renewal}
        canUpdate={canUpdate}
        userName={userName}
        overdue={overdue}
        run={runAndFollow}
        onChanged={changed}
        kycApproved={kycApproved}
        kycLink={kycLink}
      />

      {renewal.backend ? (
        <div className="mt-4">
          <RenewalActions renewal={renewal} step={null} onChanged={changed} />
        </div>
      ) : null}
    </div>
  );
}

function MilestoneDot({ n, state, selected }: { n: number; state: StepState; selected: boolean }) {
  return (
    <span
      className={cn(
        "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-shadow",
        state === "done" && "bg-primary text-primary-foreground",
        (state === "skipped" || state === "not-needed") && "bg-secondary text-muted-foreground ring-1 ring-border",
        state === "current" && "bg-card text-primary ring-2 ring-sky",
        state === "late" && "bg-danger text-white",
        state === "upcoming" && "bg-secondary text-subtle",
        selected && "shadow-[0_0_0_4px_var(--color-pale)]",
      )}
    >
      {state === "done" ? <Check className="size-4" /> : state === "skipped" || state === "not-needed" ? <Minus className="size-4" /> : n}
    </span>
  );
}

/** Across the panel when there is room, a list when it is narrow. */
function MilestoneTracker({
  renewal,
  stateOf,
  selected,
  onSelect,
}: {
  renewal: RenewalCase;
  stateOf: (code: RenewalMilestoneCode) => StepState;
  selected: RenewalMilestoneCode;
  onSelect: (code: RenewalMilestoneCode) => void;
}) {
  const last = RENEWAL_MILESTONES.length - 1;
  return (
    <div className="@container">
      <ol className="mt-6 hidden @3xl:flex">
        {RENEWAL_MILESTONES.map((m, i) => {
          const state = stateOf(m.code);
          const isSelected = selected === m.code;
          return (
            <li key={m.code} className="relative min-w-0 flex-1">
              {i < last ? (
                <span
                  aria-hidden
                  className={cn("absolute top-[22px] left-1/2 h-0.5 w-full", state === "done" || state === "skipped" ? "bg-primary" : "bg-border")}
                />
              ) : null}
              <button
                type="button"
                onClick={() => onSelect(m.code)}
                aria-current={isSelected ? "step" : undefined}
                className={cn(
                  "flex w-full flex-col items-center rounded-xl px-1 pt-1.5 pb-2 text-center transition-colors",
                  isSelected ? "bg-pale" : "hover:bg-secondary/60",
                )}
              >
                <MilestoneDot n={i + 1} state={state} selected={isSelected} />
                <span
                  className={cn(
                    "mt-2 line-clamp-2 text-[11px] leading-tight",
                    state === "upcoming" || state === "not-needed" ? "text-muted-foreground" : "font-medium text-foreground",
                  )}
                >
                  {m.name}
                </span>
                <span className="mt-0.5 text-[10px] text-subtle">{state === "skipped" ? "Skipped" : state === "not-needed" ? "Not needed" : formatDate(milestoneDue(renewal, m))}</span>
              </button>
            </li>
          );
        })}
      </ol>

      <ol className="mt-5 space-y-1 @3xl:hidden">
        {RENEWAL_MILESTONES.map((m, i) => {
          const state = stateOf(m.code);
          return (
            <li key={m.code}>
              <button
                type="button"
                onClick={() => onSelect(m.code)}
                aria-current={selected === m.code ? "step" : undefined}
                className={cn(
                  "grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-1.5 text-left",
                  selected === m.code && "bg-pale",
                )}
              >
                <MilestoneDot n={i + 1} state={state} selected={false} />
                <span className={cn("truncate text-xs", state === "upcoming" || state === "not-needed" ? "text-muted-foreground" : "font-medium")}>{m.name}</span>
                <span className="text-[10px] whitespace-nowrap text-subtle">{state === "skipped" ? "Skipped" : state === "not-needed" ? "Not needed" : formatDate(milestoneDue(renewal, m))}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function Fact({ label, value, danger }: { label: string; value: string; danger?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className={cn("mt-0.5 font-medium", danger && "text-danger")}>{value}</dd>
    </div>
  );
}

function MilestoneDetail({
  code,
  state,
  renewal,
  canUpdate,
  userName,
  overdue,
  run,
  onChanged,
  kycApproved,
  kycLink,
}: {
  code: RenewalMilestoneCode;
  state: StepState;
  renewal: RenewalCase;
  canUpdate: boolean;
  userName: string;
  overdue: number;
  run: Run;
  onChanged: (updated: RenewalCase) => void;
  kycApproved: boolean;
  kycLink?: string;
}) {
  const [note, setNote] = useState("");
  const [evidence, setEvidence] = useState("");
  const [saving, setSaving] = useState(false);
  const index = RENEWAL_MILESTONES.findIndex((x) => x.code === code);
  const m = RENEWAL_MILESTONES[index]!;
  const prev = RENEWAL_MILESTONES[index - 1];
  const done = renewal.completed.find((c) => c.code === code);
  const active = state === "current" || state === "late";
  const blocker = completionBlocker(renewal);
  const kycBlocked = code === "ACCEPTANCE" && !kycApproved;
  const backendActions = !!renewal.backend && (active || renewalActionsFor(renewal, code).length > 0);

  async function complete() {
    if (!note.trim()) {
      toast.error("Add a short note about what was done.");
      return;
    }
    setSaving(true);
    const ok = await run(
      () => completeRenewalMilestone(renewal.id, { note: note.trim(), evidence: evidence.trim() || undefined, completedBy: userName }),
      `${m.name} marked complete.`,
    );
    setSaving(false);
    if (ok) {
      setNote("");
      setEvidence("");
    }
  }

  return (
    <div className={cn("mt-4 overflow-hidden rounded-2xl border", state === "late" ? "border-danger/30" : state === "current" ? "border-sky/40" : "border-border")}>
      <div
        className={cn(
          "border-b px-4 py-4 sm:px-5",
          state === "late" ? "border-danger/30 bg-danger-soft/40" : state === "current" ? "border-sky/30 bg-pale" : "border-border",
        )}
      >
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
          Step {index + 1} of {RENEWAL_MILESTONES.length}
        </p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h3 className="text-lg font-semibold tracking-tight">{m.name}</h3>
          {state === "done" ? (
            <Chip tone="success">Done</Chip>
          ) : state === "skipped" ? (
            <Chip>Skipped</Chip>
          ) : state === "not-needed" ? (
            <Chip>Not needed</Chip>
          ) : state === "current" ? (
            <Chip tone="sky">In progress</Chip>
          ) : state === "late" ? (
            <Chip tone="danger">Overdue {overdue}d</Chip>
          ) : (
            <Chip>Not started</Chip>
          )}
        </div>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <Fact label="Owner" value={m.owner} />
          <Fact label="Due" value={`${formatDate(milestoneDue(renewal, m))} · ${dayLabel(m.offset)}`} danger={state === "late"} />
          <Fact label="Output" value={m.output} />
        </dl>
      </div>

      <div className="space-y-3 px-4 py-4 text-xs sm:px-5">
        {done ? (
          <p className="text-muted-foreground">
            {done.skipped ? "Skipped" : "Done"}
            {done.completedAt ? ` ${formatDate(done.completedAt)}` : ""}
            {done.completedBy ? ` by ${done.completedBy}` : ""}
            {done.evidence ? (
              <span className="ml-1 inline-flex items-center gap-1 text-primary">
                · <FileText className="size-3" /> {done.evidence}
              </span>
            ) : null}
          </p>
        ) : null}

        {backendActions ? (
          <RenewalActions renewal={renewal} step={code} onChanged={onChanged} />
        ) : !renewal.backend && active && canUpdate ? (
          kycBlocked ? (
            <KycBlockedNotice reasons={kycBlockedReasons(["KYC_NOT_READY"])} href={kycLink} />
          ) : blocker ? (
            <p className="text-[11px] text-warning">{blocker}</p>
          ) : code === "APPROVAL" ? (
            <ApprovalRequestBox renewalId={renewal.id} userName={userName} />
          ) : (
            <div className="max-w-xl space-y-2">
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
                <Check className="size-3.5" /> {saving ? "Saving…" : `Mark ${m.name.toLowerCase()} complete`}
              </NavyButton>
            </div>
          )
        ) : state === "not-needed" ? (
          <p className="text-muted-foreground">Marked as not needed. It is skipped when the renewal reaches it.</p>
        ) : state === "upcoming" && prev ? (
          <p className="text-muted-foreground">Starts after {prev.name.toLowerCase()}.</p>
        ) : !done && active ? (
          <p className="text-muted-foreground">Waiting for the {m.owner}.</p>
        ) : null}
      </div>
    </div>
  );
}

/** The Risk and Compliance Manager marks which remaining steps this renewal needs. */
function StepsNeededPanel({ renewal, userName, run, onClose }: { renewal: RenewalCase; userName: string; run: Run; onClose: () => void }) {
  const done = new Set(renewal.completed.map((c) => c.code));
  const remaining = RENEWAL_MILESTONES.filter((m) => !done.has(m.code) && SKIPPABLE_MILESTONES.includes(m.code));
  const [notNeeded, setNotNeeded] = useState<RenewalMilestoneCode[]>(renewal.notNeeded ?? []);
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!reason.trim()) {
      toast.error("Say why these steps are not needed.");
      return;
    }
    setSaving(true);
    const ok = await run(() => setRenewalStepsNotNeeded(renewal, notNeeded, reason, userName), "Steps updated.");
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-border p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Steps this renewal needs</h3>
      <ul className="grid gap-1.5 sm:grid-cols-2">
        {remaining.map((m) => {
          const needed = !notNeeded.includes(m.code);
          return (
            <li key={m.code}>
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-border px-3 py-2 text-xs hover:bg-secondary/60">
                <input
                  type="checkbox"
                  checked={needed}
                  onChange={() => setNotNeeded((all) => (needed ? [...all, m.code] : all.filter((x) => x !== m.code)))}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className={cn(!needed && "text-muted-foreground line-through")}>
                  {RENEWAL_MILESTONES.indexOf(m) + 1}. {m.name}
                </span>
              </label>
            </li>
          );
        })}
      </ul>
      <label className="block text-xs text-muted-foreground">
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Individual client, no visit needed" className={INPUT + " mt-1"} />
      </label>
      <div className="flex justify-between gap-2">
        <OutlineButton onClick={onClose}>Cancel</OutlineButton>
        <NavyButton onClick={save} disabled={saving}>
          {saving ? "Saving…" : "Save steps"}
        </NavyButton>
      </div>
    </div>
  );
}

/** Starts the renewal again from step 1, for example when the client's situation changed. */
function RestartPanel({ renewal, run, onClose }: { renewal: RenewalCase; run: Run; onClose: () => void }) {
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  async function restart() {
    if (!reason.trim()) {
      toast.error("Say why the renewal is restarting.");
      return;
    }
    setSaving(true);
    const ok = await run(() => restartRenewal(renewal, reason), "Renewal restarted from step 1.");
    setSaving(false);
    if (ok) onClose();
  }

  return (
    <div className="mt-4 space-y-3 rounded-2xl border border-border p-4 sm:p-5">
      <h3 className="text-sm font-semibold">Restart this renewal</h3>
      <p className="text-xs text-muted-foreground">All steps go back to not started. Quotes stay on file; the recommendation and client acceptance are cleared.</p>
      <label className="block text-xs text-muted-foreground">
        Reason
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Client changed the cover needed" className={INPUT + " mt-1"} />
      </label>
      <div className="flex justify-between gap-2">
        <OutlineButton onClick={onClose}>Cancel</OutlineButton>
        <NavyButton onClick={restart} disabled={saving}>
          {saving ? "Restarting…" : "Restart renewal"}
        </NavyButton>
      </div>
    </div>
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
          <AmountInput
            value={premium}
            onChange={setPremium}
            placeholder="Premium in RWF, e.g. 15,000,000"
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
            {saving ? "Saving…" : "Add quote"}
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
  onOpenMilestones,
}: {
  renewal: RenewalCase;
  canUpdate: boolean;
  userName: string;
  run: Run;
  /** Backend cases record acceptance on the Milestones tab. */
  onOpenMilestones?: () => void;
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
          {q ? `${q.insurer} · ${formatRwf(q.premium)}` : "Selected option"} · {formatDate(renewal.acceptance.acceptedAt)}
          {renewal.acceptance.recordedBy ? ` · recorded by ${renewal.acceptance.recordedBy}` : ""}
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
            {saving ? "Saving…" : "Record acceptance"}
          </NavyButton>
        </div>
      ) : onOpenMilestones ? (
        <div className="space-y-2 rounded-xl border border-border p-3 text-xs">
          <p className="text-muted-foreground">Not yet accepted. The acceptance is recorded on the client acceptance milestone.</p>
          <NavyButton onClick={onOpenMilestones}>Go to the acceptance milestone</NavyButton>
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