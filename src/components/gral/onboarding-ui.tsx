"use client";

// Small pieces shared by the lead, policy track and KYC pages.

import { useState, type ReactNode } from "react";
import { FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import type { EvidenceInput } from "@/lib/api";
import { blockerText, type Health } from "@/lib/onboarding";
import { formatDate, todayIso } from "@/lib/renewals";
import type { CommandHistory } from "@/lib/types";
import { cn } from "@/lib/utils";
import { inputClass } from "./client-form";
import { FilePickButton } from "./documents";
import { Chip, Dot, NavyButton, OutlineButton } from "./ui";

/** "2026-10-23T09:00:00Z" as "23 Oct 2026". */
export function dateOf(iso?: string) {
  return iso ? formatDate(iso.slice(0, 10)) : "";
}

export function HealthChip({ health }: { health: Health }) {
  switch (health) {
    case "done":
      return <Chip tone="success">Done</Chip>;
    case "overdue":
      return <Chip tone="danger">Overdue</Chip>;
    case "due-soon":
      return <Chip tone="warning">Due soon</Chip>;
    case "held":
      return <Chip>On hold</Chip>;
    case "closed":
      return <Chip>Closed</Chip>;
    default:
      return <Chip tone="sky">On track</Chip>;
  }
}

/** What is stopping progress, in plain words. */
export function Blockers({ codes, className }: { codes: string[]; className?: string }) {
  if (!codes.length) return null;
  return (
    <ul className={cn("space-y-1.5 rounded-xl bg-warning-soft/50 px-3.5 py-3 text-xs", className)}>
      {codes.map((c) => (
        <li key={c} className="flex gap-2">
          <Dot tone="warning" />
          <span>{blockerText(c)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Label({ htmlFor, children }: { htmlFor?: string; children: ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
      {children}
    </label>
  );
}

/** A labelled input, textarea or select with the platform's styling. */
export function TextInput({
  id,
  label,
  value,
  onChange,
  placeholder,
  type = "text",
  multiline,
  wide,
  min,
  max,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  multiline?: boolean;
  wide?: boolean;
  min?: string;
  max?: string;
}) {
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      {multiline ? (
        <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass()} />
      ) : (
        <input id={id} type={type} value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass()} />
      )}
    </div>
  );
}

export function SelectInput({
  id,
  label,
  value,
  onChange,
  options,
  placeholder,
  wide,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  wide?: boolean;
}) {
  return (
    <div className={cn(wide && "sm:col-span-2")}>
      <Label htmlFor={id}>{label}</Label>
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass()}>
        {placeholder ? <option value="">{placeholder}</option> : null}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

/**
 * The document that proves a step, and when it happened. The file is checked
 * in a preview first and only uploaded when the form is saved.
 */
export function EvidenceField({
  label,
  hint,
  destination,
  value,
  onChange,
  dateLabel = "Date",
  withNote,
  wide = true,
}: {
  label: string;
  hint?: string;
  destination: string;
  value: EvidenceInput | null;
  onChange: (v: EvidenceInput | null) => void;
  dateLabel?: string;
  withNote?: boolean;
  wide?: boolean;
}) {
  return (
    <div className={cn("rounded-xl border border-border p-3", wide && "sm:col-span-2")}>
      <p className="text-xs font-medium">{label}</p>
      {hint ? <p className="mt-0.5 text-[11px] text-subtle">{hint}</p> : null}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <FilePickButton destination={destination} onFile={(file) => onChange({ file, occurredAt: value?.occurredAt ?? todayIso(), detail: value?.detail })}>
          <Paperclip className="size-3.5" /> {value ? "Choose another file" : "Attach the document"}
        </FilePickButton>
        {value ? (
          <span className="flex min-w-0 items-center gap-1 text-[11px] text-primary">
            <FileText className="size-3 shrink-0" /> <span className="truncate">{value.file.name}</span>
          </span>
        ) : null}
      </div>
      {value ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <div>
            <Label>{dateLabel}</Label>
            <input
              type="date"
              max={todayIso()}
              value={value.occurredAt}
              onChange={(e) => onChange({ ...value, occurredAt: e.target.value })}
              aria-label={dateLabel}
              className={inputClass()}
            />
          </div>
          {withNote ? (
            <div>
              <Label>Note (optional)</Label>
              <input value={value.detail ?? ""} onChange={(e) => onChange({ ...value, detail: e.target.value })} aria-label="Note" className={inputClass()} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** A form for one action: its fields, then Save. Errors from the backend are shown on the form. */
export function ActionForm({
  title,
  intro,
  submitLabel,
  onSubmit,
  onCancel,
  success,
  children,
}: {
  title?: string;
  intro?: ReactNode;
  submitLabel: string;
  onSubmit: () => Promise<unknown>;
  onCancel?: () => void;
  /** Message shown after saving. */
  success: string;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await onSubmit();
      toast.success(success);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3 rounded-2xl border border-border bg-card p-4">
      {title ? <p className="text-sm font-semibold">{title}</p> : null}
      {intro ? <div className="text-xs text-muted-foreground">{intro}</div> : null}
      {children ? <div className="grid gap-3 sm:grid-cols-2">{children}</div> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <NavyButton type="submit" disabled={busy} className="px-4 py-2 text-sm">
          {busy ? "Saving…" : submitLabel}
        </NavyButton>
        {onCancel ? (
          <OutlineButton onClick={onCancel} className="px-4 py-2 text-sm">
            Cancel
          </OutlineButton>
        ) : null}
      </div>
    </form>
  );
}

/** Backend action codes in the history, e.g. LEAD_ASSESSED, as words. */
function historyText(action: string) {
  const words = action.replace(/^(ONBOARDING|LEAD|KYC)_/, "").replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function HistoryList({ items }: { items: CommandHistory[] }) {
  if (!items.length) return <p className="mt-3 text-xs text-muted-foreground">Nothing yet.</p>;
  return (
    <ol className="mt-3 space-y-3">
      {items.map((h, i) => (
        <li key={`${h.occurredAt}-${i}`} className="flex gap-3">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky" />
          <div className="min-w-0">
            <p className="text-xs">{historyText(h.action)}</p>
            <p className="text-[11px] text-subtle">
              {dateOf(h.occurredAt)}
              {h.actorName ? ` · ${h.actorName}` : ""}
              {h.reason ? ` · “${h.reason}”` : ""}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** A list of proof documents already recorded. */
export function ProofList({ items, labels }: { items: { purpose: string; fileName?: string; occurredAt: string }[]; labels?: Record<string, string> }) {
  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((p) => (
        <li key={`${p.purpose}-${p.occurredAt}`} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileText className="size-3 shrink-0 text-primary" />
          <span className="font-medium text-foreground">{labels?.[p.purpose] ?? p.purpose.replace(/_/g, " ").toLowerCase()}</span>
          {p.fileName ? <span className="truncate">· {p.fileName}</span> : null}
          <span>· {dateOf(p.occurredAt)}</span>
        </li>
      ))}
    </ul>
  );
}
