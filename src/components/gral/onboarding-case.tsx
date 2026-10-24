"use client";

// One lead's onboarding (SOP section 3) as a full page: the 11-step tracker,
// the chosen step in detail, and the prospect and history on the side.
// Steps 1 and 2 are the backend's lead; steps 3 to 11 are one policy track.
// When a lead has several policies, tabs above the tracker switch between them.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Plus } from "lucide-react";
import { confirmLead, onboardingOptions, runTrackAction, type LeadDetail, type TrackDetail } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import {
  JOURNEY_PHASES,
  JOURNEY_STEPS,
  KYC_STATUS_LABEL,
  blockerText,
  journeyDue,
  journeyHealth,
  journeyStep,
  leadAge,
  leadReady,
  leadRef,
  trackHealth,
} from "@/lib/onboarding";
import { onboardingPermissions } from "@/lib/permissions";
import { todayIso } from "@/lib/renewals";
import type { Lead, PolicyTrack } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PageHeader } from "./shell";
import { AssessmentForm, AssignForm, ClientForm, CloseLead, ResponseForm, StartTrackForm } from "./lead-forms";
import { ActionForm, Blockers, HealthChip, HistoryList, ProofList, dateOf } from "./onboarding-ui";
import { ActionPanel, OtherActions, STAGE_ACTIONS, StageRecord, type TrackOptions, type TrackRun } from "./track-forms";
import { Chip, FloatCard, OutlineButton, Person } from "./ui";

type StepState = "done" | "current" | "late" | "upcoming";

const RESPONSE_LABELS: Record<string, string> = {
  LEAD_RESPONSE: "First response",
  PRE_MEETING_REQUEST: "Pre-meeting request",
  MEETING_SUMMARY: "Meeting summary",
  MEETING_CONFIRMATION: "Client's confirmation",
};

export function OnboardingCaseView({
  detail,
  track,
  onSelectTrack,
  onChanged,
}: {
  detail: LeadDetail;
  /** The policy track shown in steps 3 to 11, with its history. */
  track: TrackDetail | null;
  onSelectTrack: (id: string) => void;
  onChanged: () => void;
}) {
  const { user } = useCurrentUser();
  const perms = onboardingPermissions(user);
  const { lead: l, tracks } = detail;
  const t = track?.track;
  const current = journeyStep(l, t);
  const [selected, setSelected] = useState(current ?? 11);
  const [adding, setAdding] = useState(false);
  const [options, setOptions] = useState<TrackOptions>({ products: [], insurers: [], accountExecutives: [] });
  useEffect(() => setSelected(current ?? 11), [current, t?.id]);
  useEffect(() => {
    onboardingOptions().then(setOptions);
  }, []);

  const insurerName = (id: string) => options.insurers.find((i) => i.id === id)?.name ?? id;
  const run: TrackRun = async (input) => {
    if (!t) return;
    await runTrackAction(t, input);
    onChanged();
  };
  const stateOf = (n: number): StepState => {
    if (current === null || n < current) return "done";
    if (n > current) return "upcoming";
    return journeyHealth(l, t) === "overdue" ? "late" : "current";
  };
  const due = journeyDue(l, t);
  const history = [...detail.history, ...(track?.history ?? [])].sort((a, b) => b.occurredAt.localeCompare(a.occurredAt));
  const canAddTrack = perms.canStartTrack && leadReady(l) && l.status !== "CLOSED_LOST" && l.status !== "CANCELLED";

  return (
    <>
      <Link href="/clients/leads" className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary">
        <ArrowLeft className="size-3.5" /> Leads
      </Link>
      <PageHeader
        title={l.name}
        subtitle={`${leadRef(l.id)} · ${l.type === "INDIVIDUAL" ? "Individual" : "Company"} · ${l.industry}`}
        action={perms.canCloseLead && l.status === "OPEN" ? <CloseLead lead={l} onChanged={onChanged} /> : null}
      />

      <FloatCard className="mt-5 p-4 sm:p-5" delay={60}>
        {tracks.length > 1 || (t && canAddTrack) ? (
          <div className="mb-4 flex flex-wrap items-center gap-2">
            {tracks.map((x) => (
              <button
                key={x.id}
                type="button"
                onClick={() => onSelectTrack(x.id)}
                className={cn(
                  "rounded-full border px-3 py-1 text-xs",
                  x.id === t?.id ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary",
                )}
              >
                {x.productName}
              </button>
            ))}
            {t && canAddTrack && !adding ? (
              <OutlineButton onClick={() => setAdding(true)}>
                <Plus className="size-3.5" /> Policy
              </OutlineButton>
            ) : null}
          </div>
        ) : null}
        {adding ? (
          <div className="mb-4">
            <StartTrackForm
              lead={l}
              onDone={() => {
                setAdding(false);
                onChanged();
              }}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <HealthChip health={journeyHealth(l, t)} />
          <span className="text-xs text-muted-foreground">
            {current ? (
              <>
                <span className="font-medium text-foreground">{JOURNEY_STEPS[current - 1]!.name}</span>
                {due ? ` · due ${dateOf(due)}` : ""}
              </>
            ) : (
              "Complete"
            )}
          </span>
        </div>

        <StepTracker stateOf={stateOf} selected={selected} onSelect={setSelected} />
      </FloatCard>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <StepDetail
          n={selected}
          state={stateOf(selected)}
          lead={l}
          track={t}
          kyc={detail.kyc ?? t?.kyc ?? null}
          due={selected === current ? due : undefined}
          perms={perms}
          options={options}
          insurerName={insurerName}
          run={run}
          onChanged={onChanged}
          onSelect={setSelected}
        />

        <div className="min-w-0 space-y-4">
          {current === null && t?.convertedAt ? (
            <FloatCard className="bg-success-soft/40 p-5" delay={140}>
              <p className="text-sm font-semibold">Onboarding complete</p>
              {t.policyId ? (
                <Link
                  href={`/policies/${encodeURIComponent(t.policyId)}`}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2"
                >
                  Open the policy <ExternalLink className="size-3" />
                </Link>
              ) : null}
            </FloatCard>
          ) : null}

          <FloatCard className="p-5" delay={160}>
            <h2 className="text-base font-semibold tracking-tight">Prospect</h2>
            <dl className="mt-3 space-y-2.5 text-xs">
              <Detail label="Accounts Executive" value={l.ownerName ? <Person name={l.ownerName} /> : <span className="text-subtle">Not assigned</span>} />
              <Detail
                label="Contact"
                value={
                  <>
                    <span className="block">{l.contactName}</span>
                    {l.email ? <span className="block text-muted-foreground">{l.email}</span> : null}
                    {l.phone ? <span className="block text-muted-foreground">{l.phone}</span> : null}
                  </>
                }
              />
              <Detail label="Industry" value={l.industry} />
              <Detail label="Source" value={[l.source, l.sourceReference].filter(Boolean).join(": ")} />
              <Detail label="Received" value={dateOf(l.receivedAt)} />
              {l.status === "OPEN" ? <Detail label="Working days" value={String(leadAge(l))} /> : null}
              {l.clientName ? <Detail label="Client" value={l.clientName} /> : null}
            </dl>
          </FloatCard>

          {t ? <OtherActions track={t} options={options} insurerName={insurerName} run={run} /> : null}
          {tracks.length ? (
            <FloatCard className="p-5" delay={180}>
              <h2 className="text-base font-semibold tracking-tight">Policies</h2>
              <ul className="mt-3 divide-y divide-border">
                {tracks.map((x) => {
                  const done = x.status === "COMPLETED";
                  const closed = x.status === "CLOSED_LOST" || x.status === "CANCELLED";
                  return (
                    <li key={x.id}>
                      <button
                        type="button"
                        onClick={() => onSelectTrack(x.id)}
                        className={cn("flex w-full items-center justify-between gap-3 py-2.5 text-left", x.id === t?.id && "font-medium")}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs">{x.productName ?? "Policy"}</span>
                          <span className="block text-[11px] text-muted-foreground">
                            {done ? "Placed" : closed ? "Closed" : `${x.stage}. ${JOURNEY_STEPS[x.stage - 1]?.name ?? ""}`}
                          </span>
                        </span>
                        {done ? <Chip tone="success">Done</Chip> : closed ? <Chip>Closed</Chip> : <HealthChip health={trackHealth(x)} />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </FloatCard>
          ) : null}

          <FloatCard className="p-5" delay={200}>
            <h2 className="text-base font-semibold tracking-tight">History</h2>
            <HistoryList items={history} />
          </FloatCard>
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[110px_minmax(0,1fr)] gap-3">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="min-w-0">{value}</dd>
    </div>
  );
}

function StepDot({ n, state, selected }: { n: number; state: StepState; selected: boolean }) {
  return (
    <span
      className={cn(
        "relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-shadow",
        state === "done" && "bg-primary text-primary-foreground",
        state === "current" && "bg-card text-primary ring-2 ring-sky",
        state === "late" && "bg-danger text-white",
        state === "upcoming" && "bg-secondary text-subtle",
        selected && "shadow-[0_0_0_4px_var(--color-pale)]",
      )}
    >
      {state === "done" ? <Check className="size-4" /> : n}
    </span>
  );
}

/** The 11 steps: across the page on wide screens, a list on phones. */
function StepTracker({ stateOf, selected, onSelect }: { stateOf: (n: number) => StepState; selected: number; onSelect: (n: number) => void }) {
  return (
    <>
      <div className="mt-6 hidden gap-3 md:flex">
        {JOURNEY_PHASES.map((phase) => (
          <div key={phase.name} className="min-w-0" style={{ flex: phase.steps.length }}>
            <ol className="flex">
              {phase.steps.map((n, i) => {
                const step = JOURNEY_STEPS[n - 1]!;
                const state = stateOf(n);
                const isSelected = selected === n;
                return (
                  <li key={n} className="relative min-w-0 flex-1">
                    {n < JOURNEY_STEPS.length ? (
                      <span
                        aria-hidden
                        className={cn(
                          "absolute top-[22px] left-1/2 h-0.5 w-full",
                          state === "done" ? "bg-primary" : "bg-border",
                          i === phase.steps.length - 1 && "w-[calc(100%+0.75rem)]",
                        )}
                      />
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onSelect(n)}
                      aria-current={isSelected ? "step" : undefined}
                      className={cn(
                        "flex w-full flex-col items-center rounded-xl px-1 pt-1.5 pb-2 text-center transition-colors",
                        isSelected ? "bg-pale" : "hover:bg-secondary/60",
                      )}
                    >
                      <StepDot n={n} state={state} selected={isSelected} />
                      <span
                        className={cn(
                          "mt-2 line-clamp-2 text-[11px] leading-tight",
                          state === "upcoming" ? "text-muted-foreground" : "font-medium text-foreground",
                        )}
                      >
                        {step.name}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </div>
        ))}
      </div>

      <div className="mt-5 space-y-1 md:hidden">
        {JOURNEY_STEPS.map((step) => {
          const state = stateOf(step.n);
          return (
            <button
              key={step.n}
              type="button"
              onClick={() => onSelect(step.n)}
              aria-current={selected === step.n ? "step" : undefined}
              className={cn("grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 rounded-xl px-2 py-1.5 text-left", selected === step.n && "bg-pale")}
            >
              <StepDot n={step.n} state={state} selected={false} />
              <span className={cn("truncate text-xs", state === "upcoming" ? "text-muted-foreground" : "font-medium")}>{step.name}</span>
            </button>
          );
        })}
      </div>
    </>
  );
}

type Perms = ReturnType<typeof onboardingPermissions>;

function StepDetail({
  n,
  state,
  lead: l,
  track: t,
  kyc,
  due,
  perms,
  options,
  insurerName,
  run,
  onChanged,
  onSelect,
}: {
  n: number;
  state: StepState;
  lead: Lead;
  track?: PolicyTrack;
  kyc: LeadDetail["kyc"];
  due?: string;
  perms: Perms;
  options: TrackOptions;
  insurerName: (id: string) => string;
  run: TrackRun;
  onChanged: () => void;
  onSelect: (n: number) => void;
}) {
  const step = JOURNEY_STEPS[n - 1]!;
  const prev = JOURNEY_STEPS[n - 2];
  const next = JOURNEY_STEPS[n];
  const active = state === "current" || state === "late";
  const open = l.status === "OPEN" || l.status === "CONVERTED";
  const onTrack = !!t && n >= 3 && t.stage === n && t.status === "OPEN";
  const actions = active && onTrack ? (STAGE_ACTIONS[n] ?? []).filter((a) => t!.availableActions.includes(a)) : [];
  const ownerName = step.owner.replace(
    "Underwriting Manager",
    t?.underwritingRole === "MEDICAL_UNDERWRITING_MANAGER" ? "Medical Underwriting Manager" : "GI Underwriting Manager",
  );

  return (
    <FloatCard className="overflow-hidden" delay={120}>
      <div
        className={cn(
          "border-b px-4 py-4 sm:px-6 sm:py-5",
          state === "late" ? "border-danger/30 bg-danger-soft/40" : state === "current" ? "border-sky/30 bg-pale" : "border-border",
        )}
      >
        <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Step {n} of 11</p>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold tracking-tight">{step.name}</h2>
          {state === "done" ? (
            <Chip tone="success">Done</Chip>
          ) : state === "current" ? (
            <Chip tone="sky">In progress</Chip>
          ) : state === "late" ? (
            <Chip tone="danger">Overdue</Chip>
          ) : (
            <Chip>Not started</Chip>
          )}
        </div>
        <dl className="mt-4 grid gap-3 text-xs sm:grid-cols-3">
          <Fact label="Owner" value={ownerName} />
          {due ? <Fact label="Due" value={dateOf(due)} danger={state === "late"} /> : null}
        </dl>
      </div>

      <div className="space-y-4 px-4 py-5 sm:px-6">
        {n === 1 && l.ownerName ? (
          <p className="text-sm">
            {l.ownerName} assigned{l.confirmed ? " · registration confirmed" : ""}
          </p>
        ) : null}
        {n === 2 ? (
          <div className="space-y-2 text-xs">
            {l.respondedAt ? <p>First response on {dateOf(l.respondedAt)}</p> : null}
            {l.assessment ? (
              <>
                <p>
                  <span className="text-muted-foreground">Needs: </span>
                  {l.assessment.needs}
                </p>
                <p>
                  <span className="text-muted-foreground">Assets: </span>
                  {l.assessment.assets}
                  {l.assessment.employeeCount ? ` · ${l.assessment.employeeCount} staff` : ""}
                </p>
                <p>
                  <span className="text-muted-foreground">Existing cover: </span>
                  {l.assessment.existingCover}
                </p>
              </>
            ) : null}
            <ProofList items={[...(l.responseEvidence ? [l.responseEvidence] : []), ...(l.assessment?.evidence ?? [])]} labels={RESPONSE_LABELS} />
            {l.clientName ? <p>Client: {l.clientName}</p> : null}
          </div>
        ) : null}
        {n === 3 ? <KycBlock lead={l} kyc={kyc} canRead={perms.canReadKyc} /> : null}
        {n >= 4 && t && n <= t.stage ? <StageRecord track={t} n={n} insurerName={insurerName} /> : null}

        {active && open ? (
          <div className="space-y-3">
            {onTrack && t!.blockers.length ? <Blockers codes={t!.blockers} /> : null}
            {n === 1 && !l.ownerId ? perms.canAssignLead ? <AssignForm lead={l} onDone={onChanged} /> : <Waiting who="CRM Manager" /> : null}
            {n === 1 && l.ownerId && !l.confirmed ? (
              perms.canConfirmLead ? (
                <ActionForm
                  submitLabel="Confirm the registration"
                  success="Registration confirmed."
                  onSubmit={async () => {
                    await confirmLead(l);
                    onChanged();
                  }}
                />
              ) : (
                <Waiting who="Commercial Director" />
              )
            ) : null}
            {n === 2 && !l.respondedAt ? perms.canAssessLead ? <ResponseForm lead={l} onDone={onChanged} /> : <Waiting who="Accounts Executive" /> : null}
            {n === 2 && l.respondedAt && !l.assessed ? perms.canAssessLead ? <AssessmentForm lead={l} onDone={onChanged} /> : <Waiting who="Accounts Executive" /> : null}
            {n === 2 && l.assessed && !l.clientId ? perms.canAssessLead ? <ClientForm lead={l} onDone={onChanged} /> : <Waiting who="Accounts Executive" /> : null}
            {n === 3 && !t ? perms.canStartTrack ? <StartTrackForm lead={l} onDone={onChanged} onCancel={() => undefined} /> : <Waiting who="Accounts Executive" /> : null}
            {actions.map((a) => (
              <ActionPanel key={a} action={a} track={t!} options={options} insurerName={insurerName} run={run} leadName={l.name} />
            ))}
            {onTrack && n === 7 && t!.availableActions.includes("QUOTE") && t!.invitations.some((i) => !i.response) ? (
              <ActionPanel action="INSURER_RESPONSE" track={t!} options={options} insurerName={insurerName} run={run} leadName={l.name} collapsed />
            ) : null}
            {onTrack &&
            (n === 6 || (n === 7 && t!.blockers.includes("SINGLE_SOURCE_APPROVAL_REQUIRED"))) &&
            !t!.approvalRequests.SINGLE_SOURCE &&
            (t!.availableActions.includes("RFQ") || t!.availableActions.includes("QUOTE")) ? (
              <ActionPanel action="SINGLE_SOURCE" track={t!} options={options} insurerName={insurerName} run={run} leadName={l.name} collapsed />
            ) : null}
            {onTrack && !actions.length && !t!.blockers.length ? <Waiting who={ownerName} /> : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-border px-4 py-3 sm:px-6">
        {prev ? (
          <OutlineButton onClick={() => onSelect(prev.n)}>
            <ArrowLeft className="size-3.5" /> <span className="hidden sm:inline">{prev.name}</span>
            <span className="sm:hidden">Previous</span>
          </OutlineButton>
        ) : (
          <span />
        )}
        {next ? (
          <OutlineButton onClick={() => onSelect(next.n)}>
            <span className="hidden sm:inline">{next.name}</span>
            <span className="sm:hidden">Next</span> <ArrowRight className="size-3.5" />
          </OutlineButton>
        ) : null}
      </div>
    </FloatCard>
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

function Waiting({ who }: { who: string }) {
  return <p className="text-xs text-muted-foreground">Waiting for the {who}.</p>;
}

/** Step 3: the client's KYC, shared by all of the client's policies. */
function KycBlock({ lead, kyc, canRead }: { lead: Lead; kyc: LeadDetail["kyc"]; canRead: boolean }) {
  if (!lead.clientId) return null;
  const status = kyc?.status ?? "NOT_STARTED";
  const approved = kyc?.gateStatus === "READY";
  const deadline = (kyc?.revisedDueAt ?? kyc?.dueAt)?.slice(0, 10);
  const late = !approved && !!deadline && deadline < todayIso();
  return (
    <div className="space-y-2 rounded-xl bg-secondary/60 px-4 py-3 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">Client KYC</span>
        <Chip tone={approved ? "success" : status === "REJECTED" || late ? "danger" : status === "NOT_STARTED" ? "neutral" : "warning"}>
          {KYC_STATUS_LABEL[status] ?? status}
        </Chip>
      </div>
      {kyc?.missingRequirements.length ? (
        <p>
          <span className="text-muted-foreground">Missing: </span>
          {kyc.missingRequirements.join(", ")}
        </p>
      ) : null}
      {!approved && kyc?.gateStatus && kyc.gateStatus !== status ? <p className="text-muted-foreground">{blockerText(kyc.gateStatus)}</p> : null}
      {canRead ? (
        <Link
          href={`/clients/kyc/${encodeURIComponent(kyc?.caseId ?? lead.clientId)}`}
          className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2"
        >
          {kyc?.caseId ? "Open the KYC review" : "Start the KYC review"} <ExternalLink className="size-3" />
        </Link>
      ) : null}
    </div>
  );
}
