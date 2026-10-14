import type { Metadata } from "next";
import { Suspense } from "react";
import { RolesView } from "./roles-view";

export const metadata: Metadata = {
  title: "Roles & Permissions — GRAL Operations Platform",
  description: "Choose what each role can do, and create new roles.",
};

export default function AdminRolesPage() {
  // Suspense is required because RolesView reads the URL (?role=...).
  return (
    <Suspense>
      <RolesView />
    </Suspense>
  );
}
