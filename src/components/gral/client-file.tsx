"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Flag, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import { listClientClaims } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { clientPermissions } from "@/lib/permissions";
import type { Client, ClientClaim } from "@/lib/types";
import { Chip, NavyButton, OutlineButton, Person, SegmentedTabs } from "./ui";

const TABS = ["KYC & Compliance", "Policies", "Claims", "Correspondence"] as const;
export type ClientFileTab = (typeof TABS)[number];

export function ClientFile({
  client,
  onClose,
  initialTab = "KYC & Compliance",
}: {
  client: Client;
  onClose: () => void;
  initialTab?: ClientFileTab;
}) {
  const [tab, setTab] = useState<ClientFileTab>(initialTab);
  const [claims, setClaims] = useState<ClientClaim[]>([]);
  const { user } = useCurrentUser();
  const { canFlagNonCompliant, seesDocumentDetail } = clientPermissions(user.role);

  useEffect(() => {
    let cancelled = false;
    listClientClaims(client.name).then((c) => {
      if (!cancelled) setClaims(c);
    });
    return () => {
      cancelled = true;
    };
  }, [client.name]);

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-lg font-semibold tracking-tight">{client.name}</span>
            {client.nonCompliant ? <Chip tone="danger">Non-Compliant</Chip> : <Chip tone="success">Compliant</Chip>}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {client.id} · {client.type} · {client.sector} · {client.activePolicies} active policies
          </p>
          <div className="mt-2">
            <Person name={client.manager} />
          </div>
        </div>
        <button
          type="button"
          aria-label="Close client file"
          onClick={onClose}
          className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="px-4 py-5 sm:px-6">
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

        {tab === "KYC & Compliance" ? (
          seesDocumentDetail ? (
            <div className="mt-4 space-y-2">
              {client.documents.map((d) => (
                <div
                  key={d.name}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <span className="flex items-center gap-2 text-xs">
                    {d.filed ? (
                      <Check className="size-4 text-success" />
                    ) : (
                      <Clock className="size-4 text-danger" />
                    )}
                    {d.name}
                  </span>
                  {!d.filed ? (
                    <Chip tone="danger">Missing</Chip>
                  ) : d.status === "expired" ? (
                    <Chip tone="danger">Expired {d.expiry}</Chip>
                  ) : d.status === "soon" ? (
                    <Chip tone="warning">Expires {d.expiry}</Chip>
                  ) : (
                    <Chip tone="success">{d.expiry ? `Valid to ${d.expiry}` : "Filed"}</Chip>
                  )}
                </div>
              ))}
              {canFlagNonCompliant ? (
                <NavyButton
                  className="mt-2"
                  onClick={() => toast.success(`${client.name} flagged as non-compliant.`)}
                >
                  <Flag className="size-3.5" /> Flag as Non-Compliant
                </NavyButton>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 text-xs text-muted-foreground">
              Document details are not part of the Finance Director view.
            </p>
          )
        ) : null}

        {tab === "Policies" ? (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-left">
              <thead>
                <tr className="bg-pale text-[11px] text-muted-foreground">
                  {["Policy ID", "Class", "Insurer", "Sum Insured", "Premium", "Renewal", "Status"].map(
                    (h, i, arr) => (
                      <th
                        key={h}
                        className={cn(
                          "px-3 py-2.5 font-medium whitespace-nowrap",
                          i === 0 && "rounded-l-xl",
                          i === arr.length - 1 && "rounded-r-xl",
                        )}
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {client.policies.map((p) => (
                  <tr key={p.id}>
                    <td className="border-b border-border px-3 py-3 text-xs font-medium">{p.id}</td>
                    <td className="border-b border-border px-3 py-3 text-xs">{p.classOfInsurance}</td>
                    <td className="border-b border-border px-3 py-3 text-xs">{p.insurer}</td>
                    <td className="border-b border-border px-3 py-3 text-xs whitespace-nowrap">
                      {formatRwf(p.sumInsured)}
                    </td>
                    <td className="border-b border-border px-3 py-3 text-xs whitespace-nowrap">
                      {formatRwf(p.premium)}
                    </td>
                    <td className="border-b border-border px-3 py-3 text-xs whitespace-nowrap">
                      {p.renewal}
                    </td>
                    <td className="border-b border-border px-3 py-3">
                      <Chip tone={p.status === "Active" ? "success" : p.status === "In Renewal" ? "sky" : "neutral"}>
                        {p.status}
                      </Chip>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {tab === "Claims" ? (
          <div className="mt-4 space-y-2">
            {claims.length === 0 ? (
              <p className="text-xs text-muted-foreground">No claims on record.</p>
            ) : (
              claims.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5"
                >
                  <div>
                    <p className="text-xs font-medium">{c.id}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {c.classOfInsurance} · {formatRwf(c.amount)}
                    </p>
                  </div>
                  <Chip tone={c.sla === "breached" ? "danger" : c.sla === "approaching" ? "warning" : "success"}>
                    Step {c.step}
                  </Chip>
                </div>
              ))
            )}
          </div>
        ) : null}

        {tab === "Correspondence" ? (
          <div className="mt-4 space-y-2">
            {client.correspondence.map((c) => (
              <div key={c.subject} className="rounded-xl border border-border px-3 py-2.5">
                <p className="text-xs font-medium">{c.subject}</p>
                <p className="text-[11px] text-muted-foreground">
                  {c.date} · {c.channel}
                </p>
              </div>
            ))}
            <OutlineButton onClick={() => toast.success("Correspondence entry added.")}>
              <Plus className="size-3.5" /> Add
            </OutlineButton>
          </div>
        ) : null}
      </div>
    </div>
  );
}
