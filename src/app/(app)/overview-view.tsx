"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/gral/shell";
import {
  ChartCard,
  Chip,
  DistributionRow,
  FloatCard,
  NavyButton,
  Person,
  SegmentedTabs,
  StageBar,
  StatTile,
} from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { formatRwf, timeAgo } from "@/lib/format";
import { activityFrom, toClaimSummary } from "@/lib/api";
import { useClaims, useClients, useRenewals } from "@/lib/queries";
import { isClosed } from "@/lib/claims";
import { useCurrentUser } from "@/lib/auth-context";
import { canAccessPath } from "@/lib/permissions";
import { currentMilestone, daysBetween, daysOverdue, daysToExpiry, formatDate, renewalHealth, todayIso } from "@/lib/renewals";
import {
  claimsByStatus,
  claimsOpenedThisMonth,
  clientsByCategory,
  expiringBetween,
  hasActivePolicy,
  inForce,
  newThisMonth,
  overdueClaims,
  overdueRenewals,
  policyRows,
  settledPerMonth,
  topClientsByPremium,
  unpaidPolicies,
  type PolicyRow,
} from "@/lib/dashboard";
import type { ActivityItem, Claim, Client, ClientClaim, RenewalCase, Role } from "@/lib/types";

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

/** GRAL's three dashboard views. Each needs the same access as the page it reports on. */
const VIEWS = ["Renewals", "Clients", "Claims"] as const;
type View = (typeof VIEWS)[number];

/** Roles that open on Claims; everyone else opens on Renewals, the view GRAL said matters most. */
const CLAIMS_FIRST: readonly Role[] = ["Technical Director", "Claims Manager", "Claims Underwriter"];

const clientHref = (id: string) => `/clients?client=${encodeURIComponent(id)}`;

export function OverviewView() {
  const router = useRouter();
  const { user } = useCurrentUser();
  const role = user.role;

  const canClaims = canAccessPath(user, "/claims");
  const canRenewals = canAccessPath(user, "/renewals");
  const canClients = canAccessPath(user, "/clients");

  // Everything comes from the shared lists, so the pages behind these cards open at once.
  // Renewal figures are worked out from client policies, so they need the client list too.
  const claimsQuery = useClaims(canClaims);
  const clientsQuery = useClients("", canClients || canRenewals);
  const renewalsQuery = useRenewals(canRenewals);

  const allClaims: Claim[] = useMemo(() => (canClaims ? (claimsQuery.data ?? []) : []), [canClaims, claimsQuery.data]);
  const openClaims: ClientClaim[] = useMemo(() => allClaims.filter((c) => !isClosed(c)).map(toClaimSummary), [allClaims]);
  const clients: Client[] = useMemo(() => clientsQuery.data ?? [], [clientsQuery.data]);
  const renewals: RenewalCase[] = useMemo(() => (canRenewals ? (renewalsQuery.data ?? []) : []), [canRenewals, renewalsQuery.data]);
  const activity: ActivityItem[] = useMemo(() => activityFrom(allClaims, renewals).slice(0, 5), [allClaims, renewals]);

  const views = VIEWS.filter((v) => (v === "Renewals" ? canRenewals : v === "Clients" ? canClients : canClaims));
  const preferred: View = CLAIMS_FIRST.includes(role as Role) ? "Claims" : "Renewals";
  const [picked, setPicked] = useState<View | null>(null);
  const view = picked && views.includes(picked) ? picked : views.includes(preferred) ? preferred : views[0];

  const attention = useMemo(() => {
    let list = buildAttention(openClaims, renewals, canClients ? clients : []);
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
  }, [openClaims, renewals, clients, canClients, role]);

  const now = new Date();
  const firstName = user.name.split(" ")[0];
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title={`${greeting(now.getHours())}, ${firstName}`} subtitle={today} />

      {views.length > 1 ? (
        <div className="mt-5 grid justify-items-start">
          <SegmentedTabs tabs={views} value={view!} onChange={setPicked} />
        </div>
      ) : null}

      {view === "Renewals" ? <RenewalsView clients={clients} /> : null}
      {view === "Clients" ? <ClientsView clients={clients} /> : null}
      {view === "Claims" ? <ClaimsView claims={allClaims} /> : null}

      {!view ? (
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

      {view ? (
        <Row>
          <FloatCard className="p-4 sm:p-5" delay={300}>
            <h2 className="text-base font-semibold tracking-tight">Needs Your Attention</h2>
            {attention.length === 0 ? (
              <p className="mt-4 text-xs text-muted-foreground">You&apos;re all caught up.</p>
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
                      <span className="text-sm text-foreground">{a.text}</span>
                    </div>
                    <div className="flex min-w-0 flex-wrap items-center gap-2 pl-4 sm:shrink-0 sm:justify-end sm:pl-0">
                      <Chip tone="sky">{a.module}</Chip>
                      <span className="text-xs text-muted-foreground">{a.when}</span>
                      <NavyButton onClick={() => router.push(a.href)}>{a.action}</NavyButton>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </FloatCard>

          <FloatCard className="p-5" delay={340}>
            <h2 className="text-base font-semibold tracking-tight">Recent Activity</h2>
            {activity.length === 0 ? <p className="mt-4 text-xs text-muted-foreground">Nothing recorded yet.</p> : null}
            <div className="mt-4 space-y-4">
              {activity.map((a, i) => (
                <Link key={`${a.at}-${i}`} href={a.href} className="block min-w-0 hover:opacity-80">
                  <Person name={a.who} />
                  <p className="mt-1.5 text-xs text-muted-foreground">
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
        </Row>
      ) : null}

      {view === "Claims" ? <SettledChart claims={allClaims} /> : null}
    </>
  );
}

/* ---------------------------------- Shared ----------------------------------- */

function Tiles({ items }: { items: { label: string; value: number | string; href: string }[] }) {
  return (
    <div className={cn("mt-4 grid gap-4 sm:grid-cols-2", items.length === 5 ? "xl:grid-cols-5" : "xl:grid-cols-4")}>
      {items.map((t, i) => (
        <Link key={t.label} href={t.href} className="block">
          <div className="lift-card">
            <StatTile label={t.label} value={String(t.value)} delay={i * 50} />
          </div>
        </Link>
      ))}
    </div>
  );
}

/** Every row below the tiles: a wide card on the left and a side card on the right. */
function Row({ children }: { children: ReactNode }) {
  return <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">{children}</div>;
}

function SectionCard({
  title,
  delay = 0,
  className,
  children,
}: {
  title: ReactNode;
  delay?: number;
  className?: string;
  children: ReactNode;
}) {
  return (
    <FloatCard className={cn("p-4 sm:p-5", className)} delay={delay}>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="mt-3">{children}</div>
    </FloatCard>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="py-2 text-xs text-muted-foreground">{children}</p>;
}

/** A short list for the side cards: name and chip on top, details underneath. */
function SideList<T>({
  rows,
  title,
  chip,
  detail,
  href,
  empty,
}: {
  rows: T[];
  title: (row: T) => string;
  chip: (row: T) => ReactNode;
  detail: (row: T) => string;
  href: (row: T) => string;
  empty: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <ul className="divide-y divide-border text-sm">
      {rows.map((r, i) => (
        <li key={i}>
          <Link href={href(r)} className="block py-2.5 hover:bg-secondary/50">
            <span className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate font-medium">{title(r)}</span>
              {chip(r)}
            </span>
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">{detail(r)}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

/** A list that is a table on wide screens and stacked rows on phones. */
function Rows<T>({
  head,
  rows,
  cols,
  cells,
  href,
  empty,
}: {
  head: string[];
  rows: T[];
  /** Grid template for wide screens. */
  cols: string;
  cells: (row: T) => ReactNode[];
  href: (row: T) => string;
  empty: string;
}) {
  if (rows.length === 0) return <Empty>{empty}</Empty>;
  return (
    <div className="text-sm">
      <div className="hidden gap-3 border-b border-border pb-2 text-[11px] font-medium text-muted-foreground sm:grid" style={{ gridTemplateColumns: cols }}>
        {head.map((h) => (
          <span key={h}>{h}</span>
        ))}
      </div>
      <ul className="divide-y divide-border">
        {rows.map((r, i) => (
          <li key={i}>
            <Link
              href={href(r)}
              className="grid grid-cols-2 gap-x-3 gap-y-1 py-2.5 hover:bg-secondary/50 sm:grid-cols-[var(--cols)] sm:items-center"
              style={{ ["--cols" as string]: cols }}
            >
              {cells(r).map((c, j) => (
                <span key={j} className={cn("min-w-0 truncate", j === 0 && "col-span-2 font-medium sm:col-span-1")}>
                  {c}
                </span>
              ))}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DaysChip({ days }: { days: number }) {
  if (days < 0) return <Chip tone="danger">{-days}d overdue</Chip>;
  if (days === 0) return <Chip tone="danger">Today</Chip>;
  return <Chip tone={days <= 14 ? "danger" : days <= 30 ? "warning" : "neutral"}>{days}d left</Chip>;
}

const POLICY_HEAD = ["Client", "Policy number", "Class", "Expiry date", ""];
const POLICY_COLS = "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,0.9fr) 6.5rem";
const policyCells = (r: PolicyRow) => [r.client, r.policy.id, r.policy.classOfInsurance, formatDate(r.expiry), <DaysChip key="d" days={r.daysLeft} />];

/* --------------------------------- Renewals ---------------------------------- */

function RenewalsView({ clients }: { clients: Client[] }) {
  const today = todayIso();
  const rows = useMemo(() => policyRows(clients, today), [clients, today]);
  const due30 = expiringBetween(rows, 0, 30);
  const due60 = expiringBetween(rows, 31, 60);
  const overdue = overdueRenewals(rows);
  const unpaid = unpaidPolicies(rows, today);

  return (
    <>
      <Tiles
        items={[
          { label: "Total Active Policies", value: inForce(rows).length, href: "/clients" },
          { label: "Expiring in Next 30 Days", value: due30.length, href: "/renewals" },
          { label: "Expiring in 31-60 Days", value: due60.length, href: "/renewals" },
          { label: "Overdue Renewals", value: overdue.length, href: "/renewals" },
          { label: "Unpaid Policies", value: unpaid.length, href: "/clients" },
        ]}
      />

      <Row>
        <SectionCard title="Expiring in the Next 30 Days" delay={120}>
          <Rows head={POLICY_HEAD} rows={due30} cols={POLICY_COLS} cells={policyCells} href={(r) => clientHref(r.clientId)} empty="None." />
        </SectionCard>
        <SectionCard title="Overdue Renewals" delay={160}>
          <SideList
            rows={overdue}
            title={(r) => r.client}
            chip={(r) => <DaysChip days={r.daysLeft} />}
            detail={(r) => `${r.policy.id} · ${r.policy.classOfInsurance} · expired ${formatDate(r.expiry)}`}
            href={(r) => clientHref(r.clientId)}
            empty="None."
          />
        </SectionCard>
      </Row>

      <Row>
        <SectionCard title="Expiring in 31-60 Days" delay={200}>
          <Rows head={POLICY_HEAD} rows={due60} cols={POLICY_COLS} cells={policyCells} href={(r) => clientHref(r.clientId)} empty="None." />
        </SectionCard>
        <SectionCard title="Unpaid Policies" delay={240}>
          <SideList
            rows={unpaid}
            title={(r) => r.client}
            chip={(r) => <span className="shrink-0 font-medium">{formatRwf(r.balance ?? 0)}</span>}
            detail={(r) => `${r.policy.id} · cover started ${r.policy.start}`}
            href={(r) => clientHref(r.clientId)}
            empty="None."
          />
        </SectionCard>
      </Row>
    </>
  );
}

/* ---------------------------------- Clients ---------------------------------- */

function ClientsView({ clients }: { clients: Client[] }) {
  const today = todayIso();
  const active = clients.filter((c) => hasActivePolicy(c, today));
  const noPolicy = clients.filter((c) => !hasActivePolicy(c, today));
  const fresh = newThisMonth(clients, today);
  const top = topClientsByPremium(clients, 15, today);
  const categories = clientsByCategory(clients);
  const completeFiles = clients.filter((c) => c.docsFiled === c.docsTotal && !c.nonCompliant).length;
  const nonCompliant = clients.filter((c) => c.nonCompliant).length;

  return (
    <>
      <Tiles
        items={[
          { label: "Total Active Clients", value: active.length, href: "/clients" },
          { label: "New Clients This Month", value: fresh.length, href: "/clients" },
          { label: "Clients with No Active Policy", value: noPolicy.length, href: "/clients" },
          { label: "SLA Agreements Due", value: "–", href: "/clients" },
        ]}
      />

      <Row>
        <SectionCard title="Top Clients by Premium" delay={120}>
          <Rows
            head={["#", "Client", "Category", "Premium"]}
            rows={top.map((t, i) => ({ ...t, rank: i + 1 }))}
            cols="2rem minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)"
            cells={(t) => [t.rank, t.client.name, t.client.type, <span key="p" className="font-medium">{formatRwf(t.premium)}</span>]}
            href={(t) => clientHref(t.client.id)}
            empty="None."
          />
        </SectionCard>

        <div className="min-w-0 space-y-4">
          <SectionCard title="Clients by Category" delay={160}>
            <StageBar wideLabels stages={categories} />
          </SectionCard>
          <SectionCard title="Client File Status" delay={200}>
            <DistributionRow
              items={[
                { label: "Complete", value: String(completeFiles), tone: "success" },
                { label: "Partial", value: String(clients.length - completeFiles - nonCompliant), tone: "warning" },
                { label: "Non-Compliant", value: String(nonCompliant), tone: "danger" },
              ]}
            />
          </SectionCard>
        </div>
      </Row>

      <Row>
        <SectionCard title="Clients with No Active Policy" delay={240}>
          <Rows
            head={["Client", "Category", "Account manager"]}
            rows={noPolicy}
            cols="minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.2fr)"
            cells={(c) => [c.name, c.type, c.manager || "Not assigned"]}
            href={(c) => clientHref(c.id)}
            empty="None."
          />
        </SectionCard>
        <SectionCard title="SLA Agreements Due for Renewal" delay={280}>
          <Empty>Not recorded yet.</Empty>
        </SectionCard>
      </Row>
    </>
  );
}

/* ---------------------------------- Claims ----------------------------------- */

function ClaimsView({ claims }: { claims: Claim[] }) {
  const router = useRouter();
  const today = todayIso();
  const open = claims.filter((c) => !isClosed(c));
  const overdue = overdueClaims(claims, today);
  const monthly = settledPerMonth(claims, 6, today);

  return (
    <>
      <Tiles
        items={[
          { label: "Total Open Claims", value: open.length, href: "/claims" },
          { label: "Claims Opened This Month", value: claimsOpenedThisMonth(claims, today).length, href: "/claims" },
          { label: "Overdue Claims", value: overdue.length, href: "/claims" },
          { label: "Claims Settled This Month", value: monthly.at(-1)?.count ?? 0, href: "/claims" },
        ]}
      />

      <Row>
        <SectionCard title="Overdue Claims" delay={120}>
          <Rows
            head={["Claim", "Client", "Class", "Reported", ""]}
            rows={overdue}
            cols="minmax(0,1fr) minmax(0,1.6fr) minmax(0,1.2fr) minmax(0,0.9fr) 6.5rem"
            cells={(c) => [
              c.id,
              c.client,
              c.classOfInsurance,
              formatDate(c.dateReported),
              <Chip key="d" tone="danger">
                {daysBetween(c.dateReported, today)} days open
              </Chip>,
            ]}
            href={(c) => `/claims?claim=${encodeURIComponent(c.id)}`}
            empty="None."
          />
        </SectionCard>
        <SectionCard title="Claims by Status" delay={160}>
          <StageBar wideLabels stages={claimsByStatus(claims)} onSelect={() => router.push("/claims")} />
        </SectionCard>
      </Row>
    </>
  );
}

/** Sits below Needs Your Attention and Recent Activity on the Claims view. */
function SettledChart({ claims }: { claims: Claim[] }) {
  const monthly = settledPerMonth(claims, 6, todayIso());
  return (
    <div className="mt-4">
      <ChartCard delay={380} title="Claims Settled per Month" legend={[]} height={200}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "var(--secondary)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 11 }} />
            <Bar dataKey="count" name="Claims settled" fill="var(--primary)" radius={[6, 6, 0, 0]} maxBarSize={36} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
