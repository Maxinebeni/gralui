"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/gral/shell";
import { CardHeader, Chip, FloatCard, Person, SegmentedTabs } from "@/components/gral/ui";
import { listActivity } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { timeAgo } from "@/lib/format";
import { canAccessPath } from "@/lib/permissions";
import type { ActivityItem } from "@/lib/types";

export function ActivityView() {
  const { user } = useCurrentUser();
  const claims = canAccessPath(user, "/claims");
  const renewals = canAccessPath(user, "/renewals");
  const tabs = ["All", ...(claims ? ["Claims"] : []), ...(renewals ? ["Renewals"] : [])] as const;

  const [items, setItems] = useState<ActivityItem[] | null>(null);
  const [tab, setTab] = useState<string>("All");

  useEffect(() => {
    listActivity({ claims, renewals }).then(setItems);
  }, [claims, renewals]);

  const rows = useMemo(() => (items ?? []).filter((a) => tab === "All" || a.module === tab), [items, tab]);

  return (
    <>
      <PageHeader title="Activity" />
      <FloatCard className="mt-5 overflow-hidden">
        <CardHeader
          title={`${rows.length} ${rows.length === 1 ? "entry" : "entries"}`}
          right={tabs.length > 2 ? <SegmentedTabs tabs={tabs} value={tab} onChange={setTab} /> : null}
        />
        <ul className="mt-2 divide-y divide-border px-5 pb-3 sm:px-6">
          {rows.map((a, i) => (
            <li key={`${a.at}-${a.what}-${i}`}>
              <Link
                href={a.href}
                className="grid gap-2 py-4 hover:opacity-80 sm:grid-cols-[220px_minmax(0,1fr)_auto] sm:items-center sm:gap-6"
              >
                <Person name={a.who} />
                <span className="min-w-0 text-xs text-foreground">{a.what}</span>
                <span className="flex items-center gap-3">
                  <Chip tone="sky">{a.module}</Chip>
                  <span className="w-24 text-right text-[11px] text-muted-foreground">{timeAgo(a.at)}</span>
                </span>
              </Link>
            </li>
          ))}
          {items === null ? <li className="py-4 text-xs text-muted-foreground">Loading…</li> : null}
          {items !== null && rows.length === 0 ? <li className="py-4 text-xs text-muted-foreground">Nothing recorded yet.</li> : null}
        </ul>
      </FloatCard>
    </>
  );
}
