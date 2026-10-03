"use client";

import { useEffect, useState } from "react";
import { Check, Clock, Flag, Mail, MapPin, Pencil, Phone, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import { listClientClaims } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { clientPermissions } from "@/lib/permissions";
import type { Client, ClientClaim, Policy } from "@/lib/types";
import { Chip, NavyButton, OutlineButton, Person, SegmentedTabs, TextLink } from "./ui";
import { canManageClients } from "./client-form";
import { PolicyForm } from "./policy-form";

const TABS = ["KYC & Compliance", "Policies", "Claims", "Correspondence"] as const;
export type ClientFileTab = (typeof TABS)[number];

export function ClientFile({
  client,
  onClose,
  onEdit,
  onChanged,
  initialTab = "KYC & Compliance",
}: {
  client: Client;
  onClose: () => void;
  /** Opens the Edit Client form. The Edit button only shows when this is given. */
  onEdit?: () => void;
  /** Called with the updated client after a policy is added or edited. */
  onChanged?: (updated: Client) => void;
  initialTab?: ClientFileTab;
}) {
  const [tab, setTab] = useState<ClientFileTab>(initialTab);
  const [claims, setClaims] = useState<ClientClaim[]>([]);
  // null: show the policy table. "new": Add Policy form. A policy: Edit Policy form.
  const [policyEditor, setPolicyEditor] = useState<Policy | "new" | null>(null);
  const { user } = useCurrentUser();
  const { canFlagNonCompliant, seesDocumentDetail } = clientPermissions(user.role);
  const canManage = canManageClients(user.role);

  useEffect(() => {
    let cancelled = false;
    listClientClaims(client.name).then((c) => {
      if (!cancelled) setClaims(c);
    });
    return () => {
      cancelled = true;
    };
  }, [client.name]);

  const policyHeadings = ["Policy ID", "Class", "Insurer", "Sum Insured", "Premium", "Start", "Renewal", "Status"];
  if (canManage) policyHeadings.push("");

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
          {client.address ? (
            <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
              <MapPin className="size-3.5 shrink-0" /> {client.address}
            </p>
          ) : null}
          {client.contact ? (
            <div className="mt-2 rounded-xl bg-pale px-3 py-2 text-xs">
              <p className="font-medium">
                {client.contact.name} <span className="font-normal text-muted-foreground">· {client.contact.title}</span>
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground">
                <a
                  href={`mailto:${client.contact.email}`}
                  className="flex items-center gap-1 text-primary underline underline-offset-2 hover:opacity-70"
                >
                  <Mail className="size-3.5" /> {client.contact.email}
                </a>
                <span className="flex items-center gap-1">
                  <Phone className="size-3.5" /> {client.contact.phone}
                </span>
              </p>
            </div>
          ) : null}
          <div className="mt-2">
            <Person name={client.manager} />
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {canManage && onEdit ? (
            <OutlineButton onClick={onEdit}>
              <Pencil className="size-3.5" /> Edit
            </OutlineButton>
          ) : null}
          <button
            type="button"
            aria-label="Close client file"
            onClick={onClose}
            className="flex size-9 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
      </div>

      <div className="px-4 py-5 sm:px-6">
        <SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />

        {tab === "KYC & Compliance" ? (
          seesDocumentDetail ? (
            <div className="mt-4 space-y-2">
              {client.documents.length === 0 ? (
                <p className="text-xs text-muted-foreground">No KYC documents uploaded yet. Section A: Not Started.</p>
              ) : null}
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
          policyEditor ? (
            <PolicyForm
              key={policyEditor === "new" ? "new" : policyEditor.id}
              client={client}
              policy={policyEditor === "new" ? null : policyEditor}
              onCancel={() => setPolicyEditor(null)}
              onSaved={(updated) => {
                setPolicyEditor(null);
                onChanged?.(updated);
              }}
            />
          ) : (
            <div className="mt-4">
              {canManage && onChanged ? (
                <div className="mb-3 flex justify-end">
                  <NavyButton onClick={() => setPolicyEditor("new")}>
                    <Plus className="size-3.5" /> Add Policy
                  </NavyButton>
                </div>
              ) : null}

              {client.policies.length === 0 ? (
                <p className="rounded-xl border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">
                  No policies on record for this client yet.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
                    <thead>
                      <tr className="bg-pale text-[11px] text-muted-foreground">
                        {policyHeadings.map((h, i, arr) => (
                          <th
                            key={h || "actions"}
                            className={cn(
                              "px-3 py-2.5 font-medium whitespace-nowrap",
                              i === 0 && "rounded-l-xl",
                              i === arr.length - 1 && "rounded-r-xl",
                            )}
                          >
                            {h}
                          </th>
                        ))}
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
                          <td className="border-b border-border px-3 py-3 text-xs whitespace-nowrap">{p.start}</td>
                          <td className="border-b border-border px-3 py-3 text-xs whitespace-nowrap">
                            {p.renewal}
                          </td>
                          <td className="border-b border-border px-3 py-3">
                            <Chip
                              tone={
                                p.status === "Active"
                                  ? "success"
                                  : p.status === "In Renewal"
                                    ? "sky"
                                    : p.status === "Cancelled"
                                      ? "danger"
                                      : "neutral"
                              }
                            >
                              {p.status}
                            </Chip>
                          </td>
                          {canManage ? (
                            <td className="border-b border-border px-3 py-3">
                              {onChanged ? <TextLink onClick={() => setPolicyEditor(p)}>Edit</TextLink> : null}
                            </td>
                          ) : null}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )
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
            {client.correspondence.length === 0 ? (
              <p className="text-xs text-muted-foreground">No correspondence on record yet.</p>
            ) : null}
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