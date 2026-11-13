"use client";

import { useMemo, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Printer } from "lucide-react";
import { Td, Th } from "@/components/gral/claim-list";
import { FilterMenu } from "@/components/gral/filter-menu";
import { usePaged } from "@/components/gral/pager";
import { PageHeader } from "@/components/gral/shell";
import { CardHeader, Chip, FloatCard, NavyButton, OutlineButton, PageLoader, SegmentedTabs, StatTile } from "@/components/gral/ui";
import { useCurrentUser } from "@/lib/auth-context";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { claimStatus } from "@/lib/dashboard";
import { displayToIso, formatRwf } from "@/lib/format";
import { canAccessPath } from "@/lib/permissions";
import { useClaims, useClients, useRenewals } from "@/lib/queries";
import {
  claimsReport,
  clientReport,
  customKey,
  isCustomKey,
  periodFor,
  periodOptions,
  portfolioReport,
  rangeLabel,
  renewalsReport,
  shortDate,
  type Period,
} from "@/lib/reports";
import { todayIso } from "@/lib/renewals";
import type { Client } from "@/lib/types";

const TABS = ["Client Report", "Renewals", "Claims", "All Business"] as const;
type Tab = (typeof TABS)[number];
/** Each tab's name in the URL (?report=client), so a report can be linked to. */
const TAB_SLUGS: Record<Tab, string> = { "Client Report": "client", Renewals: "renewals", Claims: "claims", "All Business": "portfolio" };
const CUSTOM = "custom";

const money = (n: number | null | undefined) => (n === null || n === undefined ? "Not recorded" : formatRwf(n));
const day = (display: string) => {
  const iso = displayToIso(display);
  return iso ? shortDate(iso) : display;
};
const clientHref = (id: string) => `/clients?client=${encodeURIComponent(id)}`;
const claimHref = (id: string) => `/claims?claim=${encodeURIComponent(id)}`;

/** One report's on-screen body and the rows its CSV file carries. */
type Built = { body: ReactNode; csv: CsvCell[][]; fileName: string };

export function ReportsView() {
  const { user } = useCurrentUser();
  const canClaims = canAccessPath(user, "/claims");
  const canRenewals = canAccessPath(user, "/renewals");
  const clientsQuery = useClients("");
  const claimsQuery = useClaims(canClaims);
  const renewalsQuery = useRenewals(canRenewals);
  const clients = useMemo(() => [...(clientsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)), [clientsQuery.data]);
  const claims = useMemo(() => (canClaims ? (claimsQuery.data ?? []) : []), [canClaims, claimsQuery.data]);
  const renewals = useMemo(() => (canRenewals ? (renewalsQuery.data ?? []) : []), [canRenewals, renewalsQuery.data]);

  const tabs = TABS.filter((t) => (t === "Claims" ? canClaims : t === "Renewals" ? canRenewals : true));

  // The report, period and client live in the URL, so links and Back keep them.
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set(key, value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };
  const slug = searchParams.get("report");
  const asked = TABS.find((t) => TAB_SLUGS[t] === slug);
  const tab: Tab = asked && tabs.includes(asked) ? asked : tabs[0]!;
  const setTab = (t: Tab) => setParam("report", TAB_SLUGS[t]);

  const periods = useMemo(() => periodOptions(), []);
  const period: Period = periodFor(searchParams.get("period") ?? "") ?? periods[0]!;
  const custom = isCustomKey(period.key);
  const setPeriod = (key: string) => setParam("period", key === CUSTOM ? customKey(period.from, period.to) : key);
  const setCustomEnd = (end: "from" | "to", value: string) => {
    if (value) setParam("period", customKey(end === "from" ? value : period.from, end === "to" ? value : period.to));
  };

  const client = clients.find((c) => c.id === searchParams.get("client")) ?? clients[0];
  const setClientId = (id: string) => setParam("client", id);

  const loading = clientsQuery.isPending || (canClaims && claimsQuery.isPending) || (canRenewals && renewalsQuery.isPending);

  const built: Built | null = loading
    ? null
    : tab === "Client Report"
      ? client
        ? buildClientReport(client, claims, period)
        : { body: <Empty>No clients yet.</Empty>, csv: [], fileName: "" }
      : tab === "Renewals"
        ? buildRenewals(clients, renewals, period)
        : tab === "Claims"
          ? buildClaims(claims, period)
          : buildPortfolio(clients);

  return (
    <>
      <PageHeader
        title="Reports"
        subtitle={tab === "All Business" ? `As of ${shortDate(todayIso())}` : custom ? period.label : `${period.label} · ${rangeLabel(period)}`}
        extraPills={
          <>
            {tab !== "All Business" ? (
              <FilterMenu
                label="Period"
                value={custom ? CUSTOM : period.key}
                options={[...periods.map((p) => ({ value: p.key, label: p.label })), { value: CUSTOM, label: "Custom range" }]}
                onChange={setPeriod}
              />
            ) : null}
            {tab === "Client Report" && clients.length ? (
              <FilterMenu label="Client" value={client?.id ?? ""} options={clients.map((c) => ({ value: c.id, label: c.name }))} onChange={setClientId} />
            ) : null}
          </>
        }
        action={
          built && built.csv.length > 1 ? (
            <>
              <OutlineButton className="px-4 py-2 text-sm" onClick={() => downloadCsv(built.fileName, built.csv)}>
                Download CSV
              </OutlineButton>
              <NavyButton className="px-4 py-2 text-sm" onClick={() => window.print()}>
                <Printer className="size-4" /> Print
              </NavyButton>
            </>
          ) : null
        }
      />

      <div className="mt-5 flex flex-wrap items-center gap-3 print:hidden">
        <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />
        {tab !== "All Business" && custom ? (
          <span className="float-pill flex flex-wrap items-center gap-1.5 px-3.5 py-1.5 text-xs">
            <input type="date" aria-label="From" value={period.from} max={period.to} onChange={(e) => setCustomEnd("from", e.target.value)} className="bg-transparent outline-none" />
            <span className="text-muted-foreground">to</span>
            <input type="date" aria-label="To" value={period.to} min={period.from} onChange={(e) => setCustomEnd("to", e.target.value)} className="bg-transparent outline-none" />
          </span>
        ) : null}
      </div>

      <p className="mt-4 hidden text-sm print:block">
        GRAL Operations Platform · {tab}
        {tab === "Client Report" && client ? ` · ${client.name}` : ""}
        {tab !== "All Business" ? ` · ${custom ? period.label : `${period.label} (${rangeLabel(period)})`}` : ` · as of ${shortDate(todayIso())}`}
      </p>

      {built ? built.body : <PageLoader label="Loading the report" />}
    </>
  );
}

/* ---------------------------------- Pieces ---------------------------------- */

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 pb-5 text-xs text-muted-foreground sm:px-5">{children}</p>;
}

function Tiles({ items }: { items: { label: string; value: string }[] }) {
  return (
    <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((t, i) => (
        <StatTile key={t.label} label={t.label} value={t.value} delay={i * 50} />
      ))}
    </div>
  );
}

function Table({ title, head, rows, empty }: { title: string; head: string[]; rows: ReactNode[][]; empty: string }) {
  // Every row is rendered so a printout has them all; on screen only one page shows.
  const { onPage, pager } = usePaged(rows);
  return (
    <FloatCard className="mt-4 overflow-hidden break-inside-avoid">
      <CardHeader title={title} />
      {rows.length === 0 ? (
        <div className="mt-3">
          <Empty>{empty}</Empty>
        </div>
      ) : (
        <div className="mt-4 overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-pale text-[11px] text-muted-foreground">
                {head.map((h, i) => (
                  <Th key={h} className={i === 0 ? "rounded-l-xl" : i === head.length - 1 ? "rounded-r-xl" : undefined}>
                    {h}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className={onPage(i) ? undefined : "hidden print:table-row"}>
                  {r.map((cell, j) => (
                    <Td key={j} className="text-sm">
                      {cell}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="print:hidden">{pager}</div>
    </FloatCard>
  );
}

const RowLink = ({ href, children }: { href: string; children: ReactNode }) => (
  <Link href={href} className="font-medium text-primary underline-offset-2 hover:underline">
    {children}
  </Link>
);

/* --------------------------------- Reports ---------------------------------- */

function buildClientReport(client: Client, claims: Parameters<typeof clientReport>[1], period: Period): Built {
  const r = clientReport(client, claims, period);
  const policyRows = r.policies.map(({ policy, premium, paid, balance }) => [
    policy.id,
    policy.classOfInsurance,
    policy.insurer,
    `${day(policy.start)} to ${day(policy.renewal)}`,
    money(premium),
    money(paid),
    money(balance),
  ]);
  const claimRows = r.claims.map((c) => [c.id, c.classOfInsurance, shortDate(c.dateReported), formatRwf(c.amount), claimStatus(c)]);
  const upcomingRows = r.upcoming.map(({ policy, expiry }) => [policy.id, policy.classOfInsurance, policy.insurer, shortDate(expiry)]);
  return {
    fileName: `${client.id}-${period.key}-client-report.csv`,
    csv: [
      ["Client report", client.name, period.label],
      [],
      ["Active policies", "Type of insurance", "Insurer", "Covered from - to", "Premium (RWF)", "Paid (RWF)", "Still to pay (RWF)"],
      ...r.policies.map(({ policy, premium, paid, balance }) => [policy.id, policy.classOfInsurance, policy.insurer, `${day(policy.start)} to ${day(policy.renewal)}`, premium, paid, balance]),
      [],
      ["Claims", "Type of insurance", "Reported on", "Amount claimed (RWF)", "Status"],
      ...r.claims.map((c) => [c.id, c.classOfInsurance, c.dateReported, c.amount, claimStatus(c)]),
      [],
      ["Policies ending in the next 120 days", "Type of insurance", "Insurer", "Ends on"],
      ...upcomingRows,
    ],
    body: (
      <>
        <Tiles
          items={[
            { label: "Premium for Active Policies", value: formatRwf(r.totals.premium) },
            { label: "Paid So Far", value: formatRwf(r.totals.paid) },
            { label: "Still to Pay", value: formatRwf(r.totals.balance) },
            { label: "Claims Not Yet Closed", value: String(r.totals.openClaims) },
          ]}
        />
        <Table
          title="Active Policies"
          head={["Policy", "Type of Insurance", "Insurer", "Covered", "Premium", "Paid", "Still to Pay"]}
          rows={policyRows.map((row) => [<RowLink key="p" href={clientHref(client.id)}>{row[0]}</RowLink>, ...row.slice(1)])}
          empty="No active policies in this period."
        />
        <Table
          title="Claims"
          head={["Claim", "Type of Insurance", "Reported On", "Amount Claimed", "Status"]}
          rows={claimRows.map((row) => [<RowLink key="c" href={claimHref(String(row[0]))}>{row[0]}</RowLink>, ...row.slice(1, 4), <Chip key="s">{row[4]}</Chip>])}
          empty="No claims in this period."
        />
        <Table
          title="Policies Ending in the Next 120 Days"
          head={["Policy", "Type of Insurance", "Insurer", "Ends On"]}
          rows={upcomingRows}
          empty="No policies end in the 120 days after this period."
        />
      </>
    ),
  };
}

function buildRenewals(clients: Client[], cases: Parameters<typeof renewalsReport>[1], period: Period): Built {
  const r = renewalsReport(clients, cases, period);
  return {
    fileName: `renewals-${period.key}.csv`,
    csv: [
      ["Client", "Policy", "Type of insurance", "Insurer", "Ends on", "Premium (RWF)", "Renewal status"],
      ...r.lines.map((l) => [l.client.name, l.policy.id, l.policy.classOfInsurance, l.policy.insurer, l.expiry, l.premium, l.status]),
    ],
    body: (
      <>
        <Tiles
          items={[
            { label: "Policies Ending", value: String(r.totals.due) },
            { label: "Renewed", value: String(r.totals.renewed) },
            { label: "Still Being Renewed", value: String(r.totals.inProgress + r.totals.notStarted) },
            { label: "Not Renewed", value: String(r.totals.lost) },
          ]}
        />
        <Table
          title={`Policies Ending in ${period.label} · ${formatRwf(r.totals.premium)}`}
          head={["Client", "Policy", "Type of Insurance", "Insurer", "Ends On", "Premium", "Renewal Status"]}
          rows={r.lines.map((l) => [
            <RowLink key="c" href={clientHref(l.client.id)}>{l.client.name}</RowLink>,
            l.policy.id,
            l.policy.classOfInsurance,
            l.policy.insurer,
            shortDate(l.expiry),
            money(l.premium),
            <Chip key="s" tone={l.status === "Renewed" ? "success" : l.status === "Not renewed" ? "danger" : "neutral"}>{l.status}</Chip>,
          ])}
          empty="No policies end in this period."
        />
      </>
    ),
  };
}

function buildClaims(claims: Parameters<typeof claimsReport>[0], period: Period): Built {
  const r = claimsReport(claims, period);
  return {
    fileName: `claims-${period.key}.csv`,
    csv: [
      ["Claim", "Client", "Type of insurance", "Insurer", "Reported on", "Amount claimed (RWF)", "Status"],
      ...r.reported.map((c) => [c.id, c.client, c.classOfInsurance, c.insurer, c.dateReported, c.amount, claimStatus(c)]),
    ],
    body: (
      <>
        <Tiles
          items={[
            { label: "New Claims", value: String(r.totals.reported) },
            { label: "Amount Claimed", value: formatRwf(r.totals.amount) },
            { label: "Claims Paid Out", value: String(r.totals.settled) },
            { label: "Not Yet Closed", value: String(r.totals.stillOpen) },
          ]}
        />
        <Table
          title="Where the New Claims Are"
          head={r.byStatus.map((s) => s.label)}
          rows={[r.byStatus.map((s) => s.count)]}
          empty="No claims."
        />
        <Table
          title={`Claims Reported in ${period.label}`}
          head={["Claim", "Client", "Type of Insurance", "Insurer", "Reported On", "Amount Claimed", "Status"]}
          rows={r.reported.map((c) => [
            <RowLink key="c" href={claimHref(c.id)}>{c.id}</RowLink>,
            c.client,
            c.classOfInsurance,
            c.insurer,
            shortDate(c.dateReported),
            formatRwf(c.amount),
            <Chip key="s">{claimStatus(c)}</Chip>,
          ])}
          empty="No claims were reported in this period."
        />
      </>
    ),
  };
}

function buildPortfolio(clients: Client[]): Built {
  const r = portfolioReport(clients);
  const groupRows = (rows: { label: string; policies: number; premium: number }[]) =>
    rows.map((x) => [x.label, x.policies, formatRwf(x.premium), r.totals.premium ? `${Math.round((x.premium / r.totals.premium) * 100)}%` : "-"]);
  return {
    fileName: `portfolio-${todayIso()}.csv`,
    csv: [
      ["Grouped by", "Name", "Active policies", "Premium (RWF)"],
      ...r.byClass.map((x) => ["Type of insurance", x.label, x.policies, x.premium]),
      ...r.byInsurer.map((x) => ["Insurer", x.label, x.policies, x.premium]),
    ],
    body: (
      <>
        <Tiles
          items={[
            { label: "Clients with Active Policies", value: String(r.totals.clients) },
            { label: "Active Policies", value: String(r.totals.policies) },
            { label: "Premium for Active Policies", value: formatRwf(r.totals.premium) },
            { label: "Clients with KYC Approved", value: `${r.totals.kycApproved} of ${r.totals.allClients}` },
          ]}
        />
        <Table title="By Type of Insurance" head={["Type of Insurance", "Active Policies", "Premium", "Share of Premium"]} rows={groupRows(r.byClass)} empty="No active policies." />
        <Table title="By Insurer" head={["Insurer", "Active Policies", "Premium", "Share of Premium"]} rows={groupRows(r.byInsurer)} empty="No active policies." />
      </>
    ),
  };
}

