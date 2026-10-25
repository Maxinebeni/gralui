"use client";

// Onboarding step 1: register a lead (SOP 3.2), with the backend's fields. The
// CRM Manager can assign the Accounts Executive straight away; otherwise it is
// done from the lead. The Technical Department is told by the system.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { onboardingOptions, registerLead, type ChoiceOption } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { LEAD_SOURCES } from "@/lib/onboarding";
import { onboardingPermissions } from "@/lib/permissions";
import { todayIso } from "@/lib/renewals";
import type { Lead, LeadType } from "@/lib/types";
import { Field, IndustrySelect, Section, describedBy, inputClass } from "./client-form";
import { NavyButton, OutlineButton } from "./ui";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Values = {
  name: string;
  type: LeadType;
  industry: string;
  source: string;
  sourceReference: string;
  contactName: string;
  email: string;
  phone: string;
  receivedAt: string;
  ownerId: string;
};

export function LeadForm({ onClose, onCreated }: { onClose: () => void; onCreated: (lead: Lead) => void }) {
  const { user } = useCurrentUser();
  const { canAssignLead } = onboardingPermissions(user);
  const [executives, setExecutives] = useState<ChoiceOption[]>([]);
  const [v, setV] = useState<Values>({
    name: "",
    type: "CORPORATE",
    industry: "",
    source: "",
    sourceReference: "",
    contactName: "",
    email: "",
    phone: "",
    receivedAt: todayIso(),
    ownerId: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (canAssignLead) onboardingOptions().then((o) => setExecutives(o.accountExecutives));
  }, [canAssignLead]);

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Partial<Record<keyof Values, string>> = {};
    if (v.name.trim().length < 2) found.name = v.type === "INDIVIDUAL" ? "Enter the person's full name." : "Enter the company name.";
    if (!v.industry.trim()) found.industry = "Choose the industry.";
    if (!v.source) found.source = "Choose where the lead came from.";
    if (!v.contactName.trim()) found.contactName = "Enter the contact person's name.";
    if (v.email.trim() && !EMAIL_PATTERN.test(v.email.trim())) found.email = "Enter a valid email, e.g. name@company.rw.";
    if (!v.email.trim() && !v.phone.trim()) found.email = "Enter an email or a phone number so the Accounts Executive can follow up.";
    if (!v.receivedAt || v.receivedAt > todayIso()) found.receivedAt = "Enter the date the enquiry came in (not in the future).";
    setErrors(found);
    if (Object.keys(found).length) return toast.error("Please fix the highlighted fields.");
    setSaving(true);
    try {
      const created = await registerLead({
        name: v.name,
        type: v.type,
        industry: v.industry,
        source: v.source,
        sourceReference: v.sourceReference,
        contactName: v.contactName,
        email: v.email,
        phone: v.phone,
        receivedAt: v.receivedAt,
        ownerId: v.ownerId || undefined,
      });
      toast.success(
        created.ownerId
          ? `${created.name} registered. The first response is due within 24 hours.`
          : `${created.name} registered. The CRM Manager assigns the Accounts Executive next.`,
      );
      onCreated(created);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not register the lead.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">New Lead</h2>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 px-6 py-5">
        <Section title="Prospect">
          <Field id="leadType" label="Company or individual">
            <select id="leadType" value={v.type} onChange={(e) => set("type", e.target.value as LeadType)} className={inputClass()}>
              <option value="CORPORATE">Company or organisation</option>
              <option value="INDIVIDUAL">Individual</option>
            </select>
          </Field>
          <Field id="leadName" label={v.type === "INDIVIDUAL" ? "Full name" : "Company name"} error={errors.name}>
            <input id="leadName" value={v.name} onChange={(e) => set("name", e.target.value)} className={inputClass(errors.name)} {...describedBy("leadName", errors.name)} />
          </Field>
          <Field id="leadIndustry" label="Industry" error={errors.industry}>
            <IndustrySelect id="leadIndustry" value={v.industry} onChange={(x) => set("industry", x)} error={errors.industry} />
          </Field>
          <Field id="leadReceived" label="Enquiry received on" error={errors.receivedAt}>
            <input id="leadReceived" type="date" max={todayIso()} value={v.receivedAt} onChange={(e) => set("receivedAt", e.target.value)} className={inputClass(errors.receivedAt)} {...describedBy("leadReceived", errors.receivedAt)} />
          </Field>
        </Section>

        <Section title="Contact person">
          <Field id="leadContact" label="Full name" error={errors.contactName}>
            <input id="leadContact" value={v.contactName} onChange={(e) => set("contactName", e.target.value)} className={inputClass(errors.contactName)} {...describedBy("leadContact", errors.contactName)} />
          </Field>
          <Field id="leadEmail" label="Email" error={errors.email}>
            <input id="leadEmail" type="email" value={v.email} onChange={(e) => set("email", e.target.value)} placeholder="name@company.rw" className={inputClass(errors.email)} {...describedBy("leadEmail", errors.email)} />
          </Field>
          <Field id="leadPhone" label="Phone">
            <input id="leadPhone" type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} placeholder="+250 788 123 456" className={inputClass()} />
          </Field>
        </Section>

        <Section title="Source and owner">
          <Field id="leadSource" label="Where the lead came from" error={errors.source}>
            <select id="leadSource" value={v.source} onChange={(e) => set("source", e.target.value)} className={inputClass(errors.source)} {...describedBy("leadSource", errors.source)}>
              <option value="">Select a source</option>
              {LEAD_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field id="leadSourceRef" label="Referred by (optional)">
            <input id="leadSourceRef" value={v.sourceReference} onChange={(e) => set("sourceReference", e.target.value)} className={inputClass()} />
          </Field>
          {canAssignLead ? (
            <Field id="leadOwner" label="Accounts Executive (optional now)" wide>
              <select id="leadOwner" value={v.ownerId} onChange={(e) => set("ownerId", e.target.value)} className={inputClass()}>
                <option value="">Assign later from the lead</option>
                {executives.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}
        </Section>
      </div>

      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
        <OutlineButton onClick={onClose} className="px-4 py-2 text-sm">
          Cancel
        </OutlineButton>
        <NavyButton type="submit" disabled={saving} className="px-4 py-2 text-sm">
          {saving ? "Saving…" : "Register Lead"}
        </NavyButton>
      </div>
    </form>
  );
}
