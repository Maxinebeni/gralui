"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, BadgeCheck, Building2, FileWarning, Plus, Users } from "lucide-react";
import { toast } from "sonner";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/gral/shell";
import {
  CLIENT_TABS,
  ClientFileSlideOver,
  ClientSearch,
  ClientsTable,
  useClientList,
  useOpenClient,
} from "@/components/gral/client-list";
import { ClientFormSlideOver, canManageClients } from "@/components/gral/client-form";
import {
  CardHeader,
  ChartCard,
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
import { getPoliciesByInsurer } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import type { ClientType, InsurerSummary } from "@/lib/types";

const CLIENT_TYPES: ClientType[] = ["Corporate", "State Enterprise", "NGO", "Financial Institution", "SME"];
/** The dashboard shows a compact list; the full list is on /clients/all. */
const PREVIEW_ROWS = 4;

export function ClientsView() {
  const { allClients, rows, tab, setTab, query, setQuery, emptyMessage, reload } = useClientList();
  const { open, setOpen } = useOpenClient(allClients);
  const { user } = useCurrentUser();
  const [insurers, setInsurers] = useState<InsurerSummary[]>([]);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    getPoliciesByInsurer().then(setInsurers);
  }, []);

  // Relationship managers already assigned to clients, for the form's dropdown.
  const managers = useMemo(
    () => Array.from(new Set(allClients.map((c) => c.manager).filter(Boolean))).sort(),
    [allClients],
  );

  const kycComplete = allClients.filter((c) => c.kyc).length;
  const flags = allClients.filter((c) => c.nonCompliant).length;
  const complete = allClients.filter((c) => c.docsFiled === c.docsTotal).length;
  const missing = allClients.filter((c) => c.docsFiled <= 2).length;
  const partial = allClients.length - complete - missing;

  const typeSegments = CLIENT_TYPES.map((t) => ({
    label: t,
    value: Math.max(allClients.filter((c) => c.type === t).length, 0.4),
  }));

  return (
    <>
      <PageHeader
        title="Client Records"
        extraPills={<FilterPill label="Sector" value="All sectors" />}
        action={
          canManageClients(user.role) ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" /> Add Client
            </NavyButton>
          ) : undefined
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_340px]">
        <StatTile icon={Users} label="Total Clients" value={String(allClients.length)} delta="6.1%" />
        <StatTile icon={BadgeCheck} label="KYC Complete" value={String(kycComplete)} delta="3.2%" delay={60} />
        <StatTile
          icon={FileWarning}
          label="KYC Pending"
          value={String(allClients.length - kycComplete)}
          delta="2.0%"
          tone="down"
          delay={120}
        />
        <StatTile
          icon={AlertTriangle}
          label="Non-Compliant Flags"
          value={String(flags)}
          delta="1.0%"
          tone="down"
          delay={180}
        />
        <div className="hidden xl:block" />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-4">
          <FloatCard className="overflow-hidden" delay={120}>
            <CardHeader
              title="Client Records"
              right={
                <div className="flex flex-wrap items-center gap-2">
                  <ClientSearch value={query} onChange={setQuery} />
                  <SegmentedTabs tabs={CLIENT_TABS} value={tab} onChange={setTab} />
                </div>
              }
            />
            <div className="mt-4">
              <ClientsTable
                clients={rows.slice(0, PREVIEW_ROWS)}
                onView={setOpen}
                emptyMessage={emptyMessage}
              />
            </div>
            <div className="border-t border-border px-5 py-4 text-center">
              <Link
                href="/clients/all"
                className="text-xs font-semibold text-primary underline underline-offset-4 hover:opacity-70"
              >
                See all clients
              </Link>
            </div>
          </FloatCard>

          <FloatCard className="p-5" delay={200}>
            <h2 className="text-base font-semibold tracking-tight">Clients by Type</h2>
            <div className="mt-4">
              <SegmentedBar segments={typeSegments} />
            </div>
            <p className="mt-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <Building2 className="size-3.5 text-sky" /> Portfolio mix across the book
            </p>
          </FloatCard>
        </div>

        <div className="min-w-0 space-y-4">
          <QuickAction delay={160}>
            <QuickActionRow
              icon={AlertTriangle}
              text="2 trading licences expiring in 30 days"
              action={
                <OutlineButton onClick={() => toast.success("Notification sent to 2 clients.")}>
                  Notify Clients
                </OutlineButton>
              }
            />
            <QuickActionRow
              icon={BadgeCheck}
              tone="success"
              tinted
              text="1 client awaiting compliance review"
              action={
                <NavyButton onClick={() => toast.success("Compliance review scheduled.")}>
                  Review
                </NavyButton>
              }
            />
          </QuickAction>

          <FloatCard className="p-5" delay={220}>
            <h2 className="text-base font-semibold tracking-tight">Document Completeness</h2>
            <DistributionRow
              items={[
                { label: "Complete", value: String(complete), tone: "success" },
                { label: "Partial", value: String(partial), tone: "warning" },
                { label: "Missing", value: String(missing), tone: "danger" },
              ]}
            />
          </FloatCard>

          <ChartCard
            delay={280}
            title="Active Policies by Insurer"
            legend={[
              { label: "Policies", tone: "primary" },
              { label: "Premium (RWF m)", tone: "sky" },
            ]}
          >
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={insurers} margin={{ top: 4, right: 8, left: -14, bottom: 0 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="4 4" vertical={false} />
                <XAxis
                  dataKey="insurer"
                  tick={{ fontSize: 10, fill: "var(--subtle)" }}
                  axisLine={false}
                  tickLine={false}
                />
                <YAxis tick={{ fontSize: 10, fill: "var(--subtle)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", fontSize: 11 }} />
                <Bar dataKey="policies" name="Policies" fill="var(--primary)" radius={[6, 6, 0, 0]} barSize={14} />
                <Bar dataKey="premium" name="Premium (RWF m)" fill="var(--sky)" radius={[6, 6, 0, 0]} barSize={14} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </div>

      
     <ClientFileSlideOver client={open} onClose={() => setOpen(null)} onChanged={reload} />

      <ClientFormSlideOver
        open={adding}
        onClose={() => setAdding(false)}
        managers={managers}
        onSaved={(saved) => {
          reload();
          setOpen(saved);
        }}
      />
    </>
  );
}