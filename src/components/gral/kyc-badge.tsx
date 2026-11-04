"use client";

// The KYC badge used across lists and records, and the message shown when the
// KYC gate stops an action.

import Link from "next/link";
import { kycBadge } from "@/lib/kyc";
import { cn } from "@/lib/utils";
import { Chip } from "./ui";

export function KycBadge({
  kyc,
  status,
  gateStatus,
  short = false,
}: {
  kyc?: boolean;
  status?: string;
  gateStatus?: string;
  /** Leave out the word KYC, e.g. under a column already headed KYC. */
  short?: boolean;
}) {
  const { label, tone } = kycBadge({ kyc, status, gateStatus });
  return <Chip tone={tone}>{short ? label : `KYC ${label.toLowerCase()}`}</Chip>;
}

export function KycBlockedNotice({ reasons, href, className }: { reasons: string[]; href?: string; className?: string }) {
  if (!reasons.length) return null;
  return (
    <div className={cn("rounded-xl bg-warning-soft/50 px-3.5 py-3 text-xs", className)}>
      <p className="font-medium">Blocked: KYC not approved</p>
      {reasons.map((r) => (
        <p key={r} className="mt-1 text-muted-foreground">
          {r}
        </p>
      ))}
      {href ? (
        <Link href={href} className="mt-2 inline-block font-medium text-primary underline underline-offset-2">
          Open KYC
        </Link>
      ) : null}
    </div>
  );
}
