import type { Metadata } from "next";
import { LeadsView } from "./leads-view";

export const metadata: Metadata = {
  title: "Leads / GRAL Operations Platform",
  description: "New clients from lead to welcome letter, following GRAL's Client Acquisition SOP, with the KYC checks.",
};

export default function LeadsPage() {
  return <LeadsView />;
}
