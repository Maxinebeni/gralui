
"use client";

// Shared pieces for the Clients dashboard and the All Client Records page:
// data + search + filter tabs, the search box, the table, and the profile
// slide-over (whose open client lives in the URL as ?client=CLT-001).

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { ClientFile, type ClientFileTab } from "@/components/gral/client-file";
import { ClientFormPanel } from "@/components/gral/client-form";
import { ALL_OPTION, FilterMenu, optionsFrom } from "@/components/gral/filter-menu";
import { KycBadge } from "@/components/gral/kyc-badge";
import { usePaged } from "@/components/gral/pager";
import { SlideOver } from "@/components/gral/shell";
import { Chip, Loader, NotRecorded, Recorded, TextLink } from "@/components/gral/ui";
import { downloadCsv } from "@/lib/csv";
import { useClients, useRefresh } from "@/lib/queries";
import type { Client } from "@/lib/types";
import { cn } from "@/lib/utils";

export const CLIENT_TABS = ["All", "KYC ready", "KYC not ready", "Non-compliant"] as const;
export type ClientTab = (typeof CLIENT_TABS)[number];
const ALL_TABS: readonly ClientTab[] = CLIENT_TABS;

/** Filters the client list the same way the tabs do. */
export function filterClientsBy(clients: Client[], tab: ClientTab, sector = "") {
  const inSector = sector ? clients.filter((c) => c.sector === sector) : clients;
  if (tab === "KYC not ready") return inSector.filter((c) => !c.kyc);
  if (tab === "KYC ready") return inSector.filter((c) => c.kyc);
  if (tab === "Non-compliant") return inSector.filter((c) => c.nonCompliant);
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

const HEADINGS = ["Client", "Type", "Sector", "Active policies", "KYC", "Manager"];
const COMPACT_HEADINGS = HEADINGS;
const COMPACT_WIDTHS = ["25%", "13%", "16%", "12%", "14%", "20%"];
const FULL_WIDTHS = COMPACT_WIDTHS;

export function ClientsTable({
  clients,
  onView,
  emptyMessage,
  compact = false,
}: {
  clients: Client[];
  onView: (c: Client) => void;
  emptyMessage: React.ReactNode;
  /** A dashboard card has less room than the dedicated full client list. */
  compact?: boolean;
}) {
  const { items, pager } = usePaged(clients);
  const headings = compact ? COMPACT_HEADINGS : HEADINGS;
  return (
    <>
    {/* Phones: one card per client instead of a wide table. */}
    <div className="divide-y divide-border px-4 sm:hidden">
      {items.map((c) => (
        <article key={c.id} className="py-4">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{c.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {c.sector}
              </p>
            </div>
            {c.nonCompliant ? <Chip tone="danger">Flagged</Chip> : <KycBadge short kyc={c.kyc} status={c.kycStatus} gateStatus={c.kycGateStatus} />}
          </div>
          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3">
            <div className="min-w-0 text-xs text-muted-foreground">
              <p>
                {c.activePolicies} active {c.activePolicies === 1 ? "policy" : "policies"}
              </p>
              {c.manager ? <p className="mt-0.5 break-words">{c.manager}</p> : null}
            </div>
            <button
              type="button"
              onClick={() => onView(c)}
              className="rounded-full border border-border bg-card px-3.5 py-2 text-xs font-medium hover:bg-secondary"
            >
              View file
            </button>
          </div>
        </article>
      ))}
      {clients.length === 0 ? <div className="py-6 text-center text-sm text-muted-foreground">{emptyMessage}</div> : null}
    </div>
    <div className="hidden max-w-full overflow-x-auto px-2 pb-4 sm:block">
      <table className={cn("w-full table-fixed border-separate border-spacing-0 text-left", !compact && "min-w-[1050px]")}>
        <caption className="sr-only">Client records</caption>
        <colgroup>
          {(compact ? COMPACT_WIDTHS : FULL_WIDTHS).map((width, i) => <col key={i} style={{ width }} />)}
        </colgroup>
        <thead>
          <tr className="bg-pale text-[11px] text-muted-foreground">
            {headings.map((h, i, arr) => (
              <th
                key={h}
                className={cn(
                  "sticky top-0 z-10 px-2 py-2.5 text-left font-medium whitespace-nowrap sm:px-2.5",
                  i === 0 && "rounded-l-xl",
                  i === arr.length - 1 && "rounded-r-xl",
                  i === 0 && "sticky left-0 z-20 bg-pale",
                  h === "Active policies" && "whitespace-normal leading-tight",
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
              <td colSpan={headings.length} className="px-3 py-8 text-center text-sm text-muted-foreground">
                {emptyMessage}
              </td>
            </tr>
          ) : (
            items.map((c) => (
              <tr key={c.id} className="group transition-colors hover:bg-secondary/20">
                <Td className="sticky left-0 z-[1] bg-card group-hover:bg-secondary/20">
                  <div className="truncate text-sm font-medium" title={c.name}>{c.name}</div>
                  {c.nonCompliant ? <div><Chip tone="danger">Flagged</Chip></div> : null}
                  <TextLink onClick={() => onView(c)}>View file</TextLink>
                </Td>
                <Td className="text-sm">
                  <span className="block truncate" title={c.type}>{c.type}</span>
                </Td>
                <Td className="text-sm">
                  <span className="block truncate" title={c.sector}>
                    <Recorded value={c.sector} />
                  </span>
                </Td>
                <Td className="text-sm tabular-nums">{c.activePolicies}</Td>
                <Td>
                  <KycBadge short kyc={c.kyc} status={c.kycStatus} gateStatus={c.kycGateStatus} />
                </Td>
                <Td>
                  <div className="min-w-0 break-words text-sm leading-snug" title={c.manager || "Manager not recorded"}>
                    {c.manager || <NotRecorded />}
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

  // Links from notifications carry the client's server id rather than its reference.
  const open = allClients.find((c) => c.id === openId || (!!openId && c.uuid === openId)) ?? null;
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
  initialTab,
}: {
  client: Client | null;
  onClose: () => void;
  onChanged?: () => void;
  /** The tab the file opens on, e.g. Policies from a Quick action. */
  initialTab?: ClientFileTab;
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
            key={`${shown.id}-${initialTab ?? ""}`}
            client={shown}
            initialTab={initialTab}
            onClose={handleClose}
            onEdit={() => setEditing(true)}
            onChanged={handleSaved}
          />
        )
      ) : null}
    </SlideOver>
  );
}

function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("border-b border-border px-3 py-3 align-middle", className)}>{children}</td>;
}

/** The clients as listed, for Download. */
export function downloadClients(clients: Client[], fileName = "clients.csv") {
  downloadCsv(fileName, [
    ["Client ID", "Client", "Type", "Sector", "Address", "Contact person", "Contact email", "Contact phone", "Active policies", "KYC", "Non-compliant", "Account manager"],
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
