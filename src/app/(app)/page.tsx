"use client";

import { PlaceholderPage } from "@/components/gral/placeholder-page";
import { useCurrentUser } from "@/lib/auth-context";

function greeting(hour: number) {
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export default function OverviewPage() {
  const { user } = useCurrentUser();
  const firstName = user.name.split(" ")[0];
  return <PlaceholderPage title={`${greeting(new Date().getHours())}, ${firstName}`} />;
}
