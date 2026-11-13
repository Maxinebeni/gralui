"use client";

import { Download } from "lucide-react";
import { PageHeader } from "@/components/gral/shell";
import {
  CLIENT_TABS,
  ClientFileSlideOver,
  ClientSearch,
  ClientsTable,
  SectorFilter,
  downloadClients,
  useClientList,
  useOpenClient,
} from "@/components/gral/client-list";
import { CardHeader, FloatCard, OutlineButton, SegmentedTabs } from "@/components/gral/ui";

export function AllClientsView() {
  const { allClients, rows, tab, setTab, sector, setSector, sectors, query, setQuery, emptyMessage, reload, loading } = useClientList();
  const { open, setOpen } = useOpenClient(allClients);

  return (
    <>
      <PageHeader
        title="All Client Records"
        subtitle={
          loading && rows.length === 0
            ? undefined
            : `${rows.length} ${rows.length === 1 ? "record" : "records"}${tab === "KYC Complete" ? " with KYC complete" : ""}`
        }
        extraPills={<SectorFilter value={sector} sectors={sectors} onChange={setSector} />}
        action={
          <OutlineButton className="px-4 py-2 text-sm" disabled={rows.length === 0} onClick={() => downloadClients(rows)}>
            <Download className="size-4" /> Download {rows.length === allClients.length ? "All" : rows.length} Clients
          </OutlineButton>
        }
      />
      <FloatCard className="mt-5 overflow-hidden">
        <CardHeader
          title="Client List"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <ClientSearch value={query} onChange={setQuery} />
              <SegmentedTabs tabs={CLIENT_TABS} value={tab as (typeof CLIENT_TABS)[number]} onChange={setTab} />
            </div>
          }
        />
        <div className="mt-4">
          <ClientsTable clients={rows} onView={setOpen} emptyMessage={emptyMessage} />
        </div>
      </FloatCard>

      <ClientFileSlideOver client={open} onClose={() => setOpen(null)} onChanged={reload} />
    </>
  );
}