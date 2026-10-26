"use client";

// "Preview" for a stored document. The file is kept in the shared cache, so a
// second preview is instant, and it starts loading when the pointer reaches the
// button, so it is often ready by the click.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Download, Eye, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { getDocumentContent } from "@/lib/api";
import type { DocumentSubject, StoredDocument } from "@/lib/types";
import { queryKeys } from "@/lib/query";

/** Files stay cached for the session; a stored version never changes. */
const FILE_CACHE_MS = 15 * 60_000;

export function DocumentPreviewButton({ subject, document: doc }: { subject: DocumentSubject; document: StoredDocument }) {
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; fileName: string; mediaType: string } | null>(null);

  const options = {
    queryKey: queryKeys.document(subject.type, subject.id, doc.id, doc.version),
    queryFn: () => getDocumentContent(subject, doc),
    staleTime: Infinity,
    gcTime: FILE_CACHE_MS,
  };
  const prefetch = () => void queryClient.prefetchQuery(options);

  async function open() {
    setLoading(true);
    try {
      const file = await queryClient.fetchQuery(options);
      setPreview({ url: URL.createObjectURL(file), fileName: doc.originalFileName, mediaType: file.type || doc.mediaType });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not preview the document.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!preview) return;
    const { url } = preview;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setPreview(null);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      URL.revokeObjectURL(url);
    };
  }, [preview]);

  return (
    <>
      <button
        type="button"
        onClick={open}
        onPointerEnter={prefetch}
        onFocus={prefetch}
        disabled={loading}
        className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-primary underline underline-offset-2 disabled:no-underline disabled:opacity-70"
      >
        {loading ? <Loader2 className="size-3.5 animate-spin" /> : <Eye className="size-3.5" />} {loading ? "Opening…" : "Preview"}
      </button>
      {preview
        ? createPortal(
            <div className="fixed inset-0 z-[70] flex items-center justify-center bg-foreground/50 p-3 sm:p-6" onClick={() => setPreview(null)}>
              <div
                role="dialog"
                aria-modal="true"
                aria-label={`Preview ${preview.fileName}`}
                className="flex max-h-[95dvh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-card shadow-2xl"
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
