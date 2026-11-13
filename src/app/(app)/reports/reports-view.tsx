"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { Printer } from "lucide-react";
import { Td, Th } from "@/components/gral/claim-list";
import { FilterMenu } from "@/components/gral/filter-menu";
import { PageHeader } from "@/components/gral/shell";
import { CardHeader, Chip, FloatCard, NavyButton, OutlineButton, PageLoader, SegmentedTabs, StatTile } from "@/components/gral/ui";
import { useCurrentUser } from "@/lib/auth-context";
import { downloadCsv, type CsvCell } from "@/lib/csv";
import { claimStatus } from "@/lib/dashboard";
import { displayToIso, formatRwf } from "@/lib/format";
import { canAccessPath } from "@/lib/permissions";
import { useClaims, useClients, useRenewals } from "@/lib/queries";
import { claimsReport, clientReport, periodOptions, portfolioReport, renewalsReport, shortDate, type Period } from "@/lib/reports";
import { todayIso } from "@/lib/renewals";
import type { Client } from "@/lib/types";

const TABS = ["Client Report", "Renewals", "Claims", "Portfolio"] as const;
type Tab = (typeof TABS)[number];

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
  const [tab, setTab] = useState<Tab>("Client Report");
  const periods = useMemo(() => periodOptions(), []);
  const [periodKey, setPeriodKey] = useState(periods[0]!.key);
  const period = periods.find((p) => p.key === periodKey) ?? periods[0]!;
  const [clientId, setClientId] = useState("");
  const client = clients.find((c) => c.id === clientId) ?? clients[0];

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
        extraPills={
          <>
            {tab !== "Portfolio" ? (
              <FilterMenu label="Period" value={period.key} options={periods.map((p) => ({ value: p.key, label: p.label }))} onChange={setPeriodKey} />
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

      <div className="mt-5 grid justify-items-start print:hidden">
        <SegmentedTabs tabs={tabs} value={tabs.includes(tab) ? tab : tabs[0]!} onChange={setTab} />
      </div>

      <p className="mt-4 hidden text-sm print:block">
        GRAL Operations Platform · {tab}
        {tab === "Client Report" && client ? ` · ${client.name}` : ""}
        {tab !== "Portfolio" ? ` · ${period.label}` : ` · as of ${shortDate(todayIso())}`}
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
                <tr key={i}>
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
      ["Policies in force", "Class", "Insurer", "Cover", "Total premium (RWF)", "Paid (RWF)", "Balance (RWF)"],
      ...r.policies.map(({ policy, premium, paid, balance }) => [policy.id, policy.classOfInsurance, policy.insurer, `${day(policy.start)} to ${day(policy.renewal)}`, premium, paid, balance]),
      [],
      ["Claims", "Class", "Reported", "Amount (RWF)", "Status"],
      ...r.claims.map((c) => [c.id, c.classOfInsurance, c.dateReported, c.amount, claimStatus(c)]),
      [],
      ["Renewals coming up", "Class", "Insurer", "Cover ends"],
      ...upcomingRows,
    ],
    body: (
      <>
        <Tiles
          items={[
            { label: "Premium in Force", value: formatRwf(r.totals.premium) },
            { label: "Paid", value: formatRwf(r.totals.paid) },
            { label: "Balance Owed", value: formatRwf(r.totals.balance) },
            { label: "Open Claims", value: String(r.totals.openClaims) },
          ]}
        />
        <Table
          title="Policies in Force"
          head={["Policy", "Class", "Insurer", "Cover", "Premium", "Paid", "Balance"]}
          rows={policyRows.map((row) => [<RowLink key="p" href={clientHref(client.id)}>{row[0]}</RowLink>, ...row.slice(1)])}
          empty="No cover in force in this period."
        />
        <Table
          title="Claims"
          head={["Claim", "Class", "Reported", "Amount", "Status"]}
          rows={claimRows.map((row) => [<RowLink key="c" href={claimHref(String(row[0]))}>{row[0]}</RowLink>, ...row.slice(1, 4), <Chip key="s">{row[4]}</Chip>])}
          empty="No claims in this period."
        />
        <Table
          title="Renewals Coming Up (Next 120 Days)"
          head={["Policy", "Class", "Insurer", "Cover ends"]}
          rows={upcomingRows}
          empty="No renewals due in the 120 days after this period."
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
      ["Client", "Policy", "Class", "Insurer", "Cover ends", "Total premium (RWF)", "Renewal"],
      ...r.lines.map((l) => [l.client.name, l.policy.id, l.policy.classOfInsurance, l.policy.insurer, l.expiry, l.premium, l.status]),
    ],
    body: (
      <>
        <Tiles
          items={[
            { label: "Renewals Due", value: String(r.totals.due) },
            { label: "Renewed", value: String(r.totals.renewed) },
            { label: "In Progress", value: String(r.totals.inProgress + r.totals.notStarted) },
            { label: "Lost", value: String(r.totals.lost) },
          ]}
        />
        <Table
          title={`Policies Ending in ${period.label} · ${formatRwf(r.totals.premium)}`}
          head={["Client", "Policy", "Class", "Insurer", "Cover ends", "Premium", "Renewal"]}
          rows={r.lines.map((l) => [
            <RowLink key="c" href={clientHref(l.client.id)}>{l.client.name}</RowLink>,
            l.policy.id,
            l.policy.classOfInsurance,
            l.policy.insurer,
            shortDate(l.expiry),
            money(l.premium),
            <Chip key="s" tone={l.status === "Completed" ? "success" : l.status === "Lost" ? "danger" : "neutral"}>{l.status}</Chip>,
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
      ["Claim", "Client", "Class", "Insurer", "Reported", "Amount (RWF)", "Status"],
      ...r.reported.map((c) => [c.id, c.client, c.classOfInsurance, c.insurer, c.dateReported, c.amount, claimStatus(c)]),
    ],
    body: (
      <>
        <Tiles
          items={[
            { label: "Claims Reported", value: String(r.totals.reported) },
            { label: "Amount Claimed", value: formatRwf(r.totals.amount) },
            { label: "Settled in Period", value: String(r.totals.settled) },
            { label: "Still Open", value: String(r.totals.stillOpen) },
          ]}
        />
        <Table
          title="By Status"
          head={r.byStatus.map((s) => s.label)}
          rows={[r.byStatus.map((s) => s.count)]}
          empty="No claims."
        />
        <Table
          title={`Claims Reported in ${period.label}`}
          head={["Claim", "Client", "Class", "Insurer", "Reported", "Amount", "Status"]}
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
      ["Group", "Name", "Policies", "Total premium (RWF)"],
      ...r.byClass.map((x) => ["Class", x.label, x.policies, x.premium]),
      ...r.byInsurer.map((x) => ["Insurer", x.label, x.policies, x.premium]),
    ],
    body: (
      <>
        <Tiles
          items={[
            { label: "Clients with Cover", value: String(r.totals.clients) },
            { label: "Policies in Force", value: String(r.totals.policies) },
            { label: "Premium in Force", value: formatRwf(r.totals.premium) },
            { label: "KYC Approved", value: `${r.totals.kycApproved} of ${r.totals.allClients}` },
          ]}
        />
        <Table title="By Class of Insurance" head={["Class", "Policies", "Premium", "Share"]} rows={groupRows(r.byClass)} empty="No policies in force." />
        <Table title="By Insurer" head={["Insurer", "Policies", "Premium", "Share"]} rows={groupRows(r.byInsurer)} empty="No policies in force." />
      </>
    ),
  };
}

