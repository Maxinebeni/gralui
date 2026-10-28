"use client";

import { useEffect, useState } from "react";
import { checkProspectDuplicates, linkLeadClient, linkProspectCandidate, listClients, openProspect, type ProspectDuplicateReview, type ProspectInput } from "@/lib/api";
import { OnboardingError } from "@/lib/command-attempt";
import { PROSPECT_TYPES } from "@/lib/onboarding";
import type { Client, Lead, PolicyTrack } from "@/lib/types";
import { ActionForm, SelectInput, TextInput } from "./onboarding-ui";
import { FloatCard, OutlineButton } from "./ui";

export function ProspectClientForm({ lead, onDone }: { lead: Lead; onDone: (saved?: Lead | PolicyTrack) => void | Promise<void> }) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const types = PROSPECT_TYPES.filter((t) => t.leadType === lead.type);
  const [draft, setDraft] = useState<ProspectInput>({ registeredName: lead.name, clientType: types[0]?.code ?? "CORPORATE", sector: lead.industry, address: "", contactName: lead.contactName, jobTitle: "", email: lead.email ?? "", phone: lead.phone ?? "" });
  const [review, setReview] = useState<ProspectDuplicateReview | null>(null);
  const [reason, setReason] = useState("");
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  useEffect(() => { let active = true; if (mode === "existing") listClients().then((list) => { if (active) { setClients(list); setLoadError(null); } }).catch((e) => { if (active) setLoadError(e instanceof Error ? e.message : "Could not load clients."); }); return () => { active = false; }; }, [mode]);
  const set = (key: keyof ProspectInput) => (value: string) => { setDraft((v) => ({ ...v, [key]: value })); setReview(null); setReason(""); };
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2"><OutlineButton onClick={() => setMode("new")} aria-pressed={mode === "new"}>Open a new prospect client</OutlineButton><OutlineButton onClick={() => setMode("existing")} aria-pressed={mode === "existing"}>GRAL already has this client</OutlineButton></div>
    {mode === "existing" ? <ActionForm submitLabel="Link the client" success="Client linked." disabled={!clients.length} disabledReason={loadError ?? (!clients.length ? "Loading visible clients, or no clients are available." : undefined)} onSubmit={async (attempt) => {
      const client = clients.find((c) => c.id === clientId); if (!client) throw new Error("Choose a client.");
      await onDone(await linkLeadClient(lead, client, attempt));
    }}><SelectInput id="pr-existing" label="Client" value={clientId} onChange={setClientId} placeholder="Select a client" options={clients.map((c) => ({ value: c.id, label: `${c.name} (${c.id})` }))} wide /></ActionForm> : <>
      <ActionForm submitLabel={review ? "Open the prospect client" : "Review matching clients"} success={review ? "Prospect client opened." : "Duplicate review ready."} onSubmit={async (attempt) => {
        const input: ProspectInput = { ...draft, registeredName: draft.registeredName.trim(), sector: draft.sector.trim(), address: draft.address.trim(), contactName: draft.contactName.trim(), jobTitle: draft.jobTitle.trim(), email: draft.email.trim(), phone: draft.phone.replace(/[\s()-]/g, "") };
        if ([input.registeredName, input.sector, input.address, input.contactName, input.jobTitle, input.email, input.phone].some((v) => !v)) throw new Error("Fill in every required client field.");
        if (!/^\+250\d{9}$/.test(input.phone)) throw new Error("Use a Rwanda phone number, for example +250788123456.");
        if (!review) { setReview(await checkProspectDuplicates(input)); return; }
        if (review.candidates.length && !reason.trim()) throw new Error("Explain why a separate client record is required after reviewing the matches.");
        try { await onDone(await openProspect(lead, { ...input, reviewFingerprint: review.fingerprint, duplicateReason: reason.trim() || undefined }, attempt)); }
        catch (e) { if (e instanceof OnboardingError && e.code === "DUPLICATE_REVIEW_REQUIRED") setReview(null); throw e; }
      }}>
        <TextInput id="pr-name" label="Registered name" value={draft.registeredName} onChange={set("registeredName")} wide />
        <SelectInput id="pr-type" label="Client type" value={draft.clientType} onChange={set("clientType")} options={types.map((t) => ({ value: t.code, label: t.label }))} />
        <TextInput id="pr-sector" label="Sector" value={draft.sector} onChange={set("sector")} />
        <TextInput id="pr-address" label="Address" value={draft.address} onChange={set("address")} wide />
        <TextInput id="pr-contact" label="Contact person" value={draft.contactName} onChange={set("contactName")} />
        <TextInput id="pr-title" label="Job title" value={draft.jobTitle} onChange={set("jobTitle")} />
        <TextInput id="pr-email" label="Email" value={draft.email} onChange={set("email")} />
        <TextInput id="pr-phone" label="Phone" value={draft.phone} onChange={set("phone")} />
        {review ? <p role="status" className="text-xs text-muted-foreground sm:col-span-2">{review.candidates.length ? `${review.candidates.length} possible matching clients found. Review them below before proceeding.` : "No matching clients found for these details."}</p> : null}
        {review?.candidates.length ? <TextInput id="pr-dup" label="Reason for creating a separate client" value={reason} onChange={setReason} multiline wide /> : null}
      </ActionForm>
      {review?.candidates.map((candidate) => <FloatCard key={candidate.id} className="space-y-3 p-4"><p className="text-sm font-medium">{candidate.name} · {candidate.reference}</p><p className="text-xs text-muted-foreground">Matches: {candidate.matches.join(", ")}</p><ActionForm submitLabel="Link this existing client" success="Existing client linked." disabled={candidate.managerId !== lead.ownerId} disabledReason={candidate.managerId !== lead.ownerId ? "The client must have the same Accounts Executive as this lead. Ask CRM to review the assignment." : undefined} onSubmit={async (attempt) => { await onDone(await linkProspectCandidate(lead, candidate.id, candidate.name, attempt)); }} /></FloatCard>)}
    </>}
  </div>;
}
