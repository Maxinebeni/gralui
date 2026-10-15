import type { Metadata } from "next";
import { Suspense } from "react";
import { UsersView } from "./users-view";

export const metadata: Metadata = {
  title: "Users / GRAL Operations Platform",
  description: "Invite staff, manage their roles and deactivate accounts.",
};

export default function AdminUsersPage() {
  // Suspense is required because UsersView reads the URL (?user=...).
  return (
    <Suspense>
      <UsersView />
    </Suspense>
  );
}
