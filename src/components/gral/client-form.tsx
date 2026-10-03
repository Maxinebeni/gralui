"use client";

// Add / Edit Client form (task 18). It can open on its own slide-over panel
// (Add Client button) or inside the client file panel (Edit button). It saves
// through lib/api.ts, so it keeps working unchanged once the backend has
// client endpoints.

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { SlideOver } from "@/components/gral/shell";
import { NavyButton, OutlineButton } from "@/components/gral/ui";
import { createClient, listManagers, updateClient, type ClientInput } from "@/lib/api";
import type { Client, ClientType, Role } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Client types from the requirements document, plus SME which the existing records use. */
export const CLIENT_FORM_TYPES: ClientType[] = [
  "Corporate",
  "State Enterprise",
  "NGO",
  "Financial Institution",
  "SME",
];

/** Requirements doc, section 2: the MD and the Commercial Director can add and update clients. */
export function canManageClients(role: Role): boolean {
  return role === "MD" || role === "Commercial Director";
}

type FormValues = {
  name: string;
  type: ClientType | "";
  sector: string;
  address: string;
  contactName: string;
  contactTitle: string;
  contactEmail: string;
  contactPhone: string;
  manager: string;
};

type Errors = Partial<Record<keyof FormValues, string>>;

const EMPTY: FormValues = {
  name: "",
  type: "",
  sector: "",
  address: "",
  contactName: "",
  contactTitle: "",
  contactEmail: "",
  contactPhone: "",
  manager: "",
};

function fromClient(c: Client): FormValues {
  return {
    name: c.name,
    type: c.type,
    sector: c.sector,
    address: c.address ?? "",
    contactName: c.contact?.name ?? "",
    contactTitle: c.contact?.title ?? "",
    contactEmail: c.contact?.email ?? "",
    contactPhone: c.contact?.phone ?? "",
    manager: c.manager,
  };
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function validate(v: FormValues): Errors {
  const e: Errors = {};
  if (v.name.trim().length < 2) e.name = "Enter the company name.";
  if (!v.type) e.type = "Choose the client type.";
  if (!v.sector.trim()) e.sector = "Enter the sector, for example Energy or Banking.";
  if (!v.address.trim()) e.address = "Enter the physical address.";
  if (!v.contactName.trim()) e.contactName = "Enter the contact person's name.";
  if (!v.contactTitle.trim()) e.contactTitle = "Enter the contact person's job title.";
  if (!EMAIL_PATTERN.test(v.contactEmail.trim())) {
    e.contactEmail = "Enter a valid email, for example name@company.rw.";
  }
  const digits = v.contactPhone.replace(/\D/g, "");
  if (digits.length < 9 || digits.length > 15) {
    e.contactPhone = "Enter a valid phone number, for example +250 788 123 456.";
  }
  if (!v.manager) e.manager = "Choose the GRAL relationship manager.";
  return e;
}

/** Add Client: the form on its own slide-over panel. */
export function ClientFormSlideOver({
  open,
  onClose,
  client,
  managers,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Pass a client to edit it. Leave empty to add a new client. */
  client?: Client | null;
  managers?: string[];
  onSaved: (saved: Client) => void;
}) {
  return (
   <SlideOver open={open} onClose={onClose} wide>
      {open ? (
        <ClientFormPanel
          key={client?.id ?? "new"}
          client={client ?? null}
          managers={managers}
          onClose={onClose}
          onSaved={onSaved}
        />
      ) : null}
    </SlideOver>
  );
}

/** The form itself, so it can also be shown inside the client file panel. */
export function ClientFormPanel({
  client,
  managers,
  onClose,
  onSaved,
}: {
  client: Client | null;
  /** Manager names for the dropdown. Loaded automatically when not given. */
  managers?: string[];
  onClose: () => void;
  onSaved: (saved: Client) => void;
}) {
  const editing = client !== null;
  const [values, setValues] = useState<FormValues>(client ? fromClient(client) : EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [saving, setSaving] = useState(false);
  const [loadedManagers, setLoadedManagers] = useState<string[]>(managers ?? []);

  useEffect(() => {
    if (managers) setLoadedManagers(managers);
    else listManagers().then(setLoadedManagers);
  }, [managers]);

  // When editing, keep the current manager selectable even if it is not in the list.
  const managerOptions =
    client && client.manager && !loadedManagers.includes(client.manager)
      ? [client.manager, ...loadedManagers]
      : loadedManagers;

  function set<K extends keyof FormValues>(key: K, value: FormValues[K]) {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const found = validate(values);
    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error("Please fix the highlighted fields.");
      return;
    }

    const input: ClientInput = {
      name: values.name.trim(),
      type: values.type as ClientType,
      sector: values.sector.trim(),
      address: values.address.trim(),
      contact: {
        name: values.contactName.trim(),
        title: values.contactTitle.trim(),
        email: values.contactEmail.trim().toLowerCase(),
        phone: values.contactPhone.trim(),
      },
      manager: values.manager,
    };

    setSaving(true);
    try {
      const saved = client ? await updateClient(client.id, input) : await createClient(input);
      toast.success(client ? `${saved.name} updated.` : `${saved.name} added as ${saved.id}.`);
      onSaved(saved);
      onClose();
    } catch (err) {
      toast.error(
        err instanceof Error && err.message ? err.message : "Could not save the client. Please try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex min-h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">{editing ? "Edit Client" : "Add New Client"}</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {editing
              ? `Update the details for ${client?.id}. All fields are required.`
              : "All fields are required. The Client ID is created automatically, and KYC starts as Pending until the Risk & Compliance Manager marks Section A complete."}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground transition-colors hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="flex-1 space-y-6 px-6 py-5">
        <Section title="Company details">
          <Field id="name" label="Company name" error={errors.name} wide>
            <input
              id="name"
              value={values.name}
              onChange={(e) => set("name", e.target.value)}
              placeholder="e.g. Kigali Steel Industries Ltd"
              className={inputClass(errors.name)}
              {...describedBy("name", errors.name)}
            />
          </Field>
          <Field id="type" label="Client type" error={errors.type}>
            <select
              id="type"
              value={values.type}
              onChange={(e) => set("type", e.target.value as ClientType | "")}
              className={inputClass(errors.type)}
              {...describedBy("type", errors.type)}
            >
              <option value="">Select a type</option>
              {CLIENT_FORM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </Field>
          <Field id="sector" label="Sector" error={errors.sector}>
            <input
              id="sector"
              value={values.sector}
              onChange={(e) => set("sector", e.target.value)}
              placeholder="e.g. Energy"
              className={inputClass(errors.sector)}
              {...describedBy("sector", errors.sector)}
            />
          </Field>
          <Field id="address" label="Physical address" error={errors.address} wide>
            <input
              id="address"
              value={values.address}
              onChange={(e) => set("address", e.target.value)}
              placeholder="e.g. KG 7 Ave, Kigali"
              className={inputClass(errors.address)}
              {...describedBy("address", errors.address)}
            />
          </Field>
        </Section>

        <Section title="Primary contact person">
          <Field id="contactName" label="Full name" error={errors.contactName}>
            <input
              id="contactName"
              value={values.contactName}
              onChange={(e) => set("contactName", e.target.value)}
              placeholder="e.g. Jean Habimana"
              className={inputClass(errors.contactName)}
              {...describedBy("contactName", errors.contactName)}
            />
          </Field>
          <Field id="contactTitle" label="Job title" error={errors.contactTitle}>
            <input
              id="contactTitle"
              value={values.contactTitle}
              onChange={(e) => set("contactTitle", e.target.value)}
              placeholder="e.g. Finance Manager"
              className={inputClass(errors.contactTitle)}
              {...describedBy("contactTitle", errors.contactTitle)}
            />
          </Field>
          <Field id="contactEmail" label="Email" error={errors.contactEmail}>
            <input
              id="contactEmail"
              type="email"
              value={values.contactEmail}
              onChange={(e) => set("contactEmail", e.target.value)}
              placeholder="name@company.rw"
              className={inputClass(errors.contactEmail)}
              {...describedBy("contactEmail", errors.contactEmail)}
            />
          </Field>
          <Field id="contactPhone" label="Phone" error={errors.contactPhone}>
            <input
              id="contactPhone"
              type="tel"
              value={values.contactPhone}
              onChange={(e) => set("contactPhone", e.target.value)}
              placeholder="+250 788 123 456"
              className={inputClass(errors.contactPhone)}
              {...describedBy("contactPhone", errors.contactPhone)}
            />
          </Field>
        </Section>

        <Section title="GRAL relationship manager">
          <Field id="manager" label="Assigned manager" error={errors.manager} wide>
            <select
              id="manager"
              value={values.manager}
              onChange={(e) => set("manager", e.target.value)}
              className={inputClass(errors.manager)}
              {...describedBy("manager", errors.manager)}
            >
              <option value="">Select a manager</option>
              {managerOptions.map((m) => (
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
          {saving ? "Saving…" : editing ? "Save Changes" : "Add Client"}
        </NavyButton>
      </div>
    </form>
  );
}

/* Shared form building blocks, also used by the policy form. */

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset>
      <legend className="text-sm font-semibold tracking-tight">{title}</legend>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}

export function Field({
  id,
  label,
  error,
  wide,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  wide?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function inputClass(error?: string) {
  return cn(
    "mt-1.5 w-full rounded-xl border bg-card px-3.5 py-2.5 text-sm outline-none focus:ring-2",
    error
      ? "border-red-500 focus:border-red-500 focus:ring-red-500/20"
      : "border-input focus:border-sky focus:ring-sky/30",
  );
}

export function describedBy(id: string, error?: string) {
  return {
    "aria-invalid": error ? true : undefined,
    "aria-describedby": error ? `${id}-error` : undefined,
  };
}