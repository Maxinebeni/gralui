"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { KycBadge } from "@/components/gral/kyc-badge";
import { PageHeader, SlideOver } from "@/components/gral/shell";
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
  claimStatus,
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
  title: string;
  detail: string;
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
        title: c.client,
        detail: `Claim ${c.id} · Settlement · ${formatRwf(c.amount)}`,
        module: "Claims",
        when: "Sign-off or payment",
        action: "Open",
        href: `/claims?claim=${encodeURIComponent(c.id)}`,
        kind: "approval",
      });
    } else if (c.sla === "breached") {
      items.push({
        dot: "red",
        title: c.client,
        detail: `Claim ${c.id} · SLA breached`,
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
        title: r.client,
        detail: `${m.name} · ${r.policyId}`,
        module: "Renewals",
        when: `${daysOverdue(r)}d overdue`,
        action: "Open",
        href: `/renewals?case=${r.id}`,
        kind: "renewal",
      });
    } else if (health === "due-soon") {
      items.push({
        dot: "amber",
        title: r.client,
        detail: `${r.policyId} · Renewal coming up`,
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
          title: c.name,
          detail: `${d.name} · ${d.status === "expired" ? "Expired" : "Expires"} ${d.expiry}`,
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
    } else if (role === "Risk and Compliance Manager") {
      list = list.filter((a) => a.kind === "compliance");
    } else if (role === "Finance Director") {
      list = list.filter((a) => a.kind !== "compliance");
    }
    return list;
  }, [openClaims, renewals, clients, canClients, role]);
  const activity: ActivityItem[] = useMemo(() => activityFrom(allClaims, renewals).slice(0, 5), [allClaims, renewals]);
  const visibleAttention = view === "Clients"
    ? attention.filter((item) => item.module === "Clients")
    : view === "Claims"
      ? attention.filter((item) => item.module === "Claims")
      : attention;

  const now = new Date();
  const firstName = user.name.split(" ")[0];
  const today = now.toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <>
      <PageHeader title={`${greeting(now.getHours())}, ${firstName}`} subtitle={today} />

      {views.length > 1 ? (
        <div className="mt-4 grid justify-items-start">
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
            Open my work
          </NavyButton>
        </FloatCard>
      ) : null}

      {view ? (
        <Row>
          {visibleAttention.length === 0 ? (
            <div className="h-fit rounded-2xl border border-border bg-card px-4 py-3 text-sm text-muted-foreground">
              You&apos;re all caught up.
            </div>
          ) : (
          <FloatCard className="p-4 sm:p-5" delay={300}>
            <h2 className="text-base font-semibold tracking-tight">Needs your attention</h2>
            <div className="mt-3 divide-y divide-border">
              {visibleAttention.slice(0, 7).map((a) => (
                <div key={`${a.module}:${a.title}:${a.detail}`} className="grid gap-2 py-3 first:pt-1 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        a.dot === "red" && "bg-danger",
                        a.dot === "amber" && "bg-warning",
                        a.dot === "blue" && "bg-sky",
                      )}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground" title={a.title}>{a.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground" title={a.detail}>{a.detail}</span>
                    </span>
                  </div>
                  <div className="flex min-w-0 flex-wrap items-center gap-2 pl-4 sm:shrink-0 sm:justify-end sm:pl-0">
                    <Chip tone="sky">{a.module}</Chip>
                    <span className="text-xs text-muted-foreground">{a.when}</span>
                    <NavyButton onClick={() => router.push(a.href)}>{a.action}</NavyButton>
                  </div>
                </div>
              ))}
            </div>
          </FloatCard>
          )}
          <FloatCard className="p-4 sm:p-5" delay={340}>
            <h2 className="text-base font-semibold tracking-tight">Recent activity</h2>
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
            <Link href="/activity" className="mt-4 inline-block text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-70">
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

/* -------------------------------- Drill-downs -------------------------------- */
// Each figure opens the exact records it counts, in a side panel that follows the
// URL (?show=due-30), so the Back button closes it and the view can be shared.

type Drill = { title: string; count: number; body: ReactNode; more?: { href: string; label: string } };

const showHref = (key: string) => `/?show=${encodeURIComponent(key)}`;

function DrillPanel({ drills }: { drills: Record<string, Drill> }) {
  const router = useRouter();
  const show = useSearchParams().get("show");
  const d = show ? drills[show] : undefined;
  const close = () => router.replace("/", { scroll: false });
  return (
    <SlideOver open={!!d} onClose={close}>
      {d ? (
        <div>
          <div className="flex items-start justify-between gap-3 border-b border-border px-5 pt-7 pb-5 sm:px-8">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold tracking-tight">{d.title}</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {d.count} {d.count === 1 ? "record" : "records"}
              </p>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={close}
              className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>
          <div className="px-5 py-5 sm:px-8">
            {d.body}
            {d.more ? (
              <Link href={d.more.href} className="mt-5 inline-block text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-70">
                {d.more.label}
              </Link>
            ) : null}
          </div>
        </div>
      ) : null}
    </SlideOver>
  );
}

const CLIENT_HEAD = ["Client", "Category", "Account manager", "KYC"];
const CLIENT_COLS = "minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.2fr) 6.5rem";
const clientCells = (c: Client) => [
  c.name,
  c.type,
  c.manager || "Not assigned",
  <KycBadge key="k" short kyc={c.kyc} status={c.kycStatus} gateStatus={c.kycGateStatus} />,
];

const CLAIM_HEAD = ["Claim", "Client", "Class", "Reported", "Status"];
const CLAIM_COLS = "minmax(0,1fr) minmax(0,1.6fr) minmax(0,1.2fr) minmax(0,0.9fr) 7.5rem";
const claimCells = (c: Claim) => [c.id, c.client, c.classOfInsurance, formatDate(c.dateReported), <Chip key="s">{claimStatus(c)}</Chip>];
const claimHref = (c: Claim) => `/claims?claim=${encodeURIComponent(c.id)}`;

function clientDrill(title: string, list: Client[]): Drill {
  return {
    title,
    count: list.length,
    body: <Rows head={CLIENT_HEAD} rows={list} cols={CLIENT_COLS} cells={clientCells} href={(c) => clientHref(c.id)} empty="None." />,
    more: { href: "/clients", label: "Open clients" },
  };
}

function claimDrill(title: string, list: Claim[]): Drill {
  return {
    title,
    count: list.length,
    body: <Rows head={CLAIM_HEAD} rows={list} cols={CLAIM_COLS} cells={claimCells} href={claimHref} empty="None." />,
    more: { href: "/claims/all", label: "Open all claims" },
  };
}

function Tiles({ items }: { items: { label: string; value: number | string; href: string }[] }) {
  return (
    <div className={cn("mt-3 grid grid-cols-2 gap-3 sm:gap-4", items.length === 5 ? "xl:grid-cols-5" : items.length === 3 ? "xl:grid-cols-3" : "xl:grid-cols-4")}>
      {items.map((t, i) => (
        <Link key={t.label} href={t.href} scroll={false} className="block">
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
  return <div className="mt-3 grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">{children}</div>;
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
  const active = inForce(rows);
  const policyRenewalPanelCount = Number(due30.length > 0) + Number(due60.length > 0) + Number(overdue.length > 0) + Number(unpaid.length > 0);

  const policyDrill = (title: string, list: PolicyRow[]): Drill => ({
    title,
    count: list.length,
    body: <Rows head={POLICY_HEAD} rows={list} cols={POLICY_COLS} cells={policyCells} href={(r) => clientHref(r.clientId)} empty="None." />,
    more: { href: "/renewals", label: "Open the renewals pipeline" },
  });
  const drills: Record<string, Drill> = {
    "active-policies": policyDrill("Active policies", active),
    "due-30": policyDrill("Expiring in the next 30 days", due30),
    "due-60": policyDrill("Expiring in 31-60 days", due60),
    "overdue-renewals": policyDrill("Overdue renewals", overdue),
    unpaid: {
      title: "Unpaid policies",
      count: unpaid.length,
      body: (
        <Rows
          head={["Client", "Policy number", "Class", "Balance"]}
          rows={unpaid}
          cols="minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.2fr) minmax(0,1fr)"
          cells={(r) => [r.client, r.policy.id, r.policy.classOfInsurance, <span key="b" className="font-medium">{formatRwf(r.balance ?? 0)}</span>]}
          href={(r) => clientHref(r.clientId)}
          empty="None."
        />
      ),
    },
  };

  return (
    <>
      <Tiles
        items={[
          { label: "Total active policies", value: active.length, href: showHref("active-policies") },
          { label: "Expiring in next 30 days", value: due30.length, href: showHref("due-30") },
          { label: "Expiring in 31-60 days", value: due60.length, href: showHref("due-60") },
          { label: "Overdue renewals", value: overdue.length, href: showHref("overdue-renewals") },
          { label: "Unpaid policies", value: unpaid.length, href: showHref("unpaid") },
        ]}
      />
      <DrillPanel drills={drills} />

      <div className={cn("mt-3 grid gap-3 sm:gap-4", policyRenewalPanelCount > 1 && "xl:grid-cols-2")}>
        {policyRenewalPanelCount === 0 ? (
          <SectionCard title="Policy renewals">
            <Empty>No policy expiries or unpaid balances to show.</Empty>
          </SectionCard>
        ) : null}
        {due30.length > 0 ? (
          <SectionCard title="Expiring in the next 30 days" delay={120}>
            <Rows head={POLICY_HEAD} rows={due30} cols={POLICY_COLS} cells={policyCells} href={(r) => clientHref(r.clientId)} empty="None." />
          </SectionCard>
        ) : null}
        {overdue.length > 0 ? (
          <SectionCard title="Overdue renewals" delay={160}>
            <SideList
              rows={overdue}
              title={(r) => r.client}
              chip={(r) => <DaysChip days={r.daysLeft} />}
              detail={(r) => `${r.policy.id} · ${r.policy.classOfInsurance} · expired ${formatDate(r.expiry)}`}
              href={(r) => clientHref(r.clientId)}
              empty="None."
            />
          </SectionCard>
        ) : null}
        {due60.length > 0 ? (
          <SectionCard title="Expiring in 31-60 days" delay={200}>
            <Rows head={POLICY_HEAD} rows={due60} cols={POLICY_COLS} cells={policyCells} href={(r) => clientHref(r.clientId)} empty="None." />
          </SectionCard>
        ) : null}
        {unpaid.length > 0 ? (
          <SectionCard title="Unpaid policies" delay={240}>
            <SideList
              rows={unpaid}
              title={(r) => r.client}
              chip={(r) => <span className="shrink-0 font-medium">{formatRwf(r.balance ?? 0)}</span>}
              detail={(r) => `${r.policy.id} · cover started ${r.policy.start}`}
              href={(r) => clientHref(r.clientId)}
              empty="None."
            />
          </SectionCard>
        ) : null}
      </div>
    </>
  );
}

/* ---------------------------------- Clients ---------------------------------- */

function ClientsView({ clients }: { clients: Client[] }) {
  const today = todayIso();
  const active = clients.filter((c) => hasActivePolicy(c, today));
  const noPolicy = clients.filter((c) => !hasActivePolicy(c, today));
  const fresh = newThisMonth(clients, today);
  const router = useRouter();
  const top = topClientsByPremium(clients, 15, today);
  const categories = clientsByCategory(clients);
  const completeFiles = clients.filter((c) => c.docsFiled === c.docsTotal && !c.nonCompliant).length;
  const nonCompliant = clients.filter((c) => c.nonCompliant).length;

  const drills: Record<string, Drill> = {
    "active-clients": clientDrill("Clients with an active policy", active),
    "new-clients": clientDrill("New clients this month", fresh),
    "no-policy": clientDrill("Clients with no active policy", noPolicy),
    ...Object.fromEntries(
      categories.map((cat) => [`category:${cat.label}`, clientDrill(`${cat.label} clients`, clients.filter((c) => c.type === cat.label))]),
    ),
  };

  return (
    <>
      <Tiles
        items={[
          { label: "Clients with an active policy", value: active.length, href: showHref("active-clients") },
          { label: "New clients this month", value: fresh.length, href: showHref("new-clients") },
          { label: "Clients with no active policy", value: noPolicy.length, href: showHref("no-policy") },
        ]}
      />
      <DrillPanel drills={drills} />

      <Row>
        <SectionCard title="Top clients by premium" delay={120}>
          <Rows
            head={["#", "Client", "Category", "Premium"]}
            rows={top.map((t, i) => ({ ...t, rank: i + 1 }))}
            cols="2rem minmax(0,2fr) minmax(0,1fr) minmax(0,1fr)"
            cells={(t) => [t.rank, t.client.name, t.client.type, <span key="p" className="font-medium">{formatRwf(t.premium)}</span>]}
            href={(t) => clientHref(t.client.id)}
            empty="None."
          />
        </SectionCard>
        <div className="min-w-0 space-y-3 sm:space-y-4">
          <SectionCard title="Clients by category" delay={160}>
            <StageBar wideLabels stages={categories} onSelect={(label) => router.replace(showHref(`category:${label}`), { scroll: false })} />
          </SectionCard>
          <SectionCard title="Client file status" delay={200}>
            <DistributionRow
              items={[
                { label: "Complete", value: String(completeFiles), tone: "success" },
                { label: "Partial", value: String(clients.length - completeFiles - nonCompliant), tone: "warning" },
                { label: "Non-compliant", value: String(nonCompliant), tone: "danger" },
              ]}
            />
          </SectionCard>
        </div>
      </Row>

      <div className="mt-3">
        <SectionCard title="Clients with no active policy" delay={200}>
          <Rows
            head={["Client", "Category", "Account manager"]}
            rows={noPolicy.slice(0, 5)}
            cols="minmax(0,1.6fr) minmax(0,1fr) minmax(0,1.2fr)"
            cells={(c) => [c.name, c.type, c.manager || "Not assigned"]}
            href={(c) => clientHref(c.id)}
            empty="None."
          />
          {noPolicy.length > 5 ? (
            <div className="mt-3 border-t border-border pt-3 text-right">
              <Link href="/clients" className="text-xs font-medium text-primary underline-offset-4 hover:underline">
                View all {noPolicy.length} clients
              </Link>
            </div>
          ) : null}
        </SectionCard>
      </div>
    </>
  );
}

/* ---------------------------------- Claims ----------------------------------- */

function ClaimsView({ claims }: { claims: Claim[] }) {
  const router = useRouter();
  const today = todayIso();
  const open = claims.filter((c) => !isClosed(c));
  const overdue = overdueClaims(claims, today);
  const opened = claimsOpenedThisMonth(claims, today);
  const statusStages = claimsByStatus(claims).filter((stage) => stage.count > 0);
  const monthly = settledPerMonth(claims, 6, today);
  const settledIn = (key: string) => claims.filter((c) => c.closure?.outcome === "SETTLED" && c.closure.closedAt.startsWith(key));
  const thisMonth = monthly.at(-1)!;

  const drills: Record<string, Drill> = {
    ...Object.fromEntries(monthly.map((m) => [`settled:${m.key}`, claimDrill(`Claims settled in ${m.month}`, settledIn(m.key))])),
    "open-claims": claimDrill("Open claims", open),
    "opened-month": claimDrill("Claims opened this month", opened),
    "overdue-claims": claimDrill("Overdue claims", overdue),
    ...Object.fromEntries(
      claimsByStatus(claims).map((s) => [`status:${s.label}`, claimDrill(`${s.label} Claims`, claims.filter((c) => claimStatus(c) === s.label))]),
    ),
  };

  return (
    <>
      <Tiles
        items={[
          { label: "Total open claims", value: open.length, href: showHref("open-claims") },
          { label: "Claims opened this month", value: opened.length, href: showHref("opened-month") },
          { label: "Claims settled this month", value: thisMonth.count, href: showHref(`settled:${thisMonth.key}`) },
          { label: "Overdue claims", value: overdue.length, href: showHref("overdue-claims") },
        ]}
      />
      <DrillPanel drills={drills} />

      <div className={cn("mt-3 grid items-start gap-3 sm:gap-4", overdue.length > 0 && "xl:grid-cols-[minmax(0,1fr)_380px]")}>
        {overdue.length > 0 ? (
          <SectionCard title="Overdue claims" delay={120}>
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
              empty="No overdue claims."
            />
          </SectionCard>
        ) : null}
        <SectionCard title="Claims by status" delay={160}>
          {statusStages.length > 0 ? (
            <StageBar wideLabels stages={statusStages} onSelect={(label) => router.replace(showHref(`status:${label}`), { scroll: false })} />
          ) : (
            <Empty>No claims to show by status.</Empty>
          )}
        </SectionCard>
      </div>
    </>
  );
}

/** Sits below Needs your attention and Recent activity on the Claims view. */
function SettledChart({ claims }: { claims: Claim[] }) {
  const router = useRouter();
  const monthly = settledPerMonth(claims, 6, todayIso());
  return (
    <div className="mt-3 sm:mt-4">
      <ChartCard delay={380} title="Claims settled per month" legend={[]} height={200}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={monthly} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
            <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
            <Tooltip cursor={{ fill: "var(--secondary)" }} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 11 }} />
            <Bar
              dataKey="count"
              name="Claims settled"
              fill="var(--primary)"
              radius={[6, 6, 0, 0]}
              maxBarSize={36}
              cursor="pointer"
              onClick={(bar: { payload?: { key?: string } }) => {
                if (bar.payload?.key) router.replace(showHref(`settled:${bar.payload.key}`), { scroll: false });
              }}
            />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}
