"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/gral/shell";
import { FilterMenu } from "@/components/gral/filter-menu";
import { RenewalCasePanel, RenewalHealthChip } from "@/components/gral/renewal-case";
import {
  CardHeader,
  Chip,
  DistributionRow,
  FloatCard,
  OutlineButton,
  QuickAction,
  QuickActionRow,
  SegmentedTabs,
  StageBar,
  StatTile,
} from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import { listRenewals } from "@/lib/api";
import {
  RENEWAL_MILESTONES,
  currentMilestone,
  daysOverdue,
  daysToExpiry,
  formatDate,
  renewalHealth,
} from "@/lib/renewals";
import type { RenewalCase } from "@/lib/types";

const TABS = ["Overdue", "Next 30 days", "Next 60 days", "All"] as const;
const ALL = "__all__";

export function RenewalsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openId = searchParams.get("case");

  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [allRenewals, setRenewals] = useState<RenewalCase[]>([]);
  const [insurer, setInsurer] = useState(ALL);

  useEffect(() => {
    listRenewals().then(setRenewals);
  }, []);

  // The insurer filter applies to the whole page, so the counts match the list.
  const renewals = useMemo(
    () => (insurer === ALL ? allRenewals : allRenewals.filter((r) => r.insurer === insurer)),
    [allRenewals, insurer],
  );
  const insurerOptions = [
    { value: ALL, label: "All insurers" },
    ...[...new Set(allRenewals.map((r) => r.insurer))].sort().map((i) => ({ value: i, label: i })),
  ];

  const open = allRenewals.find((r) => r.id === openId) ?? null;
  const setOpen = (r: RenewalCase | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (r) params.set("case", r.id);
    else params.delete("case");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  const replaceCase = (updated: RenewalCase) =>
    setRenewals((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));

  const rows = useMemo(() => {
    const sorted = [...renewals].sort((a, b) => daysToExpiry(a) - daysToExpiry(b));
    if (tab === "Overdue") return sorted.filter((r) => renewalHealth(r) === "overdue");
    if (tab === "Next 30 days") return sorted.filter((r) => daysToExpiry(r) >= 0 && daysToExpiry(r) <= 30);
    if (tab === "Next 60 days") return sorted.filter((r) => daysToExpiry(r) >= 0 && daysToExpiry(r) <= 60);
    return sorted;
  }, [renewals, tab]);

  const overdue = renewals.filter((r) => renewalHealth(r) === "overdue").length;
  const dueIn30 = renewals.filter((r) => daysToExpiry(r) >= 0 && daysToExpiry(r) <= 30).length;
  const onTrack = renewals.filter((r) => renewalHealth(r) === "on-track").length;
  const totalPremium = renewals.reduce((s, r) => s + r.premium, 0);

  // Open renewals by the milestone they are on; finished ones are left out.
  const active = renewals.filter((r) => currentMilestone(r));
  const stage = (from: number, to: number) =>
    active.filter((r) => r.completed.length + 1 >= from && r.completed.length + 1 <= to).length;
  const stageCounts = [
    { label: "Preparation", count: stage(1, 3) },
    { label: "Quotes & approval", count: stage(4, 6) },
    { label: "Placement", count: stage(7, 8) },
    { label: "Delivery", count: stage(9, 10) },
  ];

  const byInsurer = Object.entries(
    renewals.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.insurer]: (acc[r.insurer] ?? 0) + 1 }), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  // A renewal is a long process, so it opens as its own full page.
  if (open) {
    return (
      <>
        <Link
          href={pathname}
          scroll={false}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" /> Renewals
        </Link>
        <FloatCard className="mt-4 overflow-hidden">
          <RenewalCasePanel key={open.id} renewal={open} onChanged={replaceCase} />
        </FloatCard>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Renewals Pipeline"
        extraPills={<FilterMenu label="Insurer" value={insurer} options={insurerOptions} onChange={setInsurer} />}
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Due in 30 Days" value={String(dueIn30)} />
        <StatTile label="Overdue" value={String(overdue)} delay={60} />
        <StatTile label="On Track" value={String(onTrack)} delay={120} />
        <StatTile label="Premium Up for Renewal (RWF)" value={`${(totalPremium / 1000000).toFixed(1)}M`} delay={180} />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <FloatCard className="overflow-hidden" delay={120}>
            <CardHeader title="Renewal Pipeline" right={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />} />
            <div className="mt-4 grid gap-4 p-4 pt-0 sm:grid-cols-2 sm:p-5 sm:pt-0">
              {rows.map((r) => (
                <RenewalCard key={r.id} renewal={r} onOpen={() => setOpen(r)} />
              ))}
              {rows.length === 0 ? <p className="text-xs text-muted-foreground">No renewals in this view.</p> : null}
            </div>
          </FloatCard>
        </div>

        <div className="min-w-0 space-y-4">
          <QuickAction delay={160}>
            <QuickActionRow
              icon={AlertTriangle}
              text={`${overdue} ${overdue === 1 ? "renewal" : "renewals"} with an overdue milestone`}
              action={
                <OutlineButton onClick={() => setTab("Overdue")}>
                  Review
                </OutlineButton>
              }
            />
          </QuickAction>

          <FloatCard className="p-5" delay={220}>
            <h2 className="text-base font-semibold tracking-tight">Renewals by Insurer</h2>
            <DistributionRow items={byInsurer.map(([label, count]) => ({ label, value: String(count) }))} />
          </FloatCard>

          <FloatCard className="p-5" delay={280}>
            <h2 className="text-base font-semibold tracking-tight">Renewals by Stage</h2>
            <div className="mt-4">
              <StageBar stages={stageCounts} />
            </div>
          </FloatCard>

        </div>
      </div>

    </>
  );
}

function RenewalCard({ renewal: r, onOpen }: { renewal: RenewalCase; onOpen: () => void }) {
  const days = daysToExpiry(r);
  const current = currentMilestone(r);
  const late = daysOverdue(r) > 0;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <p className="text-xs font-semibold">{r.policyId}</p>
            <p className="truncate text-[11px] text-muted-foreground">{r.client}</p>
            <p className="text-[11px] break-words text-subtle">
              {r.classOfInsurance} · {r.insurer}
            </p>
          </div>
          <div className="text-right">
            <p className={cn("text-2xl leading-none font-semibold", days < 0 ? "text-danger" : "text-foreground")}>
              {days < 0 ? `−${Math.abs(days)}` : days}
            </p>
            <p className="text-[10px] text-subtle">days to renewal</p>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 text-[11px]">
          <span className="min-w-0 truncate text-muted-foreground">{formatRwf(r.premium)}</span>
          <Chip tone={days < 0 ? "danger" : days <= 30 ? "warning" : "sky"}>{formatDate(r.expiryDate)}</Chip>
        </div>
      </button>

      <div className="mt-4 flex items-center gap-1.5">
        {RENEWAL_MILESTONES.map((m, i) => {
          const done = i < r.completed.length;
          const isCurrent = current?.code === m.code;
          return (
            <button
              key={m.code}
              type="button"
              onClick={onOpen}
              aria-label={`${m.name}${done ? " (done)" : isCurrent ? " (current)" : ""}`}
              title={m.name}
              className={cn(
                "size-3.5 rounded-full transition-transform hover:scale-125",
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
        <p className="text-[11px] font-medium">{current ? current.name : "Completed"}</p>
        <div className="flex items-center gap-2">
          <RenewalHealthChip renewal={r} />
          <span className="text-[11px] text-muted-foreground">
            {r.completed.length} / {RENEWAL_MILESTONES.length}
          </span>
        </div>
      </div>
    </div>
  );
}
