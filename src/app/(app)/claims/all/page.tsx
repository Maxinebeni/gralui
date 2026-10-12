import type { Metadata } from "next";
import { Suspense } from "react";
import { AllClaimsView } from "./all-claims-view";

export const metadata: Metadata = {
  title: "All Claims — GRAL Operations Platform",
  description: "Complete list of GRAL claims, open and closed.",
};

export default function AllClaimsPage() {
  // Suspense is required because AllClaimsView reads the URL (?claim=...).
  return (
    <Suspense>
      <AllClaimsView />
    </Suspense>
  );
}
