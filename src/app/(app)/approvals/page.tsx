import type { Metadata } from "next";
import { Suspense } from "react";
import { ApprovalsView } from "./approvals-view";

export const metadata: Metadata = {
  title: "Approvals — GRAL Operations Platform",
  description: "Approve, return or reject renewal, claim settlement, KYC and endorsement requests.",
};

export default function ApprovalsPage() {
  // Suspense is required because ApprovalsView reads the URL (?request=...).
  return (
    <Suspense>
      <ApprovalsView />
    </Suspense>
  );
}
