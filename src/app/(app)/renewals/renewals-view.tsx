"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, Coins, Timer } from "lucide-react";
import { toast } from "sonner";
import { Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { RenewalCasePanel, RenewalHealthChip } from "@/components/gral/renewal-case";
import {
  CardHeader,
  ChartCard,
  Chip,
  DistributionRow,
  FilterPill,
  FloatCard,
  NavyButton,
  OutlineButton,
  QuickAction,
  QuickActionRow,
  SegmentedBar,
  SegmentedTabs,
  StatTile,
} from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import { getRenewalMonthly, listRenewals } from "@/lib/api";
import {
  RENEWAL_MILESTONES,
  currentMilestone,
  daysOverdue,
  daysToExpiry,
  formatDate,
  renewalHealth,
} from "@/lib/renewals";
import type { RenewalCase, RenewalMonth } from "@/lib/types";

const TABS = ["Overdue", "Next 30 days", "Next 60 days", "All"] as const;

export function RenewalsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openId = searchParams.get("case");

  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const [renewals, setRenewals] = useState<RenewalCase[]>([]);
  const [monthly, setMonthly] = useState<RenewalMonth[]>([]);

  useEffect(() => {
    listRenewals().then(setRenewals);
    getRenewalMonthly().then(setMonthly);
  }, []);

  const open = renewals.find((r) => r.id === openId) ?? null;
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
  const awaitingAcceptance = renewals.filter((r) => currentMilestone(r)?.code === "ACCEPTANCE" && !r.acceptance).length;

  const stage = (from: number, to: number) =>
    renewals.filter((r) => r.completed.length + 1 >= from && r.completed.length + 1 <= to).length || 0.4;
  const stageSegments = [
    { label: "1–3 Preparation", value: stage(1, 3) },
    { label: "4–6 Quotes & approval", value: stage(4, 6) },
    { label: "7–8 Placement", value: stage(7, 8) },
    { label: "9–10 Delivery", value: stage(9, 10) },
  ];

  const byInsurer = Object.entries(
    renewals.reduce<Record<string, number>>((acc, r) => ({ ...acc, [r.insurer]: (acc[r.insurer] ?? 0) + 1 }), {}),
  )
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return (
    <>
      <PageHeader
        title="Renewals Pipeline"
        extraPills={
          <>
            <FilterPill label="Insurer" value="All insurers" />
            <FilterPill label="Days to renewal" value="120 days" />
          </>
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_340px]">
        <StatTile icon={CalendarClock} label="Due in 30 Days" value={String(dueIn30)} delta="4.0%" />
        <StatTile icon={AlertTriangle} label="Overdue" value={String(overdue)} delta="1.0%" tone="down" delay={60} />
        <StatTile icon={CheckCircle2} label="On Track" value={String(onTrack)} delta="5.5%" delay={120} />
        <StatTile
          icon={Coins}
          label="Premium Up for Renewal"
          value={`RWF ${(totalPremium / 1000000).toFixed(1)}m`}
          delta="7.4%"
          delay={180}
        />
        <div className="hidden xl:block" />
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
            <QuickActionRow
              icon={CheckCircle2}
              tone="success"
              tinted
              text={`${awaitingAcceptance} ${awaitingAcceptance === 1 ? "quote" : "quotes"} awaiting client decision`}
              action={
                <NavyButton onClick={() => toast.success(`Reminder sent to ${awaitingAcceptance} client(s).`)}>
                  Send Reminder
                </NavyButton>
              }
            />
          </QuickAction>

          <FloatCard className="p-5" delay={220}>
            <h2 className="text-base font-semibold tracking-tight">Renewals by Insurer</h2>
            <DistributionRow items={byInsurer.map(([label, count]) => ({ label, value: String(count) }))} />
          </FloatCard>

          <FloatCard className="p-5" delay={280}>
            <h2 className="text-base font-semibold tracking-tight">Policies by Milestone Stage</h2>
            <div className="mt-4">
              <SegmentedBar segments={stageSegments} />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Timer className="size-3.5 text-sky" /> GRAL renewal process, Day −120 to delivery
            </p>
          </FloatCard>

          <ChartCard
            delay={340}
            title="Premium Up for Renewal per Month"
            legend={[
              { label: "Premium (RWF m)", tone: "sky" },
              { label: "Policies", tone: "primary" },
            ]}
          >
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={monthly} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 10, fill: "var(--subtle)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 11 }} />
                <Bar yAxisId="left" dataKey="premium" name="Premium (RWF m)" fill="var(--sky)" radius={[6, 6, 0, 0]} barSize={14} />
                <Line yAxisId="right" type="monotone" dataKey="policies" name="Policies" stroke="var(--primary)" strokeWidth={2} dot={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      <SlideOver open={!!open} onClose={() => setOpen(null)}>
        {open ? (
          <RenewalCasePanel key={open.id} renewal={open} onClose={() => setOpen(null)} onChanged={replaceCase} />
        ) : null}
      </SlideOver>
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
