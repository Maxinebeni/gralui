"use client";

// Pieces shared by the Claims Queue and All Claims pages: loading the claims,
// the ?claim= deep link, the tab filters and the claims table.

import { useCallback, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { ClaimDetailPanel } from "@/components/gral/claim-detail";
import { usePaged } from "@/components/gral/pager";
import { ALL_OPTION, ClearFilters, FilterMenu, optionsFrom } from "@/components/gral/filter-menu";
import { Chip, FloatCard, Person, PriorityPill } from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { downloadCsv } from "@/lib/csv";
import { useClaims as useClaimsQuery, useRefresh } from "@/lib/queries";
import {
  CLAIM_STEP_DEFS,
  claimSla,
  daysOpen,
  isClosed,
  isDisputed,
  missingDocuments,
  needsEscalation,
  nextSigner,
  slaLabel,
  stageLabel,
  workingDaysLeft,
} from "@/lib/claims";
import type { Claim } from "@/lib/types";

export const CLAIM_TABS = [
  "Breached",
  "Approaching SLA",
  "High Priority",
  "Missing Docs",
  "Escalation",
  "Disputed",
] as const;
/** "Open" and "Awaiting Sign-off" have no tab on the queue; their summary tiles set them. */
export type ClaimTab = (typeof CLAIM_TABS)[number] | "All" | "Open" | "Awaiting Sign-off" | "Closed";
const ALL_CLAIM_TABS: readonly ClaimTab[] = [...CLAIM_TABS, "All", "Open", "Awaiting Sign-off", "Closed"];

/** A view named in the URL (?view=Breached), or the fallback. */
export function claimTabFrom(value: string | null, fallback: ClaimTab): ClaimTab {
  return value && ALL_CLAIM_TABS.includes(value as ClaimTab) ? (value as ClaimTab) : fallback;
}

/** The claims as listed, for Download. */
export function downloadClaims(claims: Claim[], fileName = "claims.csv") {
  downloadCsv(fileName, [
    ["Claim", "Client", "Class", "Insurer", "Reported", "Priority", "Working days open", "Amount (RWF)", "Step", "Handler"],
    ...claims.map((c) => [c.id, c.client, c.classOfInsurance, c.insurer, c.dateReported, c.priority, daysOpen(c), c.amount, stageLabel(c), c.handler]),
  ]);
}

/** Most urgent first: overdue, then due soonest, then priority. */
export function byUrgency(a: Claim, b: Claim) {
  const left = (c: Claim) => workingDaysLeft(c) ?? Number.MAX_SAFE_INTEGER;
  return left(a) - left(b) || a.priority.localeCompare(b.priority);
}

export function filterClaims(claims: Claim[], tab: ClaimTab) {
  const open = claims.filter((c) => !isClosed(c));
  switch (tab) {
    case "Breached":
      return open.filter((c) => claimSla(c) === "breached");
    case "Approaching SLA":
      return open.filter((c) => claimSla(c) === "approaching");
    case "High Priority":
      return open.filter((c) => c.priority === "P1");
    case "Missing Docs":
      return open.filter((c) => c.step === "DOCUMENTS" && missingDocuments(c).length > 0);
    case "Escalation":
      return open.filter(needsEscalation);
    case "Disputed":
      return open.filter(isDisputed);
    case "Open":
      return open;
    case "Awaiting Sign-off":
      return open.filter((c) => nextSigner(c) !== null);
    case "Closed":
      return claims.filter(isClosed);
    default:
      return [...claims];
  }
}

export type ClaimFilters = { insurer?: string; handler?: string; step?: string; priority?: string };

/** Each filter left empty matches every claim. */
export function applyClaimFilters(claims: Claim[], f: ClaimFilters) {
  return claims.filter(
    (c) =>
      (!f.insurer || c.insurer === f.insurer) &&
      (!f.handler || c.handler === f.handler) &&
      (!f.step || c.step === f.step) &&
      (!f.priority || c.priority === f.priority),
  );
}

const NO_CLAIM_FILTERS = { insurer: ALL_OPTION, handler: ALL_OPTION, step: ALL_OPTION, priority: ALL_OPTION };
const STEP_OPTIONS = [{ value: ALL_OPTION, label: "All steps" }, ...CLAIM_STEP_DEFS.map((s) => ({ value: s.code as string, label: s.name }))];

/** The queue filters: returns the matching claims and the pills that set them. */
export function useClaimFilters(claims: Claim[]) {
  const [filters, setFilters] = useState(NO_CLAIM_FILTERS);
  const set = (key: keyof typeof NO_CLAIM_FILTERS) => (value: string) => setFilters((f) => ({ ...f, [key]: value }));
  const matching = useMemo(() => {
    const chosen = (v: string) => (v === ALL_OPTION ? undefined : v);
    return applyClaimFilters(claims, {
      insurer: chosen(filters.insurer),
      handler: chosen(filters.handler),
      step: chosen(filters.step),
      priority: chosen(filters.priority),
    });
  }, [claims, filters]);
  const filtered = Object.values(filters).some((v) => v !== ALL_OPTION);
  const pills = (
    <>
      <FilterMenu label="Insurer" value={filters.insurer} options={optionsFrom(claims.map((c) => c.insurer), "All insurers")} onChange={set("insurer")} />
      <FilterMenu label="Handler" value={filters.handler} options={optionsFrom(claims.map((c) => c.handler), "All handlers")} onChange={set("handler")} />
      <FilterMenu label="Step" value={filters.step} options={STEP_OPTIONS} onChange={set("step")} />
      <FilterMenu label="Priority" value={filters.priority} options={optionsFrom(claims.map((c) => c.priority), "All priorities")} onChange={set("priority")} />
      {filtered ? <ClearFilters onClear={() => setFilters(NO_CLAIM_FILTERS)} /> : null}
    </>
  );
  return { matching, pills };
}

export function useClaims() {
  const query = useClaimsQuery();
  const refresh = useRefresh();
  const reload = useCallback(() => refresh("claims"), [refresh]);
  return { claims: query.data ?? [], loaded: !query.isPending, reload };
}

/** The open claim follows the URL (?claim=CLM-...), so it can be linked to. */
export function useOpenClaim(claims: Claim[]) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openId = searchParams.get("claim");

  const open = claims.find((c) => c.id === openId) ?? null;
  const backHref = (() => {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("claim");
    const qs = params.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  })();
  const setOpen = (c: Claim | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (c) params.set("claim", c.id);
    else params.delete("claim");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };
  return { open, openId, backHref, setOpen };
}

export function ClaimSlaChip({ claim }: { claim: Claim }) {
  if (isClosed(claim)) return <Chip tone="success">Closed</Chip>;
  const label = slaLabel(claim);
  if (label) return <Chip tone={claimSla(claim) === "breached" ? "danger" : "warning"}>{label}</Chip>;
  if (isDisputed(claim)) return <Chip tone="warning">With committee</Chip>;
  return <Chip tone="sky">Within SLA</Chip>;
}

/** A claim is a long process, so it opens as its own full page. */
export function ClaimPage({
  claim,
  backHref,
  backLabel,
  onChanged,
}: {
  claim: Claim;
  backHref: string;
  backLabel: string;
  onChanged: () => void;
}) {
  return (
    <>
      <Link href={backHref} scroll={false} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" /> {backLabel}
      </Link>
      <FloatCard className="mt-4 overflow-hidden">
        <ClaimDetailPanel key={claim.id} claim={claim} onChanged={onChanged} />
      </FloatCard>
    </>
  );
}

export function ClaimSearch({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <label className="float-pill flex w-full items-center gap-2 px-3.5 py-2 sm:w-64">
      <Search className="size-3.5 shrink-0 text-subtle" />
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Search claim, client or insurer"
        aria-label="Search claims"
        className="w-full bg-transparent text-xs outline-none placeholder:text-subtle"
      />
    </label>
  );
}

export function matchesClaim(c: Claim, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [c.id, c.client, c.insurer, c.classOfInsurance, c.policyId ?? "", c.submission?.insurerClaimNo ?? "", c.handler]
    .some((v) => v.toLowerCase().includes(q));
}

export function ClaimsTable({
  claims,
  onView,
  emptyMessage = "No claims in this view.",
}: {
  claims: Claim[];
  onView: (c: Claim) => void;
  emptyMessage?: ReactNode;
}) {
  const { items: rows, pager } = usePaged(claims);
  return (
    <>
    <div className="overflow-x-auto px-3 pb-4 sm:px-4">
      <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
        <thead>
          <HeadRow>
            <Th className="rounded-l-xl">Claim</Th>
            <Th>Priority</Th>
            <Th>Days Open</Th>
            <Th>Amount (RWF)</Th>
            <Th>Step</Th>
            <Th className="rounded-r-xl">Handler</Th>
          </HeadRow>
        </thead>
        <tbody>
          <HeadGap colSpan={6} />
          {rows.map((c) => (
            <tr key={c.id} className="cursor-pointer hover:bg-pale/50" onClick={() => onView(c)}>
              <Td>
                <div className="text-sm font-medium whitespace-nowrap">{c.id}</div>
                <div className="max-w-[160px] truncate text-xs text-muted-foreground">{c.client}</div>
              </Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  <PriorityPill priority={c.priority} />
                  <ClaimSlaChip claim={c} />
                </div>
              </Td>
              <Td className="text-sm">{daysOpen(c)}d</Td>
              <Td className="text-sm whitespace-nowrap">{c.amount.toLocaleString("en-US")}</Td>
              <Td className={cn("text-sm whitespace-nowrap", isDisputed(c) && "text-warning")}>{stageLabel(c)}</Td>
              <Td>
                <div className="max-w-[130px] truncate">
                  <Person name={c.handler} />
                </div>
              </Td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <Td className="text-sm text-muted-foreground" colSpan={6}>
                {emptyMessage}
              </Td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
    {pager}
    </>
  );
}

export function HeadRow({ children }: { children: ReactNode }) {
  return <tr className="bg-pale text-xs text-foreground">{children}</tr>;
}

/** A little space between the table heading row and the first row. */
export function HeadGap({ colSpan }: { colSpan: number }) {
  return (
    <tr aria-hidden>
      <td colSpan={colSpan} className="h-2 p-0" />
    </tr>
  );
}

export function Th({ children, className }: { children?: ReactNode; className?: string }) {
  return <th className={cn("px-3 py-3 font-semibold whitespace-nowrap", className)}>{children}</th>;
}

export function Td({
  children,
  className,
  colSpan,
}: {
  children?: ReactNode;
  className?: string;
  colSpan?: number;
}) {
  return (
    <td colSpan={colSpan} className={cn("border-b border-border px-3 py-3.5 align-middle", className)}>
      {children}
    </td>
  );
}
