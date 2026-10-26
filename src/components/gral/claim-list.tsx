"use client";

// Pieces shared by the Claims Queue and All Claims pages: loading the claims,
// the ?claim= deep link, the tab filters and the claims table.

import { useCallback, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Search } from "lucide-react";
import { ClaimDetailPanel } from "@/components/gral/claim-detail";
import { Chip, FloatCard, Person, PriorityPill } from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { useClaims as useClaimsQuery, useRefresh } from "@/lib/queries";
import {
  claimSla,
  daysOpen,
  isClosed,
  isDisputed,
  missingDocuments,
  needsEscalation,
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
export type ClaimTab = (typeof CLAIM_TABS)[number] | "All" | "Closed";

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
    case "Closed":
      return claims.filter(isClosed);
    default:
      return [...claims];
  }
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
  emptyMessage?: string;
}) {
  const rows = claims;
  return (
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
                <div className="text-xs font-medium whitespace-nowrap">{c.id}</div>
                <div className="max-w-[160px] truncate text-[11px] text-muted-foreground">{c.client}</div>
              </Td>
              <Td>
                <div className="flex items-center gap-1.5">
                  <PriorityPill priority={c.priority} />
                  <ClaimSlaChip claim={c} />
                </div>
              </Td>
              <Td className="text-xs">{daysOpen(c)}d</Td>
              <Td className="text-xs whitespace-nowrap">{c.amount.toLocaleString("en-US")}</Td>
              <Td className={cn("text-xs whitespace-nowrap", isDisputed(c) && "text-warning")}>{stageLabel(c)}</Td>
              <Td>
                <div className="max-w-[130px] truncate">
                  <Person name={c.handler} />
                </div>
              </Td>
            </tr>
          ))}
          {rows.length === 0 ? (
            <tr>
              <Td className="text-xs text-muted-foreground" colSpan={6}>
                {emptyMessage}
              </Td>
            </tr>
          ) : null}
        </tbody>
      </table>
    </div>
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
