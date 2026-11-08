import type { Metadata } from "next";
import { ExitRegisterView } from "./exits-view";

export const metadata: Metadata = {
  title: "Exit Register / GRAL Operations Platform",
  description: "Renewals GRAL lost each month, why the client left, and the premium at stake.",
};

export default function ExitRegisterPage() {
  return <ExitRegisterView />;
}