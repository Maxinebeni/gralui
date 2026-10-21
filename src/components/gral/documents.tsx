"use client";

// Document upload and list (DOC-01 to DOC-03). Works on any record: client
// files go to the backend's document API; other records keep files in this
// tab until the backend accepts them. Replacing a file keeps the old one as
// an earlier version. Every chosen file is previewed first, with where it is
// going, so a wrong file can be caught before it is stored.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { Download, FileText, History, RefreshCw, Upload } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { formatBytes } from "@/lib/format";
import {
  DOCUMENT_RULES,
  documentProblem,
  downloadDocument,
  listDocuments,
  replaceDocument,
  uploadDocument,
} from "@/lib/api";
import type { DocumentClassification, DocumentSubject, StoredDocument } from "@/lib/types";
import { Chip, NavyButton, OutlineButton } from "./ui";

export const CLASSIFICATION_LABEL: Record<DocumentClassification, string> = {
  KYC: "KYC",
  POLICY_SCHEDULE: "Policy schedule",
  CLAIM_EVIDENCE: "Claim evidence",
  CLIENT_ACCEPTANCE: "Client acceptance",
  APPROVAL_EVIDENCE: "Approval evidence",
  CORRESPONDENCE: "Correspondence",
};

function uploadedOn(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

/** "Is this the right file?": a preview of the chosen file, with where it will be stored. */
export function UploadPreview({
  file,
  destination,
  confirmLabel = "Upload",
  onConfirm,
  onCancel,
  onChooseAnother,
}: {
  file: File | null;
  /** Where the file is going, e.g. "Trading licence · KYC checklist". */
  destination?: string;
  confirmLabel?: string;
  onConfirm: (file: File) => void;
  /** Escape or a click outside: close without uploading. */
  onCancel: () => void;
  /** Close and open the file chooser again. */
  onChooseAnother: () => void;
}) {
  const [url, setUrl] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  useEffect(() => {
    if (!file) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancelRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      URL.revokeObjectURL(objectUrl);
      setUrl(null);
    };
  }, [file]);

  if (!file) return null;
  const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
  const saved = file.lastModified ? uploadedOn(new Date(file.lastModified).toISOString()) : null;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 sm:items-center sm:p-4" onClick={onCancel}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="upload-preview-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-card p-5 shadow-[var(--shadow-float)] outline-none sm:rounded-3xl sm:p-6"
      >
        <h2 id="upload-preview-title" className="text-lg font-semibold tracking-tight">
          Is this the right file?
        </h2>
        {destination ? (
          <p className="mt-1 text-xs text-muted-foreground">
            Uploading to <span className="font-medium text-foreground">{destination}</span>
          </p>
        ) : null}

        <div className="mt-4 overflow-hidden rounded-2xl border border-border bg-secondary/50">
          {url ? (
            isPdf ? (
              <iframe src={`${url}#page=1&toolbar=0&navpanes=0&view=FitH`} title={`Preview of ${file.name}`} className="h-80 w-full bg-card" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url} alt={`Preview of ${file.name}`} className="mx-auto max-h-80 w-auto object-contain" />
            )
          ) : (
            <div className="h-80" />
          )}
        </div>

        <div className="mt-3 flex items-start gap-2.5">
          <FileText className="mt-0.5 size-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-medium break-words">{file.name}</p>
            <p className="text-[11px] text-muted-foreground">
              {isPdf ? "PDF" : file.type.replace("image/", "").toUpperCase() || "Image"} · {formatBytes(file.size)}
              {saved ? ` · last saved on this computer ${saved}` : ""}
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <OutlineButton onClick={onChooseAnother} className="px-4 py-2 text-sm">
            Choose another file
          </OutlineButton>
          <NavyButton onClick={() => onConfirm(file)} className="px-4 py-2 text-sm">
            {confirmLabel}
          </NavyButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** A button that opens the file chooser, then the preview. Used on its own, e.g. in a checklist row. */
export function FilePickButton({
  onFile,
  children,
  disabled,
  destination,
  variant = "outline",
}: {
  onFile: (file: File) => void;
  children: ReactNode;
  disabled?: boolean;
  /** Shown in the preview: where the file is going. */
  destination?: string;
  variant?: "outline" | "navy";
}) {
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<File | null>(null);
  return (
    <>
      <input
        ref={input}
        type="file"
        accept={DOCUMENT_RULES.accept}
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          e.target.value = "";
          if (!file) return;
          const problem = documentProblem(file);
          if (problem) toast.error(problem);
          else setPending(file);
        }}
      />
      <button
        type="button"
        disabled={disabled}
        onClick={() => input.current?.click()}
        className={cn(
          "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors disabled:opacity-40 sm:min-h-0",
          variant === "navy"
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border bg-card text-foreground hover:bg-secondary",
        )}
      >
        {children}
      </button>
      <UploadPreview
        file={pending}
        destination={destination}
        onCancel={() => setPending(null)}
        onChooseAnother={() => {
          setPending(null);
          input.current?.click();
        }}
        onConfirm={(file) => {
          setPending(null);
          onFile(file);
        }}
      />
    </>
  );
}

export function DocumentPanel({
  subject,
  classification,
  purpose,
  canUpload,
  title = "Documents",
  emptyText = "No files uploaded yet.",
  onChange,
}: {
  subject: DocumentSubject;
  classification: DocumentClassification;
  /** Why the file is kept, as an upper-case code, e.g. POLICY_SCHEDULE. */
  purpose: string;
  canUpload: boolean;
  title?: string;
  emptyText?: string;
  /** Called after an upload or replacement, with the new list. */
  onChange?: (documents: StoredDocument[]) => void;
}) {
  const [documents, setDocuments] = useState<StoredDocument[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [openHistory, setOpenHistory] = useState<string | null>(null);
  // A dropped or chosen file waiting in the preview.
  const [pending, setPending] = useState<File | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // Depend on the subject's values, not the object, so callers can pass a literal.
  const { type: subjectType, id: subjectId } = subject;
  const load = useCallback(async () => {
    try {
      const list = await listDocuments({ type: subjectType, id: subjectId });
      setDocuments(list);
      setError(null);
      return list;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the documents.");
      setDocuments([]);
      return [];
    }
  }, [subjectType, subjectId]);

  useEffect(() => {
    load();
  }, [load]);

  function choose(file: File) {
    const problem = documentProblem(file);
    if (problem) return toast.error(problem);
    setPending(file);
  }

  async function upload(file: File) {
    setPending(null);
    setBusy(file.name);
    try {
      await uploadDocument(subject, file, { classification, purpose });
      toast.success(`${file.name} uploaded.`);
      // Reload first: an optional call would skip load() when onChange is not given.
      const list = await load();
      onChange?.(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload the file.");
    } finally {
      setBusy(null);
    }
  }

  async function replace(doc: StoredDocument, file: File) {
    setBusy(file.name);
    try {
      await replaceDocument(subject, doc, file);
      toast.success(`${doc.originalFileName} replaced. The earlier version is kept.`);
      // Reload first: an optional call would skip load() when onChange is not given.
      const list = await load();
      onChange?.(list);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not replace the file.");
    } finally {
      setBusy(null);
    }
  }

  async function download(doc: StoredDocument, version?: number) {
    try {
      await downloadDocument(subject, doc, version);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download the file.");
    }
  }

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold tracking-tight">{title}</h3>
        {documents?.length ? <span className="text-[11px] text-muted-foreground">{documents.length} files</span> : null}
      </div>

      {canUpload ? (
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files?.[0];
            if (file) choose(file);
          }}
          className={cn(
            "mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed px-4 py-5 text-center transition-colors",
            dragging ? "border-sky bg-pale" : "border-border",
          )}
        >
          <Upload className="size-5 text-sky" />
          <p className="text-xs">
            {busy ? (
              `Uploading ${busy}…`
            ) : (
              <>
                Drop a file here or{" "}
                <button type="button" onClick={() => picker.current?.click()} className="font-medium text-primary underline underline-offset-2">
                  choose one
                </button>
              </>
            )}
          </p>
          <p className="text-[11px] text-subtle">PDF, PNG or JPEG, up to 10 MB. You will see a preview before it is uploaded.</p>
          <input
            ref={picker}
            type="file"
            accept={DOCUMENT_RULES.accept}
            className="hidden"
            aria-label={`Upload to ${title}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) choose(file);
            }}
          />
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {documents === null ? <p className="text-xs text-muted-foreground">Loading documents…</p> : null}
        {error ? <p className="text-xs text-danger">{error}</p> : null}
        {documents && documents.length === 0 && !error ? <p className="text-xs text-muted-foreground">{emptyText}</p> : null}
        {documents?.map((d) => (
          <div key={d.id} className="rounded-xl border border-border px-3 py-2.5">
            <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-2.5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center">
              <FileText className="mt-0.5 size-4 text-primary sm:mt-0" />
              <div className="min-w-0">
                <p className="truncate text-xs font-medium">{d.originalFileName}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                  <Chip tone="sky">{CLASSIFICATION_LABEL[d.classification]}</Chip>
                  <span>Version {d.version}</span>
                  <span>{formatBytes(d.sizeBytes)}</span>
                  <span>{uploadedOn(d.uploadedAt)}</span>
                </p>
              </div>
              <div className="col-span-2 flex flex-wrap gap-2 sm:col-span-1 sm:justify-end">
                <OutlineButton onClick={() => download(d)}>
                  <Download className="size-3.5" /> Download
                </OutlineButton>
                {canUpload ? (
                  <FilePickButton
                    onFile={(f) => replace(d, f)}
                    disabled={!!busy}
                    destination={`${title}, replacing ${d.originalFileName} (it becomes version ${d.version + 1})`}
                  >
                    <RefreshCw className="size-3.5" /> Replace
                  </FilePickButton>
                ) : null}
                {d.previous.length ? (
                  <OutlineButton onClick={() => setOpenHistory(openHistory === d.id ? null : d.id)}>
                    <History className="size-3.5" /> {d.previous.length} earlier
                  </OutlineButton>
                ) : null}
              </div>
            </div>
            {openHistory === d.id ? (
              <ul className="mt-2 space-y-1 border-t border-border pt-2">
                {d.previous.map((p) => (
                  <li key={p.version} className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
                    <span className="min-w-0 truncate">
                      Version {p.version} · {p.originalFileName} · {uploadedOn(p.uploadedAt)}
                    </span>
                    <button
                      type="button"
                      onClick={() => download(d, p.version)}
                      className="shrink-0 text-primary underline underline-offset-2"
                    >
                      Download
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ))}
      </div>

      <UploadPreview
        file={pending}
        destination={`${title} · ${CLASSIFICATION_LABEL[classification]}`}
        onCancel={() => setPending(null)}
        onChooseAnother={() => {
          setPending(null);
          picker.current?.click();
        }}
        onConfirm={upload}
      />
    </div>
  );
}
