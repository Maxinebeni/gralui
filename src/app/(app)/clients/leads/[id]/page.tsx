import type { Metadata } from "next";
import { Suspense } from "react";
import { LeadView } from "./lead-view";

export const metadata: Metadata = {
  title: "Lead / GRAL Operations Platform",
  description: "One prospect's onboarding: the 11 steps of GRAL's Client Acquisition SOP.",
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Suspense is required because LeadView reads the URL (?track=...).
  return (
    <Suspense>
      <LeadView caseId={decodeURIComponent(id)} />
    </Suspense>
  );
}
