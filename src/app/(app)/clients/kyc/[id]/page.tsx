import type { Metadata } from "next";
import { KycView } from "./kyc-view";

export const metadata: Metadata = {
  title: "KYC review / GRAL Operations Platform",
  description: "A client's KYC review: GRAL's checklist, sanctions screening and the compliance decision.",
};

export default async function KycPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <KycView id={decodeURIComponent(id)} />;
}
