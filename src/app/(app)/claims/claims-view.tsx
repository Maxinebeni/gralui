"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, ClipboardList, Gavel, Layers, Plus, Timer } from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/gral/shell";
import {
  CLAIM_TABS,
  ClaimSlideOver,
  Td,
  Th,
  byUrgency,
  filterClaims,
  useClaims,
  useOpenClaim,
  ClaimsTable,
} from "@/components/gral/claim-list";
import { NewClaimSlideOver } from "@/components/gral/claim-form";
import {
  CardHeader,
  ChartCard,
  Chip,
  DistributionRow,
  FloatCard,
  NavyButton,
  OutlineButton,
  QuickAction,
  QuickActionRow,
  SegmentedBar,
  SegmentedTabs,
  StatTile,
} from "@/components/gral/ui";
import { getClaimMonthly } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import {
  CLAIM_STEP_DEFS,
  claimBlocker,
  claimSla,
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
import type { Claim, ClaimMonth } from "@/lib/types";

const QUEUE_ROWS = 5;

/** Who has to act next on a blocked claim. */
function actionOwner(c: Claim) {
  if (isDisputed(c)) return "Claims Committee (DMD)";
  return nextSigner(c) ?? c.handler;
}

export function ClaimsView() {
  const { user } = useCurrentUser();
  const { canUpdateClaims } = claimPermissions(user.role);
  const { claims, reload } = useClaims();
  const { open, setOpen } = useOpenClaim(claims);
  const [tab, setTab] = useState<(typeof CLAIM_TABS)[number]>("Breached");
  const [newOpen, setNewOpen] = useState(false);
  const [monthly, setMonthly] = useState<ClaimMonth[]>([]);

  useEffect(() => {
    getClaimMonthly().then(setMonthly);
  }, []);

  const openClaims = claims.filter((c) => !isClosed(c));
  const rows = useMemo(() => filterClaims(claims, tab).sort(byUrgency), [claims, tab]);
  const blocked = useMemo(
    () => openClaims.filter((c) => claimBlocker(c) !== null).sort(byUrgency),
    [openClaims],
  );

  const breached = openClaims.filter((c) => claimSla(c) === "breached").length;
  const approaching = openClaims.filter((c) => claimSla(c) === "approaching").length;
  const awaitingSignOff = openClaims.filter((c) => nextSigner(c) !== null).length;
  const escalations = openClaims.filter(needsEscalation).length;
  const disputes = openClaims.filter(isDisputed).length;
  const avgDays = openClaims.length
    ? (openClaims.reduce((s, c) => s + daysOpen(c), 0) / openClaims.length).toFixed(1)
    : "0";
  const handlers = [...new Set(claims.map((c) => c.handler))].sort();

  const stepSegments = CLAIM_STEP_DEFS.map((s) => ({
    label: s.name,
    value: openClaims.filter((c) => c.step === s.code).length || 0.4,
  }));

  return (
    <>
      <PageHeader
        title="Claims Queue"
        action={
          canUpdateClaims ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setNewOpen(true)}>
              <Plus className="size-4" /> New Claim
            </NavyButton>
          ) : null
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_340px]">
        <StatTile icon={ClipboardList} label="Total Open Claims" value={String(openClaims.length)} />
        <StatTile icon={AlertTriangle} label="SLA Breached" value={String(breached)} tone="down" delay={60} />
        <StatTile icon={CheckCircle2} label="Awaiting Sign-off" value={String(awaitingSignOff)} delay={120} />
        <StatTile icon={Timer} label="Avg Working Days Open" value={avgDays} delay={180} />
        <div className="hidden xl:block" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <FloatCard className="overflow-hidden" delay={120}>
            <CardHeader
              title="Claims Queue"
              right={<SegmentedTabs tabs={CLAIM_TABS} value={tab} onChange={setTab} />}
            />
            <div className="mt-4">
              <ClaimsTable claims={rows.slice(0, QUEUE_ROWS)} onView={setOpen} />
            </div>
            <div className="border-t border-border px-5 py-4 text-center">
              <Link
                href="/claims/all"
                className="text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-70"
              >
                {rows.length > QUEUE_ROWS ? `See all ${rows.length} in this view` : "See all claims"}
              </Link>
            </div>
          </FloatCard>

          <FloatCard className="overflow-hidden" delay={200}>
            <CardHeader title="Needs Action" right={<Chip tone="neutral">{blocked.length} blocked</Chip>} />
            <div className="mt-4 overflow-x-auto px-2 pb-4">
              <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr className="bg-pale text-[11px] text-muted-foreground">
                    <Th className="rounded-l-xl">Claim</Th>
                    <Th>Step</Th>
                    <Th>Blocker</Th>
                    <Th>Who acts</Th>
                    <Th>Working days waiting</Th>
                    <Th className="rounded-r-xl">Next Action</Th>
                  </tr>
                </thead>
                <tbody>
                  {blocked.map((c) => (
                    <tr key={c.id}>
                      <Td>
                        <span className="flex items-center gap-2 text-xs font-medium whitespace-nowrap">
                          <span className="size-1.5 rounded-full bg-sky" />
                          {c.id}
                        </span>
                      </Td>
                      <Td className="text-xs whitespace-nowrap">{stageLabel(c)}</Td>
                      <Td className="max-w-[220px] text-xs">{claimBlocker(c)}</Td>
                      <Td className="text-xs whitespace-nowrap">{actionOwner(c)}</Td>
                      <Td className="text-xs">{workingDaysBetween(isDisputed(c) ? c.dispute!.raisedAt : c.stepStartedAt, todayIso())} d</Td>
                      <Td>
                        <NavyButton onClick={() => setOpen(c)}>Open</NavyButton>
                      </Td>
                    </tr>
                  ))}
                  {blocked.length === 0 ? (
                    <tr>
                      <Td className="text-xs text-muted-foreground" colSpan={6}>
                        Nothing is blocked right now.
                      </Td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </FloatCard>
        </div>

        <div className="min-w-0 space-y-4">
          <QuickAction delay={160}>
            <QuickActionRow
              icon={AlertTriangle}
              text={`${escalations} ${escalations === 1 ? "claim" : "claims"} with no insurer response for 15+ working days`}
              action={<OutlineButton onClick={() => setTab("Escalation")}>Review</OutlineButton>}
            />
            <QuickActionRow
              icon={Gavel}
              tone="success"
              tinted
              text={`${disputes} ${disputes === 1 ? "dispute" : "disputes"} waiting for the Claims Committee`}
              action={<NavyButton onClick={() => setTab("Disputed")}>View</NavyButton>}
            />
          </QuickAction>

          <FloatCard className="p-5" delay={220}>
            <h2 className="text-base font-semibold tracking-tight">SLA Status Distribution</h2>
            <DistributionRow
              items={[
                { label: "Breached", value: String(breached), tone: "danger" },
                { label: "Approaching", value: String(approaching), tone: "warning" },
                { label: "Within SLA", value: String(openClaims.length - breached - approaching) },
              ]}
            />
          </FloatCard>

          <FloatCard className="p-5" delay={280}>
            <h2 className="text-base font-semibold tracking-tight">Claims by Step</h2>
            <div className="mt-4">
              <SegmentedBar segments={stepSegments} />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Layers className="size-3.5 text-sky" /> GRAL 6-step claims process, plus Claims Committee disputes
            </p>
          </FloatCard>

          <ChartCard
            delay={340}
            title="Claims Count & Amount per Month"
            legend={[
              { label: "Claim amount (RWF m)", tone: "sky" },
              { label: "Count of claims", tone: "primary" },
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
                  tick={{ fontSize: 10, fill: "var(--subtle)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 11 }} />
                <Line yAxisId="left" type="monotone" dataKey="amount" stroke="var(--sky)" strokeWidth={2} dot={false} name="Claim amount (RWF m)" />
                <Line yAxisId="right" type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={false} name="Count of claims" />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      <ClaimSlideOver claim={open} onClose={() => setOpen(null)} onChanged={reload} />
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
