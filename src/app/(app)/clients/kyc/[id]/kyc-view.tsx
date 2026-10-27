"use client";

// Opens a KYC review by its ID, or a client's KYC by the client's ID (the lead
// page links there before any review exists): the open or latest review, or
// the form to start one.

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { OutlineButton } from "@/components/gral/ui";
import { useRouter, useSearchParams } from "next/navigation";
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
  const mode = useSearchParams().get("mode");
  const { user } = useCurrentUser();
  const { canReadKyc } = onboardingPermissions(user);
  const [state, setState] = useState<State>({ kind: "loading" });
  const knownCase = useRef(false);

  const reload = useCallback(async () => {
    try {
      const found = mode === "client" ? null : await getKycReview(id);
      if (found) { knownCase.current = true; return setState({ kind: "review", review: found.review, history: found.history }); }
      if (knownCase.current) throw new Error("This review is no longer available under your current access. Completed reviews can leave your assigned work.");
      const { reviews } = await getClientKyc(id);
      const current = reviews.find((r) => ["DRAFT", "SUBMITTED", "RETURNED"].includes(r.status)) ?? reviews.find((r) => r.status === "APPROVED");
      if (current) return router.replace(`/clients/kyc/${encodeURIComponent(current.id)}`);
      setState({ kind: "client", clientId: id, reviews });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : "Could not load the KYC review." });
    }
  }, [id, router, mode, user.id, user.role]);
  useEffect(() => {
    knownCase.current = false;
    setState({ kind: "loading" });
    void reload();
  }, [reload]);

  if (!canReadKyc) return <NoAccess />;
  if (state.kind === "loading") return <p className="text-sm text-muted-foreground">Loading KYC…</p>;
  if (state.kind === "error") return <div className="space-y-3"><p role="alert" className="text-sm text-danger">{state.message}</p><div className="flex gap-3"><OutlineButton onClick={() => void reload()}>Try again</OutlineButton><Link href="/my-work" className="text-sm text-primary underline">Back to My Work</Link></div></div>;
  if (state.kind === "review") return <KycReviewPage key={`${state.review.id}:${user.id ?? user.role}`} review={state.review} history={state.history} onChanged={reload} />;
  return <StartKycReview clientId={state.clientId} reviews={state.reviews} onStarted={(r) => router.replace(`/clients/kyc/${encodeURIComponent(r.id)}`)} />;
}
