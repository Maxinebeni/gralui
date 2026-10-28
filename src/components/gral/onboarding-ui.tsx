"use client";

// Small pieces shared by the lead, policy track and KYC pages.

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, FileText, Paperclip } from "lucide-react";
import { toast } from "sonner";
import { listDocuments, loadCommandHistory, type EvidenceInput } from "@/lib/api";
import { CommandAttempt, OnboardingError } from "@/lib/command-attempt";
import { useCurrentUser } from "@/lib/auth-context";
import { blockerText, type Health } from "@/lib/onboarding";
import { formatDate, todayIso } from "@/lib/renewals";
import type { CommandHistory, DocumentSubject, StoredDocument } from "@/lib/types";
import { cn } from "@/lib/utils";
import { inputClass } from "./client-form";
import { FilePickButton } from "./documents";
import { DocumentPreviewButton } from "./document-preview";
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

export type ActionDisclosureControls = {
  onSuccess: (formId: string) => void;
  onFailure: (formId: string) => void;
  onPendingChange: (pending: boolean, formId: string, unmounted?: boolean) => void;
};

/** Saved summaries stay outside this disclosure. Pending commands cannot be hidden. */
export function ActionDisclosure({ label, initiallyCollapsed = false, collapseOnSuccess = true, summary, children }: {
  label: string;
  initiallyCollapsed?: boolean;
  collapseOnSuccess?: boolean;
  summary?: ReactNode;
  children: (controls: ActionDisclosureControls) => ReactNode;
}) {
  const [expanded, setExpanded] = useState(!initiallyCollapsed);
  const [saved, setSaved] = useState(false);
  const pendingForms = useRef(new Set<string>());
  const failedForms = useRef(new Set<string>());
  const [pending, setPending] = useState(false);
  const [hasFailure, setHasFailure] = useState(false);
  const id = useId();
  const toggle = useRef<HTMLDivElement>(null);
  const onPendingChange = useCallback((active: boolean, formId: string, unmounted = false) => {
    if (active && !pendingForms.current.has(formId)) {
      setSaved(false);
      failedForms.current.delete(formId);
    }
    if (active) pendingForms.current.add(formId); else pendingForms.current.delete(formId);
    if (unmounted) failedForms.current.delete(formId);
    setPending(pendingForms.current.size > 0);
    setHasFailure(failedForms.current.size > 0);
  }, []);
  const onSuccess = useCallback((formId: string) => {
    failedForms.current.delete(formId); setHasFailure(failedForms.current.size > 0); setSaved(true);
  }, []);
  const onFailure = useCallback((formId: string) => {
    failedForms.current.add(formId); setHasFailure(true); setSaved(false);
  }, []);
  useEffect(() => {
    if (saved && !pending && !hasFailure && collapseOnSuccess) {
      setExpanded(false);
      toggle.current?.querySelector("button")?.focus();
    }
  }, [saved, pending, hasFailure, collapseOnSuccess]);
  useEffect(() => { if (!initiallyCollapsed) setExpanded(true); }, [initiallyCollapsed]);
  return <div className="space-y-3">
    <div ref={toggle}><OutlineButton aria-expanded={expanded} aria-controls={id} disabled={pending}
      onClick={() => { setSaved(false); setExpanded((value) => !value); }}
      className="max-w-full justify-start text-left">
      {expanded ? <ChevronUp aria-hidden="true" className="size-3.5 shrink-0" /> : <ChevronDown aria-hidden="true" className="size-3.5 shrink-0" />}{label}
    </OutlineButton></div>
    {summary}
    <div id={id} hidden={!expanded}>{expanded ? children({ onSuccess, onFailure, onPendingChange }) : null}</div>
  </div>;
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
  disabled = false,
  disabledReason,
  attempt: suppliedAttempt,
  onReconcile,
  onSuccess,
  onFailure,
  onPendingChange,
}: {
  title?: string;
  intro?: ReactNode;
  submitLabel: string;
  onSubmit: (attempt: CommandAttempt) => Promise<unknown>;
  disabled?: boolean;
  disabledReason?: string;
  attempt?: CommandAttempt;
  onReconcile?: () => void | Promise<void>;
  onSuccess?: ActionDisclosureControls["onSuccess"];
  onFailure?: ActionDisclosureControls["onFailure"];
  onPendingChange?: ActionDisclosureControls["onPendingChange"];
  onCancel?: () => void;
  /** Message shown after saving. */
  success: string;
  children?: ReactNode;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [ownedAttempt] = useState(() => new CommandAttempt());
  const attempt = suppliedAttempt ?? ownedAttempt;
  const { user } = useCurrentUser();
  const formId = useId();
  useEffect(() => { attempt.clear(); return () => attempt.clear(); }, [attempt, user.id, user.role]);
  useEffect(() => { onPendingChange?.(busy || attempt.uncertain || needsRefresh, formId); }, [busy, attempt.uncertain, needsRefresh, formId, onPendingChange]);
  useEffect(() => () => onPendingChange?.(false, formId, true), [formId, onPendingChange]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (disabled || busy || needsRefresh) return;
    onPendingChange?.(true, formId);
    setBusy(true);
    setError(null);
    try {
      await onSubmit(attempt);
      attempt.clear();
      toast.success(success);
      onSuccess?.(formId);
    } catch (err) {
      onFailure?.(formId);
      if (err instanceof OnboardingError && err.code === "STALE_VERSION") setNeedsRefresh(true);
      if (!attempt.uncertain) attempt.clear();
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
      {children ? <fieldset disabled={busy || attempt.uncertain || needsRefresh} className="grid min-w-0 gap-3 sm:grid-cols-2">{children}</fieldset> : null}
      {disabledReason ? <p className="text-xs text-muted-foreground">{disabledReason}</p> : null}
      {attempt.uncertain ? <p className="text-xs text-warning">The server result could not be confirmed. Retry the same submission or refresh to check its current state before making changes.</p> : null}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <NavyButton type="submit" disabled={busy || disabled || needsRefresh} className="px-4 py-2 text-sm">
          {busy ? "Saving…" : attempt.uncertain ? "Retry same submission" : submitLabel}
        </NavyButton>
        {attempt.uncertain || needsRefresh ? <OutlineButton disabled={busy} onClick={async () => { if (onReconcile) { await onReconcile(); attempt.clear(); setNeedsRefresh(false); setError(null); } else window.location.reload(); }}>Refresh current state</OutlineButton> : null}
        {onCancel ? (
          <OutlineButton onClick={onCancel} disabled={busy || attempt.uncertain || needsRefresh} className="px-4 py-2 text-sm">
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

export function HistoryList({ items, resource }: { items: CommandHistory[]; resource?: { type: "LEAD" | "ONBOARDING" | "KYC"; id: string } }) {
  const [extra, setExtra] = useState<CommandHistory[]>([]);
  const [page, setPage] = useState(1);
  const [more, setMore] = useState(items.length === 50);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setExtra([]); setPage(1); setMore(items.length === 50); setError(null); }, [items, resource?.id]);
  if (!items.length) return <p className="mt-3 text-xs text-muted-foreground">Nothing yet.</p>;
  return (
    <>
    <ol className="mt-3 space-y-3">
      {[...items, ...extra].map((h, i) => (
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
    {error ? <p role="alert" className="mt-2 text-xs text-danger">{error}</p> : null}
    {resource && more ? <OutlineButton disabled={busy} className="mt-3" onClick={async () => {
      setBusy(true); setError(null);
      try { const next = await loadCommandHistory(resource.type, resource.id, page); setExtra((old) => [...old, ...next]); setPage(page + 1); setMore(next.length === 50); }
      catch (e) { setError(e instanceof Error ? e.message : "Could not load history."); }
      finally { setBusy(false); }
    }}>{busy ? "Loading…" : "Load more history"}</OutlineButton> : null}
    </>
  );
}

/** A list of proof documents already recorded. */
export function ProofList({ items, labels, subject }: {
  items: { purpose: string; fileName?: string; documentId?: string; documentVersion?: number; occurredAt: string }[];
  labels?: Record<string, string>;
  subject?: DocumentSubject;
}) {
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  useEffect(() => {
    if (!subject) {
      setDocuments(null);
      return;
    }
    let active = true;
    listDocuments(subject).then((loaded) => { if (active) setDocuments(loaded); }).catch(() => { if (active) setDocuments([]); });
    return () => { active = false; };
  }, [subject?.type, subject?.id]);

  if (!items.length) return null;
  return (
    <ul className="space-y-1">
      {items.map((p) => (
        <li key={`${p.purpose}-${p.occurredAt}`} className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
          <FileText className="size-3 shrink-0 text-primary" />
          <span className="font-medium text-foreground">{labels?.[p.purpose] ?? p.purpose.replace(/_/g, " ").toLowerCase()}</span>
          {p.fileName ? <span className="truncate">· {p.fileName}</span> : null}
          <span>· {dateOf(p.occurredAt)}</span>
          {subject && p.documentId && documents ? (() => {
            const doc = documents.find((candidate) => candidate.id === p.documentId);
            return doc ? <DocumentPreviewButton subject={subject} document={{ ...doc, version: p.documentVersion ?? doc.version }} /> : <span className="text-subtle">Preview unavailable</span>;
          })() : subject && p.documentId ? <span className="text-subtle">Loading preview…</span> : null}
        </li>
      ))}
    </ul>
  );
}
