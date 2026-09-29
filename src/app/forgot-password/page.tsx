import type { Metadata } from "next";
import { ForgotPasswordForm } from "./forgot-password-form";

export const metadata: Metadata = {
  title: "Reset password — GRAL Operations Platform",
  description: "Request a password reset link for the GRAL operations platform.",
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
