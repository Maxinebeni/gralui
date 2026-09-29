import type { Metadata } from "next";
import { Suspense } from "react";
import { AllClientsView } from "./all-clients-view";

export const metadata: Metadata = {
  title: "All Client Records — GRAL Operations Platform",
  description: "Complete list of GRAL client, KYC and compliance records.",
};

export default function AllClientsPage() {
  // Suspense is required because AllClientsView reads the URL (?client=...).
  return (
    <Suspense>
      <AllClientsView />
    </Suspense>
  );
}
