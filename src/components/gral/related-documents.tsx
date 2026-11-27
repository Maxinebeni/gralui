"use client";

import { useEffect, useState } from "react";
import { FileText } from "lucide-react";
import Link from "next/link";
import { listRelatedDocuments } from "@/lib/api";
import { recordHref } from "@/lib/links";
import { formatDate } from "@/lib/renewals";
import type { DocumentSubject, RelatedDocumentPage } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DocumentPreviewButton } from "./document-preview";
import { Pager } from "./pager";
import { Loader, OutlineButton } from "./ui";

const SOURCE_LABELS: Record<DocumentSubject["type"], string> = {
  LEAD: "Lead", CLIENT: "Client", ONBOARDING: "Policy track", KYC: "KYC review",
  POLICY: "Policy", RENEWAL: "Renewal", CLAIM: "Claim", APPROVAL: "Approval",
};
const LEAD_COLUMNS = "@3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(7rem,0.6fr)_11rem]";

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
  const isLead = subjectType === "LEAD";

  return (
    <div className={cn("space-y-3", isLead && "@container")}>
      {isLead ? (
        <div aria-hidden="true" className={cn("hidden gap-5 px-4 text-xs font-medium text-muted-foreground @3xl:grid", LEAD_COLUMNS)}>
          <span>Document</span>
          <span>Source</span>
          <span>Uploaded</span>
          <span className="text-right">Actions</span>
        </div>
      ) : null}
      <ul className="space-y-2">
        {result.items.map((file) => {
          const source = file.sources[0];
          const uploaded = file.uploadedAt.slice(0, 10);
          const sources = file.sources.map((item) => (
            <li key={`${item.subjectType}:${item.subjectId}:${item.purpose}`}>
              {item.subjectType === subjectType && item.subjectId === subjectId ? SOURCE_LABELS[item.subjectType] : (
                <Link href={recordHref(item.subjectType === "KYC" ? "KYC_REVIEW" : item.subjectType, item.subjectId)} className="text-primary underline underline-offset-2">
                  {SOURCE_LABELS[item.subjectType]}
                </Link>
              )} · {item.purpose.replaceAll("_", " ").toLowerCase()}
            </li>
          ));
          const actions = source ? <DocumentPreviewButton subject={{ type: source.subjectType, id: source.subjectId }} document={{ ...file, purpose: source.purpose }} showDownload /> : null;
          const key = `${file.id}:${file.version}`;

          if (isLead) return (
            <li key={key} className={cn("grid gap-3 rounded-xl border border-border px-4 py-3 @3xl:items-center @3xl:gap-5", LEAD_COLUMNS)}>
              <div className="flex min-w-0 items-start gap-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-pale text-primary" aria-hidden="true">
                  <FileText className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-medium [overflow-wrap:anywhere]">{file.originalFileName}</p>
                  <p className="text-xs text-muted-foreground">Version {file.version}</p>
                </div>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1 @3xl:contents">
                <ul className="min-w-0 space-y-0.5 text-xs text-muted-foreground [overflow-wrap:anywhere]">{sources}</ul>
                <time className="whitespace-nowrap text-xs tabular-nums text-muted-foreground" dateTime={uploaded}>{formatDate(uploaded)}</time>
              </div>
              {actions ? <div className="flex border-t border-border pt-2 @3xl:justify-end @3xl:border-0 @3xl:pt-0">{actions}</div> : null}
            </li>
          );

          return (
            <li key={key} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
              <div className="flex min-w-0 items-start gap-2">
                <FileText className="size-4 shrink-0 text-primary" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="break-words text-xs font-medium">{file.originalFileName}</p>
                  <p className="text-[11px] text-muted-foreground">Version {file.version} · {formatDate(uploaded)}</p>
                  <ul className="text-[11px] text-muted-foreground">{sources}</ul>
                </div>
              </div>
              {actions}
            </li>
          );
        })}
      </ul>
      <Pager page={result.page + 1} pages={result.totalPages} total={result.totalItems}
        from={result.page * result.size + 1} to={result.page * result.size + result.items.length} onPage={(next) => setPage(next - 1)} />
    </div>
  );
}
