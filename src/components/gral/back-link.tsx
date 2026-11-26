"use client";

// One back link for every page that opens a record: same size and wording
// ("Back to …") everywhere. It returns to the page the person came from, named,
// and falls back to the record's usual list when they arrived directly (a link,
// a notification, a new tab).

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const PREVIOUS_KEY = "gral:previous-page";
const CURRENT_KEY = "gral:current-page";

/** Names for the pages a person can come back to. Longest match wins. */
const PAGE_NAMES: [prefix: string, name: string][] = [
  ["/my-work", "My work"],
  ["/approvals", "Approvals"],
  ["/notifications", "Notifications"],
  ["/activity", "Activity"],
  ["/reports", "Reports"],
  ["/claims/all", "All claims"],
  ["/claims", "Claims queue"],
  ["/renewals/exits", "Exit register"],
  ["/renewals/all", "All renewals"],
  ["/renewals", "Renewals"],
  ["/clients/leads/tracks/", "the policy track"],
  ["/clients/leads/all", "All leads"],
  ["/clients/leads/", "the lead"],
  ["/clients/leads", "Leads"],
  ["/clients/kyc/", "the KYC review"],
  ["/clients/onboarding", "Onboarding"],
  ["/clients/all", "All clients"],
  ["/clients", "Client records"],
  ["/policies/", "the policy"],
  ["/insurer-products", "Insurer products"],
  ["/imports", "Data import"],
  ["/admin", "Administration"],
  ["/settings", "Settings"],
];

function pageName(path: string): string | null {
  const pathname = path.split("?")[0]!;
  if (pathname === "/") return "Overview";
  const fits = ([prefix]: [string, string]) =>
    prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`);
  const match = PAGE_NAMES.filter(fits).sort((a, b) => b[0].length - a[0].length)[0];
  return match ? match[1] : null;
}

/** Remembers the page before this one, for back links. Mounted once in the app shell. */
export function PageMemory() {
  const pathname = usePathname();
  useEffect(() => {
    try {
      const here = `${pathname}${window.location.search}`;
      const last = sessionStorage.getItem(CURRENT_KEY);
      if (last && last.split("?")[0] !== pathname) sessionStorage.setItem(PREVIOUS_KEY, last);
      sessionStorage.setItem(CURRENT_KEY, here);
    } catch {
      // Storage unavailable: back links use their default page.
    }
  }, [pathname]);
  return null;
}

/**
 * "Back to …". fallbackHref and fallbackLabel are the usual parent, used when the
 * person did not come from another page in the app.
 *
 * recordParam is for records that open inside their own list (claims, renewals):
 * opened from that list, back goes to the list; opened straight from elsewhere
 * (My Work, a client file, a notification), back goes to that page.
 */
export function BackLink({
  fallbackHref,
  fallbackLabel,
  recordParam,
  className,
}: {
  fallbackHref: string;
  fallbackLabel: string;
  recordParam?: string;
  className?: string;
}) {
  const pathname = usePathname();
  const [target, setTarget] = useState({ href: fallbackHref, label: fallbackLabel });

  useEffect(() => {
    try {
      const previous = sessionStorage.getItem(PREVIOUS_KEY);
      const arrival = sessionStorage.getItem(CURRENT_KEY) ?? "";
      // A record opened from its own list: the list is the way back.
      if (recordParam && !new URLSearchParams(arrival.split("?")[1] ?? "").has(recordParam)) return;
      const name = previous ? pageName(previous) : null;
      if (previous && name && previous.split("?")[0] !== pathname) setTarget({ href: previous, label: name });
    } catch {
      // Keep the default.
    }
  }, [recordParam, pathname]);

  return (
    <Link
      href={target.href}
      scroll={false}
      className={className ?? "mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary"}
    >
      <ArrowLeft className="size-3.5" aria-hidden /> Back to {target.label}
    </Link>
  );
}
