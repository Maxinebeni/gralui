"use client";

import { useMemo, useState } from "react";
import { PageHeader } from "@/components/gral/shell";
import {
  CLAIM_TABS,
  ClaimSearch,
  ClaimSlideOver,
  ClaimsTable,
  byUrgency,
  filterClaims,
  matchesClaim,
  useClaims,
  useOpenClaim,
  type ClaimTab,
} from "@/components/gral/claim-list";
import { CardHeader, FloatCard, SegmentedTabs } from "@/components/gral/ui";

const TABS = ["All", ...CLAIM_TABS, "Closed"] as const;

export function AllClaimsView() {
  const { claims, loaded, reload } = useClaims();
  const { open, setOpen } = useOpenClaim(claims);
  const [tab, setTab] = useState<ClaimTab>("All");
  const [query, setQuery] = useState("");

  const rows = useMemo(
    () => filterClaims(claims, tab).filter((c) => matchesClaim(c, query)).sort(byUrgency),
    [claims, tab, query],
  );

  return (
    <>
      <PageHeader title="All Claims" subtitle={`${rows.length} ${rows.length === 1 ? "claim" : "claims"}`} />
      <FloatCard className="mt-5 overflow-hidden">
        <CardHeader
          title="Claims List"
          right={
            <div className="flex flex-wrap items-center gap-2">
              <ClaimSearch value={query} onChange={setQuery} />
              <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />
            </div>
          }
        />
        <div className="mt-4">
          <ClaimsTable
            claims={rows}
            onView={setOpen}
            emptyMessage={!loaded ? "Loading claims…" : query ? `No claims match "${query}".` : "No claims in this view."}
          />
        </div>
      </FloatCard>

      <ClaimSlideOver claim={open} onClose={() => setOpen(null)} onChanged={reload} />
    </>
  );
}
