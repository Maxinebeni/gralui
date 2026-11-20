import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportsView } from "./imports-view";

export const metadata: Metadata = {
  title: "Data Import / GRAL Operations Platform",
  description: "Upload the cleaned GRAL registers, fix the rows that need a decision, and import the ready clients and policies.",
};

export default function ImportsPage() {
  // Suspense is required because ImportsView reads the URL (?batch=...).
  return (
    <Suspense>
      <ImportsView />
    </Suspense>
  );
}
