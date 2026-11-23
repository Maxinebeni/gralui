"use client";

// A filter pill that opens a list to choose from (e.g. Insurer: All insurers).

import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

/** Lists longer than this get a search box (e.g. every client on Reports). */
const SEARCH_FROM = 8;
/** At most this many matches are listed; typing narrows the rest. */
const SHOW_AT_MOST = 50;

export function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  /** The chosen option's value. */
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  const searchable = options.length > SEARCH_FROM;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const input = useRef<HTMLInputElement>(null);

  // The menu moves focus to itself when it opens; put it in the search box instead.
  useEffect(() => {
    if (!open || !searchable) return;
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [open, searchable]);

  const q = query.trim().toLowerCase();
  const matches = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  const shown = matches.slice(0, SHOW_AT_MOST);

  return (
    <DropdownMenu
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery("");
      }}
    >
      <DropdownMenuTrigger className="float-pill flex max-w-full items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-foreground outline-none transition-colors hover:border-sky/50">
        <span className="text-muted-foreground">{label}:</span>
        <span className="truncate">{current?.label}</span>
        <ChevronDown className="size-3.5 text-subtle" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="max-h-80 w-72 max-w-[calc(100vw-2rem)] rounded-2xl p-2 shadow-[var(--shadow-float)]">
        {searchable ? (
          <div className="sticky -top-2 z-10 -mx-2 -mt-2 mb-1 bg-popover px-2 pt-2 pb-1">
            <label className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
              <Search className="size-3.5 shrink-0 text-subtle" />
              <input
                ref={input}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                // Letters go into the box, not to the menu's jump-to-item behaviour.
                // Arrow down moves into the list; Escape still closes the menu.
                onKeyDown={(e) => {
                  if (e.key === "ArrowDown") {
                    e.preventDefault();
                    (e.currentTarget.closest('[role="menu"]')?.querySelector('[role="menuitem"]') as HTMLElement | null)?.focus();
                  } else if (e.key !== "Escape" && e.key !== "Tab") {
                    e.stopPropagation();
                  }
                }}
                placeholder={`Search ${label.toLowerCase()}`}
                aria-label={`Search ${label.toLowerCase()}`}
                className="w-full bg-transparent text-sm outline-none placeholder:text-subtle"
              />
            </label>
          </div>
        ) : null}
        {shown.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => onChange(o.value)}
            className={cn("justify-between rounded-xl px-3 py-2.5 text-sm", o.value === value && "font-medium text-primary")}
          >
            <span className="min-w-0 truncate">{o.label}</span>
            {o.value === value ? <Check className="size-4 shrink-0" /> : null}
          </DropdownMenuItem>
        ))}
        {matches.length === 0 ? <p className="px-3 py-3 text-sm text-muted-foreground">No match for &ldquo;{query.trim()}&rdquo;.</p> : null}
        {matches.length > shown.length ? (
          <p className="px-3 py-2 text-xs text-muted-foreground">
            Showing {shown.length} of {matches.length}. Type more of the name to narrow the list.
          </p>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/** The value of a filter's "all" option. */
export const ALL_OPTION = "__all__";

/** An "all" option followed by each distinct value, sorted. */
export function optionsFrom(values: string[], allLabel: string, labelOf: (value: string) => string = (v) => v) {
  return [
    { value: ALL_OPTION, label: allLabel },
    ...[...new Set(values.filter(Boolean))].sort().map((value) => ({ value, label: labelOf(value) })),
  ];
}

export function ClearFilters({ onClear }: { onClear: () => void }) {
  return (
    <button type="button" onClick={onClear} className="px-1.5 text-xs font-medium text-primary underline underline-offset-4 hover:opacity-70">
      Clear filters
    </button>
  );
}
