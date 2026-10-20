import type { Metadata } from "next";
import { Suspense } from "react";
import { OnboardingView } from "./onboarding-view";

export const metadata: Metadata = {
  title: "Client Onboarding / GRAL Operations Platform",
  description: "New clients from lead to welcome letter, following GRAL's Client Acquisition SOP, with the KYC checks.",
};

export default function OnboardingPage() {
  // Suspense is required because OnboardingView reads the URL (?case=...).
  return (
    <Suspense>
      <OnboardingView />
    </Suspense>
  );
}
