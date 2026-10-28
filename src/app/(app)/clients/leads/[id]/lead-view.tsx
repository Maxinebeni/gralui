"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { OnboardingCaseView } from "@/components/gral/onboarding-case";
import { getLead, getTrack, type LeadDetail, type TrackDetail } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { primaryTrack } from "@/lib/onboarding";
import type { Lead, PolicyTrack } from "@/lib/types";
import { useRefresh } from "@/lib/queries";

export function LeadView({ caseId }: { caseId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  // Reloaded when the role changes: the allowed actions depend on it.
  const { user } = useCurrentUser();
  const wantedTrack = searchParams.get("track");

  const [detail, setDetail] = useState<LeadDetail | null | undefined>(undefined);
  const [track, setTrack] = useState<TrackDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const d = await getLead(caseId);
      const chosen = d ? (d.tracks.find((t) => t.id === wantedTrack) ?? primaryTrack(d.tracks)) : undefined;
      setTrack(chosen ? await getTrack(chosen.id) : null);
      setDetail(d);
      setLoadError(null);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Could not load this lead.");
    }
  }, [caseId, wantedTrack, user.role]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    reload();
  }, [reload]);

  // A step done here hands work to someone else, so the bell refreshes too.
  const refresh = useRefresh();
  // Show what the backend sent back at once; the full reload (history, other
  // policies, KYC) follows in the background.
  const changed = async (saved?: Lead | PolicyTrack) => {
    if (saved && "stage" in saved) {
      setTrack((prev) => (prev && prev.track.id === saved.id ? { ...prev, track: saved } : prev));
      setDetail((prev) => (prev ? { ...prev, tracks: prev.tracks.map((x) => (x.id === saved.id ? saved : x)) } : prev));
    } else if (saved) {
      setDetail((prev) => (prev ? { ...prev, lead: saved } : prev));
    }
    await reload();
    refresh("leads", "approvals", "renewals", ...(saved && "clientId" in saved && saved.clientId ? ["clients" as const] : []));
  };

  const selectTrack = (id: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("track", id);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  if (loadError) {
    return (
      <p className="text-sm text-danger">
        {loadError}{" "}
        <button type="button" onClick={reload} className="text-primary underline underline-offset-2">
          Try again
        </button>
      </p>
    );
  }
  if (detail === undefined) return <p className="text-sm text-muted-foreground">Loading lead…</p>;
  if (detail === null) {
    return (
      <div className="flex justify-center pt-16">
        <div className="float-card max-w-md p-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Lead not found</h1>
          <Link href="/clients/leads" className="mt-4 inline-block text-sm text-primary underline underline-offset-2">
            Go to Leads
          </Link>
        </div>
      </div>
    );
  }
  return <OnboardingCaseView detail={detail} track={track} onSelectTrack={selectTrack} onChanged={changed} />;
}
