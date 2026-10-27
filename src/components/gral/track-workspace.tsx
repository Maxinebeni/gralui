"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { onboardingOptions, runTrackAction, type TrackDetail } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { onboardingPermissions } from "@/lib/permissions";
import { TRACK_STAGES, trackHandoff, trackHealth } from "@/lib/onboarding";
import { useRefresh } from "@/lib/queries";
import { ActionPanel, OtherActions, StageRecord, STAGE_ACTIONS, type TrackOptions, type TrackRun } from "./track-forms";
import { Blockers, HealthChip, HistoryList } from "./onboarding-ui";
import { SingleSourceRequest } from "./track-workflow-actions";
import { KycReviewerAssignment } from "./kyc-reviewer-assignment";
import { PageHeader } from "./shell";
import { Chip, FloatCard, OutlineButton } from "./ui";

export function TrackWorkspace({ detail, onChanged }: { detail: TrackDetail; onChanged: () => Promise<void> }) {
  const t = detail.track;
  const { user } = useCurrentUser();
  const perms = onboardingPermissions(user);
  const refresh = useRefresh();
  const [selected, setSelected] = useState(t.stage);
  const [options, setOptions] = useState<TrackOptions>({ products: [], insurers: [], accountExecutives: [] });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setSelected(t.stage); }, [t.stage]);
  useEffect(() => { let active = true; onboardingOptions().then((o) => { if (active) setOptions(o); }).catch((e) => { if (active) setError(e instanceof Error ? e.message : "Could not load form choices."); }); return () => { active = false; }; }, [user.id, user.role]);
  const insurerName = (id: string) => options.insurers.find((i) => i.id === id)?.name ?? id;
  const run: TrackRun = async (input) => {
    await runTrackAction(t, input);
    await onChanged();
    refresh("leads", "approvals", "clients", "renewals");
  };
  const actions = selected === t.stage && t.status === "OPEN" ? (STAGE_ACTIONS[selected] ?? []).filter((a) => t.availableActions.includes(a)) : [];
  const handoff = selected === t.stage ? trackHandoff(t) : null;
  return <>
    <Link href="/my-work" className="mb-3 inline-flex text-xs text-muted-foreground hover:text-primary">Back to My Work</Link>
    <PageHeader title={t.productName ?? "Policy track"} subtitle={`${detail.lead?.name ?? "Assigned policy track"} · ${t.id}`} />
    <FloatCard className="mt-5 space-y-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-2"><HealthChip health={trackHealth(t)} /><Chip>Step {t.stage} of 11</Chip>{detail.lead ? <Link className="text-xs text-primary underline" href={`/clients/leads/${encodeURIComponent(detail.lead.id)}?track=${encodeURIComponent(t.id)}`}>Open parent lead</Link> : null}</div>
      <div className="flex flex-wrap gap-2" aria-label="Onboarding stages">{TRACK_STAGES.map((stage) => <OutlineButton key={stage.n} aria-pressed={selected === stage.n} className={selected === stage.n ? "bg-secondary text-primary" : ""} onClick={() => setSelected(stage.n)}>{stage.n}. {stage.name}</OutlineButton>)}</div>
    </FloatCard>
    <div className="mt-4 grid gap-4 xl:grid-cols-[1fr_340px]">
      <FloatCard className="min-w-0 space-y-4 p-4 sm:p-5">
        <h2 className="text-xl font-semibold tracking-tight">{TRACK_STAGES.find((s) => s.n === selected)?.name}</h2>
        {handoff ? <dl className="text-xs"><dt className="text-muted-foreground">Owner</dt><dd className="mt-1 font-medium">{handoff.owner}</dd></dl> : null}
        {error ? <p role="alert" className="text-xs text-danger">{error}</p> : null}
        {selected === 3 ? <div className="space-y-3"><p className="text-sm">Client KYC: {t.kyc?.status ?? "Not started"}</p>{perms.canReadKyc ? <><Link className="text-xs text-primary underline" href={`/clients/kyc/${encodeURIComponent(t.kyc?.caseId ?? t.clientId)}${t.kyc?.caseId ? "" : "?mode=client"}`}>Open client KYC</Link><KycReviewerAssignment caseId={t.kyc?.caseId} onChanged={onChanged} /></> : null}</div> : <StageRecord track={t} n={selected} insurerName={insurerName} />}
        {handoff?.summary ? <p className="text-sm font-medium">{handoff.summary}</p> : null}
        {selected === t.stage ? <Blockers codes={t.blockers} /> : null}
        {handoff && !actions.length ? <p className="text-xs text-muted-foreground">{handoff.waiting}</p> : null}
        {actions.map((action) => <ActionPanel key={`${action}:${t.version}`} action={action} track={t} options={options} insurerName={insurerName} run={run} leadName={detail.lead?.clientName ?? detail.lead?.name ?? ""} />)}
        {selected === 7 && t.stage === 7 && t.availableActions.includes("QUOTE") && t.invitations.some((i) => !i.response) ? <ActionPanel action="INSURER_RESPONSE" track={t} options={options} insurerName={insurerName} run={run} leadName="" collapsed /> : null}
        {selected === t.stage && [6, 7].includes(selected) ? <SingleSourceRequest track={t} run={run} /> : null}
      </FloatCard>
      <div className="min-w-0 space-y-4"><OtherActions track={t} options={options} insurerName={insurerName} run={run} /><FloatCard className="p-5"><h2 className="text-base font-semibold">Track history</h2><HistoryList items={detail.history} resource={{ type: "ONBOARDING", id: t.id }} /></FloatCard></div>
    </div>
  </>;
}
