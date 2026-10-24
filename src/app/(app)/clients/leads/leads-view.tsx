"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { FilterMenu } from "@/components/gral/filter-menu";
import { LeadForm } from "@/components/gral/lead-form";
import { HealthChip, dateOf } from "@/components/gral/onboarding-ui";
import { CardHeader, FloatCard, NavyButton, SegmentedTabs, StageBar, StatTile } from "@/components/gral/ui";
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
const ALL = "__all__";

type Journey = { lead: Lead; track?: PolicyTrack; policies: number; step: number | null };

export function LeadsView() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { canRegisterLead } = onboardingPermissions(user);

  const [leads, setLeads] = useState<Lead[]>([]);
  const [tracks, setTracks] = useState<PolicyTrack[]>([]);
  const [tab, setTab] = useState<Tab>("In progress");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState(ALL);
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

  const ownerOptions = [
    { value: ALL, label: "Everyone" },
    ...(user.id && leads.some((l) => l.ownerId === user.id) ? [{ value: user.id, label: "My leads" }] : []),
    ...[...new Map(leads.filter((l) => l.ownerId && l.ownerName && l.ownerId !== user.id).map((l) => [l.ownerId!, l.ownerName!])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label })),
  ];

  const journeys: Journey[] = useMemo(
    () =>
      leads
        .filter((lead) => owner === ALL || lead.ownerId === owner)
        .filter((lead) => {
          const q = query.trim().toLowerCase();
          return !q || [lead.name, leadRef(lead.id), lead.contactName, lead.industry, lead.ownerName ?? ""].some((v) => v.toLowerCase().includes(q));
        })
        .map((lead) => {
        const own = tracks.filter((t) => t.leadId === lead.id);
        const track = primaryTrack(own);
        return { lead, track, policies: own.length, step: journeyStep(lead, track) };
      }),
    [leads, tracks, owner, query],
  );
  const closed = (j: Journey) => j.lead.status === "CLOSED_LOST" || j.lead.status === "CANCELLED";
  const active = journeys.filter((j) => j.step !== null && !closed(j));
  const overdue = active.filter((j) => journeyHealth(j.lead, j.track) === "overdue");
  const kycWaiting = active.filter((j) => j.step === 3 && j.track?.kyc?.status === "SUBMITTED").length;

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

  const perStep = JOURNEY_STEPS.map((s) => ({ label: `${s.n}. ${s.name}`, count: active.filter((j) => j.step === s.n).length }));
  const countBy = (key: (j: Journey) => string) =>
    [...active.reduce((m, j) => m.set(key(j), (m.get(key(j)) ?? 0) + 1), new Map<string, number>()).entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  const perOwner = countBy((j) => j.lead.ownerName ?? "Not assigned");
  const perSource = countBy((j) => j.lead.source || "Not recorded");
  const policiesInProgress = active.reduce((n, j) => n + j.policies, 0);

  return (
    <>
      <PageHeader
        title="Leads"
        extraPills={ownerOptions.length > 1 ? <FilterMenu label="Owner" value={owner} options={ownerOptions} onChange={setOwner} /> : null}
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
        <StatTile label="Policies in Progress" value={String(policiesInProgress)} delay={60} />
        <StatTile label="KYC Waiting for Approval" value={String(kycWaiting)} delay={120} />
        <StatTile label="Overdue" value={String(overdue.length)} delay={180} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <FloatCard className="overflow-hidden" delay={120}>
          <CardHeader title="Lead Pipeline" right={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />} />
          <div className="mt-5 px-4 sm:px-5">
            <label className="float-pill flex w-full items-center gap-2 px-3.5 py-2 sm:w-72">
              <Search className="size-3.5 shrink-0 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name, reference or contact"
                aria-label="Search leads"
                className="w-full bg-transparent text-xs outline-none placeholder:text-subtle"
              />
            </label>
          </div>
          <div className="mt-5 grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-5 sm:pt-0">
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
              <p className="py-10 text-center text-xs text-muted-foreground sm:col-span-2">
                {loading ? "Loading leads…" : query ? `No leads match "${query.trim()}".` : "No leads in this view."}
              </p>
            ) : null}
          </div>
        </FloatCard>

        <div className="min-w-0 space-y-4">
          <FloatCard className="p-5" delay={160}>
            <h2 className="text-base font-semibold tracking-tight">Leads by Step</h2>
            <div className="mt-4">
              <StageBar stages={perStep} wideLabels />
            </div>
          </FloatCard>

          {perOwner.length ? (
            <FloatCard className="p-5" delay={200}>
              <h2 className="text-base font-semibold tracking-tight">By Accounts Executive</h2>
              <div className="mt-4">
                <StageBar stages={perOwner} wideLabels />
              </div>
            </FloatCard>
          ) : null}

          {perSource.length ? (
            <FloatCard className="p-5" delay={240}>
              <h2 className="text-base font-semibold tracking-tight">By Source</h2>
              <div className="mt-4">
                <StageBar stages={perSource} wideLabels />
              </div>
            </FloatCard>
          ) : null}
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
