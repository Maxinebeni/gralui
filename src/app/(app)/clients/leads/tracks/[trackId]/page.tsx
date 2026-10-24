"use client";

// Approvals and My Work link to a policy track by its ID. Its steps are shown on
// the lead's page, so this opens that page with the track selected.

import { use, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getTrack } from "@/lib/api";

export default function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = use(params);
  const router = useRouter();
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    const id = decodeURIComponent(trackId);
    getTrack(id)
      .then((d) => {
        if (d) router.replace(`/clients/leads/${encodeURIComponent(d.track.leadId)}?track=${encodeURIComponent(id)}`);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [trackId, router]);

  return <p className="text-sm text-muted-foreground">{missing ? "This policy could not be found." : "Opening…"}</p>;
}
