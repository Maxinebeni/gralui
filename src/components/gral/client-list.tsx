
"use client";

// Shared pieces for the Clients dashboard and the All Client Records page:
// data + search + filter tabs, the search box, the table, and the profile
// slide-over (whose open client lives in the URL as ?client=CLT-001).

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ClientFile } from "@/components/gral/client-file";
import { ClientFormPanel } from "@/components/gral/client-form";
import { ALL_OPTION, FilterMenu, optionsFrom } from "@/components/gral/filter-menu";
import { KycBadge } from "@/components/gral/kyc-badge";
import { usePaged } from "@/components/gral/pager";
import { SlideOver } from "@/components/gral/shell";
import { Chip, Loader, NotRecorded, Person, Recorded, TextLink } from "@/components/gral/ui";
import { downloadCsv } from "@/lib/csv";
import { useClients, useRefresh } from "@/lib/queries";
import type { Client } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CLIENT_TABS = ["All", "KYC Pending", "Missing Docs", "Non-Compliant"] as const;
/** "KYC Complete" has no tab; its summary tile sets it. */
export type ClientTab = (typeof CLIENT_TABS)[number] | "KYC Complete";
const ALL_TABS: readonly ClientTab[] = [...CLIENT_TABS, "KYC Complete"];

/** Filters the client list the same way the tabs do. */
export function filterClientsBy(clients: Client[], tab: ClientTab, sector = "") {
  const inSector = sector ? clients.filter((c) => c.sector === sector) : clients;
  if (tab === "KYC Pending") return inSector.filter((c) => !c.kyc);
  if (tab === "KYC Complete") return inSector.filter((c) => c.kyc);
  if (tab === "Missing Docs") return inSector.filter((c) => c.docsFiled < c.docsTotal);
  if (tab === "Non-Compliant") return inSector.filter((c) => c.nonCompliant);
  return inSector;
}

/** The filter as a query string, so "See all" opens the full list filtered the same way. */
export function clientFilterQuery(tab: ClientTab, sector: string) {
  const params = new URLSearchParams();
  if (tab !== "All") params.set("view", tab);
  if (sector) params.set("sector", sector);
  const qs = params.toString();
  return qs ? `?${qs}` : "";
}

/** Loads the client book and applies the search query, filter tab and sector. */
export function useClientList() {
  const searchParams = useSearchParams();
  const fromUrl = searchParams.get("view") as ClientTab | null;
  const [tab, setTab] = useState<ClientTab>(fromUrl && ALL_TABS.includes(fromUrl) ? fromUrl : "All");
  const [sector, setSector] = useState(searchParams.get("sector") ?? "");
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

  const rows = useMemo(() => filterClientsBy(matches, tab, sector), [tab, sector, matches]);
  const sectors = useMemo(() => [...new Set(allClients.map((c) => c.sector).filter((s): s is string => !!s))].sort(), [allClients]);

  // While loading, the table shows this text in place of the empty message.
  // Rows already on screen stay visible during a reload or a new search.
  const emptyMessage =
    loading && matches.length === 0
      ? <Loader label="Loading clients" />
      : `No clients match ${query ? `“${query}”` : "this filter"}.`;

  return { allClients, rows, tab, setTab, sector, setSector, sectors, query, setQuery, emptyMessage, reload, loading };
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
  emptyMessage: React.ReactNode;
}) {
  const { items, pager } = usePaged(clients);
  return (
    <>
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
            items.map((c) => (
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
                  <KycBadge short kyc={c.kyc} status={c.kycStatus} gateStatus={c.kycGateStatus} />
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
    {pager}
    </>
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

/** The clients as listed, for Download. */
export function downloadClients(clients: Client[], fileName = "clients.csv") {
  downloadCsv(fileName, [
    ["Client ID", "Client", "Type", "Sector", "Address", "Contact person", "Contact email", "Contact phone", "Active policies", "KYC", "Non-compliant", "Documents filed", "Account manager"],
    ...clients.map((c) => [
      c.id,
      c.name,
      c.type,
      c.sector,
      c.address,
      c.contact?.name,
      c.contact?.email,
      c.contact?.phone,
      c.activePolicies,
      c.kyc ? "Approved" : "Not approved",
      c.nonCompliant ? "Yes" : "No",
      `${c.docsFiled} / ${c.docsTotal}`,
      c.manager,
    ]),
  ]);
}

export function SectorFilter({ value, sectors, onChange }: { value: string; sectors: string[]; onChange: (sector: string) => void }) {
  return (
    <FilterMenu
      label="Sector"
      value={value || ALL_OPTION}
      options={optionsFrom(sectors, "All sectors")}
      onChange={(v) => onChange(v === ALL_OPTION ? "" : v)}
    />
  );
}
