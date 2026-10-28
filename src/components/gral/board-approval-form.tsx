"use client";

import { useEffect, useState } from "react";
import { getOnboardingApproval, runTrackAction, type EvidenceInput } from "@/lib/api";
import type { ApprovalRequest, PolicyTrack } from "@/lib/types";
import type { TrackRun } from "./track-forms";
import { ActionForm, EvidenceField, SelectInput, TextInput } from "./onboarding-ui";
import { OutlineButton } from "./ui";
import { todayIso } from "@/lib/renewals";

export function isBoardStep(request: ApprovalRequest): boolean {
  return request.subjectType === "NEW_BUSINESS" && request.action === "RECOMMEND_STRATEGIC" && request.steps.some((s) => s.order === request.currentStepNumber && s.requiredPermission === "ONBOARDING_BOARD_EVIDENCE" && s.evidencePurpose === "BOARD_APPROVAL");
}

export function BoardApprovalForm({ track, run, onChanged }: { track: PolicyTrack; run?: TrackRun; onChanged?: () => void | Promise<void> }) {
  const [approval, setApproval] = useState<ApprovalRequest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [proof, setProof] = useState<EvidenceInput | null>(null);
  const [index, setIndex] = useState("0");
  const [date, setDate] = useState(todayIso());
  const [revision, retry] = useState(0);
  useEffect(() => {
    let active = true; setError(null); setApproval(null);
    const id = track.approvalRequests.RECOMMENDATION;
    if (id) getOnboardingApproval(id).then((r) => { if (active) setApproval(r); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load Board approval."); });
    else setError("The recommendation approval request is unavailable.");
    return () => { active = false; };
  }, [track.id, track.version, revision, track.approvalRequests.RECOMMENDATION]);
  const recover = approval?.status === "APPROVED";
  const retained = approval?.boardEvidence ?? [];
  const eligible = !!approval && isBoardStep(approval) && ["PENDING", "APPROVED"].includes(approval.status);
  return <div className="space-y-3">
    {error ? <><p role="alert" className="text-xs text-danger">{error}</p><OutlineButton onClick={() => retry((n) => n + 1)}>Try again</OutlineButton></> : null}
    <ActionForm title={recover ? "Complete Board approval recording" : "Record the Board's written approval"} submitLabel="Record Board approval" success="Board approval recorded."
      disabled={!eligible || (recover && !retained.length)} disabledReason={error ?? (!approval ? "Loading the current approval…" : !eligible ? "The MD review must be complete before recording the Board decision." : recover && !retained.length ? "The original Board evidence is unavailable under your current access. It must be restored before this recording can be completed." : undefined)}
      onSubmit={async (attempt) => {
        const existing = retained[Number(index)];
        if (recover && (!existing || !date || date > todayIso())) throw new Error("Select the original Board evidence and its actual decision date.");
        if (!recover && !proof) throw new Error("Attach the Board's written approval.");
        const input = { action: "RECORD_BOARD_EVIDENCE", attempt,
          ...(recover ? { existingEvidence: { main: { documentId: existing.documentId!, documentVersion: existing.version ?? 1, occurredAt: date === todayIso() ? new Date().toISOString() : `${date}T09:00:00Z` } } } : { evidence: { main: proof! } }),
        };
        if (run) await run(input); else { await runTrackAction(track, input); await onChanged?.(); }
      }}>
      {recover ? <>
        <p className="text-xs text-muted-foreground sm:col-span-2">Reuse the exact evidence already approved in the inbox. A replacement upload cannot complete this recording.</p>
        <SelectInput id={`board-proof-${track.id}`} label="Original approved evidence" value={index} onChange={setIndex} options={retained.map((p, i) => ({ value: String(i), label: `${p.documentId} · version ${p.version}` }))} wide />
        <TextInput id={`board-date-${track.id}`} label="Actual Board decision date" type="date" max={todayIso()} value={date} onChange={setDate} wide />
      </> : <EvidenceField label="Board's written approval" destination={`Board approval · ${track.productName}`} value={proof} onChange={setProof} dateLabel="Board decided on" />}
    </ActionForm>
  </div>;
}
