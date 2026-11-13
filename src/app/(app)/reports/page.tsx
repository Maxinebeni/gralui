import type { Metadata } from "next";
import { ReportsView } from "./reports-view";

export const metadata: Metadata = {
  title: "Reports / GRAL Operations Platform",
  description: "Quarterly client reports and renewal, claim and portfolio summaries, ready to download or print.",
};

export default function ReportsPage() {
  return <ReportsView />;
}
