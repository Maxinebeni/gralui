"use client";

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, FileText, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Td, Th } from "@/components/gral/claim-list";
import { inputClass } from "@/components/gral/client-form";
import { ALL_OPTION, FilterMenu, optionsFrom } from "@/components/gral/filter-menu";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { CardHeader, Chip, FloatCard, NavyButton, OutlineButton, SegmentedTabs, StatTile, TextLink } from "@/components/gral/ui";
import { getImportBatch, listImportIssues, uploadImport, validateImport } from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import {
  IMPORT_ACCEPT,
  IMPORT_MODE_LABEL,
  IMPORT_STATUS_LABEL,
  importFileProblem,
  importTotals,
  issuesToCsv,
  type ImportBatch,
  type ImportIssue,
  type ImportMode,
} from "@/lib/imports";
import { importPermissions } from "@/lib/permissions";
import { useImports, useRefresh } from "@/lib/queries";
import { queryKeys } from "@/lib/query";
import { formatDate } from "@/lib/renewals";

const ISSUE_TABS = ["All", "Blocked", "Flagged"] as const;

function StatusChip({ batch }: { batch: ImportBatch }) {
  const tone = batch.status === "VALIDATED" ? "success" : batch.status === "FAILED" ? "danger" : "sky";
  return <Chip tone={tone}>{IMPORT_STATUS_LABEL[batch.status]}</Chip>;
}

export function ImportsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const { canUpload } = importPermissions(user);
  const { data: batches = [], isPending, error } = useImports();
  const [uploadOpen, setUploadOpen] = useState(false);
  const openId = searchParams.get("batch");

  const open = (id: string) => router.replace(`${pathname}?batch=${encodeURIComponent(id)}`, { scroll: false });

  const upload = (
    <SlideOver open={uploadOpen} onClose={() => setUploadOpen(false)}>
      {uploadOpen ? (
        <UploadForm
          onClose={() => setUploadOpen(false)}
          onDone={(batch) => {
            setUploadOpen(false);
            open(batch.id);
          }}
        />
      ) : null}
    </SlideOver>
  );

  if (openId) {
    return (
      <>
        <BatchPage id={openId} backHref={pathname} onUploadAgain={canUpload ? () => setUploadOpen(true) : undefined} />
        {upload}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Data Import"
        action={
          canUpload ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setUploadOpen(true)}>
              <Plus className="size-4" /> New Import
            </NavyButton>
          ) : null
        }
      />

      <FloatCard className="mt-5 overflow-hidden">
        <CardHeader title="Imports" />
        <div className="mt-4 overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-pale text-[11px] text-muted-foreground">
                <Th className="rounded-l-xl">File</Th>
                <Th>Type</Th>
                <Th>Uploaded</Th>
                <Th>Status</Th>
                <Th>Rows</Th>
                <Th>Ready</Th>
                <Th>Flagged</Th>
                <Th>Blocked</Th>
                <Th className="rounded-r-xl">Action</Th>
              </tr>
            </thead>
            <tbody>
              {batches.map((b) => {
                const t = importTotals(b);
                const checked = b.status === "VALIDATED";
                return (
                  <tr key={b.id} className="cursor-pointer hover:bg-pale/50" onClick={() => open(b.id)}>
                    <Td>
                      <div className="max-w-[220px] truncate text-sm font-medium">{b.fileName}</div>
                      <div className="text-xs text-muted-foreground">{b.id}</div>
                    </Td>
                    <Td className="text-sm whitespace-nowrap">{IMPORT_MODE_LABEL[b.mode]}</Td>
                    <Td className="text-sm whitespace-nowrap">
                      {formatDate(b.uploadedAt.slice(0, 10))}
                      <div className="text-xs text-muted-foreground">{b.uploadedBy}</div>
                    </Td>
                    <Td>
                      <StatusChip batch={b} />
                    </Td>
                    <Td className="text-sm">{checked ? t.rows : "-"}</Td>
                    <Td className="text-sm">{checked ? t.ready : "-"}</Td>
                    <Td className="text-sm">{checked ? t.flagged : "-"}</Td>
                    <Td className="text-sm">{checked ? t.blocked : "-"}</Td>
                    <Td>
                      <TextLink>View</TextLink>
                    </Td>
                  </tr>
                );
              })}
              {batches.length === 0 ? (
                <tr>
                  <Td className={error ? "text-sm text-danger" : "text-sm text-muted-foreground"} colSpan={9}>
                    {error instanceof Error ? error.message : isPending ? "Loading imports…" : "No imports yet."}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </FloatCard>
      {upload}
    </>
  );
}

function UploadForm({ onClose, onDone }: { onClose: () => void; onDone: (batch: ImportBatch) => void }) {
  const { user } = useCurrentUser();
  const refresh = useRefresh();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mode, setMode] = useState<ImportMode>("HISTORICAL");
  const [fileError, setFileError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!file) {
      setFileError("Choose a file.");
      return;
    }
    setSaving(true);
    let uploaded: ImportBatch | null = null;
    try {
      uploaded = await uploadImport(file, mode, user.name);
      const checked = await validateImport(uploaded.id);
      toast.success("Dry run complete.");
      refresh("imports");
      onDone(checked);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not upload this file.");
      // The file is on the server, so its page can run the check again.
      if (uploaded) {
        refresh("imports");
        onDone(uploaded);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <h2 className="text-lg font-semibold tracking-tight">New Import</h2>
        <button
          type="button"
          aria-label="Close new import"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="space-y-5 px-4 py-5 sm:px-6">
        <div>
          <label htmlFor="import-mode" className="text-xs font-medium text-muted-foreground">
            Type of records
          </label>
          <select id="import-mode" value={mode} onChange={(e) => setMode(e.target.value as ImportMode)} className={inputClass()}>
            {(Object.keys(IMPORT_MODE_LABEL) as ImportMode[]).map((m) => (
              <option key={m} value={m}>
                {IMPORT_MODE_LABEL[m]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground">Filled import template (.xlsx or .csv, up to 25 MB)</p>
          <input
            ref={input}
            type="file"
            accept={IMPORT_ACCEPT}
            aria-label="Filled import template"
            className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0];
              e.target.value = "";
              if (!picked) return;
              const problem = importFileProblem(picked);
              setFileError(problem);
              setFile(problem ? null : picked);
            }}
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <OutlineButton onClick={() => input.current?.click()}>{file ? "Choose another file" : "Choose file"}</OutlineButton>
            {file ? (
              <span className="flex min-w-0 items-center gap-1.5 text-xs text-primary">
                <FileText className="size-3.5 shrink-0" /> <span className="truncate">{file.name}</span>
              </span>
            ) : null}
          </div>
          {fileError ? <p className="mt-2 text-xs text-danger">{fileError}</p> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <NavyButton className="px-4 py-2 text-sm" disabled={saving} onClick={submit}>
            {saving ? "Checking…" : "Upload and Check"}
          </NavyButton>
          <OutlineButton className="px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </OutlineButton>
        </div>
      </div>
    </div>
  );
}

function BatchPage({ id, backHref, onUploadAgain }: { id: string; backHref: string; onUploadAgain?: () => void }) {
  const { user } = useCurrentUser();
  const { canValidate } = importPermissions(user);
  const refresh = useRefresh();
  const batchQuery = useQuery({ queryKey: queryKeys.importBatch(id), queryFn: () => getImportBatch(id) });
  const batch = batchQuery.data;
  const checked = batch?.status === "VALIDATED";
  const issuesQuery = useQuery({
    queryKey: queryKeys.importIssues(id),
    queryFn: () => listImportIssues(id),
    enabled: checked,
  });
  const [checking, setChecking] = useState(false);

  async function check() {
    setChecking(true);
    try {
      await validateImport(id);
      toast.success("Dry run complete.");
      refresh("imports");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check this file.");
    } finally {
      setChecking(false);
    }
  }

  const back = (
    <Link href={backHref} scroll={false} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Data Import
    </Link>
  );

  if (!batch) {
    return (
      <>
        {back}
        <p className={batchQuery.error ? "mt-4 text-sm text-danger" : "mt-4 text-sm text-muted-foreground"}>
          {batchQuery.error instanceof Error ? batchQuery.error.message : batchQuery.isPending ? "Loading import…" : "This import could not be found."}
        </p>
      </>
    );
  }

  const totals = importTotals(batch);

  return (
    <>
      {back}
      <div className="mt-4">
        <PageHeader
          title={batch.fileName}
          action={
            <>
              {canValidate && batch.status !== "VALIDATING" && batch.status !== "FAILED" ? (
                <OutlineButton className="px-4 py-2 text-sm" disabled={checking} onClick={check}>
                  {checking ? "Checking…" : checked ? "Check Again" : "Run Dry Run"}
                </OutlineButton>
              ) : null}
              {onUploadAgain ? (
                <NavyButton className="px-4 py-2 text-sm" onClick={onUploadAgain}>
                  Upload Corrected File
                </NavyButton>
              ) : null}
            </>
          }
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <StatusChip batch={batch} />
        {checked ? <Chip tone="neutral">Nothing saved</Chip> : null}
        <span>
          {batch.id} · {IMPORT_MODE_LABEL[batch.mode]} · {batch.uploadedBy} · {formatDate(batch.uploadedAt.slice(0, 10))}
        </span>
      </div>

      {batch.fileProblems.length ? (
        <FloatCard className="mt-5 p-5">
          <h2 className="text-base font-semibold tracking-tight">Problems with this file</h2>
          <ul className="mt-3 space-y-1.5 text-sm">
            {batch.fileProblems.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        </FloatCard>
      ) : null}

      {checked ? (
        <>
          <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Rows Checked" value={String(totals.rows)} />
            <StatTile label="Ready" value={String(totals.ready)} delay={60} />
            <StatTile label="Ready with Flags" value={String(totals.flagged)} delay={120} />
            <StatTile label="Blocked" value={String(totals.blocked)} delay={180} />
          </div>

          <FloatCard className="mt-4 overflow-hidden" delay={120}>
            <CardHeader title="By Sheet" />
            <div className="mt-4 overflow-x-auto px-2 pb-4">
              <table className="w-full min-w-[480px] border-separate border-spacing-0 text-left">
                <thead>
                  <tr className="bg-pale text-[11px] text-muted-foreground">
                    <Th className="rounded-l-xl">Sheet</Th>
                    <Th>Rows</Th>
                    <Th>Ready</Th>
                    <Th>Flagged</Th>
                    <Th className="rounded-r-xl">Blocked</Th>
                  </tr>
                </thead>
                <tbody>
                  {batch.sheets.map((s) => (
                    <tr key={s.sheet}>
                      <Td className="text-sm font-medium">{s.sheet}</Td>
                      <Td className="text-sm">{s.rows}</Td>
                      <Td className="text-sm">{s.ready}</Td>
                      <Td className="text-sm">{s.flagged}</Td>
                      <Td className="text-sm">{s.blocked}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </FloatCard>

          <IssueList batch={batch} issues={issuesQuery.data ?? []} loading={issuesQuery.isPending} error={issuesQuery.error} />
        </>
      ) : null}
    </>
  );
}

function IssueList({ batch, issues, loading, error }: { batch: ImportBatch; issues: ImportIssue[]; loading: boolean; error: unknown }) {
  const [tab, setTab] = useState<(typeof ISSUE_TABS)[number]>("All");
  const [sheet, setSheet] = useState(ALL_OPTION);
  const rows = useMemo(
    () =>
      issues
        .filter((i) => tab === "All" || (tab === "Blocked" ? i.blocking : !i.blocking))
        .filter((i) => sheet === ALL_OPTION || i.sourceSheet === sheet)
        .sort((a, b) => Number(b.blocking) - Number(a.blocking) || a.sourceSheet.localeCompare(b.sourceSheet) || a.sourceRow - b.sourceRow),
    [issues, tab, sheet],
  );

  function download() {
    const url = URL.createObjectURL(new Blob([issuesToCsv(rows)], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${batch.id}-error-list.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <FloatCard className="mt-4 overflow-hidden" delay={180}>
      <CardHeader
        title="Issues"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <FilterMenu label="Sheet" value={sheet} options={optionsFrom(issues.map((i) => i.sourceSheet), "All sheets")} onChange={setSheet} />
            <SegmentedTabs tabs={ISSUE_TABS} value={tab} onChange={setTab} />
            <OutlineButton disabled={rows.length === 0} onClick={download}>
              Download List
            </OutlineButton>
          </div>
        }
      />
      <div className="mt-4 overflow-x-auto px-2 pb-4">
        <table className="w-full min-w-[720px] border-separate border-spacing-0 text-left">
          <thead>
            <tr className="bg-pale text-[11px] text-muted-foreground">
              <Th className="rounded-l-xl">Sheet</Th>
              <Th>Row</Th>
              <Th>Field</Th>
              <Th>Value</Th>
              <Th>Problem</Th>
              <Th className="rounded-r-xl">Result</Th>
            </tr>
          </thead>
          <tbody>
            {rows.map((i) => (
              <tr key={`${i.sourceSheet}:${i.sourceRow}:${i.field}:${i.code}`}>
                <Td className="text-sm">{i.sourceSheet}</Td>
                <Td className="text-sm">{i.sourceRow}</Td>
                <Td className="text-sm whitespace-nowrap">{i.field}</Td>
                <Td className="text-sm">{i.normalizedValue || "-"}</Td>
                <Td className="text-sm">{i.message}</Td>
                <Td>{i.blocking ? <Chip tone="danger">Blocked</Chip> : <Chip tone="warning">Flagged</Chip>}</Td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <Td className={error ? "text-sm text-danger" : "text-sm text-muted-foreground"} colSpan={6}>
                  {error instanceof Error ? error.message : loading ? "Loading issues…" : "No issues in this view."}
                </Td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </FloatCard>
  );
}
