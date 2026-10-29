"use client";
import { useCallback, useEffect, useState } from "react";
import { getTrack, type TrackDetail } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { TrackWorkspace } from "@/components/gral/track-workspace";
import { OutlineButton } from "@/components/gral/ui";
export function TrackView({ trackId }: { trackId: string }) {
  const { user } = useCurrentUser();
  const [detail, setDetail] = useState<TrackDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(async () => {
    try {
      const found = await getTrack(trackId);
      if (!found) throw new Error("This policy track is unavailable under your current access.");
      setDetail(found); setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the policy track."); }
  }, [trackId, user.id, user.role]);
  useEffect(() => { setDetail(null); void reload(); }, [reload]);
  if (error) return <div className="space-y-3"><p role="alert" className="text-sm text-danger">{error}</p><OutlineButton onClick={() => void reload()}>Try again</OutlineButton></div>;
  if (!detail) return <p className="text-sm text-muted-foreground">Loading policy track…</p>;
  return <TrackWorkspace key={trackId + (user.id ?? user.role)} detail={detail} onChanged={reload} />;
}
