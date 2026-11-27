"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import Link from "next/link";
import { listRelatedDocuments } from "@/lib/api";
import { recordHref } from "@/lib/links";
import { formatDate } from "@/lib/renewals";
import type { DocumentSubject, RelatedDocumentPage } from "@/lib/types";
import { DocumentPreviewButton } from "./document-preview";
import { Pager } from "./pager";
import { Loader, OutlineButton } from "./ui";

const SOURCE_LABELS: Record<DocumentSubject["type"], string> = {
  LEAD: "Lead", CLIENT: "Client", ONBOARDING: "Policy track", KYC: "KYC review",
  POLICY: "Policy", RENEWAL: "Renewal", CLAIM: "Claim", APPROVAL: "Approval",
};

export function RelatedDocuments({ subjectType, subjectId }: { subjectType: "LEAD" | "CLIENT"; subjectId: string }) {
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [response, setResponse] = useState<{ key: string; data: RelatedDocumentPage } | { key: string; error: string }>();
  const key = `${subjectType}:${subjectId}:${page}:${retry}`;

  useEffect(() => {
    const controller = new AbortController();
    listRelatedDocuments({ type: subjectType, id: subjectId }, page, controller.signal).then((data) => {
      if (controller.signal.aborted) return;
      const lastPage = Math.max(0, data.totalPages - 1);
      if (page > lastPage) setPage(lastPage);
      else setResponse({ key, data });
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setResponse({ key, error: failure instanceof Error ? failure.message : "Could not load the documents." });
    });
    return () => controller.abort();
  }, [subjectType, subjectId, page, key]);

  if (response?.key !== key) return <Loader label="Loading documents" />;
  if ("error" in response) return (
    <div className="space-y-2">
      <p role="alert" className="text-xs text-danger">{response.error}</p>
      <OutlineButton onClick={() => setRetry((value) => value + 1)}>Try again</OutlineButton>
    </div>
  );
  const result = response.data;
  if (!result.items.length) return <p className="text-xs text-muted-foreground">No documents to show.</p>;

  return (
    <div className="space-y-3">
      <ul className="space-y-2">
        {result.items.map((file) => {
          const source = file.sources[0];
          return (
            <li key={`${file.id}:${file.version}`} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="break-words text-xs font-medium">{file.originalFileName}</p>
                  <p className="text-[11px] text-muted-foreground">Version {file.version} · {formatDate(file.uploadedAt.slice(0, 10))}</p>
                  <ul className="text-[11px] text-muted-foreground">
                    {file.sources.map((item) => (
                      <li key={`${item.subjectType}:${item.subjectId}:${item.purpose}`}>
                        {item.subjectType === subjectType && item.subjectId === subjectId ? SOURCE_LABELS[item.subjectType] : (
                          <Link href={recordHref(item.subjectType === "KYC" ? "KYC_REVIEW" : item.subjectType, item.subjectId)} className="text-primary underline underline-offset-2">
                            {SOURCE_LABELS[item.subjectType]}
                          </Link>
                        )} · {item.purpose.replaceAll("_", " ").toLowerCase()}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
              {source ? <DocumentPreviewButton subject={{ type: source.subjectType, id: source.subjectId }} document={{ ...file, purpose: source.purpose }} showDownload /> : null}
            </li>
          );
        })}
      </ul>
      <Pager page={result.page + 1} pages={result.totalPages} total={result.totalItems}
        from={result.page * result.size + 1} to={result.page * result.size + result.items.length} onPage={(next) => setPage(next - 1)} />
    </div>
  );
}
