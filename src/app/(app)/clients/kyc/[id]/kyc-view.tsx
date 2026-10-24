"use client";

// Opens a KYC review by its ID, or a client's KYC by the client's ID (the lead
// page links there before any review exists): the open or latest review, or
// the form to start one.

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { KycReviewPage, StartKycReview } from "@/components/gral/kyc-review";
import { NoAccess } from "@/components/gral/shell";
import { getClientKyc, getKycReview } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { onboardingPermissions } from "@/lib/permissions";
import type { CommandHistory, KycReview } from "@/lib/types";

type State =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "review"; review: KycReview; history: CommandHistory[] }
  | { kind: "client"; clientId: string; reviews: KycReview[] };

export function KycView({ id }: { id: string }) {
  const router = useRouter();
  const { user } = useCurrentUser();
  const { canReadKyc } = onboardingPermissions(user);
  const [state, setState] = useState<State>({ kind: "loading" });

  const reload = useCallback(async () => {
    try {
      const found = await getKycReview(id).catch(() => null);
      if (found) return setState({ kind: "review", review: found.review, history: found.history });
      const { reviews } = await getClientKyc(id);
      const current = reviews.find((r) => ["DRAFT", "SUBMITTED", "RETURNED"].includes(r.status)) ?? reviews.find((r) => r.status === "APPROVED");
      if (current) return router.replace(`/clients/kyc/${encodeURIComponent(current.id)}`);
      setState({ kind: "client", clientId: id, reviews });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Could not load the KYC review." });
    }
  }, [id, router]);
  useEffect(() => {
    reload();
  }, [reload]);

  if (!canReadKyc) return <NoAccess />;
  if (state.kind === "loading") return <p className="text-sm text-muted-foreground">Loading KYC…</p>;
  if (state.kind === "error") return <p className="text-sm text-danger">{state.message}</p>;
  if (state.kind === "review") return <KycReviewPage review={state.review} history={state.history} onChanged={reload} />;
  return <StartKycReview clientId={state.clientId} reviews={state.reviews} onStarted={(r) => router.replace(`/clients/kyc/${encodeURIComponent(r.id)}`)} />;
}
