"use client";

// Contacts and Interactions tabs of the client file.

import { useEffect, useState, type FormEvent } from "react";
import { Mail, Phone, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  addClientContact,
  listClientContacts,
  listClientInteractions,
  makePrimaryContact,
  recordClientInteraction,
  updateClientContact,
  type ClientContactEntry,
  type ClientInteraction,
} from "@/lib/api";
import { formatDate } from "@/lib/renewals";
import type { Client, ClientContact } from "@/lib/types";
import { Chip, NavyButton, OutlineButton, TextLink } from "./ui";
import { Field, Section, describedBy, inputClass } from "./client-form";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function errorText(err: unknown, fallback: string) {
  return err instanceof Error ? err.message : fallback;
}

/* --------------------------------- Contacts ---------------------------------- */

export function ContactsPanel({
  client,
  canEdit,
  onChanged,
}: {
  client: Client;
  canEdit: boolean;
  onChanged?: (updated: Client) => void;
}) {
  const [contacts, setContacts] = useState<ClientContactEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null: the list. "new": Add Contact form. An entry: Edit Contact form.
  const [editing, setEditing] = useState<ClientContactEntry | "new" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setContacts(null);
    listClientContacts(client)
      .then((list) => !cancelled && (setContacts(list), setError(null)))
      .catch((err) => !cancelled && setError(errorText(err, "Could not load the contacts.")));
    return () => {
      cancelled = true;
    };
  }, [client]);

  async function afterChange(updated: Client) {
    onChanged?.(updated);
    setContacts(await listClientContacts(updated));
  }

  async function makePrimary(entry: ClientContactEntry) {
    setBusy(entry.id);
    try {
      await afterChange(await makePrimaryContact(client, entry.id));
      toast.success(`${entry.contact.name} is now the primary contact.`);
    } catch (err) {
      toast.error(errorText(err, "Could not change the primary contact."));
    } finally {
      setBusy(null);
    }
  }

  if (editing) {
    return (
      <ContactForm
        key={editing === "new" ? "new" : editing.id}
        initial={editing === "new" ? undefined : editing.contact}
        onCancel={() => setEditing(null)}
        onSave={async (contact) => {
          const updated = editing === "new" ? await addClientContact(client, contact) : await updateClientContact(client, editing.id, contact);
          await afterChange(updated);
          setEditing(null);
          toast.success(editing === "new" ? "Contact added." : "Contact saved.");
        }}
      />
    );
  }

  return (
    <div className="mt-6">
      {canEdit ? (
        <div className="mb-3 flex justify-end">
          <NavyButton onClick={() => setEditing("new")}>
            <Plus className="size-3.5" /> Add Contact
          </NavyButton>
        </div>
      ) : null}
      {error ? <p className="py-4 text-sm text-danger">{error}</p> : null}
      {!contacts && !error ? <p className="py-4 text-sm text-muted-foreground">Loading contacts…</p> : null}
      {contacts?.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No contacts on record.</p> : null}
      <div className="space-y-2.5">
        {contacts?.map((entry) => (
          <div key={entry.id} className="grid gap-3 rounded-xl border border-border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <div className="min-w-0">
              <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {entry.contact.name}
                {entry.primary ? <Chip tone="sky">Primary</Chip> : null}
              </p>
              <p className="mt-0.5 text-xs text-muted-foreground">{entry.contact.title}</p>
              <p className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                <a href={`mailto:${entry.contact.email}`} className="flex min-w-0 items-center gap-1.5 truncate text-primary hover:underline">
                  <Mail className="size-3.5 shrink-0 text-muted-foreground" /> {entry.contact.email}
                </a>
                <span className="flex items-center gap-1.5">
                  <Phone className="size-3.5 shrink-0 text-muted-foreground" /> {entry.contact.phone}
                </span>
              </p>
            </div>
            {canEdit ? (
              <div className="flex items-center gap-4">
                {!entry.primary ? (
                  <TextLink onClick={() => void makePrimary(entry)}>{busy === entry.id ? "Saving…" : "Make primary"}</TextLink>
                ) : null}
                <TextLink onClick={() => setEditing(entry)}>Edit</TextLink>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}

type ContactErrors = Partial<Record<keyof ClientContact, string>>;

function ContactForm({
  initial,
  onCancel,
  onSave,
}: {
  initial?: ClientContact;
  onCancel: () => void;
  onSave: (contact: ClientContact) => Promise<void>;
}) {
  const [values, setValues] = useState<ClientContact>(initial ?? { name: "", title: "", email: "", phone: "" });
  const [errors, setErrors] = useState<ContactErrors>({});
  const [saving, setSaving] = useState(false);
  const set = (key: keyof ClientContact, value: string) => setValues((v) => ({ ...v, [key]: value }));

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: ContactErrors = {};
    if (!values.name.trim()) next.name = "Enter the name.";
    if (!values.title.trim()) next.title = "Enter the job title.";
    if (!EMAIL_PATTERN.test(values.email.trim())) next.email = "Enter a valid email.";
    const digits = values.phone.replace(/\D/g, "");
    if (digits.length < 9 || digits.length > 15) next.phone = "Enter a valid phone number.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await onSave({ name: values.name.trim(), title: values.title.trim(), email: values.email.trim(), phone: values.phone.trim() });
    } catch (err) {
      toast.error(errorText(err, "Could not save the contact."));
    } finally {
      setSaving(false);
    }
  }

  const input = (key: keyof ClientContact, label: string, type = "text", placeholder = "") => (
    <Field id={`contact-${key}`} label={label} error={errors[key]}>
      <input
        id={`contact-${key}`}
        type={type}
        value={values[key]}
        onChange={(e) => set(key, e.target.value)}
        placeholder={placeholder}
        className={inputClass(errors[key])}
        {...describedBy(`contact-${key}`, errors[key])}
      />
    </Field>
  );

  return (
    <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
      <Section title={initial ? "Edit Contact" : "Add Contact"}>
        {input("name", "Full name")}
        {input("title", "Job title")}
        {input("email", "Email", "email", "name@company.rw")}
        {input("phone", "Phone", "tel", "+250 788 123 456")}
      </Section>
      <div className="flex justify-end gap-2">
        <OutlineButton onClick={onCancel} disabled={saving}>
          Cancel
        </OutlineButton>
        <NavyButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </NavyButton>
      </div>
    </form>
  );
}

/* ------------------------------- Interactions -------------------------------- */

const INTERACTION_TYPES = [
  { value: "CALL", label: "Call" },
  { value: "MEETING", label: "Meeting" },
  { value: "EMAIL", label: "Email" },
  { value: "VISIT", label: "Visit" },
  { value: "OTHER", label: "Other" },
];
const typeLabel = (type: string) => INTERACTION_TYPES.find((t) => t.value === type)?.label ?? type;

export function InteractionsPanel({ client, canRecord }: { client: Client; canRecord: boolean }) {
  const [items, setItems] = useState<ClientInteraction[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // null: the list. "new": Record form. An entry: Correct form for that entry.
  const [recording, setRecording] = useState<ClientInteraction | "new" | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    listClientInteractions(client)
      .then((list) => !cancelled && (setItems(list), setError(null)))
      .catch((err) => !cancelled && setError(errorText(err, "Could not load the interactions.")));
    return () => {
      cancelled = true;
    };
  }, [client]);

  if (recording) {
    return (
      <InteractionForm
        corrects={recording === "new" ? undefined : recording}
        onCancel={() => setRecording(null)}
        onSave={async (input) => {
          await recordClientInteraction(client, input);
          setItems(await listClientInteractions(client));
          setRecording(null);
          toast.success(input.correctsId ? "Correction recorded." : "Interaction recorded.");
        }}
      />
    );
  }

  // A corrected entry stays on record; its newest correction is shown in its place.
  const correctedIds = new Set((items ?? []).map((i) => i.correctsId).filter(Boolean));

  return (
    <div className="mt-6">
      {canRecord ? (
        <div className="mb-3 flex justify-end">
          <NavyButton onClick={() => setRecording("new")}>
            <Plus className="size-3.5" /> Record Interaction
          </NavyButton>
        </div>
      ) : null}
      {error ? <p className="py-4 text-sm text-danger">{error}</p> : null}
      {!items && !error ? <p className="py-4 text-sm text-muted-foreground">Loading interactions…</p> : null}
      {items?.length === 0 ? <p className="py-4 text-sm text-muted-foreground">No interactions on record.</p> : null}
      <div className="space-y-2.5">
        {items
          ?.filter((i) => !correctedIds.has(i.id))
          .map((i) => (
            <div key={i.id} className="grid gap-2 rounded-xl border border-border px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <Chip tone="neutral">{typeLabel(i.type)}</Chip>
                  {formatDate(i.occurredAt.slice(0, 10))}
                  {i.correctsId ? <span>· Corrected</span> : null}
                </p>
                <p className="mt-1.5 text-sm whitespace-pre-line">{i.summary}</p>
                {i.followUp ? <p className="mt-1 text-xs text-muted-foreground">Follow-up: {i.followUp}</p> : null}
              </div>
              {canRecord ? <TextLink onClick={() => setRecording(i)}>Correct</TextLink> : null}
            </div>
          ))}
      </div>
    </div>
  );
}

function InteractionForm({
  corrects,
  onCancel,
  onSave,
}: {
  corrects?: ClientInteraction;
  onCancel: () => void;
  onSave: (input: { occurredAt: string; type: string; summary: string; followUp?: string; correctsId?: string }) => Promise<void>;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(corrects?.occurredAt.slice(0, 10) ?? today);
  const [type, setType] = useState(corrects?.type ?? "CALL");
  const [summary, setSummary] = useState(corrects?.summary ?? "");
  const [followUp, setFollowUp] = useState(corrects?.followUp ?? "");
  const [errors, setErrors] = useState<{ date?: string; summary?: string }>({});
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const next: typeof errors = {};
    if (!date || date > today) next.date = "Enter a date that is not in the future.";
    if (!summary.trim()) next.summary = "Enter a summary.";
    setErrors(next);
    if (Object.keys(next).length) return;
    setSaving(true);
    try {
      await onSave({ occurredAt: `${date}T12:00:00`, type, summary, followUp, correctsId: corrects?.id });
    } catch (err) {
      toast.error(errorText(err, "Could not record the interaction."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-6 space-y-6" noValidate>
      <Section title={corrects ? "Correct Interaction" : "Record Interaction"}>
        <Field id="interaction-date" label="Date" error={errors.date}>
          <input
            id="interaction-date"
            type="date"
            max={today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={inputClass(errors.date)}
            {...describedBy("interaction-date", errors.date)}
          />
        </Field>
        <Field id="interaction-type" label="Type">
          <select id="interaction-type" value={type} onChange={(e) => setType(e.target.value)} className={inputClass()}>
            {INTERACTION_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field id="interaction-summary" label="Summary" error={errors.summary} wide>
          <textarea
            id="interaction-summary"
            rows={4}
            maxLength={2000}
            value={summary}
            onChange={(e) => setSummary(e.target.value)}
            className={inputClass(errors.summary)}
            {...describedBy("interaction-summary", errors.summary)}
          />
        </Field>
        <Field id="interaction-follow-up" label="Follow-up (optional)" wide>
          <input
            id="interaction-follow-up"
            maxLength={1000}
            value={followUp}
            onChange={(e) => setFollowUp(e.target.value)}
            className={inputClass()}
          />
        </Field>
      </Section>
      <div className="flex justify-end gap-2">
        <OutlineButton onClick={onCancel} disabled={saving}>
          Cancel
        </OutlineButton>
        <NavyButton type="submit" disabled={saving}>
          {saving ? "Saving…" : "Save"}
        </NavyButton>
      </div>
    </form>
  );
}
