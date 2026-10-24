"use client";

// Platform-wide search (Lovable's search overlay design), opened from the
// search icon in the top bar or Ctrl+K. It only searches the areas the
// signed-in user can open (same rules as the menu), so nobody sees results
// they are not allowed to view and no request goes to an area the backend
// would refuse. Results open the exact record, not just the page.

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatRwf } from "@/lib/format";
import { listClaimsSummary, listClients, listManagedUsers, listRenewals } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { canAccessPath } from "@/lib/permissions";

type Result = {
  key: string;
  group: "Users" | "Claims" | "Clients" | "Renewals";
  title: string;
  detail: string;
  href: string;
};

const GROUPS: Result["group"][] = ["Users", "Claims", "Clients", "Renewals"];
const PER_GROUP = 5;
/** Client search goes to the backend, so wait for at least this many letters. */
const CLIENT_MIN_CHARS = 2;

function matches(q: string, ...fields: (string | number | undefined)[]) {
  return fields.some((f) => f !== undefined && String(f).toLowerCase().includes(q));
}

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [active, setActive] = useState(0);

  const canSee = useMemo(
    () => ({
      clients: canAccessPath(user, "/clients"),
      renewals: canAccessPath(user, "/renewals"),
      claims: canAccessPath(user, "/claims"),
      users: canAccessPath(user, "/admin"),
    }),
    [user],
  );

  // The placeholder names only what this person can search.
  const searchable = [
    canSee.users && "users by name or email",
    canSee.clients && "clients",
    canSee.claims && "claims",
    canSee.renewals && "renewals",
  ].filter(Boolean) as string[];
  const placeholder = searchable.length
    ? `Search ${searchable.length > 1 ? `${searchable.slice(0, -1).join(", ")} or ${searchable.at(-1)}` : searchable[0]}…`
    : "Search…";

  useEffect(() => {
    if (!open) return undefined;
    setQuery("");
    setResults([]);
    setActive(0);
    const t = setTimeout(() => inputRef.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]);

  // Search shortly after the user stops typing.
  useEffect(() => {
    const q = query.trim().toLowerCase();
    if (!open || !q) {
      setResults([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(async () => {
      const [users, claims, clients, renewals] = await Promise.all([
        canSee.users ? listManagedUsers().catch(() => []) : Promise.resolve([]),
        canSee.claims ? listClaimsSummary().catch(() => []) : Promise.resolve([]),
        canSee.clients && q.length >= CLIENT_MIN_CHARS ? listClients(q).catch(() => []) : Promise.resolve([]),
        canSee.renewals ? listRenewals().catch(() => []) : Promise.resolve([]),
      ]);

      const found: Result[] = [];
      for (const u of users.filter((u) => matches(q, u.fullName, u.email)).slice(0, PER_GROUP)) {
        found.push({
          key: `user-${u.id}`,
          group: "Users",
          title: u.fullName,
          detail: u.email,
          href: `/admin?user=${encodeURIComponent(u.id)}`,
        });
      }
      for (const c of claims.filter((c) => matches(q, c.id, c.client, c.classOfInsurance)).slice(0, PER_GROUP)) {
        found.push({
          key: `claim-${c.id}`,
          group: "Claims",
          title: c.id,
          detail: `${c.client} · ${c.classOfInsurance} · ${formatRwf(c.amount)}`,
          href: `/claims?claim=${encodeURIComponent(c.id)}`,
        });
      }
      for (const c of clients.slice(0, PER_GROUP)) {
        found.push({
          key: `client-${c.id}`,
          group: "Clients",
          title: c.name,
          detail: [c.id, c.type, c.sector].filter(Boolean).join(" · "),
          href: `/clients?client=${encodeURIComponent(c.id)}`,
        });
      }
      for (const r of renewals
        .filter((r) => matches(q, r.id, r.policyId, r.client, r.classOfInsurance, r.insurer))
        .slice(0, PER_GROUP)) {
        found.push({
          key: `renewal-${r.id}`,
          group: "Renewals",
          title: r.policyId,
          detail: `${r.client} · ${r.classOfInsurance} · ${r.insurer}`,
          href: `/renewals?case=${encodeURIComponent(r.id)}`,
        });
      }

      if (!cancelled) {
        setResults(found);
        setActive(0);
      }
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, open, canSee]);

  if (!open) return null;

  function go(r: Result | undefined) {
    if (!r) return;
    onClose();
    router.push(r.href);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onClose();
    else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      go(results[active]);
    }
  }

  // Keep keyboard order the same as the order shown on screen.
  const ordered = GROUPS.flatMap((g) => results.filter((r) => r.group === g));

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-3 pt-20 sm:pt-28" onKeyDown={onKeyDown}>
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search the platform"
        className="float-card relative w-full max-w-[560px] overflow-hidden shadow-[var(--shadow-float)]"
      >
        <div className={cn("flex items-center gap-2.5 px-4 py-3", query.trim() && "border-b border-border")}>
          <Search className="size-4 shrink-0 text-subtle" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            aria-label="Search the platform"
            className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-subtle"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-pale hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>
        <div className={cn("max-h-[50vh] overflow-y-auto p-2", query.trim() === "" && "hidden")}>
          {query.trim() === "" ? null : ordered.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">
              No matches for “{query.trim()}”.
            </p>
          ) : (
            GROUPS.map((g) => {
              const items = ordered.filter((r) => r.group === g);
              if (items.length === 0) return null;
              return (
                <div key={g} className="mb-1 last:mb-0">
                  <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-subtle uppercase">{g}</p>
                  {items.map((r) => {
                    const index = ordered.indexOf(r);
                    return (
                      <button
                        key={r.key}
                        type="button"
                        onMouseEnter={() => setActive(index)}
                        onClick={() => go(r)}
                        className={cn(
                          "flex w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-pale",
                          index === active && "bg-pale",
                        )}
                      >
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-medium text-foreground">{r.title}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">{r.detail}</span>
                        </span>
                        <span className="shrink-0 text-[10px] font-medium text-primary">Open</span>
                      </button>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
