"use client";

import { useEffect } from "react";
import Link from "next/link";

// Shown inside the signed-in layout when a page throws while rendering, so one
// broken screen does not blank the whole app. The menu stays usable.
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div role="alert" className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="float-card max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold text-foreground">This page could not be shown</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong while loading it. Try again, or go back to the overview.
          {error.digest ? <span className="mt-2 block text-xs text-subtle">Reference: {error.digest}</span> : null}
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Try again
          </button>
          <Link href="/" className="inline-flex items-center justify-center rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-secondary">
            Go to overview
          </Link>
        </div>
      </div>
    </div>
  );
}
