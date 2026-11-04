import type { Metadata } from "next";
import { Suspense } from "react";
import { ImportsView } from "./imports-view";

export const metadata: Metadata = {
  title: "Data Import / GRAL Operations Platform",
  description: "Upload GRAL's import template and check every row in a dry run.",
};

export default function ImportsPage() {
  // Suspense is required because ImportsView reads the URL (?batch=...).
  return (
    <Suspense>
      <ImportsView />
    </Suspense>
  );
}
