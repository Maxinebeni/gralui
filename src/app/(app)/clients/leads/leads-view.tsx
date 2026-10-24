"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Hourglass, Plus, ShieldCheck, UserPlus } from "lucide-react";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { LeadForm } from "@/components/gral/lead-form";
import { OnboardingHealthChip } from "@/components/gral/onboarding-case";
import {
  CardHeader,
  FloatCard,
  NavyButton,
  SegmentedTabs,
  StatTile,
} from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { listApprovals, listOnboarding } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import {
  ONBOARDING_STEPS,
  ONBOARDING_TARGET_DAYS,
  currentStep,
  isComplete,
  onboardingAge,
  onboardingHealth,
  stepDue,
} from "@/lib/onboarding";
import { onboardingPermissions } from "@/lib/permissions";
import { formatDate } from "@/lib/renewals";
import type { ApprovalRequest, OnboardingCase } from "@/lib/types";

const TABS = ["In progress", "KYC", "Quotes & approval", "Overdue", "Onboarded"] as const;
type Tab = (typeof TABS)[number];

export function LeadsView() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { canRegisterLead } = onboardingPermissions(user);

  const [cases, setCases] = useState<OnboardingCase[]>([]);
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([]);
  const [tab, setTab] = useState<Tab>("In progress");
  const [newOpen, setNewOpen] = useState(false);

  // null while loading; a message when the leads could not be loaded.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    setLoading(true);
    listOnboarding()
      .then((list) => {
        setCases(list);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load the leads."))
      .finally(() => setLoading(false));
    listApprovals()
      .then(setApprovals)
      .catch(() => setApprovals([]));
  }, []);
  useEffect(reload, [reload]);

  const active = cases.filter((c) => !isComplete(c));
  const kycWaiting = active.filter(
    (c) => currentStep(c)?.code === "KYC" && approvals.some((r) => r.id === c.kyc.approvalId && r.status === "PENDING"),
  ).length;
  const overdue = active.filter((c) => onboardingHealth(c) === "overdue").length;
  const avgAge = active.length ? (active.reduce((s, c) => s + onboardingAge(c), 0) / active.length).toFixed(1) : "0";

  const rows = useMemo(() => {
    const by = (codes: string[]) => active.filter((c) => codes.includes(currentStep(c)?.code ?? ""));
    const list =
      tab === "KYC"
        ? by(["KYC"])
        : tab === "Quotes & approval"
          ? by(["QUOTES", "COMPARISON", "APPROVAL"])
          : tab === "Overdue"
            ? active.filter((c) => onboardingHealth(c) === "overdue")
            : tab === "Onboarded"
              ? cases.filter(isComplete)
              : active;
    return [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }, [tab, active, cases]);

  const perStep = ONBOARDING_STEPS.map((s) => ({ step: s, count: active.filter((c) => currentStep(c)?.code === s.code).length }));

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
        <StatTile icon={UserPlus} label="Open Leads" value={String(active.length)} />
        <StatTile icon={ShieldCheck} label="Waiting for KYC Approval" value={String(kycWaiting)} delay={60} />
        <StatTile icon={AlertTriangle} label="Step Overdue" value={String(overdue)} tone="down" delay={120} />
        <StatTile icon={Hourglass} label={`Avg Working Days (target ${ONBOARDING_TARGET_DAYS})`} value={avgAge} delay={180} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <FloatCard className="overflow-hidden" delay={120}>
          <CardHeader title="Lead Pipeline" right={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />} />
          <div className="mt-4 grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-5 sm:pt-0">
            {rows.map((c) => (
              <CaseCard key={c.id} value={c} />
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
                <li key={step.code} className="flex items-center justify-between gap-3 text-xs">
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
        {newOpen ? (
          <LeadForm
            onClose={() => setNewOpen(false)}
            onCreated={(c) => router.push(`/clients/leads/${encodeURIComponent(c.id)}`)}
          />
        ) : null}
      </SlideOver>
    </>
  );
}

function CaseCard({ value: c }: { value: OnboardingCase }) {
  const step = currentStep(c);
  const late = onboardingHealth(c) === "overdue";
  return (
    <Link
      href={`/clients/leads/${encodeURIComponent(c.id)}`}
      className="block w-full rounded-2xl border border-border bg-card p-4 text-left shadow-[var(--shadow-card)] transition-shadow hover:shadow-[var(--shadow-float)]"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold">{c.prospect.name}</p>
          <p className="text-[11px] text-muted-foreground">
            {c.id} · {c.prospect.type} · {c.prospect.sector}
          </p>
          <p className="text-[11px] text-subtle">{c.accountExecutive}</p>
        </div>
        <div className="text-right">
          <p className={cn("text-2xl leading-none font-semibold", onboardingAge(c) > ONBOARDING_TARGET_DAYS && "text-danger")}>
            {onboardingAge(c)}
          </p>
          <p className="text-[10px] text-subtle">working days</p>
        </div>
      </div>
      <div className="mt-4 flex items-center gap-1.5">
        {ONBOARDING_STEPS.map((s, i) => {
          const done = i < c.completed.length;
          const isCurrent = step?.code === s.code;
          return (
            <span
              key={s.code}
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
          {step ? `${step.n}. ${step.name}` : "Onboarded"}
          {step ? <span className="font-normal text-subtle"> · due {formatDate(stepDue(c, step))}</span> : null}
        </p>
        <OnboardingHealthChip value={c} />
      </div>
    </Link>
  );
}