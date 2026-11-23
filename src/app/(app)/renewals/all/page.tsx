import type { Metadata } from "next";
import { Suspense } from "react";
import { RenewalsView } from "../renewals-view";

export const metadata: Metadata = {
  title: "All renewals / GRAL Operations Platform",
  description: "Every GRAL policy renewal and the milestone it is on.",
};

export default function AllRenewalsPage() {
  // Suspense is required because RenewalsView reads the URL (?view=, ?case=).
  return (
    <Suspense>
      <RenewalsView full />
    </Suspense>
  );
}
