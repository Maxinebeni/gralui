import type { Metadata } from "next";
import { Suspense } from "react";
import { ClientsView } from "./clients-view";

export const metadata: Metadata = {
  title: "Client Records — GRAL Operations Platform",
  description:
    "Client records, KYC completeness and compliance flags for GRAL's corporate and institutional clients.",
};

export default function ClientsPage() {
  // Suspense is required because ClientsView reads the URL (?client=...).
  return (
    <Suspense>
      <ClientsView />
    </Suspense>
  );
}
