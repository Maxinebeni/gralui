"use client";

import { PageHeader } from "@/components/gral/shell";
import {
  CLIENT_TABS,
  ClientFileSlideOver,
  ClientSearch,
  ClientsTable,
  useClientList,
  useOpenClient,
} from "@/components/gral/client-list";
import { CardHeader, FloatCard, SegmentedTabs } from "@/components/gral/ui";

export function AllClientsView() {
  const { allClients, rows, tab, setTab, query, setQuery, emptyMessage } = useClientList();
  const { open, setOpen } = useOpenClient(allClients);

  return (
    <>
      <PageHeader
        title="All Client Records"
        subtitle={`${rows.length} ${rows.length === 1 ? "record" : "records"}`}
      />
      <FloatCard className="mt-5">
        <CardHeader
          title="Client List"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <ClientSearch value={query} onChange={setQuery} />
              <SegmentedTabs tabs={CLIENT_TABS} value={tab} onChange={setTab} />
            </div>
          }
        />
        <div className="mt-4">
          <ClientsTable clients={rows} onView={setOpen} emptyMessage={emptyMessage} />
        </div>
      </FloatCard>

      <ClientFileSlideOver client={open} onClose={() => setOpen(null)} />
    </>
  );
}
