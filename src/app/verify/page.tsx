import type { Metadata } from "next";
import { VerifyForm } from "./verify-form";

export const metadata: Metadata = {
  title: "Verify sign-in / GRAL Operations Platform",
  description: "Enter the 6-digit code to finish signing in to the GRAL operations platform.",
};

export default function VerifyPage() {
  return <VerifyForm />;
}
