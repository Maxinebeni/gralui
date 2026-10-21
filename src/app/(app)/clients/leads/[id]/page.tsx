import type { Metadata } from "next";
import { LeadView } from "./lead-view";

export const metadata: Metadata = {
  title: "Lead / GRAL Operations Platform",
  description: "One prospect's onboarding: the 11 steps of GRAL's Client Acquisition SOP, with owners, deadlines and records.",
};

export default async function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LeadView caseId={decodeURIComponent(id)} />;
}
