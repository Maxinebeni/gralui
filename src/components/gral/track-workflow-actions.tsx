"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getOnboardingApproval, getOnboardingClient, listTrackAssignees, onboardingOptions, type EvidenceInput, type StaffChoice } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { hasPermission, usesBackendPermissions } from "@/lib/permissions";
import type { PolicyTrack } from "@/lib/types";
import type { TrackRun } from "./track-forms";
import { ActionForm, EvidenceField, SelectInput, TextInput } from "./onboarding-ui";
import { Chip, OutlineButton } from "./ui";

function useSingleSource(track: PolicyTrack) {
  const id = track.approvalRequests.SINGLE_SOURCE;
  const [status, setStatus] = useState<string | null>(id ? null : "NOT_REQUESTED");
  const [error, setError] = useState<string | null>(null);
  const [revision, retry] = useState(0);
  useEffect(() => {
    let active = true; setError(null); setStatus(id ? null : "NOT_REQUESTED");
    if (id) getOnboardingApproval(id).then((r) => { if (active) setStatus(r.status); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not check the exception."); });
    return () => { active = false; };
  }, [id, track.version, revision]);
  return { status, error, retry: () => retry((n) => n + 1) };
}

export function SingleSourceStatus({ track, onApproved }: { track: PolicyTrack; onApproved?: (approved: boolean) => void }) {
  const { status, error, retry } = useSingleSource(track);
  useEffect(() => { onApproved?.(status === "APPROVED" && !error); }, [status, error, onApproved]);
  if (!track.approvalRequests.SINGLE_SOURCE) return null;
  return <div className="space-y-2 text-xs sm:col-span-2">
    <p>Single-source exception: <Chip tone={status === "APPROVED" ? "success" : "warning"}>{status ? status.toLowerCase() : "Checking…"}</Chip></p>
    {error ? <><p role="alert" className="text-danger">{error}</p><OutlineButton onClick={retry}>Try again</OutlineButton></> : null}
    {status !== "APPROVED" ? <p className="text-muted-foreground">At least three insurer invitations are required until this exception is approved.</p> : null}
  </div>;
}

export function SingleSourceRequest({ track, run }: { track: PolicyTrack; run: TrackRun }) {
  const { user } = useCurrentUser();
  const { status, error, retry } = useSingleSource(track);
  const [proof, setProof] = useState<EvidenceInput | null>(null);
  const [reason, setReason] = useState("");
  const eligible = usesBackendPermissions(user) ? hasPermission(user, "ONBOARDING_RECOMMEND") : ["GI Underwriting Manager"].includes(user.role);
  if (!eligible || track.status !== "OPEN" || ![6, 7].includes(track.stage)) return null;
  if (error) return <div className="space-y-2"><p role="alert" className="text-xs text-danger">{error}</p><OutlineButton onClick={retry}>Check exception status</OutlineButton></div>;
  if (!status) return <p className="text-xs text-muted-foreground">Checking single-source exception…</p>;
  if (!["NOT_REQUESTED", "RETURNED", "REJECTED"].includes(status)) return <SingleSourceStatus track={track} />;
  return <ActionForm title={status === "NOT_REQUESTED" ? "Request a single-source exception" : `Request a new exception (${status.toLowerCase()})`} submitLabel="Send for approval" success="Single-source exception sent for approval."
    onSubmit={async (attempt) => {
      if (!proof || !reason.trim()) throw new Error("Attach the justification and explain why the exception is needed.");
      await run({ action: "SINGLE_SOURCE", evidence: { main: { ...proof, detail: reason.trim() } }, attempt });
    }}>
    <TextInput id={`ss-reason-${track.id}`} label="Written justification" value={reason} onChange={setReason} multiline wide />
    <EvidenceField label="Single-source justification evidence" destination={`Single-source exception · ${track.productName}`} value={proof} onChange={setProof} />
  </ActionForm>;
}

export function TrackAssignmentForm({ track, run }: { track: PolicyTrack; run: TrackRun }) {
  const [responsibility, setResponsibility] = useState<"OWNER" | "TECHNICAL" | "UNDERWRITING">("TECHNICAL");
  const [choices, setChoices] = useState<StaffChoice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState("");
  const [reason, setReason] = useState("");
  const [revision, retry] = useState(0);
  useEffect(() => {
    let active = true; setChoices(null); setError(null); setSelected("");
    const load = async () => {
      if (responsibility !== "OWNER") return listTrackAssignees(track.id, responsibility);
      const [client, options] = await Promise.all([getOnboardingClient(track.clientId), onboardingOptions()]);
      return options.accountExecutives.filter((p) => p.id === client.managerId).map((p) => ({ id: p.id, fullName: p.name }));
    };
    load().then((p) => { if (active) setChoices(p); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load eligible staff."); });
    return () => { active = false; };
  }, [track.id, track.clientId, responsibility, revision]);
  return <ActionForm title="Assign responsibility" submitLabel={responsibility === "OWNER" ? "Synchronize Accounts Executive" : "Assign"} success="Responsibility assigned."
    disabled={!choices?.length || !!error} disabledReason={error ?? (choices === null ? "Loading eligible staff…" : !choices.length ? "No eligible staff are available for this responsibility." : undefined)}
    onSubmit={async (attempt) => {
      if (!selected) throw new Error("Select an eligible person.");
      await run({ action: "ASSIGN", fields: { responsibility, assigneeId: selected }, reason, attempt });
    }}>
    <SelectInput id={`responsibility-${track.id}`} label="Responsibility" value={responsibility} onChange={(v) => setResponsibility(v as typeof responsibility)} options={[
      { value: "TECHNICAL", label: "Technical Director" }, { value: "UNDERWRITING", label: track.underwritingRole === "MEDICAL_UNDERWRITING_MANAGER" ? "Medical Underwriting Manager" : "GI Underwriting Manager" }, { value: "OWNER", label: "Accounts Executive" },
    ]} wide />
    {responsibility === "OWNER" ? <p className="text-xs text-muted-foreground sm:col-span-2">The track owner must match the client&apos;s current manager. Change the manager on the <Link className="text-primary underline" href={`/clients?client=${encodeURIComponent(track.clientId)}`}>client record</Link> first, then synchronize this track.</p> : null}
    <SelectInput id={`staff-${track.id}`} label="Eligible person" value={selected} onChange={setSelected} placeholder="Select a person" options={(choices ?? []).map((p) => ({ value: p.id, label: p.fullName }))} wide />
    <TextInput id={`assignment-reason-${track.id}`} label="Reason for assignment" value={reason} onChange={setReason} multiline wide />
    {error ? <OutlineButton onClick={() => retry((n) => n + 1)}>Reload eligible staff</OutlineButton> : null}
  </ActionForm>;
}

export function DeadlineForm({ track, run }: { track: PolicyTrack; run: TrackRun }) {
  const open = track.milestones.filter((m) => m.status === "OPEN");
  const [milestone, setMilestone] = useState(open.at(-1)?.code ?? "");
  const [date, setDate] = useState("");
  const [reason, setReason] = useState("");
  return <ActionForm title="Adjust deadline" submitLabel="Save deadline" success="Milestone deadline updated." disabled={track.status !== "OPEN" || !open.length} disabledReason={track.status !== "OPEN" ? "Resume the case before adjusting its deadline." : !open.length ? "There is no open milestone." : undefined}
    onSubmit={async (attempt) => {
      if (!milestone || !date || Number.isNaN(new Date(date).valueOf())) throw new Error("Choose an open milestone and a valid date and time.");
      await run({ action: "DEADLINE", fields: { milestone, dueAt: new Date(date).toISOString() }, reason, attempt });
    }}>
    <SelectInput id={`milestone-${track.id}`} label="Open milestone" value={milestone} onChange={setMilestone} options={open.map((m) => ({ value: m.code, label: m.code.replaceAll("_", " ") }))} wide />
    <TextInput id={`deadline-${track.id}`} label="New deadline (local date and time)" type="datetime-local" value={date} onChange={setDate} wide />
    <TextInput id={`deadline-reason-${track.id}`} label="Reason for adjustment" value={reason} onChange={setReason} multiline wide />
  </ActionForm>;
}
