"use client";

// Who did something in an activity list. Some records (new clients, new leads) do
// not say who created them; those show what kind of record it is instead of a dash.

import { Building2, FileCheck2, Handshake, RefreshCw, ShieldAlert } from "lucide-react";
import type { ActivityItem } from "@/lib/types";
import { Person } from "./ui";

const ICON = {
  Claims: ShieldAlert,
  Renewals: RefreshCw,
  Approvals: FileCheck2,
  Clients: Building2,
  Leads: Handshake,
} as const;

const LABEL = {
  Claims: "Claim record",
  Renewals: "Renewal record",
  Approvals: "Approval record",
  Clients: "Client record",
  Leads: "Lead record",
} as const;

export function ActivityWho({ item }: { item: ActivityItem }) {
  if (item.who.trim()) return <Person name={item.who} />;
  const Icon = ICON[item.module];
  return (
    <span className="inline-flex items-center gap-2 text-xs text-muted-foreground">
      <span className="flex size-7 items-center justify-center rounded-full bg-secondary">
        <Icon className="size-3.5" />
      </span>
      {LABEL[item.module]}
    </span>
  );
}
