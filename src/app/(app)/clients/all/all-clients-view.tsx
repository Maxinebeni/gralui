"use client";

import { PageHeader } from "@/components/gral/shell";
import {
  CLIENT_TABS,
  ClientFileSlideOver,
  ClientSearch,
  ClientsTable,
  SectorFilter,
  DownloadClientsMenu,
  useClientList,
  useOpenClient,
} from "@/components/gral/client-list";
import { CardHeader, FloatCard, SegmentedTabs } from "@/components/gral/ui";

export function AllClientsView() {
  const { allClients, rows, tab, setTab, sector, setSector, sectors, query, setQuery, emptyMessage, reload, loading } = useClientList();
  const { open, setOpen } = useOpenClient(allClients);

  return (
    <>
      <PageHeader
        title="All client records"
        subtitle={
          loading && rows.length === 0
            ? undefined
            : `${rows.length} ${rows.length === 1 ? "record" : "records"}${tab === "KYC ready" ? " with KYC ready" : ""}`
        }
        extraPills={<SectorFilter value={sector} sectors={sectors} onChange={setSector} />}
        action={
          <DownloadClientsMenu clients={rows} sector={sector} />
        }
      />
      <FloatCard className="mt-5 overflow-hidden">
        <CardHeader
          title="Client list"
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
