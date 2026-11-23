"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown, Download, Plus } from "lucide-react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/gral/shell";
import {
  CLIENT_TABS,
  ClientFileSlideOver,
  ClientSearch,
  ClientsTable,
  SectorFilter,
  clientFilterQuery,
  downloadClients,
  filterClientsBy,
  useClientList,
  useOpenClient,
} from "@/components/gral/client-list";
import { ClientFormSlideOver, canManageClients } from "@/components/gral/client-form";
import {
  CardHeader,
  ChartCard,
  FloatCard,
  NavyButton,
  OutlineButton,
  QuickAction,
  QuickActionRow,
  SegmentedBar,
  SegmentedTabs,
  StatTile,
} from "@/components/gral/ui";
import { getPoliciesByInsurer } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import type { ClientFileTab } from "@/components/gral/client-file";
import type { Client, ClientType, InsurerSummary } from "@/lib/types";

const CLIENT_TYPES: ClientType[] = ["Corporate", "State enterprise", "NGO", "Financial institution", "SME"];
/** The dashboard shows a compact list; the full list is on /clients/all. */
const PREVIEW_ROWS = 4;

export function ClientsView() {
  const { allClients, rows, tab, setTab, sector, setSector, sectors, query, setQuery, emptyMessage, reload } = useClientList();
  const { open, setOpen } = useOpenClient(allClients);
  const { user } = useCurrentUser();
  const [insurers, setInsurers] = useState<InsurerSummary[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getPoliciesByInsurer().then(setInsurers);
  }, []);

  // The Add Client form loads the manager list from the backend by itself,
  // so this page no longer builds one.

  // The tiles count the chosen sector, and each one filters the table below.
  const inSector = filterClientsBy(allClients, "All", sector);
  const kycReady = inSector.filter((c) => c.kyc).length;
  const flags = inSector.filter((c) => c.nonCompliant).length;

  // Quick actions: work on client records that can be done in the app. Each row
  // counts the clients it applies to; the button opens the next one where the
  // work is done, and the count goes down as each is finished.
  const router = useRouter();
  const kycPage = (c: Client) => () => router.push(`/clients/kyc/${encodeURIComponent(c.id)}?mode=client`);
  const [fileTab, setFileTab] = useState<ClientFileTab | undefined>();
  const filePage = (tab: ClientFileTab) => (c: Client) => () => {
    setFileTab(tab);
    setOpen(c);
  };
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const quickActions = [
    {
      key: "kyc-waiting",
      list: inSector.filter((c) => c.kycStatus === "SUBMITTED"),
      text: (n: number) => `${plural(n, "client", "clients")} waiting for a KYC decision`,
      label: "Review",
      open: kycPage,
      primary: true,
    },
    {
      key: "kyc-returned",
      list: inSector.filter((c) => c.kycStatus === "RETURNED"),
      text: (n: number) => `${plural(n, "KYC review", "KYC reviews")} returned for changes`,
      label: "Fix",
      open: kycPage,
      primary: false,
    },
    {
      key: "kyc-not-started",
      list: inSector.filter((c) => !c.kyc && (!c.kycStatus || c.kycStatus === "NOT_STARTED" || c.kycStatus === "DRAFT")),
      text: (n: number) => `${plural(n, "client has", "clients have")} no KYC review started`,
      label: "Start KYC",
      open: kycPage,
      primary: false,
    },
    {
      key: "documents",
      list: inSector.filter((c) => c.docsTotal > 0 && c.docsFiled < c.docsTotal),
      text: (n: number) => `${plural(n, "client file is", "client files are")} missing documents`,
      label: "Add documents",
      open: filePage("KYC and compliance"),
      primary: false,
    },
    {
      key: "no-policy",
      list: inSector.filter((c) => c.activePolicies === 0),
      text: (n: number) => `${plural(n, "client has", "clients have")} no active policy`,
      label: "Add policy",
      open: filePage("Policies"),
      primary: false,
    },
  ].filter((a) => a.list.length > 0);

  const typeSegments = CLIENT_TYPES.map((t) => ({
    label: t,
    value: Math.max(allClients.filter((c) => c.type === t).length, 0.4),
  }));

  return (
    <>
      <PageHeader
        title="Client records"
        extraPills={<SectorFilter value={sector} sectors={sectors} onChange={setSector} />}
        action={
          <>
            <OutlineButton className="px-4 py-2 text-sm" disabled={allClients.length === 0} onClick={() => downloadClients(allClients)}>
              <Download className="size-4" /> <span>Download<span className="hidden sm:inline"> all clients</span></span>
            </OutlineButton>
            {canManageClients(user) ? (
              <NavyButton className="px-4 py-2 text-sm" onClick={() => setAdding(true)}>
                <Plus className="size-4" /> Add client
              </NavyButton>
            ) : null}
          </>
        }
      />

      <div className="mt-5 grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <StatTile label="Total clients" value={String(inSector.length)} onClick={() => setTab("All")} active={tab === "All"} />
        <StatTile label="KYC ready" value={String(kycReady)} delay={60} onClick={() => setTab("KYC ready")} active={tab === "KYC ready"} />
        <StatTile label="KYC not ready" value={String(inSector.length - kycReady)} delay={120} onClick={() => setTab("KYC not ready")} active={tab === "KYC not ready"} />
        <StatTile label="Non-compliant flags" value={String(flags)} delay={180} onClick={() => setTab("Non-compliant")} active={tab === "Non-compliant"} />
      </div>

      {quickActions.length ? (
        <div className="mt-4">
          <QuickAction delay={100}>
            {quickActions.map((a) => {
              const next = a.list[0]!;
              return (
                <QuickActionRow
                  key={a.key}
                  tone={a.primary ? "success" : "danger"}
                  tinted={a.primary}
                  text={a.list.length > 1 ? `${a.text(a.list.length)}. Next: ${next.name}` : `${a.text(1)}: ${next.name}`}
                  action={
                    a.primary ? (
                      <NavyButton onClick={a.open(next)}>{a.label}</NavyButton>
                    ) : (
                      <OutlineButton onClick={a.open(next)}>{a.label}</OutlineButton>
                    )
                  }
                />
              );
            })}
          </QuickAction>
        </div>
      ) : null}

      <div className="mt-4">
        <FloatCard className="overflow-hidden" delay={120}>
          <CardHeader
            title={tab === "KYC ready" ? "KYC ready" : "Client records"}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <ClientSearch value={query} onChange={setQuery} />
                <SegmentedTabs tabs={CLIENT_TABS} value={tab as (typeof CLIENT_TABS)[number]} onChange={setTab} />
              </div>
            }
          />
          <div className="mt-4">
            <ClientsTable
              clients={rows.slice(0, PREVIEW_ROWS)}
              onView={setOpen}
              emptyMessage={emptyMessage}
              compact
            />
          </div>
          <div className="border-t border-border px-5 py-4 text-center">
            <Link
              href={`/clients/all${clientFilterQuery(tab, sector)}`}
              className="text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-70"
            >
              {rows.length > PREVIEW_ROWS ? `See all ${rows.length} in this view` : "See all clients"}
            </Link>
          </div>
        </FloatCard>

      </div>

      <details className="group mt-4">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3.5 outline-none transition-colors hover:bg-secondary/50 focus-visible:ring-2 focus-visible:ring-sky sm:px-5">
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Portfolio insights</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">Client mix and insurer policies</span>
          </span>
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
        </summary>
        <div className="mt-3 grid min-w-0 gap-3 sm:mt-4 sm:gap-4 md:grid-cols-2 2xl:grid-cols-3">
          <FloatCard className="p-5">
            <h2 className="text-base font-semibold tracking-tight">Clients by type</h2>
            <div className="mt-4">
              <SegmentedBar segments={typeSegments} />
            </div>
            <p className="mt-3 text-[11px] text-muted-foreground">Portfolio mix across the book</p>
          </FloatCard>
          <ChartCard
            delay={0}
            title="Active policies by insurer"
            legend={[
              { label: "Policies", tone: "primary" },
              { label: "Premium (RWF m)", tone: "sky" },
            ]}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insurers} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                <XAxis dataKey="insurer" tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 11 }} />
                <Bar dataKey="policies" name="Policies" fill="var(--primary)" radius={[6, 6, 0, 0]} barSize={14} />
                <Bar dataKey="premium" name="Premium (RWF m)" fill="var(--sky)" radius={[6, 6, 0, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </details>

      <ClientFileSlideOver
        client={open}
        initialTab={fileTab}
        onClose={() => {
          setOpen(null);
          setFileTab(undefined);
        }}
        onChanged={reload}
      />

      <ClientFormSlideOver
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(saved) => {
          reload();
          setOpen(saved);
        }}
      />
    </>
  );
}
