import type { Metadata } from "next";
import { Suspense } from "react";
import { LeadsView } from "./leads-view";

export const metadata: Metadata = {
  title: "Leads / GRAL Operations Platform",
  description: "New clients from lead to welcome letter, following GRAL's Client Acquisition SOP, with the KYC checks.",
};

export default function LeadsPage() {
  // Suspense is required because LeadsView reads the URL (?view=...).
  return (
    <Suspense>
      <LeadsView />
    </Suspense>
  );
}
