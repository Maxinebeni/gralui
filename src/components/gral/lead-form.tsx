"use client";

// Onboarding step 1: register a lead (SOP 3.2). The KYC checklist for the
// client type is created with it; the client file itself is opened at step 11.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { createLead, listManagers } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import type { ClientType, OnboardingCase } from "@/lib/types";
import { CLIENT_FORM_TYPES, Field, Section, describedBy, inputClass } from "./client-form";
import { NavyButton, OutlineButton } from "./ui";

const REFERRAL_SOURCES = [
  "Referral from an existing client",
  "Referral from a partner or insurer",
  "Direct approach",
  "Website enquiry",
  "Marketing campaign",
  "Tender invitation",
  "Other",
];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type Values = {
  name: string;
  type: ClientType | "";
  sector: string;
  address: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  referralSource: string;
  accountExecutive: string;
};

export function LeadForm({ onClose, onCreated }: { onClose: () => void; onCreated: (c: OnboardingCase) => void }) {
  const { user } = useCurrentUser();
  const [managers, setManagers] = useState<string[]>([]);
  const [v, setV] = useState<Values>({
    name: "",
    type: "",
    sector: "",
    address: "",
    contactName: "",
    contactTitle: "",
    contactEmail: "",
    contactPhone: "",
    referralSource: "",
    accountExecutive: "",
  });
  const [errors, setErrors] = useState<Partial<Record<keyof Values, string>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    listManagers().then(setManagers);
  }, []);

  const set = <K extends keyof Values>(k: K, value: Values[K]) => {
    setV((x) => ({ ...x, [k]: value }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Partial<Record<keyof Values, string>> = {};
    if (v.name.trim().length < 2) found.name = "Enter the company name.";
    if (!v.type) found.type = "Choose the client type. It decides the KYC checklist.";
    if (!v.sector.trim()) found.sector = "Enter the industry, e.g. Hospitality.";
    if (!v.contactName.trim()) found.contactName = "Enter the contact person's name.";
    if (!EMAIL_PATTERN.test(v.contactEmail.trim()) && !v.contactPhone.trim()) {
      found.contactEmail = "Enter an email or a phone number so the Accounts Executive can follow up.";
    }
    if (!v.referralSource) found.referralSource = "Choose where the lead came from.";
    if (!v.accountExecutive) found.accountExecutive = "Choose the Accounts Executive (the CRM Manager assigns one).";
    setErrors(found);
    if (Object.keys(found).length) return toast.error("Please fix the highlighted fields.");
    setSaving(true);
    try {
      const created = await createLead(
        {
          name: v.name,
          type: v.type as ClientType,
          sector: v.sector.trim(),
          address: v.address.trim(),
          contact: {
            name: v.contactName.trim(),
            title: v.contactTitle.trim(),
            email: v.contactEmail.trim().toLowerCase(),
            phone: v.contactPhone.trim(),
          },
          referralSource: v.referralSource,
          accountExecutive: v.accountExecutive,
        },
        user.name,
      );
      toast.success(`Lead ${created.id} registered. ${v.accountExecutive} meets the client within 3 working days.`);
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
          <p className="mt-1 text-xs text-muted-foreground">
            Step 1 of onboarding: register the prospect the same day. The KYC checklist is created from the client type, and
            the Accounts Executive takes it from here.
          </p>
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
          <Field id="leadName" label="Company name" error={errors.name} wide>
            <input id="leadName" value={v.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Kivu Lakeside Hotels Ltd" className={inputClass(errors.name)} {...describedBy("leadName", errors.name)} />
          </Field>
          <Field id="leadType" label="Client type" error={errors.type}>
            <select id="leadType" value={v.type} onChange={(e) => set("type", e.target.value as ClientType | "")} className={inputClass(errors.type)} {...describedBy("leadType", errors.type)}>
              <option value="">Select a type</option>
              {CLIENT_FORM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field id="leadSector" label="Industry" error={errors.sector}>
            <input id="leadSector" value={v.sector} onChange={(e) => set("sector", e.target.value)} placeholder="e.g. Hospitality" className={inputClass(errors.sector)} {...describedBy("leadSector", errors.sector)} />
          </Field>
          <Field id="leadAddress" label="Address (optional)" wide>
            <input id="leadAddress" value={v.address} onChange={(e) => set("address", e.target.value)} placeholder="e.g. Rubavu, Lake Kivu shore" className={inputClass()} />
          </Field>
        </Section>

        <Section title="Contact person">
          <Field id="leadContact" label="Full name" error={errors.contactName}>
            <input id="leadContact" value={v.contactName} onChange={(e) => set("contactName", e.target.value)} className={inputClass(errors.contactName)} {...describedBy("leadContact", errors.contactName)} />
          </Field>
          <Field id="leadTitle" label="Job title (optional)">
            <input id="leadTitle" value={v.contactTitle} onChange={(e) => set("contactTitle", e.target.value)} className={inputClass()} />
          </Field>
          <Field id="leadEmail" label="Email" error={errors.contactEmail}>
            <input id="leadEmail" type="email" value={v.contactEmail} onChange={(e) => set("contactEmail", e.target.value)} placeholder="name@company.rw" className={inputClass(errors.contactEmail)} {...describedBy("leadEmail", errors.contactEmail)} />
          </Field>
          <Field id="leadPhone" label="Phone">
            <input id="leadPhone" type="tel" value={v.contactPhone} onChange={(e) => set("contactPhone", e.target.value)} placeholder="+250 788 123 456" className={inputClass()} />
          </Field>
        </Section>

        <Section title="Source and owner">
          <Field id="leadSource" label="Where the lead came from" error={errors.referralSource}>
            <select id="leadSource" value={v.referralSource} onChange={(e) => set("referralSource", e.target.value)} className={inputClass(errors.referralSource)} {...describedBy("leadSource", errors.referralSource)}>
              <option value="">Select a source</option>
              {REFERRAL_SOURCES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </Field>
          <Field id="leadAe" label="Accounts Executive" error={errors.accountExecutive}>
            <select id="leadAe" value={v.accountExecutive} onChange={(e) => set("accountExecutive", e.target.value)} className={inputClass(errors.accountExecutive)} {...describedBy("leadAe", errors.accountExecutive)}>
              <option value="">Select a person</option>
              {managers.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </Field>
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
