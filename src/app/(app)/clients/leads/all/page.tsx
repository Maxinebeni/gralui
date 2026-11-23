import type { Metadata } from "next";
import { Suspense } from "react";
import { LeadsView } from "../leads-view";

export const metadata: Metadata = {
  title: "All leads / GRAL Operations Platform",
  description: "Every lead in GRAL's client acquisition pipeline.",
};

export default function AllLeadsPage() {
  // Suspense is required because LeadsView reads the URL (?view=...).
  return (
    <Suspense>
      <LeadsView full />
    </Suspense>
  );
}
