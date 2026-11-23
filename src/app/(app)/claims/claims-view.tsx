"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Gavel, Plus } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/gral/shell";
import { FilterMenu } from "@/components/gral/filter-menu";
import { DATE_RANGE_OPTIONS, withinRange, type DateRange } from "@/lib/date-range";
import {
  ClaimPage,
  HeadGap,
  HeadRow,
  Td,
  Th,
  byUrgency,
  downloadClaims,
  filterClaims,
  type ClaimTab,
  useClaimFilters,
  useClaims,
  useOpenClaim,
  ClaimsTable,
} from "@/components/gral/claim-list";
import { NewClaimSlideOver } from "@/components/gral/claim-form";
import {
  CardHeader,
  ChartCard,
  Chip,
  FloatCard,
  Loader,
  NavyButton,
  OutlineButton,
  PageLoader,
  QuickAction,
  QuickActionRow,
  SegmentedTabs,
  StatTile,
} from "@/components/gral/ui";
import { claimsPerMonth } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import {
  claimBlocker,
  daysOpen,
  isClosed,
  isDisputed,
  needsEscalation,
  nextSigner,
  stageLabel,
  workingDaysBetween,
} from "@/lib/claims";
import { claimPermissions } from "@/lib/permissions";
import { todayIso } from "@/lib/renewals";
import type { Claim } from "@/lib/types";

const QUEUE_ROWS = 5;
const QUEUE_TABS = ["Open", "High Priority", "Missing Docs", "Escalation", "Disputed"] as const;

/** Who has to act next on a blocked claim. */
function actionOwner(c: Claim) {
  if (isDisputed(c)) return "Claims Committee (DMD)";
  return nextSigner(c) ?? c.handler;
}

export function ClaimsView() {
  const { user } = useCurrentUser();
  const { canUpdateClaims } = claimPermissions(user.role);
  const { claims: allClaims, loaded, reload } = useClaims();
  // Until the claims arrive, the tiles show "…" instead of a misleading 0.
  const shown = (n: number | string) => (loaded ? String(n) : "…");
  const { open, openId, backHref, setOpen } = useOpenClaim(allClaims);
  // Date reported filter; applies to the tiles, the queue and Needs Action.
  const [range, setRange] = useState<DateRange>("all");
  const { matching, pills } = useClaimFilters(allClaims);
  const claims = useMemo(() => matching.filter((c) => withinRange(c.dateReported, range)), [matching, range]);
  const [tab, setTab] = useState<ClaimTab>("Open");
  const [newOpen, setNewOpen] = useState(false);
  const monthly = useMemo(() => claimsPerMonth(allClaims), [allClaims]);

  const openClaims = claims.filter((c) => !isClosed(c));
  const rows = useMemo(() => filterClaims(claims, tab).sort(byUrgency), [claims, tab]);
  const blocked = useMemo(
    () => openClaims.filter((c) => claimBlocker(c) !== null).sort(byUrgency),
    [openClaims],
  );

  const awaitingSignOff = openClaims.filter((c) => nextSigner(c) !== null).length;
  const escalations = openClaims.filter(needsEscalation).length;
  const disputes = openClaims.filter(isDisputed).length;
  const avgDays = openClaims.length ? openClaims.reduce((s, c) => s + daysOpen(c), 0) / openClaims.length : null;
  const roundedAvgDays = avgDays === null ? null : Number(avgDays.toFixed(1));
  const avgDaysLabel = roundedAvgDays === null ? "—" : `${roundedAvgDays} ${roundedAvgDays === 1 ? "day" : "days"}`;
  const handlers = [...new Set(allClaims.map((c) => c.handler))].sort();

  const activeMonths = monthly.filter((month) => month.count > 0).length;
  const hasQuickActions = loaded && (escalations > 0 || disputes > 0);

  // A claim is a long process, so it opens as its own full page.
  if (openId) {
    if (open) return <ClaimPage claim={open} backHref={backHref} backLabel="Claims Queue" onChanged={reload} />;
    return loaded ? <p className="text-sm text-muted-foreground">This claim could not be found.</p> : <PageLoader label="Loading claim" />;
  }

  return (
    <>
      <PageHeader
        title="Claims Queue"
        extraPills={
          <>
            <FilterMenu
              label="Reported"
              value={range}
              options={DATE_RANGE_OPTIONS}
              onChange={(v) => setRange(v as DateRange)}
            />
            {pills}
          </>
        }
        action={
          canUpdateClaims ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> New Claim
            </NavyButton>
          ) : null
        }
      />

      <div className={`mt-5 grid grid-cols-2 gap-3 sm:gap-4 ${awaitingSignOff > 0 ? "xl:grid-cols-3" : "xl:grid-cols-2"}`}>
        <StatTile label="Open Claims" value={shown(openClaims.length)} onClick={() => setTab("Open")} active={tab === "Open"} />
        {awaitingSignOff > 0 ? (
          <StatTile label="Awaiting Sign-off" value={shown(awaitingSignOff)} delay={60} onClick={() => setTab("Awaiting Sign-off")} active={tab === "Awaiting Sign-off"} />
        ) : null}
        <StatTile label="Avg Working Days Open" value={loaded ? avgDaysLabel : "…"} delay={120} />
      </div>

      <div className={hasQuickActions ? "mt-4 grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_340px]" : "mt-4 grid gap-3 sm:gap-4"}>
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <FloatCard className="overflow-hidden" delay={120}>
            <CardHeader
              title={tab === "Open" ? "Open Claims" : tab === "Awaiting Sign-off" ? "Awaiting Sign-off" : "Claims Queue"}
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <SegmentedTabs tabs={QUEUE_TABS} value={tab as (typeof QUEUE_TABS)[number]} onChange={setTab} />
                  <OutlineButton disabled={rows.length === 0} onClick={() => downloadClaims(rows)}>
                    Download
                  </OutlineButton>
                </div>
              }
            />
            <div className="mt-6">
              <ClaimsTable
                claims={rows.slice(0, QUEUE_ROWS)}
                onView={setOpen}
                emptyMessage={loaded ? "No claims in this view." : <Loader label="Loading claims" />}
              />
            </div>
            <div className="border-t border-border px-5 py-4 text-center">
              <Link
                href={`/claims/all?view=${encodeURIComponent(tab)}`}
                className="text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-70"
              >
                {rows.length > QUEUE_ROWS ? `See all ${rows.length} in this view` : "See all claims"}
              </Link>
            </div>
          </FloatCard>

          <FloatCard className="overflow-hidden" delay={200}>
            <CardHeader title="Needs Action" right={blocked.length ? <Chip tone="warning">{blocked.length} blocked</Chip> : null} />
            {blocked.length === 0 ? (
              <p className="px-4 pt-3 pb-5 text-xs text-muted-foreground sm:px-5">{loaded ? "Nothing is blocked." : <Loader label="Loading claims" />}</p>
            ) : (
              <div className="mt-6 overflow-x-auto px-3 pb-4 sm:px-4">
                <table className="stack-table w-full min-w-[720px] border-separate border-spacing-0 text-left">
                  <thead>
                    <HeadRow>
                      <Th className="rounded-l-xl">Claim</Th>
                      <Th>Step</Th>
                      <Th>Blocker</Th>
                      <Th>Who acts</Th>
                      <Th>Waiting</Th>
                      <Th className="rounded-r-xl" />
                    </HeadRow>
                  </thead>
                  <tbody>
                    <HeadGap colSpan={6} />
                    {blocked.map((c) => (
                      <tr key={c.id}>
                        <Td className="text-sm font-medium whitespace-nowrap">{c.id}</Td>
                        <Td label="Step" className="text-sm whitespace-nowrap">{stageLabel(c)}</Td>
                        <Td label="Blocker" className="max-w-[220px] text-sm">{claimBlocker(c)}</Td>
                        <Td label="Who acts" className="text-sm whitespace-nowrap">{actionOwner(c)}</Td>
                        <Td label="Waiting" className="text-sm whitespace-nowrap">
                          {workingDaysBetween(isDisputed(c) ? c.dispute!.raisedAt : c.stepStartedAt, todayIso())} working days
                        </Td>
                        <Td className="text-right">
                          <NavyButton onClick={() => setOpen(c)}>Open</NavyButton>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </FloatCard>

          {activeMonths >= 3 ? (
            <ChartCard
              delay={260}
              title="Claims per Month"
              legend={[
                { label: "Amount (RWF m)", tone: "sky" },
                { label: "Number of claims", tone: "primary" },
              ]}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} margin={{ top: 4, right: 8, left: -12, bottom: 0 }}>
                  <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="left" tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
                  <YAxis
                    yAxisId="right"
                    orientation="right"
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: "var(--subtle)" }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 11 }} />
                  <Line yAxisId="left" type="monotone" dataKey="amount" stroke="var(--sky)" strokeWidth={2} dot={false} name="Amount (RWF m)" />
                  <Line yAxisId="right" type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={false} name="Number of claims" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}
        </div>

        {hasQuickActions ? (
          <div className="min-w-0 space-y-3 sm:space-y-4">
            <QuickAction delay={160}>
              {escalations > 0 ? (
                <QuickActionRow
                  icon={AlertTriangle}
                  text={`${escalations} ${escalations === 1 ? "claim" : "claims"} with no insurer response for 15+ working days`}
                  action={<OutlineButton onClick={() => setTab("Escalation")}>Review</OutlineButton>}
                />
              ) : null}
              {disputes > 0 ? (
                <QuickActionRow
                  icon={Gavel}
                  tone="success"
                  tinted
                  text={`${disputes} ${disputes === 1 ? "dispute" : "disputes"} waiting for the Claims Committee`}
                  action={<NavyButton onClick={() => setTab("Disputed")}>View</NavyButton>}
                />
              ) : null}
            </QuickAction>
          </div>
        ) : null}
      </div>

      <NewClaimSlideOver
        open={newOpen}
        onClose={() => setNewOpen(false)}
        handlers={handlers}
        onCreated={(c) => {
          reload();
          setOpen(c);
        }}
      />
    </>
  );
}
