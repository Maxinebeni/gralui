"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Stamp,
  Timer,
  UserPlus,
  Wallet,
} from "lucide-react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/gral/shell";
import {
  ChartCard,
  Chip,
  DistributionRow,
  FloatCard,
  NavyButton,
  Person,
  StageBar,
  StatTile,
} from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { formatRwf, timeAgo } from "@/lib/format";
import {
  getClaimMonthly,
  getClaimSteps,
  listApprovals,
  listClaimsSummary,
  listClients,
  listActivity,
  listLeads,
  listRenewals,
} from "@/lib/api";
import { canDecide } from "@/lib/approvals";
import { leadHealth, trackHealth } from "@/lib/onboarding";
import { useCurrentUser } from "@/lib/auth-context";
import { canAccessPath } from "@/lib/permissions";
import { currentMilestone, daysOverdue, daysToExpiry, renewalHealth } from "@/lib/renewals";
import type { ActivityItem, ClaimMonth, ClaimStep, Client, ClientClaim, Lead, PolicyTrack, RenewalCase, Role } from "@/lib/types";

type Tile = { icon: LucideIcon; label: string; value: string; delta?: string; tone?: "up" | "down"; href: string };

type Attention = {
  dot: "red" | "amber" | "blue";
  text: string;
  module: "Claims" | "Clients" | "Renewals";
  when: string;
  action: string;
  href: string;
  kind: "claim" | "approval" | "renewal" | "compliance";
};

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

/** Build the "Needs your attention" list from live data instead of fixed text. */
function buildAttention(claims: ClientClaim[], renewals: RenewalCase[], clients: Client[]): Attention[] {
  const items: Attention[] = [];

  for (const c of claims) {
    if (c.step === 5) {
      items.push({
        dot: "blue",
        text: `${c.id} ${c.client} at settlement (${formatRwf(c.amount)})`,
        module: "Claims",
        when: "Sign-off or payment",
        action: "Open",
        href: `/claims?claim=${encodeURIComponent(c.id)}`,
        kind: "approval",
      });
    } else if (c.sla === "breached") {
      items.push({
        dot: "red",
        text: `${c.id} ${c.client}: claim SLA breached`,
        module: "Claims",
        when: "Overdue",
        action: "Open",
        href: `/claims?claim=${encodeURIComponent(c.id)}`,
        kind: "claim",
      });
    }
  }

  for (const r of renewals) {
    const health = renewalHealth(r);
    const m = currentMilestone(r);
    if (health === "overdue" && m) {
      items.push({
        dot: "red",
        text: `${r.policyId} ${r.client}: renewal step "${m.name}" overdue by ${daysOverdue(r)} days`,
        module: "Renewals",
        when: `${daysOverdue(r)}d overdue`,
        action: "Open",
        href: `/renewals?case=${r.id}`,
        kind: "renewal",
      });
    } else if (health === "due-soon") {
      items.push({
        dot: "amber",
        text: `${r.policyId} ${r.client}: renewal in ${daysToExpiry(r)} days`,
        module: "Renewals",
        when: `${daysToExpiry(r)}d left`,
        action: "Open",
        href: `/renewals?case=${r.id}`,
        kind: "renewal",
      });
    }
  }

  for (const c of clients) {
    for (const d of c.documents) {
      if (d.status === "expired" || d.status === "soon") {
        items.push({
          dot: "amber",
          text: `${c.name}: ${d.name} ${d.status === "expired" ? "expired" : "expires"} ${d.expiry}`,
          module: "Clients",
          when: d.status === "expired" ? "Expired" : "Expiring soon",
          action: "Request",
          href: `/clients?client=${c.id}`,
          kind: "compliance",
        });
      }
    }
  }

  // Most urgent first: red, then blue, then amber.
  const rank = { red: 0, blue: 1, amber: 2 } as const;
  return items.sort((a, b) => rank[a.dot] - rank[b.dot]);
}

/**
 * Each tile and card needs the same access as the page it opens, so people
 * only see figures from parts of the system they work in. Their data is only
 * loaded when it can be shown.
 */
type Access = { claims: boolean; renewals: boolean; clients: boolean; leads: boolean; approvals: boolean };

type TileKey =
  | "openClaims"
  | "slaBreached"
  | "renewals30"
  | "renewalsQuarter"
  | "incompleteFiles"
  | "kycComplete"
  | "kycPending"
  | "docsExpiring"
  | "nonCompliant"
  | "openLeads"
  | "leadsOverdue"
  | "approvalsWaiting"
  | "claimsAwaitingPayment"
  | "premiumDue"
  | "settledThisMonth"
  | "outstandingInvoices";

/** Each role's preferred tiles, first to last. Tiles the person cannot open are skipped and the default list fills the gaps. */
const ROLE_TILES: Partial<Record<Role, TileKey[]>> = {
  MD: ["approvalsWaiting", "openClaims", "renewals30", "openLeads"],
  DMD: ["approvalsWaiting", "openClaims", "renewals30", "openLeads"],
  "Technical Director": ["openClaims", "slaBreached", "approvalsWaiting", "renewals30"],
  "Commercial Director": ["renewalsQuarter", "openLeads", "leadsOverdue", "renewals30"],
  "Finance Director": ["claimsAwaitingPayment", "premiumDue", "settledThisMonth", "outstandingInvoices"],
  "Risk & Compliance Manager": ["kycComplete", "kycPending", "docsExpiring", "nonCompliant"],
  "Claims Manager": ["openClaims", "slaBreached", "approvalsWaiting"],
  "Claims Underwriter": ["openClaims", "slaBreached"],
  "Accounts Executive": ["renewals30", "openLeads", "incompleteFiles", "openClaims"],
  "CRM Manager": ["openLeads", "leadsOverdue", "incompleteFiles", "renewals30"],
  "Client Relation Records Officer": ["incompleteFiles", "docsExpiring", "openLeads"],
  "GI Underwriting Manager": ["renewals30", "openLeads", "openClaims"],
};
const DEFAULT_TILES: TileKey[] = ["openClaims", "slaBreached", "renewals30", "incompleteFiles", "openLeads", "approvalsWaiting"];

export function OverviewView() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const role = user.role;

  const access: Access = {
    claims: canAccessPath(user, "/claims"),
    renewals: canAccessPath(user, "/renewals"),
    clients: canAccessPath(user, "/clients"),
    leads: canAccessPath(user, "/clients/leads"),
    approvals: canAccessPath(user, "/approvals"),
  };
  const { claims: canClaims, renewals: canRenewals, clients: canClients, leads: canLeads, approvals: canApprovals } = access;

  const [claims, setClaims] = useState<ClientClaim[]>([]);
  const [steps, setSteps] = useState<ClaimStep[]>([]);
  const [monthly, setMonthly] = useState<ClaimMonth[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [renewals, setRenewals] = useState<RenewalCase[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [tracks, setTracks] = useState<PolicyTrack[]>([]);
  const [waiting, setWaiting] = useState(0);
  const [activity, setActivity] = useState<ActivityItem[]>([]);

  useEffect(() => {
    if (canClaims) {
      listClaimsSummary().then(setClaims);
      getClaimSteps().then(setSteps);
      getClaimMonthly().then(setMonthly);
    } else {
      setClaims([]);
      setMonthly([]);
    }
    if (canClients) listClients().then(setClients);
    else setClients([]);
    if (canRenewals) listRenewals().then(setRenewals);
    else setRenewals([]);
    if (canLeads) {
      listLeads()
        .then((r) => {
          setLeads(r.leads);
          setTracks(r.tracks);
        })
        .catch(() => setLeads([]));
    } else {
      setLeads([]);
      setTracks([]);
    }
    if (canApprovals) listApprovals().then((list) => setWaiting(list.filter((r) => canDecide(r, role)).length));
    else setWaiting(0);
    if (canClaims || canRenewals) listActivity({ claims: canClaims, renewals: canRenewals }).then((a) => setActivity(a.slice(0, 5)));
    else setActivity([]);
  }, [canClaims, canClients, canRenewals, canLeads, canApprovals, role]);

  const now = new Date();
  const firstName = user.name.split(" ")[0];
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  const breached = claims.filter((c) => c.sla === "breached").length;
  const dueIn30 = renewals.filter((r) => daysToExpiry(r) >= 0 && daysToExpiry(r) <= 30).length;
  const dueIn90 = renewals.filter((r) => daysToExpiry(r) >= 0 && daysToExpiry(r) <= 90);
  const incompleteFiles = clients.filter((c) => c.docsFiled < c.docsTotal).length;
  const kycComplete = clients.filter((c) => c.kyc).length;
  const nonCompliant = clients.filter((c) => c.nonCompliant).length;
  const expiringDocs = clients.flatMap((c) => c.documents).filter((d) => d.status === "soon").length;
  const pipelineValue = claims.reduce((s, c) => s + c.amount, 0);
  const renewalPremium = dueIn90.reduce((s, r) => s + r.premium, 0);
  const completeFiles = clients.filter((c) => c.docsFiled === c.docsTotal && !c.nonCompliant).length;
  const openLeads = leads.filter((l) => l.status === "OPEN");

  const catalog: Record<TileKey, Tile & { needs: keyof Access }> = {
    openClaims: { icon: ClipboardList, label: "Open Claims", value: String(claims.length), href: "/claims", needs: "claims" },
    slaBreached: { icon: AlertTriangle, label: "SLA Breached", value: String(breached), tone: "down", href: "/claims", needs: "claims" },
    renewals30: { icon: CalendarClock, label: "Renewals Due in 30 Days", value: String(dueIn30), href: "/renewals", needs: "renewals" },
    renewalsQuarter: { icon: CalendarClock, label: "Renewals This Quarter", value: String(dueIn90.length), href: "/renewals", needs: "renewals" },
    incompleteFiles: { icon: FileWarning, label: "Clients with Incomplete Files", value: String(incompleteFiles), href: "/clients", needs: "clients" },
    kycComplete: { icon: BadgeCheck, label: "KYC Complete", value: String(kycComplete), href: "/clients", needs: "clients" },
    kycPending: { icon: Timer, label: "KYC Pending", value: String(clients.length - kycComplete), href: "/clients", needs: "clients" },
    docsExpiring: { icon: CalendarClock, label: "Documents Expiring Soon", value: String(expiringDocs), href: "/clients", needs: "clients" },
    nonCompliant: { icon: AlertTriangle, label: "Non-Compliant", value: String(nonCompliant), tone: "down", href: "/clients", needs: "clients" },
    openLeads: { icon: UserPlus, label: "Open Leads", value: String(openLeads.length), href: "/clients/leads", needs: "leads" },
    leadsOverdue: {
      icon: AlertTriangle,
      label: "Onboarding Steps Overdue",
      value: String(openLeads.filter((l) => leadHealth(l) === "overdue").length + tracks.filter((t) => trackHealth(t) === "overdue").length),
      tone: "down",
      href: "/clients/leads",
      needs: "leads",
    },
    approvalsWaiting: { icon: Stamp, label: "Approvals Waiting for You", value: String(waiting), href: "/approvals", needs: "approvals" },
    // Sample values until the finance figures come from the backend.
    claimsAwaitingPayment: { icon: Wallet, label: "Claims Awaiting Payment", value: "RWF 12.7m", href: "/claims", needs: "claims" },
    premiumDue: { icon: Wallet, label: "Premium Due", value: `RWF ${(renewalPremium / 1000000).toFixed(1)}m`, href: "/renewals", needs: "renewals" },
    settledThisMonth: { icon: Wallet, label: "Settled This Month", value: "RWF 31.4m", href: "/claims", needs: "claims" },
    outstandingInvoices: { icon: Wallet, label: "Outstanding Invoices", value: "6", href: "/renewals", needs: "renewals" },
  };
  const tileKeys = [...new Set([...(ROLE_TILES[role as Role] ?? []), ...DEFAULT_TILES])].filter((k) => access[catalog[k].needs]);
  const tiles = tileKeys.slice(0, 4).map((k) => catalog[k]);

  const attention = useMemo(() => {
    let list = buildAttention(claims, renewals, clients);
    if (role === "MD" || role === "DMD") {
      list = [...list].sort((a, b) => Number(b.kind === "approval") - Number(a.kind === "approval"));
    } else if (role === "Technical Director") {
      list = [...list].sort((a, b) => Number(b.module === "Claims") - Number(a.module === "Claims"));
    } else if (role === "Commercial Director") {
      list = [...list].sort((a, b) => Number(b.module === "Renewals") - Number(a.module === "Renewals"));
    } else if (role === "Risk & Compliance Manager") {
      list = list.filter((a) => a.kind === "compliance");
    } else if (role === "Finance Director") {
      list = list.filter((a) => a.kind !== "compliance");
    }
    return list;
  }, [claims, renewals, clients, role]);


  const stepCounts = steps.map((s) => ({
    label: s.name === "FNOL Received" ? "FNOL" : s.name === "Documentation" ? "Docs" : s.name,
    count: claims.filter((c) => c.step === s.n).length,
  }));

  const nothingToShow = !canClaims && !canRenewals && !canClients && !canLeads && !canApprovals;

  return (
    <>
      <PageHeader title={`${greeting(now.getHours())}, ${firstName}`} subtitle={today} />

      {tiles.length > 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {tiles.map((t, i) => (
            <Link key={t.label} href={t.href} className="block">
              <div className="lift-card">
                <StatTile icon={t.icon} label={t.label} value={t.value} delta={t.delta} tone={t.tone} delay={i * 60} />
              </div>
            </Link>
          ))}
        </div>
      ) : null}

      {nothingToShow ? (
        <FloatCard className="mt-5 p-5" delay={60}>
          <h2 className="text-base font-semibold tracking-tight">Your work</h2>
          <p className="mt-2 text-xs text-muted-foreground">
            Your role has no dashboard figures yet. Your tasks are in My Work.
          </p>
          <NavyButton className="mt-3" onClick={() => router.push("/my-work")}>
            Open My Work
          </NavyButton>
        </FloatCard>
      ) : null}

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          {canClaims || canRenewals || canClients ? (
            <FloatCard className="p-4 sm:p-5" delay={120}>
              <h2 className="text-base font-semibold tracking-tight">Needs Your Attention</h2>
              {attention.length === 0 ? (
                <p className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="size-4 text-success" /> You&apos;re all caught up.
                </p>
              ) : (
                <div className="mt-3 divide-y divide-border">
                  {attention.slice(0, 7).map((a) => (
                    <div key={a.text} className="grid gap-2 py-3 first:pt-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          className={cn(
                            "size-2 shrink-0 rounded-full",
                            a.dot === "red" && "bg-danger",
                            a.dot === "amber" && "bg-warning",
                            a.dot === "blue" && "bg-sky",
                          )}
                        />
                        <span className="text-xs text-foreground">{a.text}</span>
                      </div>
                      <div className="flex min-w-0 flex-wrap items-center gap-2 pl-4 sm:shrink-0 sm:justify-end sm:pl-0">
                        <Chip tone="sky">{a.module}</Chip>
                        <span className="text-[11px] text-muted-foreground">{a.when}</span>
                        <NavyButton onClick={() => router.push(a.href)}>{a.action}</NavyButton>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </FloatCard>
          ) : null}

          {canClaims ? (
            <FloatCard className="p-4 sm:p-5" delay={180}>
              <h2 className="text-base font-semibold tracking-tight">Claims Pipeline</h2>
              <div className="mt-4">
                <StageBar stages={stepCounts} onSelect={() => router.push("/claims")} />
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground">Total value in pipeline: {formatRwf(pipelineValue)}</p>
            </FloatCard>
          ) : null}

          {canClaims ? (
            <ChartCard
              delay={280}
              title="Claims per Month"
              legend={[
                { label: "Amount (RWF m)", tone: "sky" },
                { label: "Number of claims", tone: "primary" },
              ]}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthly} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
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
                  <Line yAxisId="left" type="monotone" dataKey="amount" stroke="var(--sky)" strokeWidth={2} dot={false} name="Amount (RWF m)" />
                  <Line yAxisId="right" type="monotone" dataKey="count" stroke="var(--primary)" strokeWidth={2} dot={false} name="Number of claims" />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          ) : null}

          {canRenewals ? (
            <FloatCard className="p-4 sm:p-5" delay={240}>
              <h2 className="text-base font-semibold tracking-tight">Upcoming Renewals (next 90 days)</h2>
              <div className="relative mt-8 mb-2 h-10">
                <div className="absolute top-4 h-0.5 w-full rounded-full bg-border" />
                {renewals
                  .filter((r) => daysToExpiry(r) <= 90)
                  .map((r) => {
                    const pct = (Math.min(Math.max(daysToExpiry(r), 0), 90) / 90) * 100;
                    const health = renewalHealth(r);
                    const tone = health === "overdue" ? "bg-danger" : health === "due-soon" ? "bg-warning" : "bg-primary";
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => router.push(`/renewals?case=${r.id}`)}
                        aria-label={`${r.policyId} ${r.client}`}
                        className="group absolute top-2.5"
                        style={{ left: `calc(${pct}% - 5px)` }}
                      >
                        <span className={cn("block size-2.5 rounded-full ring-2 ring-card", tone)} />
                        <span className="pointer-events-none absolute bottom-6 left-1/2 z-10 hidden w-44 -translate-x-1/2 rounded-xl border border-border bg-card p-2.5 text-left text-[11px] shadow-[var(--shadow-float)] group-hover:block sm:w-56">
                          <span className="block font-medium">{r.policyId}</span>
                          <span className="block text-muted-foreground">{r.client}</span>
                          <span className="block text-muted-foreground">{formatRwf(r.premium)}</span>
                          <span className="block text-muted-foreground">{currentMilestone(r)?.name ?? "Completed"}</span>
                        </span>
                      </button>
                    );
                  })}
                <span className="absolute top-7 left-0 text-[10px] text-subtle">Today</span>
                <span className="absolute top-7 right-0 text-[10px] text-subtle">+90 days</span>
              </div>
              <p className="mt-4 text-[11px] text-muted-foreground">{formatRwf(renewalPremium)} in premium up for renewal</p>
            </FloatCard>
          ) : null}
        </div>

        <div className="min-w-0 space-y-4">
          {canClients ? (
            <FloatCard className="p-5" delay={220}>
              <h2 className="text-base font-semibold tracking-tight">Client File Status</h2>
              <DistributionRow
                items={[
                  { label: "Complete", value: String(completeFiles), tone: "success" },
                  { label: "Partial", value: String(clients.length - completeFiles - nonCompliant), tone: "warning" },
                  { label: "Non-Compliant", value: String(nonCompliant), tone: "danger" },
                ]}
              />
            </FloatCard>
          ) : null}


          {!nothingToShow ? (
            <FloatCard className="p-5" delay={340}>
              <h2 className="text-base font-semibold tracking-tight">Recent Activity</h2>
              {activity.length === 0 ? <p className="mt-4 text-xs text-muted-foreground">Nothing recorded yet.</p> : null}
              <div className="mt-4 space-y-4">
                {activity.map((a, i) => (
                  <Link key={`${a.at}-${i}`} href={a.href} className="block min-w-0 hover:opacity-80">
                    <Person name={a.who} />
                    <p className="mt-1.5 text-[11px] text-muted-foreground">
                      {a.what} · {timeAgo(a.at)}
                    </p>
                  </Link>
                ))}
              </div>
              <Link
                href="/activity"
                className="mt-4 inline-block text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-70"
              >
                View all
              </Link>
            </FloatCard>
          ) : null}
        </div>
      </div>
    </>
  );
}
