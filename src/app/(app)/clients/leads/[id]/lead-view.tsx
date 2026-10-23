"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OnboardingCaseView } from "@/components/gral/onboarding-case";
import { getOnboarding } from "@/lib/api";
import type { OnboardingCase } from "@/lib/types";

export function LeadView({ caseId }: { caseId: string }) {
  const [value, setValue] = useState<OnboardingCase | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);

  const reload = useCallback(() => {
    getOnboarding(caseId)
      .then((c) => {
        setValue(c);
        setLoadError(null);
      })
      .catch((err) => setLoadError(err instanceof Error ? err.message : "Could not load this lead."));
  }, [caseId]);
  useEffect(reload, [reload]);

  if (loadError) {
    return (
      <p className="text-sm text-danger">
        {loadError}{" "}
        <button type="button" onClick={reload} className="text-primary underline underline-offset-2">
          Try again
        </button>
      </p>
    );
  }
  if (value === undefined) return <p className="text-sm text-muted-foreground">Loading lead…</p>;
  if (value === null) {
    return (
      <div className="flex justify-center pt-16">
        <div className="float-card max-w-md p-6 text-center">
          <h1 className="text-xl font-semibold tracking-tight">Lead not found</h1>
          <p className="mt-2 text-sm text-muted-foreground">There is no lead with the reference {caseId}.</p>
          <Link href="/clients/leads" className="mt-4 inline-block text-sm text-primary underline underline-offset-2">
            Go to Leads
          </Link>
        </div>
      </div>
    );
  }
  return <OnboardingCaseView value={value} onChanged={reload} />;
}