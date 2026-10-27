"use client";

import { useCallback, useEffect, useState } from "react";
import { assignKycReviewer, getKycReview, listKycReviewers, type StaffChoice } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { onboardingPermissions } from "@/lib/permissions";
import { useRefresh } from "@/lib/queries";
import type { KycReview } from "@/lib/types";
import { ActionForm, SelectInput, TextInput } from "./onboarding-ui";
import { Chip, FloatCard, OutlineButton } from "./ui";

export function KycReviewerAssignment({ review, caseId, onChanged }: { review?: KycReview; caseId?: string; onChanged?: () => void | Promise<void> }) {
  const { user } = useCurrentUser();
  const { canAssignKyc } = onboardingPermissions(user);
  const refresh = useRefresh();
  const [current, setCurrent] = useState(review);
  const [choices, setChoices] = useState<StaffChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignee, setAssignee] = useState("");
  const [reason, setReason] = useState("");
  const load = useCallback(async () => {
    setError(null); setChoices(null);
    try {
      const value = review ?? (caseId ? (await getKycReview(caseId))?.review : undefined);
      setCurrent(value);
      if (canAssignKyc && value) setChoices(await listKycReviewers());
    } catch (e) { setError(e instanceof Error ? e.message : "Could not load the compliance assignment."); }
  }, [review, caseId, canAssignKyc, user.id]);
  useEffect(() => { void load(); }, [load]);
  const active = current && ["DRAFT", "SUBMITTED", "RETURNED"].includes(current.status);
  return <FloatCard className="p-4 sm:p-5">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-base font-semibold tracking-tight">Compliance reviewer</h2>
      <Chip tone={current?.reviewerId ? "success" : "warning"}>{current?.reviewerId ? "Assigned" : "Not assigned"}</Chip>
    </div>
    {current?.reviewerId ? <p className="mt-2 break-words text-xs text-muted-foreground">{choices?.find((p) => p.id === current.reviewerId)?.fullName ?? (current.reviewerId === user.id ? user.name : "Assigned compliance reviewer")} <span className="text-subtle">· {current.reviewerId}</span></p> : <p className="mt-2 text-xs text-muted-foreground">The CRM Manager or MD must assign a reviewer before this checklist can be submitted.</p>}
    {!current && !caseId ? <p className="mt-2 text-xs text-muted-foreground">Start the KYC checklist before assigning its reviewer.</p> : null}
    {error ? <div className="mt-3 space-y-2"><p role="alert" className="text-xs text-danger">{error}</p><OutlineButton onClick={() => void load()}>Try again</OutlineButton></div> : null}
    {canAssignKyc && active && !error ? <div className="mt-3">
      <ActionForm title={current.reviewerId ? "Reassign the review" : "Assign the review"} submitLabel="Assign reviewer" success="Compliance reviewer assigned." disabled={!choices?.length}
        disabledReason={choices === null ? "Loading eligible reviewers…" : choices.length === 0 ? "No eligible compliance reviewers are available. Ask an administrator to check staff eligibility." : undefined}
        onSubmit={async (attempt) => {
          const saved = await assignKycReviewer(current, assignee, reason, attempt);
          setCurrent(saved); setReason("");
          refresh("leads", "approvals");
          await onChanged?.();
          if (!review && caseId) setCurrent((await getKycReview(caseId))?.review);
        }}>
        <SelectInput id={`reviewer-${current.id}`} label="Eligible compliance reviewer" value={assignee} onChange={setAssignee} placeholder="Select a reviewer" options={(choices ?? []).map((p) => ({ value: p.id, label: p.fullName }))} wide />
        <TextInput id={`reviewer-reason-${current.id}`} label="Reason for assignment" value={reason} onChange={setReason} multiline wide />
      </ActionForm>
    </div> : null}
  </FloatCard>;
}
