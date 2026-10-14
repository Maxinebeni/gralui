import type { Metadata } from "next";
import { OverviewView } from "./overview-view";

export const metadata: Metadata = {
  title: "Overview / GRAL Operations Platform",
  description: "What needs attention today across GRAL claims, client files and policy renewals.",
};

export default function OverviewPage() {
  return <OverviewView />;
}
