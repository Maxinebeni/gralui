import type { Metadata } from "next";
import { PolicyDetailView } from "./policy-detail-view";

export const metadata: Metadata = {
  title: "Policy / GRAL Operations Platform",
  description: "Policy cover periods, movements, financial terms, claims and documents.",
};

export default async function PolicyPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ref?: string }>;
}) {
  const { id } = await params;
  // ?ref= carries the backend policy ID when the link comes from a client file.
  const { ref } = await searchParams;
  return <PolicyDetailView policyId={decodeURIComponent(id)} policyUuid={ref} />;
}