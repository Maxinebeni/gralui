
"use client";

// Shared pieces for the Clients dashboard and the All Client Records page:
// data + search + filter tabs, the search box, the table, and the profile
// slide-over (whose open client lives in the URL as ?client=CLT-001).

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ClientFile } from "@/components/gral/client-file";
import { ClientFormPanel } from "@/components/gral/client-form";
import { SlideOver } from "@/components/gral/shell";
import { Chip, NotRecorded, Person, Recorded, TextLink } from "@/components/gral/ui";
import { useClients, useRefresh } from "@/lib/queries";
import type { Client } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CLIENT_TABS = ["All", "KYC Pending", "Missing Docs", "Non-Compliant"] as const;
export type ClientTab = (typeof CLIENT_TABS)[number];

/** Loads the client book and applies the search query + filter tab. */
export function useClientList() {
  const [tab, setTab] = useState<ClientTab>("All");
  const [query, setQuery] = useState("");
  const book = useClients("");
  const search = useClients(query);
  const allClients = book.data ?? [];
  const matches = search.data ?? [];
  // True while the table's rows are loading, so the table can say
  // "Loading clients…" instead of "No clients match this filter".
  const loading = search.isFetching;
  const refresh = useRefresh();
  const reload = useCallback(() => refresh("clients"), [refresh]);

  const rows = useMemo(() => {
    if (tab === "KYC Pending") return matches.filter((c) => !c.kyc);
    if (tab === "Missing Docs") return matches.filter((c) => c.docsFiled < c.docsTotal);
    if (tab === "Non-Compliant") return matches.filter((c) => c.nonCompliant);
    return matches;
  }, [tab, matches]);

  // While loading, the table shows this text in place of the empty message.
  // Rows already on screen stay visible during a reload or a new search.
  const emptyMessage =
    loading && matches.length === 0
      ? "Loading clients…"
      : `No clients match ${query ? `“${query}”` : "this filter"}.`;

  return { allClients, rows, tab, setTab, query, setQuery, emptyMessage, reload, loading };
}

export function ClientSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex w-full items-center gap-2 rounded-full bg-secondary px-3.5 py-1.5 focus-within:ring-2 focus-within:ring-sky/30 sm:w-auto">
      <Search className="size-3.5 shrink-0 text-subtle" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search name, ID, sector, manager…"
        aria-label="Search clients"
        className="w-full min-w-0 bg-transparent text-xs outline-none placeholder:text-subtle sm:w-48"
      />
    </label>
  );
}

const HEADINGS = ["Client", "Type", "Sector", "Active", "KYC", "Policies", "Claims", "Corr.", "Docs Progress", "Manager"];

export function ClientsTable({
  clients,
  onView,
  emptyMessage,
}: {
  clients: Client[];
  onView: (c: Client) => void;
  emptyMessage: string;
}) {
  return (
    <div className="overflow-x-auto px-2 pb-4">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
        <thead>
          <tr className="bg-pale text-[11px] text-muted-foreground">
            {HEADINGS.map((h, i, arr) => (
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
            ))}
          </tr>
        </thead>
        <tbody>
          {clients.length === 0 ? (
            <tr>
              <td colSpan={HEADINGS.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            clients.map((c) => (
              <tr key={c.id}>
                <Td>
                  <div className="max-w-[150px] truncate text-sm font-medium">{c.name}</div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{c.id}</span>
                    {c.nonCompliant ? <Chip tone="danger">Flagged</Chip> : null}
                  </div>
                  <TextLink onClick={() => onView(c)}>View File</TextLink>
                </Td>
                <Td className="text-sm">
                  <span className="block max-w-[90px] truncate">{c.type}</span>
                </Td>
                <Td className="text-sm">
                  <span className="block max-w-[80px] truncate">
                    <Recorded value={c.sector} />
                  </span>
                </Td>
                <Td className="text-sm">{c.activePolicies}</Td>
                <Td>
                  <StatusDot ok={c.kyc} title={c.kycGateStatus ? `KYC: ${c.kycGateStatus}` : undefined} />
                </Td>
                <Td>
                  <StatusDot ok={c.policiesOk} />
                </Td>
                <Td>
                  <StatusDot ok={c.claimsOk} />
                </Td>
                <Td>
                  <StatusDot ok={c.correspondenceOk} />
                </Td>
                <Td>
                  <div className="w-16">
                    <div className="text-xs text-muted-foreground">
                      {c.docsFiled} / {c.docsTotal}
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-secondary">
                      <div
                        className="h-full rounded-full bg-sky"
                        style={{ width: `${(c.docsFiled / c.docsTotal) * 100}%` }}
                      />
                    </div>
                  </div>
                </Td>
                <Td>
                  <div className="max-w-[70px] truncate">
                    {c.manager ? <Person name={c.manager} /> : <NotRecorded />}
                  </div>
                </Td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

/** Profile slide-over driven by ?client=ID, so a profile can be linked to directly. */
export function useOpenClient(allClients: Client[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openId = searchParams.get("client");

  const open = allClients.find((c) => c.id === openId) ?? null;
  const setOpen = (c: Client | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (c) params.set("client", c.id);
    else params.delete("client");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return { open, setOpen };
}

/**
 * The client file panel. The Edit button swaps the panel to the Edit Client
 * form and back. After any save, the panel shows the latest details straight
 * away, and onChanged lets the page reload its table.
 */
export function ClientFileSlideOver({
  client,
  onClose,
  onChanged,
}: {
  client: Client | null;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const [latest, setLatest] = useState<Client | null>(null);
  const [editing, setEditing] = useState(false);
  const shown = client && latest && latest.id === client.id ? latest : client;

  function handleSaved(saved: Client) {
    setLatest(saved);
    onChanged?.();
  }

  function handleClose() {
    setEditing(false);
    onClose();
  }

  return (
    <SlideOver open={!!shown} onClose={handleClose}>
      {shown ? (
        editing ? (
          <ClientFormPanel
            key={`edit-${shown.id}`}
            client={shown}
            onClose={() => setEditing(false)}
            onSaved={handleSaved}
          />
        ) : (
          <ClientFile
            key={shown.id}
            client={shown}
            onClose={handleClose}
            onEdit={() => setEditing(true)}
            onChanged={handleSaved}
          />
        )
      ) : null}
    </SlideOver>
  );
}

function StatusDot({ ok, title }: { ok: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "flex size-5 items-center justify-center rounded-full text-[10px] font-semibold",
        ok ? "bg-success-soft text-success" : "bg-warning-soft text-warning",
      )}
    >
      {ok ? "✓" : "!"}
    </span>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-border px-3 py-3 align-middle", className)}>{children}</td>;
}
