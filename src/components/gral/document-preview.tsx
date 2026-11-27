"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Download, Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { downloadDocument, getDocumentContent } from "@/lib/api";
import { trapTab } from "@/lib/focus-trap";
import type { DocumentFile, DocumentSubject } from "@/lib/types";

export function DocumentPreviewButton({ subject, document: doc, showDownload = false }: {
  subject: DocumentSubject;
  document: DocumentFile;
  showDownload?: boolean;
}) {
  const [busy, setBusy] = useState<"preview" | "download" | null>(null);
  const [preview, setPreview] = useState<{ url: string; fileName: string; mediaType: string } | null>(null);
  const request = useRef<AbortController | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  useEffect(() => () => request.current?.abort(), []);

  async function load(action: "preview" | "download") {
    if (request.current) return;
    const controller = new AbortController();
    request.current = controller;
    setBusy(action);
    try {
      if (action === "download") {
        await downloadDocument(subject, doc, doc.version, controller.signal);
      } else {
        const { blob, fileName } = await getDocumentContent(subject, doc, controller.signal);
        if (!controller.signal.aborted) setPreview({ url: URL.createObjectURL(blob), fileName, mediaType: blob.type || doc.mediaType || "" });
      }
    } catch (error) {
      if (!controller.signal.aborted) toast.error(error instanceof Error ? error.message : "Could not open the document.");
    } finally {
      request.current = null;
      if (!controller.signal.aborted) setBusy(null);
    }
  }

  useEffect(() => {
    if (!preview) return;
    const { url } = preview;
    const button = opener.current;
    dialog.current?.focus({ preventScroll: true });
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && [...document.querySelectorAll('[aria-modal="true"]')].at(-1) === dialog.current) {
        event.preventDefault();
        setPreview(null);
      }
      trapTab(event, dialog.current);
    };
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      URL.revokeObjectURL(url);
      button?.focus({ preventScroll: true });
    };
  }, [preview]);

  return (
    <>
      <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
        <button ref={opener} type="button" onClick={() => void load("preview")} disabled={!!busy} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 disabled:no-underline disabled:opacity-70">
          {busy === "preview" ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />} {busy === "preview" ? "Opening…" : "Preview"}
        </button>
        {showDownload ? (
          <button type="button" onClick={() => void load("download")} disabled={!!busy} className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 disabled:no-underline disabled:opacity-70">
            {busy === "download" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} {busy === "download" ? "Downloading…" : "Download"}
          </button>
        ) : null}
      </span>
      {preview
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/50 p-3 sm:p-6" onClick={() => setPreview(null)}>
              <div
                ref={dialog}
                role="dialog"
                tabIndex={-1}
                aria-modal="true"
                aria-label={`Preview ${preview.fileName}`}
                className="flex max-h-[95dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl outline-none"
                onClick={(event) => event.stopPropagation()}
              >
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <p className="min-w-0 truncate text-sm font-medium">{preview.fileName}</p>
                  <div className="flex shrink-0 items-center gap-3">
                    <a href={preview.url} download={preview.fileName} className="inline-flex items-center gap-1 text-xs font-medium text-primary underline underline-offset-2">
                      <Download className="size-3.5" /> Download
                    </a>
                    <button type="button" aria-label="Close preview" onClick={() => setPreview(null)} className="rounded-full p-1.5 hover:bg-secondary">
                      <X className="size-4" />
                    </button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 bg-secondary/40">
                  {preview.mediaType === "application/pdf" || /\.pdf$/i.test(preview.fileName) ? (
                    <iframe src={`${preview.url}#toolbar=0&navpanes=0&view=FitH`} title={`Preview of ${preview.fileName}`} className="h-[82dvh] w-full bg-card" />
                  ) : preview.mediaType.startsWith("image/") || /\.(png|jpe?g)$/i.test(preview.fileName) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={preview.url} alt={preview.fileName} className="mx-auto max-h-[82dvh] max-w-full object-contain" />
                  ) : (
                    <div className="p-8 text-center text-sm text-muted-foreground">Preview isn&apos;t available for this file type. Download it to view.</div>
                  )}
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
