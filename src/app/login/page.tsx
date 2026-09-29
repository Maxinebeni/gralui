import type { Metadata } from "next";
import { LoginForm } from "./login-form";

export const metadata: Metadata = {
  title: "Sign in — GRAL Operations Platform",
  description: "Sign in to the Global Risk Advisors Ltd operations platform.",
};

export default function LoginPage() {
  return <LoginForm />;
}
