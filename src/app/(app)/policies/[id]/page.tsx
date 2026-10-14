import type { Metadata } from "next";
import { PolicyDetailView } from "./policy-detail-view";

export const metadata: Metadata = {
  title: "Policy / GRAL Operations Platform",
  description: "Policy cover periods, movements, financial terms, claims and documents.",
};

export default async function PolicyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PolicyDetailView policyId={decodeURIComponent(id)} />;
}
