import type { Metadata } from "next";
import { Suspense } from "react";
import { RenewalsView } from "./renewals-view";

export const metadata: Metadata = {
  title: "Renewals Pipeline / GRAL Operations Platform",
  description: "Track GRAL policy renewals through each SOP milestone, from Day −120 to delivery.",
};

export default function RenewalsPage() {
  // Suspense is required because RenewalsView reads the URL (?case=...).
  return (
    <Suspense>
      <RenewalsView />
    </Suspense>
  );
}
