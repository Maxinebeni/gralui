"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { LeadForm } from "@/components/gral/lead-form";
import { HealthChip, dateOf } from "@/components/gral/onboarding-ui";
import { CardHeader, FloatCard, NavyButton, SegmentedTabs, StatTile } from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { listLeads } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import {
  JOURNEY_STEPS,
  ONBOARDING_TARGET_DAYS,
  journeyDue,
  journeyHealth,
  journeyStep,
  leadAge,
  leadRef,
  primaryTrack,
} from "@/lib/onboarding";
import { onboardingPermissions } from "@/lib/permissions";
import type { Lead, PolicyTrack } from "@/lib/types";

const TABS = ["In progress", "KYC", "Quotes & approval", "Overdue", "Onboarded"] as const;
type Tab = (typeof TABS)[number];

/** A lead with the policy track its card shows. */
type Journey = { lead: Lead; track?: PolicyTrack; policies: number; step: number | null };

export function LeadsView() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { canRegisterLead } = onboardingPermissions(user);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [tracks, setTracks] = useState<PolicyTrack[]>([]);
  const [tab, setTab] = useState<Tab>("In progress");
  const [newOpen, setNewOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    listLeads()
      .then((r) => {
        setLeads(r.leads);
        setTracks(r.tracks);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load the leads."))
      .finally(() => setLoading(false));
  }, []);
  useEffect(reload, [reload]);

  const journeys: Journey[] = useMemo(
    () =>
      leads.map((lead) => {
        const own = tracks.filter((t) => t.leadId === lead.id);
        const track = primaryTrack(own);
        return { lead, track, policies: own.length, step: journeyStep(lead, track) };
      }),
    [leads, tracks],
  );
  const closed = (j: Journey) => j.lead.status === "CLOSED_LOST" || j.lead.status === "CANCELLED";
  const active = journeys.filter((j) => j.step !== null && !closed(j));
  const overdue = active.filter((j) => journeyHealth(j.lead, j.track) === "overdue");
  const kycWaiting = active.filter((j) => j.step === 3 && j.track?.kyc?.status === "SUBMITTED").length;
  const avgAge = active.length ? (active.reduce((s, j) => s + leadAge(j.lead), 0) / active.length).toFixed(1) : "0";

  const rows = useMemo(() => {
    const by = (steps: number[]) => active.filter((j) => j.step !== null && steps.includes(j.step));
    const list =
      tab === "KYC"
        ? by([3])
        : tab === "Quotes & approval"
          ? by([6, 7, 8])
          : tab === "Overdue"
            ? overdue
            : tab === "Onboarded"
              ? journeys.filter((j) => j.step === null)
              : active;
    return [...list].sort((a, b) => a.lead.receivedAt.localeCompare(b.lead.receivedAt));
  }, [tab, active, overdue, journeys]);

  const perStep = JOURNEY_STEPS.map((s) => ({ step: s, count: active.filter((j) => j.step === s.n).length }));

  return (
    <>
      <PageHeader
        title="Leads"
        action={
          canRegisterLead ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> New Lead
            </NavyButton>
          ) : null
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Open Leads" value={String(active.length)} />
        <StatTile label="Waiting for KYC Approval" value={String(kycWaiting)} delay={60} />
        <StatTile label="Step Overdue" value={String(overdue.length)} tone="down" delay={120} />
        <StatTile label={`Avg Working Days (target ${ONBOARDING_TARGET_DAYS})`} value={avgAge} delay={180} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <FloatCard className="overflow-hidden" delay={120}>
          <CardHeader title="Lead Pipeline" right={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />} />
          <div className="mt-4 grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-5 sm:pt-0">
            {rows.map((j) => (
              <CaseCard key={j.lead.id} value={j} />
            ))}
            {loadError ? (
              <p className="text-xs text-danger">
                {loadError}{" "}
                <button type="button" onClick={reload} className="text-primary underline underline-offset-2">
                  Try again
                </button>
              </p>
            ) : rows.length === 0 ? (
              <p className="text-xs text-muted-foreground">{loading ? "Loading leads…" : "No leads in this view."}</p>
            ) : null}
          </div>
        </FloatCard>

        <div className="min-w-0 space-y-4">
          <FloatCard className="p-5" delay={160}>
            <h2 className="text-base font-semibold tracking-tight">Leads by Step</h2>
            <ul className="mt-3 space-y-1">
              {perStep.map(({ step, count }) => (
                <li key={step.n} className="flex items-center justify-between gap-3 text-xs">
                  <span className={cn(count ? "text-foreground" : "text-subtle")}>
                    {step.n}. {step.name}
                  </span>
                  <span className={cn("font-semibold", count ? "text-primary" : "text-subtle")}>{count}</span>
                </li>
              ))}
            </ul>
          </FloatCard>
        </div>
      </div>

      <SlideOver open={newOpen} onClose={() => setNewOpen(false)} wide>
        {newOpen ? <LeadForm onClose={() => setNewOpen(false)} onCreated={(l) => router.push(`/clients/leads/${encodeURIComponent(l.id)}`)} /> : null}
      </SlideOver>
    </>
  );
}

function CaseCard({ value: j }: { value: Journey }) {
  const { lead: l, track: t, step } = j;
  const health = journeyHealth(l, t);
  const late = health === "overdue";
  const due = journeyDue(l, t);
  const age = leadAge(l);
  return (
    <Link
      href={`/clients/leads/${encodeURIComponent(l.id)}`}
      className="block w-full rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-float)]"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{l.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {leadRef(l.id)} · {l.type === "INDIVIDUAL" ? "Individual" : "Company"} · {l.industry}
            {j.policies > 1 ? ` · ${j.policies} policies` : ""}
          </p>
          <p className="text-[11px] text-subtle">{l.ownerName ?? "No Accounts Executive yet"}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-2xl leading-none font-semibold", age > ONBOARDING_TARGET_DAYS && "text-danger")}>{age}</p>
          <p className="text-[10px] text-subtle">working days</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        {JOURNEY_STEPS.map((s) => {
          const done = step === null || s.n < step;
          const isCurrent = step === s.n;
          return (
            <span
              key={s.n}
              title={s.name}
              className={cn(
                "size-3 rounded-full",
                done && "bg-primary",
                isCurrent && !late && "bg-card ring-2 ring-sky",
                isCurrent && late && "bg-danger",
                !done && !isCurrent && "bg-secondary",
              )}
            />
          );
        })}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[11px] font-medium">
          {step ? `${step}. ${JOURNEY_STEPS[step - 1]!.name}` : "Onboarded"}
          {step && due ? <span className="font-normal text-subtle"> · due {dateOf(due)}</span> : null}
        </p>
        <HealthChip health={health} />
      </div>
    </Link>
  );
}
