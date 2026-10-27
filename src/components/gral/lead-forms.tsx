"use client";

// One lead: SOP steps 1 and 2 as a checklist with the action for each, the
// policy tracks started for it (steps 3 to 11, one per policy), the client's
// KYC, and the lead's history.

import { useEffect, useState } from "react";
import { ProspectClientForm } from "./prospect-client-form";

import {
  assignLead,
  closeLead,
  onboardingOptions,
  recordAssessment,
  recordLeadResponse,
  startTrack,
  type ChoiceOption,
  type EvidenceInput,
} from "@/lib/api";
import { onboardingPermissions } from "@/lib/permissions";
import { todayIso } from "@/lib/renewals";
import type { Lead, PolicyTrack } from "@/lib/types";
import { ActionForm, EvidenceField, SelectInput, TextInput } from "./onboarding-ui";
import { CenteredModal } from "./shell";
import { OutlineButton } from "./ui";

const PROOF_LABELS: Record<string, string> = {
  LEAD_RESPONSE: "First response",
  PRE_MEETING_REQUEST: "Pre-meeting document request",
  MEETING_SUMMARY: "Meeting summary",
  MEETING_CONFIRMATION: "Client's confirmation of the summary",
};

type Perms = ReturnType<typeof onboardingPermissions>;

export function AssignForm({ lead, onDone, onCancel }: { lead: Lead; onDone: (saved?: Lead | PolicyTrack) => void | Promise<void>; onCancel?: () => void }) {
  const [options, setOptions] = useState<ChoiceOption[]>([]);
  const [ownerId, setOwnerId] = useState(lead.ownerId ?? "");
  const [reason, setReason] = useState("");
  useEffect(() => {
    onboardingOptions().then((o) => setOptions(o.accountExecutives));
  }, []);
  return (
    <ActionForm
      submitLabel="Assign"
      success="Accounts Executive assigned."
      onCancel={onCancel}
      onSubmit={async (attempt) => {
        if (!ownerId) throw new Error("Choose the Accounts Executive.");
        if (!reason.trim()) throw new Error("Give a reason for this assignment.");
        await onDone(await assignLead(lead, ownerId, reason, attempt));
      }}
    >
      <SelectInput id="lead-owner" label="Accounts Executive" value={ownerId} onChange={setOwnerId} placeholder="Select a person" options={options.map((o) => ({ value: o.id, label: o.name }))} wide />
      <TextInput id="lead-assignment-reason" label="Reason for assignment" value={reason} onChange={setReason} placeholder="Explain why this Accounts Executive is being assigned" multiline wide />
    </ActionForm>
  );
}

export function ResponseForm({ lead, onDone }: { lead: Lead; onDone: (saved?: Lead | PolicyTrack) => void }) {
  const [evidence, setEvidence] = useState<EvidenceInput | null>(null);
  return (
    <ActionForm
      submitLabel="Record the response"
      success="First response recorded."
      onSubmit={async (attempt) => {
        if (!evidence) throw new Error("Attach the email or call note.");
        await onDone(await recordLeadResponse(lead, evidence, attempt));
      }}
    >
      <EvidenceField label="Proof of the first response" destination={`First response · ${lead.name}`} value={evidence} onChange={setEvidence} dateLabel="Responded on" withNote />
    </ActionForm>
  );
}

export function AssessmentForm({ lead, onDone }: { lead: Lead; onDone: (saved?: Lead | PolicyTrack) => void }) {
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
      onSubmit={async (attempt) => {
        if (!needs.trim() || !assets.trim() || !existingCover.trim()) throw new Error("Fill in the needs, the assets and the existing cover.");
        if (!request || !summary || !confirmation) throw new Error("Attach the pre-meeting request, the meeting summary and the client's confirmation.");
        await onDone(
          await recordAssessment(lead, {
            meetingAt,
            needs,
            assets,
            existingCover,
            employeeCount: employees ? Number(employees) : undefined,
            request,
            summary,
            confirmation,
          }, attempt),
        );
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

export function ClientForm({ lead, onDone }: { lead: Lead; onDone: (saved?: Lead | PolicyTrack) => void | Promise<void> }) { return <ProspectClientForm lead={lead} onDone={onDone} />; }

export function StartTrackForm({ lead, onDone, onCancel }: { lead: Lead; onDone: (saved?: Lead | PolicyTrack) => void | Promise<void>; onCancel: () => void }) {
  const [products, setProducts] = useState<ChoiceOption[]>([]);
  const [productsLoaded, setProductsLoaded] = useState(false);
  const [productId, setProductId] = useState("");
  const [underwritingRole, setRole] = useState("GI_UNDERWRITING_MANAGER");
  const [property, setProperty] = useState(false);
  useEffect(() => {
    onboardingOptions().then((o) => setProducts(o.products)).finally(() => setProductsLoaded(true));
  }, []);
  return (
    <ActionForm
      title="Start a policy track"
      submitLabel="Start the track"
      success="Policy track started. Step 3 checks the client's KYC."
      onCancel={onCancel}
      onSubmit={async (attempt) => {
        if (!productId) throw new Error("Choose the product.");
        await onDone(await startTrack(lead, { productId, underwritingRole, property }, attempt));
      }}
    >
      <SelectInput id="tr-product" label="Product" value={productId} onChange={setProductId} placeholder="Select a product" options={products.map((p) => ({ value: p.id, label: p.name }))} wide />
      {productsLoaded && products.length === 0 ? <p className="text-xs text-muted-foreground sm:col-span-2">No active products are linked to an active insurer in the catalog.</p> : null}
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
export function CloseLead({ lead, onChanged }: { lead: Lead; onChanged: (saved?: Lead) => void }) {
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
              onSubmit={async (attempt) => {
                const saved = await closeLead(lead, disposition, reason, attempt);
                setOpen(false);
                onChanged(saved);
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
