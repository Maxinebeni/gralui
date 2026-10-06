import type { Metadata } from "next";
import { SetPasswordForm } from "@/components/gral/set-password-form";

export const metadata: Metadata = {
  title: "Set a new password — GRAL Operations Platform",
  // The page URL carries a one-time token; never send it to other sites.
  referrer: "no-referrer",
};

export default function ResetPasswordPage() {
  return <SetPasswordForm mode="reset" />;
}
