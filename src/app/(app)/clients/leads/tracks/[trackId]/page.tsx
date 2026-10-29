import type { Metadata } from "next";
import { TrackView } from "./track-view";

export const metadata: Metadata = {
  title: "Policy Track / GRAL Operations Platform",
  description: "One policy's onboarding track: quotes, approval and placement.",
};

export default async function TrackPage({ params }: { params: Promise<{ trackId: string }> }) {
  const { trackId } = await params;
  return <TrackView trackId={trackId} />;
}
