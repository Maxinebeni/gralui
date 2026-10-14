import type { Metadata } from "next";
import { Suspense } from "react";
import { MyWorkView } from "./my-work-view";

export const metadata: Metadata = {
  title: "My Work / GRAL Operations Platform",
  description: "Tasks assigned to you from claims, renewals, approvals and your own list.",
};

export default function MyWorkPage() {
  // Suspense is required because MyWorkView reads the URL (?task=...).
  return (
    <Suspense>
      <MyWorkView />
    </Suspense>
  );
}
