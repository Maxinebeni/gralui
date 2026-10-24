import type { Metadata } from "next";
import { SessionsView } from "./sessions-view";

export const metadata: Metadata = {
  title: "Active Sessions / GRAL Operations Platform",
  description: "Who is signed in, and ending a session.",
};

export default function AdminSessionsPage() {
  return <SessionsView />;
}
