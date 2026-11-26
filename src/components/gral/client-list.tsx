
"use client";

// Shared pieces for the Clients dashboard and the All Client Records page:
// data + search + filter tabs, the search box, the table, and the profile
// slide-over (whose open client lives in the URL as ?client=CLT-001).

import { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, Download, Search } from "lucide-react";
import { ClientFile, type ClientFileTab } from "@/components/gral/client-file";
import { ClientFormPanel } from "@/components/gral/client-form";
import { ALL_OPTION, FilterMenu, optionsFrom } from "@/components/gral/filter-menu";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { KycBadge } from "@/components/gral/kyc-badge";
import { usePaged } from "@/components/gral/pager";
import { SlideOver } from "@/components/gral/shell";
import { Chip, Loader, NotRecorded, Recorded } from "@/components/gral/ui";
import { downloadCsv } from "@/lib/csv";
import { downloadXlsx } from "@/lib/xlsx";
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
  const book = useClients("", true, "CLIENT");
  const search = useClients(query, true, "CLIENT");
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
        <button key={c.id} type="button" onClick={() => onView(c)} className="block w-full py-4 text-left outline-none focus-visible:ring-2 focus-visible:ring-sky">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
            <div className="min-w-0">
              <p className="text-sm font-semibold">{c.name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {c.sector}
              </p>
            </div>
            {c.nonCompliant ? <Chip tone="danger">Flagged</Chip> : <KycBadge short kyc={c.kyc} status={c.kycStatus} gateStatus={c.kycGateStatus} />}
          </div>
          <div className="mt-3">
            <div className="min-w-0 text-xs text-muted-foreground">
              <p>
                {c.activePolicies} active {c.activePolicies === 1 ? "policy" : "policies"}
              </p>
              {c.manager ? <p className="mt-0.5 break-words">{c.manager}</p> : null}
            </div>
          </div>
        </button>
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
              <tr key={c.id} onClick={() => onView(c)} className="group cursor-pointer transition-colors hover:bg-secondary/40">
                <Td className="sticky left-0 z-[1] bg-card group-hover:bg-secondary/40">
                  {/* The whole row opens the file; this button is the keyboard way in. */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onView(c);
                    }}
                    className="block max-w-full truncate rounded text-left text-sm font-medium outline-none group-hover:text-primary group-hover:underline focus-visible:ring-2 focus-visible:ring-sky"
                    title={`Open ${c.name}`}
                  >
                    {c.name}
                  </button>
                  {c.nonCompliant ? <div><Chip tone="danger">Flagged</Chip></div> : null}
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
const CLIENT_COLUMNS = ["Client ID", "Client", "Type", "Sector", "Address", "Contact person", "Contact email", "Contact phone", "Active policies", "KYC", "Non-compliant", "Account manager"];

function clientRows(clients: Client[]) {
  return [
    CLIENT_COLUMNS,
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
  ];
}

export type DownloadFormat = "xlsx" | "csv";

export function downloadClients(clients: Client[], format: DownloadFormat = "xlsx", name = "clients") {
  const stamp = new Date().toISOString().slice(0, 10);
  if (format === "csv") downloadCsv(`${name}-${stamp}.csv`, clientRows(clients));
  else downloadXlsx(`${name}-${stamp}.xlsx`, clientRows(clients), "Clients");
}

const NO_SECTOR = "Not recorded";
const sectorOf = (c: Client) => c.sector || NO_SECTOR;
const fileSlug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/**
 * Download button with a small panel: pick the sectors (all, one or a few) and
 * Excel or CSV. It downloads from the list it is given, so a page's tab and
 * search still apply.
 */
export function DownloadClientsMenu({ clients, sector = "" }: { clients: Client[]; sector?: string }) {
  const sectors = useMemo(() => [...new Set(clients.map(sectorOf))].sort((a, b) => a.localeCompare(b)), [clients]);
  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of clients) m.set(sectorOf(c), (m.get(sectorOf(c)) ?? 0) + 1);
    return m;
  }, [clients]);
  const [open, setOpen] = useState(false);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [format, setFormat] = useState<DownloadFormat>("xlsx");
  const [query, setQuery] = useState("");

  const all = picked.size === 0;
  const chosen = all ? clients : clients.filter((c) => picked.has(sectorOf(c)));
  const q = query.trim().toLowerCase();
  const shown = q ? sectors.filter((s) => s.toLowerCase().includes(q)) : sectors;
  const toggle = (s: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s);
      else next.add(s);
      return next.size === sectors.length ? new Set() : next;
    });

  function download() {
    const name = all ? "clients" : picked.size === 1 ? `clients-${fileSlug([...picked][0]!)}` : "clients-selected-sectors";
    downloadClients(chosen, format, name);
    setOpen(false);
  }

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (next) setPicked(sector && sectors.includes(sector) ? new Set([sector]) : new Set());
        else setQuery("");
      }}
    >
      <DropdownMenuTrigger
        disabled={clients.length === 0}
        className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-sm font-medium outline-none transition-colors hover:bg-secondary focus-visible:ring-2 focus-visible:ring-sky disabled:opacity-50"
      >
        <Download className="size-4" /> Download
        <ChevronDown className="size-3.5 text-subtle" />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={8}
        className="w-80 max-w-[calc(100vw-2rem)] rounded-2xl p-0 shadow-[var(--shadow-float)]"
        onKeyDown={(e) => {
          // Let typing and space reach the search box and checkboxes; Escape still closes.
          if (e.key !== "Escape") e.stopPropagation();
        }}
      >
        <div className="border-b border-border px-4 pt-4 pb-3">
          <p className="text-sm font-semibold">Download clients</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Choose the sectors, or leave all of them.</p>
        </div>

        <div className="max-h-64 overflow-y-auto px-2 py-2">
          {sectors.length > 8 ? (
            <label className="mx-1 mb-1 flex items-center gap-2 rounded-xl border border-border px-3 py-2">
              <Search className="size-3.5 text-subtle" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Find a sector"
                aria-label="Find a sector"
                className="w-full bg-transparent text-xs outline-none"
              />
            </label>
          ) : null}
          {!q ? <SectorCheck label="All sectors" count={clients.length} checked={all} onChange={() => setPicked(new Set())} /> : null}
          {shown.map((s) => (
            <SectorCheck key={s} label={s} count={counts.get(s) ?? 0} checked={!all && picked.has(s)} onChange={() => toggle(s)} />
          ))}
          {shown.length === 0 ? <p className="px-3 py-2 text-xs text-muted-foreground">No sector matches.</p> : null}
        </div>

        <div className="border-t border-border px-4 py-3">
          <p className="text-xs font-medium text-muted-foreground">File type</p>
          <div className="mt-2 grid grid-cols-2 gap-1 rounded-full bg-secondary p-1" role="radiogroup" aria-label="File type">
            {(
              [
                ["xlsx", "Excel (.xlsx)"],
                ["csv", "CSV"],
              ] as const
            ).map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="radio"
                aria-checked={format === value}
                onClick={() => setFormat(value)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-sky",
                  format === value ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="text-xs text-muted-foreground">
            {chosen.length} {chosen.length === 1 ? "client" : "clients"}
          </span>
          <button
            type="button"
            disabled={chosen.length === 0}
            onClick={download}
            className="rounded-full bg-primary px-4 py-2 text-xs font-semibold text-primary-foreground outline-none transition-opacity hover:opacity-90 focus-visible:ring-2 focus-visible:ring-sky disabled:opacity-50"
          >
            Download
          </button>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SectorCheck({ label, count, checked, onChange }: { label: string; count: number; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-sm hover:bg-secondary">
      <input type="checkbox" checked={checked} onChange={onChange} className="size-4 accent-[var(--primary)]" />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums text-muted-foreground">{count}</span>
    </label>
  );
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
