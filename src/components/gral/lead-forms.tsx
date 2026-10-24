"use client";

// One lead: SOP steps 1 and 2 as a checklist with the action for each, the
// policy tracks started for it (steps 3 to 11, one per policy), the client's
// KYC, and the lead's history.

import { useEffect, useState } from "react";
import Link from "next/link";

import {
  assignLead,
  closeLead,
  confirmLead,
  linkLeadClient,
  listClients,
  onboardingOptions,
  openProspect,
  recordAssessment,
  recordLeadResponse,
  startTrack,
  type ChoiceOption,
  type EvidenceInput,
  type LeadDetail,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import {
  KYC_STATUS_LABEL,
  LEAD_STATUS_LABEL,
  LEAD_STEPS,
  PROSPECT_TYPES,
  TRACK_STATUS_LABEL,
  leadHealth,
  leadReady,
  leadStepDone,
  nextLeadStep,
  openMilestone,
  stageOf,
  trackHealth,
  type LeadStepKey,
} from "@/lib/onboarding";
import { onboardingPermissions } from "@/lib/permissions";
import { todayIso } from "@/lib/renewals";
import type { Client, Lead } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CenteredModal, PageHeader } from "./shell";
import { ActionForm, Blockers, EvidenceField, HealthChip, HistoryList, ProofList, SelectInput, TextInput, dateOf } from "./onboarding-ui";
import { Chip, FloatCard, OutlineButton, Person } from "./ui";

const PROOF_LABELS: Record<string, string> = {
  LEAD_RESPONSE: "First response",
  PRE_MEETING_REQUEST: "Pre-meeting document request",
  MEETING_SUMMARY: "Meeting summary",
  MEETING_CONFIRMATION: "Client's confirmation of the summary",
};

type Perms = ReturnType<typeof onboardingPermissions>;

export function AssignForm({ lead, onDone, onCancel }: { lead: Lead; onDone: () => void; onCancel?: () => void }) {
  const [options, setOptions] = useState<ChoiceOption[]>([]);
  const [ownerId, setOwnerId] = useState(lead.ownerId ?? "");
  useEffect(() => {
    onboardingOptions().then((o) => setOptions(o.accountExecutives));
  }, []);
  return (
    <ActionForm
      submitLabel="Assign"
      success="Accounts Executive assigned."
      onCancel={onCancel}
      onSubmit={async () => {
        if (!ownerId) throw new Error("Choose the Accounts Executive.");
        await assignLead(lead, ownerId);
        onDone();
      }}
    >
      <SelectInput id="lead-owner" label="Accounts Executive" value={ownerId} onChange={setOwnerId} placeholder="Select a person" options={options.map((o) => ({ value: o.id, label: o.name }))} wide />
    </ActionForm>
  );
}

export function ResponseForm({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  return (
    <ActionForm
      submitLabel="Record the response"
      success="First response recorded."
      onSubmit={async () => {
        if (!evidence) throw new Error("Attach the email or call note.");
        await recordLeadResponse(lead, evidence);
        onDone();
      }}
    >
      <EvidenceField label="Proof of the first response" destination={`First response · ${lead.name}`} value={evidence} onChange={setEvidence} dateLabel="Responded on" withNote />
    </ActionForm>
  );
}

export function AssessmentForm({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const [meetingAt, setMeetingAt] = useState(todayIso());
  const [needs, setNeeds] = useState("");
  const [assets, setAssets] = useState("");
  const [employees, setEmployees] = useState("");
  const [existingCover, setExistingCover] = useState("");
  const [request, setRequest] = useState<EvidenceInput | null>(null);
  const [summary, setSummary] = useState<EvidenceInput | null>(null);
  const [confirmation, setConfirmation] = useState<EvidenceInput | null>(null);
  return (
    <ActionForm
      submitLabel="Record the needs assessment"
      success="Needs assessment recorded."
      onSubmit={async () => {
        if (!needs.trim() || !assets.trim() || !existingCover.trim()) throw new Error("Fill in the needs, the assets and the existing cover.");
        if (!request || !summary || !confirmation) throw new Error("Attach the pre-meeting request, the meeting summary and the client's confirmation.");
        await recordAssessment(lead, {
          meetingAt,
          needs,
          assets,
          existingCover,
          employeeCount: employees ? Number(employees) : undefined,
          request,
          summary,
          confirmation,
        });
        onDone();
      }}
    >
      <TextInput id="as-meeting" label="Meeting date" type="date" max={todayIso()} value={meetingAt} onChange={setMeetingAt} />
      <TextInput id="as-employees" label="Number of staff (optional)" type="number" value={employees} onChange={setEmployees} />
      <TextInput id="as-needs" label="Needs" value={needs} onChange={setNeeds} multiline wide />
      <TextInput id="as-assets" label="Assets to insure" value={assets} onChange={setAssets} multiline wide />
      <TextInput id="as-cover" label="Existing cover" value={existingCover} onChange={setExistingCover} wide />
      <EvidenceField label="Pre-meeting document request" destination={`Pre-meeting request · ${lead.name}`} value={request} onChange={setRequest} dateLabel="Sent on" />
      <EvidenceField label="Meeting summary" destination={`Meeting summary · ${lead.name}`} value={summary} onChange={setSummary} dateLabel="Written on" />
      <EvidenceField label="Client's confirmation of the summary" destination={`Client confirmation · ${lead.name}`} value={confirmation} onChange={setConfirmation} dateLabel="Confirmed on" />
    </ActionForm>
  );
}

export function ClientForm({ lead, onDone }: { lead: Lead; onDone: () => void }) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const types = PROSPECT_TYPES.filter((t) => t.leadType === lead.type);
  const [v, setV] = useState({
    registeredName: lead.name,
    clientType: types[0]?.code ?? "CORPORATE",
    sector: lead.industry,
    address: "",
    contactName: lead.contactName,
    jobTitle: "",
    email: lead.email ?? "",
    phone: lead.phone ?? "",
    duplicateReason: "",
  });
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  useEffect(() => {
    if (mode === "existing") listClients().then(setClients).catch(() => setClients([]));
  }, [mode]);
  const set = (k: keyof typeof v) => (value: string) => setV((x) => ({ ...x, [k]: value }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["new", "Open a new prospect client"],
            ["existing", "GRAL already has this client"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => setMode(m)}
            className={cn("rounded-full border px-3 py-1 text-xs", mode === m ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:bg-secondary")}
          >
            {label}
          </button>
        ))}
      </div>
      {mode === "new" ? (
        <ActionForm
          submitLabel="Open the prospect client"
          success="Prospect client opened."
          onSubmit={async () => {
            const missing = (["registeredName", "sector", "address", "contactName", "jobTitle", "email", "phone"] as const).filter((k) => !v[k].trim());
            if (missing.length) throw new Error("Fill in every field. The client record needs them all.");
            await openProspect(lead, { ...v, duplicateReason: v.duplicateReason.trim() || undefined });
            onDone();
          }}
        >
          <TextInput id="pr-name" label="Registered name" value={v.registeredName} onChange={set("registeredName")} wide />
          <SelectInput id="pr-type" label="Client type" value={v.clientType} onChange={set("clientType")} options={types.map((t) => ({ value: t.code, label: t.label }))} />
          <TextInput id="pr-sector" label="Sector" value={v.sector} onChange={set("sector")} />
          <TextInput id="pr-address" label="Address" value={v.address} onChange={set("address")} wide />
          <TextInput id="pr-contact" label="Contact person" value={v.contactName} onChange={set("contactName")} />
          <TextInput id="pr-title" label="Job title" value={v.jobTitle} onChange={set("jobTitle")} />
          <TextInput id="pr-email" label="Email" type="email" value={v.email} onChange={set("email")} />
          <TextInput id="pr-phone" label="Phone" value={v.phone} onChange={set("phone")} />
          <TextInput id="pr-dup" label="Duplicate reason (optional)" value={v.duplicateReason} onChange={set("duplicateReason")} wide />
        </ActionForm>
      ) : (
        <ActionForm
          submitLabel="Link the client"
          success="Client linked."
          onSubmit={async () => {
            const client = clients.find((c) => c.id === clientId);
            if (!client) throw new Error("Choose the client.");
            await linkLeadClient(lead, client);
            onDone();
          }}
        >
          <SelectInput id="pr-existing" label="Client" value={clientId} onChange={setClientId} placeholder="Select a client" options={clients.map((c) => ({ value: c.id, label: `${c.name} (${c.id})` }))} wide />
        </ActionForm>
      )}
    </div>
  );
}

export function StartTrackForm({ lead, onDone, onCancel }: { lead: Lead; onDone: () => void; onCancel: () => void }) {
  const [products, setProducts] = useState<ChoiceOption[]>([]);
  const [productId, setProductId] = useState("");
  const [underwritingRole, setRole] = useState("GI_UNDERWRITING_MANAGER");
  const [property, setProperty] = useState(false);
  useEffect(() => {
    onboardingOptions().then((o) => setProducts(o.products));
  }, []);
  return (
    <ActionForm
      title="Start a policy track"
      submitLabel="Start the track"
      success="Policy track started. Step 3 checks the client's KYC."
      onCancel={onCancel}
      onSubmit={async () => {
        if (!productId) throw new Error("Choose the product.");
        await startTrack(lead, { productId, underwritingRole, property });
        onDone();
      }}
    >
      <SelectInput id="tr-product" label="Product" value={productId} onChange={setProductId} placeholder="Select a product" options={products.map((p) => ({ value: p.id, label: p.name }))} wide />
      <SelectInput
        id="tr-role"
        label="Underwriting by"
        value={underwritingRole}
        onChange={setRole}
        options={[
          { value: "GI_UNDERWRITING_MANAGER", label: "GI Underwriting Manager" },
          { value: "MEDICAL_UNDERWRITING_MANAGER", label: "Medical Underwriting Manager" },
        ]}
      />
      <label className="flex items-center gap-2 self-end pb-2 text-xs">
        <input type="checkbox" checked={property} onChange={(e) => setProperty(e.target.checked)} />
        Property cover (needs the client's asset list before placement)
      </label>
    </ActionForm>
  );
}

/** "Close lead" in the page header; the outcome and reason are asked in a pop-up. */
export function CloseLead({ lead, onChanged }: { lead: Lead; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [disposition, setDisposition] = useState<"CLOSED_LOST" | "CANCELLED">("CLOSED_LOST");
  const [reason, setReason] = useState("");
  return (
    <>
      <OutlineButton className="px-4 py-2 text-sm" onClick={() => setOpen(true)}>
        Close lead
      </OutlineButton>
      <CenteredModal open={open} onClose={() => setOpen(false)}>
        <div className="px-6 py-6 sm:px-8">
          <h2 className="text-lg font-semibold tracking-tight">Close {lead.name}</h2>
          <div className="mt-5">
            <ActionForm
              submitLabel="Close lead"
              success="Lead closed."
              onCancel={() => setOpen(false)}
              onSubmit={async () => {
                await closeLead(lead, disposition, reason);
                setOpen(false);
                onChanged();
              }}
            >
              <SelectInput
                id="cl-disp"
                label="Outcome"
                value={disposition}
                onChange={(v) => setDisposition(v as "CLOSED_LOST" | "CANCELLED")}
                options={[
                  { value: "CLOSED_LOST", label: "Lost" },
                  { value: "CANCELLED", label: "Cancelled" },
                ]}
                wide
              />
              <TextInput id="cl-reason" label="Reason" value={reason} onChange={setReason} wide />
            </ActionForm>
          </div>
        </div>
      </CenteredModal>
    </>
  );
}
