"use client";

// Document upload and list (DOC-01 to DOC-03). Works on any record: client
// files go to the backend's document API; other records keep files in this
// tab until the backend accepts them. Replacing a file keeps the old one as
// an earlier version.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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
import { Chip, OutlineButton } from "./ui";

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

/** A button that opens the file chooser. Used on its own, e.g. in a checklist row. */
export function FilePickButton({
  onFile,
  children,
  disabled,
  variant = "outline",
}: {
  onFile: (file: File) => void;
  children: ReactNode;
  disabled?: boolean;
  variant?: "outline" | "navy";
}) {
  const input = useRef<HTMLInputElement>(null);
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
          if (file) onFile(file);
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

  async function upload(file: File) {
    const problem = documentProblem(file);
    if (problem) return toast.error(problem);
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
            if (file) upload(file);
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
          <p className="text-[11px] text-subtle">PDF, PNG or JPEG, up to 10 MB</p>
          <input
            ref={picker}
            type="file"
            accept={DOCUMENT_RULES.accept}
            className="hidden"
            aria-label={`Upload to ${title}`}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) upload(file);
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
                  <FilePickButton onFile={(f) => replace(d, f)} disabled={!!busy}>
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
    </div>
  );
}
