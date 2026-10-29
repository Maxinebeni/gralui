import type { Metadata } from "next";
import { NotificationsView } from "./notifications-view";

export const metadata: Metadata = {
  title: "Notifications / GRAL Operations Platform",
  description: "Every update sent to you, newest first.",
};

export default function NotificationsPage() {
  return <NotificationsView />;
}
