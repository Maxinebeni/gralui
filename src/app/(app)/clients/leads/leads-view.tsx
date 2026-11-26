"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { FilterMenu } from "@/components/gral/filter-menu";
import { usePaged } from "@/components/gral/pager";
import { LeadForm } from "@/components/gral/lead-form";
import { HealthChip, dateOf } from "@/components/gral/onboarding-ui";
import { CardHeader, FloatCard, Loader, NavyButton, SegmentedTabs, StageBar, StatTile } from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { useLeads, useRefresh } from "@/lib/queries";
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
import { BackLink } from "@/components/gral/back-link";

const TABS = ["In progress", "KYC", "Quotes and approval", "Overdue", "Onboarded"] as const;
type Tab = (typeof TABS)[number];

/** Leads shown on the Leads page before "See all". */
const PREVIEW = 4;

/** A lead with the policy track its card shows. */
const ALL = "__all__";

type Journey = { lead: Lead; track?: PolicyTrack; policies: number; step: number | null };

/** The Leads page shows a few leads; `full` is the All Leads page with the whole list. */
export function LeadsView({ full = false }: { full?: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const { canRegisterLead } = onboardingPermissions(user);

  const leadsQuery = useLeads();
  const leads = useMemo(() => leadsQuery.data?.leads ?? [], [leadsQuery.data]);
  const tracks = useMemo(() => leadsQuery.data?.tracks ?? [], [leadsQuery.data]);
  const loading = leadsQuery.isPending;
  const loadError = leadsQuery.error ? (leadsQuery.error instanceof Error ? leadsQuery.error.message : "Could not load the leads.") : null;
  const reload = () => void leadsQuery.refetch();
  const refresh = useRefresh();
  const [tab, setTab] = useState<Tab>(() => TABS.find((t) => t === searchParams.get("view")) ?? "In progress");
  const [query, setQuery] = useState("");
  const [owner, setOwner] = useState(ALL);
  const [newOpen, setNewOpen] = useState(false);

  const ownerOptions = [
    { value: ALL, label: "Everyone" },
    ...(user.id && leads.some((l) => l.ownerId === user.id) ? [{ value: user.id, label: "My leads" }] : []),
    ...[...new Map(leads.filter((l) => l.ownerId && l.ownerName && l.ownerId !== user.id).map((l) => [l.ownerId!, l.ownerName!])).entries()]
      .sort((a, b) => a[1].localeCompare(b[1]))
      .map(([value, label]) => ({ value, label })),
  ];

  const allJourneys: Journey[] = useMemo(
    () =>
      leads
        .map((lead) => {
        const own = tracks.filter((t) => t.leadId === lead.id);
        const track = primaryTrack(own);
        return { lead, track, policies: own.length, step: journeyStep(lead, track) };
      }),
    [leads, tracks],
  );
  const closed = (j: Journey) => j.lead.status === "CLOSED_LOST" || j.lead.status === "CANCELLED";
  const journeys = useMemo(
    () =>
      allJourneys
        .filter((j) => owner === ALL || j.lead.ownerId === owner)
        .filter((j) => {
          const q = query.trim().toLowerCase();
          return !q || [j.lead.name, leadRef(j.lead.id), j.lead.contactName, j.lead.industry, j.lead.ownerName ?? ""].some((v) => v.toLowerCase().includes(q));
        }),
    [allJourneys, owner, query],
  );
  const active = journeys.filter((j) => j.step !== null && !closed(j));
  const allActive = allJourneys.filter((j) => j.step !== null && !closed(j));
  const overdue = active.filter((j) => journeyHealth(j.lead, j.track) === "overdue");
  const kycWaiting = active.filter((j) => j.step === 3 && j.track?.kyc?.status === "SUBMITTED").length;

  const rows = useMemo(() => {
    const by = (steps: number[]) => active.filter((j) => j.step !== null && steps.includes(j.step));
    const list =
      tab === "KYC"
        ? by([3])
        : tab === "Quotes and approval"
          ? by([6, 7, 8])
          : tab === "Overdue"
            ? overdue
            : tab === "Onboarded"
              ? journeys.filter((j) => j.step === null)
              : active;
    return [...list].sort((a, b) => a.lead.receivedAt.localeCompare(b.lead.receivedAt));
  }, [tab, active, overdue, journeys]);
  const { items: pagedRows, pager } = usePaged(rows, { resetKey: tab });
  const shown = full ? pagedRows : rows.slice(0, PREVIEW);

  const perStep = [
    ...JOURNEY_STEPS.map((s) => ({ label: `${s.n}. ${s.name}`, count: allActive.filter((j) => j.step === s.n).length })),
    { label: "Onboarded", count: allJourneys.filter((j) => j.step === null && !closed(j)).length },
    { label: "Closed", count: allJourneys.filter(closed).length },
  ].filter((stage) => stage.count > 0);
  const countBy = (key: (j: Journey) => string) =>
    [...active.reduce((m, j) => m.set(key(j), (m.get(key(j)) ?? 0) + 1), new Map<string, number>()).entries()]
      .map(([label, count]) => ({ label, count }))
      .sort((a, b) => b.count - a.count);
  const perOwner = countBy((j) => j.lead.ownerName ?? "Not assigned");
  const perSource = countBy((j) => j.lead.source || "Not recorded");
  const policiesInProgress = active.reduce((n, j) => n + j.policies, 0);

  return (
    <>
      {full ? (
        <BackLink fallbackHref="/clients/leads" fallbackLabel="Leads" />
      ) : null}
      <PageHeader
        title={full ? "All leads" : "Leads"}
        extraPills={ownerOptions.length > 1 ? <FilterMenu label="Owner" value={owner} options={ownerOptions} onChange={setOwner} /> : null}
        action={
          canRegisterLead ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> New lead
            </NavyButton>
          ) : null
        }
      />

      {full ? null : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatTile label="Open leads" value={String(active.length)} onClick={() => setTab("In progress")} active={tab === "In progress"} />
          <StatTile label="Policies in progress" value={String(policiesInProgress)} delay={60} />
          <StatTile label="KYC waiting for approval" value={String(kycWaiting)} delay={120} onClick={() => setTab("KYC")} active={tab === "KYC"} />
          <StatTile label="Overdue" value={String(overdue.length)} delay={180} onClick={() => setTab("Overdue")} active={tab === "Overdue"} />
        </div>
      )}

      <div className={cn("mt-4 grid items-start gap-3 sm:gap-4", !full && leads.length > 0 && "xl:grid-cols-[minmax(0,1fr)_340px]")}>
        <FloatCard className="overflow-hidden" delay={120}>
          <CardHeader title={full ? `${rows.length} ${rows.length === 1 ? "lead" : "leads"}` : "Lead pipeline"} right={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />} />
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
          <div className={cn("mt-5 grid gap-3 p-4 pt-0 sm:grid-cols-2 sm:gap-4 sm:p-5 sm:pt-0", rows.length === 0 && "block")}>
            {shown.map((j) => (
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
              <p className={cn("text-center text-xs text-muted-foreground", rows.length === 0 ? "py-4" : "py-10 sm:col-span-2")}>
                {loading ? <Loader label="Loading leads" /> : query ? `No leads match "${query.trim()}".` : `No leads in ${tab}.`}
              </p>
            ) : null}
          </div>
          {full ? (
            pager
          ) : (
            <div className="border-t border-border px-5 py-4 text-center">
              <Link
                href={rows.length > PREVIEW ? `/clients/leads/all?view=${encodeURIComponent(tab)}` : "/clients/leads/all"}
                className="text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-70"
              >
                {rows.length > PREVIEW ? `See all ${rows.length} in this view` : "See all leads"}
              </Link>
            </div>
          )}
        </FloatCard>

        {full || leads.length === 0 ? null : (
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <FloatCard className="p-5" delay={160}>
            <h2 className="text-base font-semibold tracking-tight">All leads by step</h2>
            <div className="mt-4">
              <StageBar stages={perStep} wideLabels wrapLabels />
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
              <h2 className="text-base font-semibold tracking-tight">By source</h2>
              <div className="mt-4">
                <StageBar stages={perSource} wideLabels />
              </div>
            </FloatCard>
          ) : null}
        </div>
        )}
      </div>

      <SlideOver open={newOpen} onClose={() => setNewOpen(false)} wide>
        {newOpen ? <LeadForm onClose={() => setNewOpen(false)} onCreated={(l) => {
              refresh("leads");
              router.push(`/clients/leads/${encodeURIComponent(l.id)}`);
            }} /> : null}
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
      className="block w-full min-w-0 rounded-2xl border border-border bg-card p-4 text-left transition-colors hover:border-sky/50"
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
          <p className="text-[10px] whitespace-nowrap text-subtle">working days</p>
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
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
