"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/gral/shell";
import { DocumentPanel } from "@/components/gral/documents";
import { Td, Th } from "@/components/gral/claim-list";
import { CardHeader, Chip, FloatCard, NotRecorded, Recorded } from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import { getPolicyDetail } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { recordHref } from "@/lib/links";
import { canAccessPath, documentPermissions } from "@/lib/permissions";
import { daysBetween, formatDate, todayIso } from "@/lib/renewals";
import type { PolicyDetail, PolicyMovementType } from "@/lib/types";

const MOVEMENT_LABEL: Record<PolicyMovementType, string> = {
  NEW: "New business",
  RENEWAL: "Renewal",
  ENDORSEMENT: "Endorsement",
  END_R: "Endorsement (renewal)",
  END_N: "Endorsement (change)",
  CANCELLATION: "Cancellation",
};

const amount = (v: number | null) => (v === null ? <NotRecorded /> : formatRwf(v));
const plain = (v: number | null) => (v === null ? <NotRecorded /> : v.toLocaleString("en-US"));

export function PolicyDetailView({ policyId, policyUuid }: { policyId: string; policyUuid?: string }) {
  const { user } = useCurrentUser();
  const { canUpload, canReplace } = documentPermissions(user);
  const canSeeClaims = canAccessPath(user, "/claims");
  const canSeeRenewals = canAccessPath(user, "/renewals");
  const [detail, setDetail] = useState<PolicyDetail | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getPolicyDetail(policyId, policyUuid)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : "Could not load this policy.");
        setDetail(null);
      });
    return () => {
      cancelled = true;
    };
  }, [policyId, policyUuid]);

  if (detail === undefined) return <p className="text-sm text-muted-foreground">Loading policy…</p>;
  if (detail === null) {
    return (
      <div className="flex justify-center pt-16">
        <div className="float-card max-w-md p-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">{loadError ? "Could not load the policy" : "Policy not found"}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {loadError ?? `No client you can see holds a policy with the number ${policyId}.`}
          </p>
          <Link href="/clients" className="mt-4 inline-block text-sm text-primary underline underline-offset-2">
            Go to Clients
          </Link>
        </div>
      </div>
    );
  }

  const { policy: p, financials: f } = detail;
  const current = detail.periods[0]!;
  const daysLeft = current.to ? daysBetween(todayIso(), current.to) : null;

  return (
    <>
      <Link
        href={`/clients?client=${encodeURIComponent(detail.clientId)}`}
        className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"
      >
        <ArrowLeft className="size-3.5" /> {detail.client}
      </Link>
      <PageHeader title={p.id} subtitle={`${p.classOfInsurance} · ${p.insurer}`} />

      {/* No summary tiles: the money figures stay in the Financials card, not in large type at the top. */}
      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_360px]">
        <div className="min-w-0 space-y-4">
          <FloatCard className="p-4 sm:p-5" delay={120}>
            <h2 className="text-base font-semibold tracking-tight">Financials · current period</h2>
            <dl className="mt-4 divide-y divide-border text-xs">
              <Row label="Sum insured" value={amount(f.sumInsured)} />
              <Row label="Net premium" value={amount(f.netPremium)} />
              <Row label="Total premium" value={amount(f.totalPremium)} />
              <Row label="Amount paid" value={amount(f.amountPaid)} />
              <Row
                label="Balance"
                hint="Total premium − amount paid"
                value={
                  f.balance === null ? (
                    <NotRecorded />
                  ) : f.balance === 0 ? (
                    <Chip tone="success">Paid in full</Chip>
                  ) : f.balance < 0 ? (
                    <span className="text-warning">Overpaid by {formatRwf(-f.balance)}</span>
                  ) : (
                    <span className="font-semibold text-danger">{formatRwf(f.balance)}</span>
                  )
                }
              />
              <Row label="Commission rate" value={f.commissionRate === null ? <NotRecorded /> : `${+(f.commissionRate * 100).toFixed(2)}%`} />
              <Row label="Commission" hint="Net premium × commission rate" value={amount(f.commission)} />
            </dl>
            <p className="mt-3 text-[11px] text-subtle">
              Balance and commission are worked out by the system. Update the terms from the client file (Edit policy).
            </p>
          </FloatCard>

          <FloatCard className="overflow-hidden" delay={180}>
            <CardHeader title="Cover Periods" />
            <div className="mt-4 overflow-x-auto px-2 pb-4">
              <table className="w-full min-w-[680px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr className="bg-pale text-[11px] text-muted-foreground">
                    <Th className="rounded-l-xl">Period</Th>
                    <Th>Movement</Th>
                    <Th>Sum insured</Th>
                    <Th>Net premium</Th>
                    <Th>Total premium</Th>
                    <Th className="rounded-r-xl">Booking note</Th>
                  </tr>
                </thead>
                <tbody>
                  {detail.periods.map((period) => (
                    <tr key={period.periodId}>
                      <Td className="text-xs whitespace-nowrap">
                        {period.from ? formatDate(period.from) : <NotRecorded />} – {period.to ? formatDate(period.to) : <NotRecorded />}
                        {period.current ? (
                          <span className="ml-2">
                            <Chip tone="sky">Current</Chip>
                          </span>
                        ) : null}
                      </Td>
                      <Td className="text-xs whitespace-nowrap">{MOVEMENT_LABEL[period.movement]}</Td>
                      <Td className="text-xs whitespace-nowrap">{plain(period.sumInsured)}</Td>
                      <Td className="text-xs whitespace-nowrap">{plain(period.netPremium)}</Td>
                      <Td className="text-xs whitespace-nowrap">{plain(period.totalPremium)}</Td>
                      <Td className="text-xs whitespace-nowrap"><Recorded value={period.bookingNote} /></Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FloatCard>

          <FloatCard className="p-4 sm:p-5" delay={240}>
            <h2 className="text-base font-semibold tracking-tight">History</h2>
            <ol className="mt-4 space-y-3">
              {detail.movements.map((m) => (
                <li key={m.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3">
                  <span className="mt-1.5 size-1.5 rounded-full bg-sky" />
                  <div className="min-w-0">
                    <p className="text-xs">
                      <span className="font-medium">{MOVEMENT_LABEL[m.type]}</span> · {m.description}
                    </p>
                    <p className="text-[11px] text-subtle">
                      {formatDate(m.date)} · {m.by}
                      {m.evidence ? ` · ${m.evidence}` : ""}
                    </p>
                  </div>
                  {m.premiumChange ? (
                    <span className={cn("text-[11px] font-medium whitespace-nowrap", m.premiumChange < 0 ? "text-success" : "text-foreground")}>
                      {m.premiumChange > 0 ? "+" : "−"}
                      {formatRwf(Math.abs(m.premiumChange))}
                    </span>
                  ) : (
                    <span />
                  )}
                </li>
              ))}
            </ol>
          </FloatCard>
        </div>

        <div className="min-w-0 space-y-4">
          <FloatCard className="p-5" delay={160}>
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base font-semibold tracking-tight">Status</h2>
              <Chip tone={p.status === "Active" ? "success" : p.status === "In Renewal" ? "warning" : "neutral"}>{p.status}</Chip>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {current.from ? formatDate(current.from) : <NotRecorded />} to {current.to ? formatDate(current.to) : <NotRecorded />}
            </p>
            {daysLeft !== null ? (
              <p className={cn("mt-1 text-xs", daysLeft < 0 ? "font-medium text-danger" : "text-muted-foreground")}>
                {daysLeft < 0 ? `Expired ${Math.abs(daysLeft)} days ago` : `${daysLeft} days until renewal`}
              </p>
            ) : null}
            {detail.renewalCaseId && canSeeRenewals ? (
              <Link href={recordHref("RENEWAL", detail.renewalCaseId)} className="mt-3 inline-block text-xs text-primary underline underline-offset-2">
                Open renewal {detail.renewalCaseId}
              </Link>
            ) : null}
          </FloatCard>

          <FloatCard className="p-5" delay={220}>
            <h2 className="text-base font-semibold tracking-tight">Claims on this Policy</h2>
            <div className="mt-3 space-y-2">
              {detail.claims.length === 0 ? <p className="text-xs text-muted-foreground">No claims on this policy.</p> : null}
              {detail.claims.map((c) => {
                const body = (
                  <>
                    <div>
                      <p className="text-xs font-medium">{c.id}</p>
                      <p className="text-[11px] text-muted-foreground">{formatRwf(c.amount)}</p>
                    </div>
                    <Chip tone={c.sla === "breached" ? "danger" : c.sla === "approaching" ? "warning" : "success"}>{c.stage}</Chip>
                  </>
                );
                const className = "flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5";
                return canSeeClaims ? (
                  <Link key={c.id} href={recordHref("CLAIM", c.id)} className={cn(className, "hover:bg-pale/50")}>
                    {body}
                  </Link>
                ) : (
                  <div key={c.id} className={className}>
                    {body}
                  </div>
                );
              })}
            </div>
          </FloatCard>

          <FloatCard className="p-5" delay={280}>
            <DocumentPanel
              subject={{ type: "POLICY", id: p.id }}
              classification="POLICY_SCHEDULE"
              purpose="POLICY_SCHEDULE"
              canUpload={canUpload}
              canReplace={canReplace}
              title="Policy Documents"
              emptyText={p.uuid ? "No files yet. Policy files stay in this tab until the backend accepts policy documents." : "No schedule or endorsement uploaded yet."}
            />
          </FloatCard>
        </div>
      </div>
    </>
  );
}

function Row({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 py-2.5">
      <dt className="text-muted-foreground">
        {label}
        {hint ? <span className="block text-[10px] text-subtle">{hint}</span> : null}
      </dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}