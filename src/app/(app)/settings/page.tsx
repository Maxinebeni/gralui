import type { Metadata } from "next";
import { SettingsView } from "./settings-view";

export const metadata: Metadata = {
  title: "Settings / GRAL Operations Platform",
  description: "Your account, password and help.",
};

export default function SettingsPage() {
  return <SettingsView />;
}
