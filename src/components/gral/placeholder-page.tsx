"use client";

import { PageHeader } from "./shell";
import { FloatCard } from "./ui";

/** Stand-in for screens outside the current frontend scope, so navigation works. */
export function PlaceholderPage({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <FloatCard className="mt-5 p-8 text-center" delay={60}>
        <p className="text-sm text-muted-foreground">To be completed.</p>
      </FloatCard>
    </>
  );
}
