import type { Metadata } from "next";
import { Suspense } from "react";
import { ClaimsView } from "./claims-view";

export const metadata: Metadata = {
  title: "Claims Queue / GRAL Operations Platform",
  description: "Track open claims, SLA breaches, disputes and settlement sign-off across GRAL's claims process.",
};

export default function ClaimsPage() {
  // Suspense is required because ClaimsView reads the URL (?claim=...).
  return (
    <Suspense>
      <ClaimsView />
    </Suspense>
  );
}
