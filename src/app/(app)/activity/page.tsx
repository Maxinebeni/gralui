import type { Metadata } from "next";
import { ActivityView } from "./activity-view";

export const metadata: Metadata = {
  title: "Activity / GRAL Operations Platform",
  description: "Everything recorded on the claims and renewals you can see, newest first.",
};

export default function ActivityPage() {
  return <ActivityView />;
}
