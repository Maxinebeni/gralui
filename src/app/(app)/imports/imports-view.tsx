"use client";

// Data Import: the cleaned GRAL registers (the workbook made by
// tools/gral-import/clean_gral.py) are uploaded and checked; the Administrator
// fixes the rows that need a decision (account manager, insurer, product ...),
// checks again, and imports the ready rows as clients and policies. Rows that
// are not ready stay in the list, so the import can be finished in rounds.

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, FileText, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { Td, Th } from "@/components/gral/claim-list";
import { inputClass } from "@/components/gral/client-form";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { CardHeader, Chip, FloatCard, Loader, NavyButton, OutlineButton, SegmentedTabs, StatTile, TextLink } from "@/components/gral/ui";
import { usePaged } from "@/components/gral/pager";
import {
  IMPORT_ROW_PAGE,
  commitImport,
  correctImportRow,
  downloadImportSource,
  getImportBatch,
  getImportLookups,
  listAllImportRows,
  listImportRows,
  uploadImport,
  validateImport,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import {
  IMPORT_ACCEPT,
  IMPORT_CLIENT_TYPES,
  IMPORT_MOVEMENTS,
  IMPORT_STATUS_LABEL,
  ROW_STATUS_LABEL,
  SEVERITY_LABEL,
  duplicateCandidates,
  fieldKind,
  fieldLabel,
  fieldsFor,
  clientTypeCode,
  hasSuggestionNote,
  withoutSuggestionNote,
  fieldsToFix,
  groupIssues,
  importFileProblem,
  importStatusTone,
  issuesToCsv,
  matchField,
  matchValue,
  rowSource,
  rowStatusTone,
  mergeIssues,
  rowTitle,
  sameCaseRows,
  severityTone,
  valueText,
  type ImportBatch,
  type ImportLookups,
  type ImportRecordType,
  type ImportRow,
  type ImportRowStatus,
} from "@/lib/imports";
import { importPermissions } from "@/lib/permissions";
import { useImports, useRefresh } from "@/lib/queries";
import { queryKeys } from "@/lib/query";
import { formatDate } from "@/lib/renewals";
import { cn } from "@/lib/utils";

const RECORD_TABS = ["Clients", "Policies"] as const;
const STATUS_TABS = ["Blocked", "Needs a decision", "Ready", "Imported"] as const;
const STATUS_OF: Record<(typeof STATUS_TABS)[number], ImportRowStatus> = {
  Blocked: "ERROR",
  "Needs a decision": "REVIEW",
  Ready: "READY",
  Imported: "COMMITTED",
};
const IMMUTABLE_IMPORT_FIELDS = new Set(["Client ID", "Policy Number"]);

const n = (v: number) => v.toLocaleString("en-US");
const rowsWord = (v: number) => (v === 1 ? "row" : "rows");

function StatusChip({ status }: { status: string }) {
  return <Chip tone={importStatusTone(status)}>{IMPORT_STATUS_LABEL[status] ?? status}</Chip>;
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export function ImportsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const { canUpload } = importPermissions(user);
  const { data: batches = [], isPending, error } = useImports();
  const { items: pageBatches, pager: batchPager } = usePaged(batches);
  const [upload, setUpload] = useState<{ parentBatchId?: string } | null>(null);
  const openId = searchParams.get("batch");

  const open = (id: string) => router.replace(`${pathname}?batch=${encodeURIComponent(id)}`, { scroll: false });

  const uploadPanel = (
    <SlideOver open={upload !== null} onClose={() => setUpload(null)}>
      {upload ? (
        <UploadForm
          parentBatchId={upload.parentBatchId}
          onClose={() => setUpload(null)}
          onDone={(batch) => {
            setUpload(null);
            open(batch.id);
          }}
        />
      ) : null}
    </SlideOver>
  );

  if (openId) {
    return (
      <>
        <BatchPage id={openId} backHref={pathname} onUploadCorrected={canUpload ? () => setUpload({ parentBatchId: openId }) : undefined} />
        {uploadPanel}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Data import"
        subtitle="GRAL's historical clients and policies, from the cleaned registers"
        action={
          canUpload ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setUpload({})}>
              <Plus className="size-4" /> New import
            </NavyButton>
          ) : null
        }
      />

      <FloatCard className="mt-5 overflow-hidden">
        <CardHeader title="Imports" />
        <div className="mt-4 overflow-x-auto px-2 pb-4">
          <table className="stack-table w-full min-w-[860px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-pale text-[11px] text-muted-foreground">
                <Th className="rounded-l-xl">File</Th>
                <Th>Uploaded</Th>
                <Th>Status</Th>
                <Th>Clients</Th>
                <Th>Policies</Th>
                <Th>Ready</Th>
                <Th>Needs a decision</Th>
                <Th>Blocked</Th>
                <Th>Imported</Th>
                <Th className="rounded-r-xl">Action</Th>
              </tr>
            </thead>
            <tbody>
              {pageBatches.map((b) => (
                <tr key={b.id} className="cursor-pointer hover:bg-pale/50" onClick={() => open(b.id)}>
                  <Td>
                    <div className="max-w-[240px] truncate text-sm font-medium">{b.fileName}</div>
                    <div className="text-xs text-muted-foreground">Mapping {b.mappingVersion}</div>
                  </Td>
                  <Td label="Uploaded" className="text-sm whitespace-nowrap">{formatDate(b.uploadedAt.slice(0, 10))}</Td>
                  <Td label="Status">
                    <StatusChip status={b.status} />
                  </Td>
                  <Td label="Clients" className="text-sm">{n(b.clients)}</Td>
                  <Td label="Policies" className="text-sm">{n(b.policies)}</Td>
                  <Td label="Ready" className="text-sm">{n(b.ready)}</Td>
                  <Td label="Needs a decision" className="text-sm">{n(b.review)}</Td>
                  <Td label="Blocked" className="text-sm">{n(b.errors)}</Td>
                  <Td label="Imported" className="text-sm">{n(b.committed)}</Td>
                  <Td>
                    <TextLink>View</TextLink>
                  </Td>
                </tr>
              ))}
              {batches.length === 0 ? (
                <tr>
                  <Td className={error ? "text-sm text-danger" : "text-sm text-muted-foreground"} colSpan={10}>
                    {error instanceof Error ? error.message : isPending ? <Loader label="Loading imports" /> : "No imports yet."}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        {batchPager}
      </FloatCard>
      {uploadPanel}
    </>
  );
}

function UploadForm({ parentBatchId, onClose, onDone }: { parentBatchId?: string; onClose: () => void; onDone: (batch: ImportBatch) => void }) {
  const refresh = useRefresh();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [step, setStep] = useState<"idle" | "uploading" | "checking">("idle");

  async function submit() {
    if (!file) {
      setFileError("Choose a file.");
      return;
    }
    let uploaded: ImportBatch | null = null;
    try {
      setStep("uploading");
      uploaded = await uploadImport(file, parentBatchId);
      setStep("checking");
      const checked = await validateImport(uploaded.id);
      toast.success("File uploaded and checked. Nothing is imported until you click Import Ready Rows.");
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
      setStep("idle");
    }
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <h2 className="text-lg font-semibold tracking-tight">{parentBatchId ? "Upload corrected file" : "New import"}</h2>
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
          <p className="text-xs font-medium text-muted-foreground">Cleaned workbook (.xlsx, up to 50 MB)</p>
          <input
            ref={input}
            type="file"
            accept={IMPORT_ACCEPT}
            aria-label="Cleaned workbook"
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
        <div className="flex flex-wrap justify-between gap-2">
          <OutlineButton className="px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </OutlineButton>
          <NavyButton className="px-4 py-2 text-sm" disabled={step !== "idle"} onClick={submit}>
            {step === "uploading" ? "Uploading…" : step === "checking" ? "Checking every row…" : "Upload and check"}
          </NavyButton>
        </div>
      </div>
    </div>
  );
}

function BatchPage({ id, backHref, onUploadCorrected }: { id: string; backHref: string; onUploadCorrected?: () => void }) {
  const { user } = useCurrentUser();
  const { canValidate, canCommit, canResolve } = importPermissions(user);
  const refresh = useRefresh();
  const batchQuery = useQuery({ queryKey: queryKeys.importBatch(id), queryFn: () => getImportBatch(id) });
  const batch = batchQuery.data;
  const [busy, setBusy] = useState<"check" | "commit" | "download" | "problems" | null>(null);
  const [confirming, setConfirming] = useState(false);

  async function check() {
    setBusy("check");
    try {
      const b = await validateImport(id);
      toast.success(`Checked. Ready: ${n(b.ready)}. Needs a decision: ${n(b.review)}. Blocked: ${n(b.errors)}.`);
      refresh("imports");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check this file.");
    } finally {
      setBusy(null);
    }
  }

  async function commit() {
    setBusy("commit");
    setConfirming(false);
    try {
      const before = batch?.committed ?? 0;
      const b = await commitImport(id);
      const saved = b.committed - before;
      toast.success(
        b.status === "COMMITTED"
          ? `Import finished. ${n(saved)} ${rowsWord(saved)} saved as clients and policies.`
          : `${n(saved)} ${rowsWord(saved)} saved. ${n(b.review + b.errors + b.ready)} ${rowsWord(b.review + b.errors + b.ready)} still need work.`,
      );
      refresh("imports", "clients");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not import the ready rows.");
    } finally {
      setBusy(null);
    }
  }

  async function download() {
    setBusy("download");
    try {
      const { blob, fileName } = await downloadImportSource(id);
      saveBlob(blob, fileName);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not download the original file.");
    } finally {
      setBusy(null);
    }
  }

  async function downloadProblems() {
    setBusy("problems");
    try {
      const lists = await Promise.all(
        (["CLIENT", "POLICY"] as const).flatMap((t) => (["ERROR", "REVIEW"] as const).map((s) => listAllImportRows(id, t, s))),
      );
      const rows = lists.flat();
      if (rows.length === 0) {
        toast.success("No rows are blocked or waiting for a decision.");
        return;
      }
      saveBlob(new Blob([issuesToCsv(rows)], { type: "text/csv;charset=utf-8" }), `import-problems-${id.slice(0, 8)}.csv`);
      toast.message("The list holds client data. Keep it off GitHub and group chats.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not load the problem list.");
    } finally {
      setBusy(null);
    }
  }

  const back = (
    <Link href={backHref} scroll={false} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
      <ArrowLeft className="size-4" /> Data import
    </Link>
  );

  if (!batch) {
    return (
      <>
        {back}
        <p className={batchQuery.error ? "mt-4 text-sm text-danger" : "mt-4 text-sm text-muted-foreground"}>
          {batchQuery.error instanceof Error ? batchQuery.error.message : batchQuery.isPending ? <Loader label="Loading import" /> : "This import could not be found."}
        </p>
      </>
    );
  }

  const open = batch.status !== "COMMITTED" && batch.status !== "FAILED";
  const checked = batch.status === "VALIDATED" || batch.status === "PARTIAL";
  const canImportNow = canCommit && checked && batch.ready > 0;

  return (
    <>
      {back}
      <div className="mt-4">
        <PageHeader
          title={batch.fileName}
          action={
            <>
              {canValidate && open ? (
                <OutlineButton className="px-4 py-2 text-sm" disabled={busy !== null} onClick={check}>
                  {busy === "check" ? "Validating…" : "Validate"}
                </OutlineButton>
              ) : null}
              {canCommit && open ? (
                <NavyButton className="px-4 py-2 text-sm" disabled={busy !== null || !canImportNow} onClick={() => setConfirming(true)}>
                  {busy === "commit" ? "Importing…" : `Import ${n(batch.ready)} Ready ${batch.ready === 1 ? "Row" : "Rows"}`}
                </NavyButton>
              ) : null}
            </>
          }
        />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <StatusChip status={batch.status} />
        <span>
          Uploaded {formatDate(batch.uploadedAt.slice(0, 10))} · Mapping {batch.mappingVersion}
          {batch.validatedAt ? ` · Last checked ${formatDate(batch.validatedAt.slice(0, 10))}` : ""}
          {batch.committedAt ? ` · Finished ${formatDate(batch.committedAt.slice(0, 10))}` : ""}
        </span>
        <TextLink onClick={busy ? undefined : download}>{busy === "download" ? "Downloading…" : "Original file"}</TextLink>
        <TextLink onClick={busy ? undefined : downloadProblems}>{busy === "problems" ? "Preparing…" : "Problem list (CSV)"}</TextLink>
        {onUploadCorrected && open ? <TextLink onClick={onUploadCorrected}>Upload corrected file</TextLink> : null}
      </div>

      {batch.status === "STAGED" && batch.validatedAt ? (
        <p className="mt-3 rounded-xl bg-sky-soft/60 px-4 py-3 text-xs">Rows were changed since the last validation. Click Validate to see which rows are ready now.</p>
      ) : null}

      {confirming ? (
        <FloatCard className="mt-4 p-5">
          <p className="text-sm font-medium">
            Import {n(batch.ready)} ready {rowsWord(batch.ready)}?
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            They become real clients and policies, and this cannot be undone from here. Rows that are blocked or need a decision stay in this list, so you can
            fix them and import them later.
          </p>
          <div className="mt-3 flex flex-wrap justify-between gap-2">
            <OutlineButton onClick={() => setConfirming(false)}>Cancel</OutlineButton>
            <NavyButton onClick={commit}>Yes, import them</NavyButton>
          </div>
        </FloatCard>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <StatTile label="Clients" value={n(batch.clients)} />
        <StatTile label="Policies" value={n(batch.policies)} delay={40} />
        <StatTile label="Ready" value={n(batch.ready)} delay={80} />
        <StatTile label="Needs a decision" value={n(batch.review)} delay={120} />
        <StatTile label="Blocked" value={n(batch.errors)} delay={160} />
        <StatTile label="Imported" value={n(batch.committed)} delay={200} />
      </div>

      <RowList batch={batch} canResolve={canResolve && open} />
    </>
  );
}

function RowList({ batch, canResolve }: { batch: ImportBatch; canResolve: boolean }) {
  const [record, setRecord] = useState<(typeof RECORD_TABS)[number]>("Clients");
  const [statusTab, setStatusTab] = useState<(typeof STATUS_TABS)[number]>("Blocked");
  const [page, setPage] = useState(0);
  const recordType: ImportRecordType = record === "Clients" ? "CLIENT" : "POLICY";
  const status = STATUS_OF[statusTab];
  const rowsQuery = useQuery({
    queryKey: queryKeys.importRows(batch.id, recordType, status, page),
    queryFn: () => listImportRows(batch.id, { recordType, status, page }),
  });
  const lookupsQuery = useQuery({ queryKey: queryKeys.importLookups, queryFn: getImportLookups, enabled: canResolve, staleTime: 5 * 60_000 });
  const rows = useMemo(() => rowsQuery.data ?? [], [rowsQuery.data]);
  const groups = useMemo(() => groupIssues(rows), [rows]);

  return (
    <FloatCard className="mt-4 overflow-hidden" delay={120}>
      <CardHeader
        title="Rows"
        right={
          <div className="flex flex-wrap items-center gap-2">
            <SegmentedTabs
              tabs={RECORD_TABS}
              value={record}
              onChange={(v) => {
                setRecord(v);
                setPage(0);
              }}
            />
            <SegmentedTabs
              tabs={STATUS_TABS}
              value={statusTab}
              onChange={(v) => {
                setStatusTab(v);
                setPage(0);
              }}
            />
          </div>
        }
      />

      {groups.length ? (
        <div className="mt-3 flex flex-wrap gap-2 px-5">
          {groups.slice(0, 6).map((g) => (
            <Chip key={`${g.code}|${g.field}`} tone={severityTone(g.severity)}>
              {fieldLabel(g.field)}: {g.count} on this page
            </Chip>
          ))}
        </div>
      ) : null}

      <div className="mt-4 space-y-2 px-4 pb-4">
        {rowsQuery.error ? (
          <p className="text-sm text-danger">{rowsQuery.error instanceof Error ? rowsQuery.error.message : "Could not load the rows."}</p>
        ) : rowsQuery.isPending ? (
          <p className="text-sm text-muted-foreground">
            <Loader label="Loading rows" />
          </p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">No {record.toLowerCase()} in this view.</p>
        ) : (
          rows.map((row) => <RowCard key={row.id} batch={batch} row={row} canResolve={canResolve} lookups={lookupsQuery.data} lookupsError={lookupsQuery.error} />)
        )}
      </div>

      {page > 0 || rows.length === IMPORT_ROW_PAGE ? (
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3 text-xs text-muted-foreground">
          <OutlineButton disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
            Previous
          </OutlineButton>
          <span>
            Rows {n(page * IMPORT_ROW_PAGE + 1)} to {n(page * IMPORT_ROW_PAGE + rows.length)}
          </span>
          <OutlineButton disabled={rows.length < IMPORT_ROW_PAGE} onClick={() => setPage((p) => p + 1)}>
            Next
          </OutlineButton>
        </div>
      ) : null}
    </FloatCard>
  );
}

function RowCard({
  batch,
  row,
  canResolve,
  lookups,
  lookupsError,
}: {
  batch: ImportBatch;
  row: ImportRow;
  canResolve: boolean;
  lookups?: ImportLookups;
  lookupsError: unknown;
}) {
  const [fixing, setFixing] = useState(false);
  const [showValues, setShowValues] = useState(false);
  const canFix = canResolve && row.status !== "COMMITTED" && row.recordType !== "SOURCE_ROW";
  const issues = useMemo(() => mergeIssues(row.issues), [row.issues]);

  return (
    <div className="rounded-xl border border-border px-4 py-3 transition-colors hover:border-primary/30 hover:bg-muted/15">
      <div className="flex flex-wrap items-start justify-between gap-3">
        {canFix ? <button type="button" onClick={() => setFixing(true)} aria-haspopup="dialog" className="min-w-0 flex-1 cursor-pointer text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2">
          <p className="text-sm font-medium">{rowTitle(row)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{rowSource(row)}</p>
          {issues.length ? (
            <ul className="mt-2 space-y-1">
              {issues.map((i) => (
                <li key={`${i.severity}|${i.field}|${i.message}`} className="flex flex-wrap items-start gap-2 text-xs">
                  <Chip tone={severityTone(i.severity)}>{SEVERITY_LABEL[i.severity] ?? i.severity}</Chip>
                  <span>
                    <span className="font-medium">{fieldLabel(i.field)}:</span> {i.message}
                    {i.count > 1 ? <span className="text-muted-foreground"> (×{i.count}, one per register row)</span> : null}
                  </span>
                </li>
              ))}
            </ul>
          ) : row.status === "REVIEW" ? (
            <p className="mt-2 text-xs text-muted-foreground">Changed since the last validation. Click Validate to see if it is ready.</p>
          ) : null}
          <span className="mt-2 block text-[11px] font-medium text-primary">Click to review and fix</span>
        </button> : <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{rowTitle(row)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{rowSource(row)}</p>
          {issues.length ? <ul className="mt-2 space-y-1">{issues.map((i) => <li key={`${i.severity}|${i.field}|${i.message}`} className="flex flex-wrap items-start gap-2 text-xs"><Chip tone={severityTone(i.severity)}>{SEVERITY_LABEL[i.severity] ?? i.severity}</Chip><span><span className="font-medium">{fieldLabel(i.field)}:</span> {i.message}{i.count > 1 ? <span className="text-muted-foreground"> (×{i.count}, one per register row)</span> : null}</span></li>)}</ul> : null}
        </div>}
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Chip tone={rowStatusTone(row.status)}>{ROW_STATUS_LABEL[row.status] ?? row.status}</Chip>
          {canFix ? <OutlineButton onClick={() => setFixing(true)}>Fix</OutlineButton> : null}
        </div>
      </div>

      <button
        type="button"
        onClick={() => setShowValues((s) => !s)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
        aria-expanded={showValues}
      >
        <ChevronDown className={cn("size-3 transition-transform", showValues && "rotate-180")} /> {showValues ? "Hide values" : "Show values"}
      </button>
      {showValues ? <RowValues row={row} lookups={lookups} /> : null}

      {fixing ? <div className="fixed inset-0 z-[70] flex items-end justify-center bg-foreground/40 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setFixing(false); }}>
        <div role="dialog" aria-modal="true" aria-labelledby={`fix-import-${row.id}`} className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-background p-4 shadow-2xl sm:rounded-2xl sm:p-6">
          <div className="mb-3 flex items-start justify-between gap-3">
            <div><h2 id={`fix-import-${row.id}`} className="text-base font-semibold">Fix {rowTitle(row)}</h2><p className="mt-1 text-xs text-muted-foreground">{rowSource(row)}</p></div>
            <OutlineButton onClick={() => setFixing(false)} className="px-3 py-1.5 text-xs">Close</OutlineButton>
          </div>
          {lookupsError ? (
            <p className="mt-3 text-xs text-danger">{lookupsError instanceof Error ? lookupsError.message : "Could not load the lists to choose from."}</p>
          ) : !lookups ? (
            <p className="mt-3 text-xs text-muted-foreground"><Loader label="Loading insurers, products and account managers" /></p>
          ) : <FixForm batch={batch} row={row} lookups={lookups} onDone={() => setFixing(false)} />}
        </div>
      </div> : null}
    </div>
  );
}

/** A system ID shown as the name it stands for. */
function displayValue(field: string, value: unknown, lookups?: ImportLookups): string {
  const v = valueText(value);
  if (!v || !lookups) return v;
  const kind = fieldKind(field);
  if (kind === "manager") return lookups.managers.find((m) => m.id === v)?.name ?? v;
  if (kind === "insurer") return lookups.insurers.find((i) => i.id === v)?.name ?? v;
  if (kind === "product") return lookups.products.find((p) => p.id === v)?.name ?? v;
  return v;
}

function RowValues({ row, lookups }: { row: ImportRow; lookups?: ImportLookups }) {
  const entries = Object.entries(row.values).filter(([k, v]) => valueText(v) && !k.startsWith("Import Provenance") && k !== "Client Key SHA256" && k !== "Source Row ID");
  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-xl bg-pale/60 px-3 py-2 text-[11px] sm:grid-cols-2">
      {entries.map(([k, v]) => (
        <div key={k} className="flex min-w-0 gap-2">
          <dt className="shrink-0 text-muted-foreground">{fieldLabel(k)}</dt>
          <dd className="min-w-0 truncate" title={valueText(v)}>
            {displayValue(k, v, lookups)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function existingFixValue(row: ImportRow, field: string, lookups: ImportLookups) {
  const raw = valueText(row.values[field]);
  const kind = fieldKind(field);
  if (kind === "duplicate") {
    if (raw.startsWith("LINK:")) return { value: "LINK", linkTo: raw.slice("LINK:".length) };
    return { value: ["DISTINCT", "CREATE_NEW"].includes(raw) ? raw : "", linkTo: "" };
  }
  if (kind === "manager") {
    const manager = lookups.managers.find((item) => item.id === raw || item.name === raw);
    return { value: manager?.id ?? "", linkTo: "" };
  }
  if (kind === "insurer") {
    const insurer = lookups.insurers.find((item) => item.id === raw || item.name === raw || item.code === raw);
    return { value: insurer?.id ?? "", linkTo: "" };
  }
  if (kind === "product") {
    const product = lookups.products.find((item) => item.id === raw || item.name === raw || item.code === raw);
    return { value: product?.id ?? "", linkTo: "" };
  }
  if (kind === "clientType") {
    return { value: clientTypeCode(raw), linkTo: "" };
  }
  if (kind === "movement") {
    return { value: IMPORT_MOVEMENTS.some((item) => item.value === raw) ? raw : "", linkTo: "" };
  }
  return { value: kind === "date" ? raw.slice(0, 10) : raw, linkTo: "" };
}

const draftsRemarks = (drafts: Record<string, { value: string }>) => drafts["Remarks"]?.value ?? "";

function FixForm({ batch, row, lookups, onDone }: { batch: ImportBatch; row: ImportRow; lookups: ImportLookups; onDone: () => void }) {
  const refresh = useRefresh();
  const queryClient = useQueryClient();
  const suggested = fieldsToFix(row);
  const allFields = [...suggested, ...fieldsFor(row.recordType).filter((f) => !suggested.includes(f))];
  const editableFields = allFields.filter((field) => !IMMUTABLE_IMPORT_FIELDS.has(field));
  // The cleaning script's client-type note is taken out of Remarks straight away, so
  // saving any fix on the row removes it; the field can still be edited.
  const autoRemarks = row.recordType === "CLIENT" && hasSuggestionNote(valueText(row.values["Remarks"]));
  const [drafts, setDrafts] = useState<Record<string, { value: string; linkTo: string }>>(() =>
    Object.fromEntries(
      editableFields.map((field) => [
        field,
        field === "Remarks" && autoRemarks ? { value: withoutSuggestionNote(valueText(row.values[field])), linkTo: "" } : existingFixValue(row, field, lookups),
      ]),
    ),
  );
  const remarksLeftAsSuggested = autoRemarks && draftsRemarks(drafts) === withoutSuggestionNote(valueText(row.values["Remarks"]));
  const [applyAll, setApplyAll] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const candidates = duplicateCandidates(row);
  const draftValue = (field: string) => drafts[field]?.value ?? "";
  const draftLinkTo = (field: string) => drafts[field]?.linkTo ?? "";
  const updateDraft = (field: string, key: "value" | "linkTo", next: string) => {
    setDrafts((current) => ({
      ...current,
      [field]: { ...current[field], [key]: next },
      ...(field === "Insurer ID" && key === "value" ? { "Product ID": { value: "", linkTo: "" } } : {}),
    }));
    setErrors((current) => ({ ...current, [field]: "", form: "" }));
  };
  const finalValue = (field: string) => {
    const kind = fieldKind(field);
    const value = draftValue(field);
    if (kind === "duplicate" && value === "LINK") return `LINK:${draftLinkTo(field).trim()}`;
    if (kind === "money") return value.replace(/,/g, "").trim();
    return value.trim();
  };
  const changedFields = editableFields.filter((field) => {
    const initial = existingFixValue(row, field, lookups);
    const before = fieldKind(field) === "money" ? initial.value.replace(/,/g, "").trim() : fieldKind(field) === "duplicate" && initial.value === "LINK" ? `LINK:${initial.linkTo}` : initial.value.trim();
    return finalValue(field) !== before;
  });
  const bulkMatchField = changedFields.find((field) => {
    const kind = fieldKind(field);
    return !!matchValue(row, field) && ["manager", "insurer", "product", "clientType", "movement"].includes(kind);
  });
  const bulkable = Boolean(bulkMatchField);

  function previewValue(field: string): string {
    const kind = fieldKind(field);
    const value = finalValue(field);
    if (kind === "duplicate" && draftValue(field) === "LINK") {
      const candidate = candidates.find((item) => item.id === draftLinkTo(field));
      return candidate ? `${candidate.reference} · ${candidate.name}` : draftLinkTo(field) || "Choose an existing client";
    }
    if (kind === "clientType") return IMPORT_CLIENT_TYPES.find((item) => item.value === value)?.label ?? value;
    if (kind === "movement") return IMPORT_MOVEMENTS.find((item) => item.value === value)?.label ?? value;
    return displayValue(field, value, lookups);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!changedFields.length) found.form = "Change at least one field before reviewing.";
    for (const field of changedFields) {
      const kind = fieldKind(field);
      const value = draftValue(field);
      if (!value.trim() && kind !== "text") found[field] = "Choose or enter a value.";
      if (kind === "duplicate" && value === "LINK" && !/^[0-9a-f-]{36}$/i.test(draftLinkTo(field).trim())) found[field] = "Choose the existing client to link to.";
      if (kind === "money" && value.trim() && !(Number(value.replace(/,/g, "")) >= 0)) found[field] = "Enter a number of zero or more.";
    }
    setErrors(found);
    if (Object.keys(found).length) return;
    setReviewing(true);
  }

  async function confirmSave() {
    try {
      setProgress("Saving changes…");
      const changes = Object.fromEntries(changedFields.map((field) => [field, finalValue(field)]));
      await correctImportRow(batch.id, row, changes);
      let others = 0;
      let failed = 0;
      if (applyAll && bulkMatchField) {
        setProgress("Finding the other rows…");
        const lists = await Promise.all((["ERROR", "REVIEW"] as const).map((s) => listAllImportRows(batch.id, row.recordType, s)));
        const targets = sameCaseRows(lists.flat(), row, bulkMatchField);
        for (const [k, target] of targets.entries()) {
          try {
            setProgress(`Saving changes for ${k + 1} of ${targets.length} matching rows…`);
            // Remarks left as suggested means "take the note out": each row keeps its own remark.
            const targetValue = (field: string) =>
              field === "Remarks" && remarksLeftAsSuggested ? withoutSuggestionNote(valueText(target.values[field])) : finalValue(field);
            const targetChanges = Object.fromEntries(changedFields.filter((field) => targetValue(field) !== valueText(target.values[field])).map((field) => [field, targetValue(field)]));
            if (Object.keys(targetChanges).length) {
              await correctImportRow(batch.id, target, targetChanges);
              others += 1;
            }
          } catch {
            failed += 1;
          }
        }
      }
      toast.success(
        others || failed
          ? `Saved on this row and ${n(others)} others${failed ? `. ${n(failed)} could not be saved; try those again` : ""}. Click Validate when you are done fixing.`
          : "Saved. Click Validate when you are done fixing.",
      );
      await queryClient.invalidateQueries({ queryKey: ["imports", batch.id, "rows"] });
      refresh("imports");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this change.");
    } finally {
      setProgress(null);
    }
  }

  const cls = (field: string) => cn(inputClass(), errors[field] && "border-danger");
  const controlFor = (field: string) => {
    const kind = fieldKind(field);
    const value = draftValue(field);
    const id = `fix-${row.id}-${field.replace(/[^a-z0-9]/gi, "-")}`;
    const selectClass = cls(field);
    const selectedInsurerId = field === "Product ID" ? (draftValue("Insurer ID") || valueText(row.values["Insurer ID"])) : valueText(row.values["Insurer ID"]);
    const insurerForProduct = lookups.insurers.find((item) => item.id === selectedInsurerId);
    const products = insurerForProduct ? lookups.products.filter((item) => insurerForProduct.productIds.includes(item.id)) : lookups.products;
    if (kind === "manager") return <select id={id} value={value} onChange={(event) => updateDraft(field, "value", event.target.value)} className={selectClass}><option value="">Choose the Accounts Executive…</option>{lookups.managers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
    if (kind === "insurer") return <select id={id} value={value} onChange={(event) => updateDraft(field, "value", event.target.value)} className={selectClass}><option value="">Choose the insurer…</option>{lookups.insurers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
    if (kind === "product") return insurerForProduct && products.length === 0 ? <p className="rounded-lg bg-warning-soft/60 px-2.5 py-2 text-xs text-foreground">{insurerForProduct.name} has no active products yet. Add its products on the Insurers and products page, then come back to this row.</p> : <select id={id} value={value} onChange={(event) => updateDraft(field, "value", event.target.value)} className={selectClass}><option value="">{insurerForProduct ? `Choose a product from ${insurerForProduct.name}…` : "Choose the product…"}</option>{products.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select>;
    if (kind === "clientType") return <select id={id} value={value} onChange={(event) => updateDraft(field, "value", event.target.value)} className={selectClass}><option value="">Choose the client type…</option>{IMPORT_CLIENT_TYPES.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>;
    if (kind === "movement") return <select id={id} value={value} onChange={(event) => updateDraft(field, "value", event.target.value)} className={selectClass}><option value="">Choose the movement…</option>{IMPORT_MOVEMENTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select>;
    if (kind === "duplicate") return <div className="space-y-2"><select id={id} value={value} onChange={(event) => updateDraft(field, "value", event.target.value)} className={selectClass}><option value="">Choose…</option><option value="DISTINCT">A different client from similar names in this file</option><option value="CREATE_NEW">A new client, even though a similar one exists</option><option value="LINK">The same as a client already in the system</option></select>{value === "LINK" ? candidates.length ? <select value={draftLinkTo(field)} onChange={(event) => updateDraft(field, "linkTo", event.target.value)} className={selectClass} aria-label="Existing client"><option value="">Choose the existing client…</option>{candidates.map((item) => <option key={item.id} value={item.id}>{item.reference} · {item.name}</option>)}</select> : <input value={draftLinkTo(field)} onChange={(event) => updateDraft(field, "linkTo", event.target.value)} placeholder="The existing client's system ID" className={selectClass} aria-label="Existing client ID" /> : null}</div>;
    return <input id={id} type={kind === "date" ? "date" : "text"} inputMode={kind === "money" ? "decimal" : undefined} value={value} onChange={(event) => updateDraft(field, "value", event.target.value)} className={selectClass} />;
  };

  return (
    <form onSubmit={save} noValidate className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
      {errors.form ? <p role="alert" className="text-xs text-danger sm:col-span-2">{errors.form}</p> : null}
      <div className="grid gap-3 sm:col-span-2 sm:grid-cols-2">
        {allFields.map((field) => {
          const current = displayValue(field, row.values[field], lookups) || "Blank";
          const original = displayValue(field, row.original[field], lookups);
          const isChanged = changedFields.includes(field);
          const isImmutable = IMMUTABLE_IMPORT_FIELDS.has(field);
          return <div key={field} className={`min-w-0 space-y-2 rounded-xl border p-3 ${isChanged ? "border-primary/50 bg-primary/[0.03]" : "border-border bg-background"}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isImmutable ? <span className="text-xs font-semibold text-foreground">{fieldLabel(field)}</span> : <label htmlFor={`fix-${row.id}-${field.replace(/[^a-z0-9]/gi, "-")}`} className="text-xs font-semibold text-foreground">{fieldLabel(field)}</label>}
              {!isImmutable ? <span className="text-[10px] text-muted-foreground">Current: {current}</span> : null}
            </div>
            {original && original !== valueText(row.values[field]) ? <p className="text-[10px] text-subtle">Register value: {original}</p> : null}
            {isImmutable ? <p aria-readonly="true" className="break-words text-sm text-muted-foreground">{current}</p> : reviewing ? <p className={`break-words rounded-lg px-2.5 py-2 text-xs ${isChanged ? "bg-primary/10 font-medium text-primary" : "bg-muted/50 text-muted-foreground"}`}>
              {isChanged ? `After save: ${previewValue(field) || "Blank"}` : "Unchanged"}
            </p> : controlFor(field)}
            {!reviewing && field === "Remarks" && autoRemarks ? <p className="text-[11px] text-muted-foreground">The cleaning script&apos;s client-type note is removed when you save. Check the client type is right.</p> : null}
            {!reviewing && errors[field] ? <p role="alert" className="text-[11px] text-danger">{errors[field]}</p> : null}
          </div>;
        })}
      </div>
      {reviewing ? <div className="rounded-xl border border-sky/30 bg-sky-soft/40 p-3 text-xs sm:col-span-2">
        <p className="font-semibold text-foreground">Review before saving</p>
        <p className="mt-1 text-muted-foreground">{changedFields.length} {changedFields.length === 1 ? "field" : "fields"} changed. These are local drafts; nothing is sent until you confirm.</p>
        {applyAll && bulkable && bulkMatchField ? <p className="mt-1 text-muted-foreground">The changes will also be applied to matching rows where {fieldLabel(matchField(bulkMatchField))} is “{matchValue(row, bulkMatchField)}”.</p> : null}
      </div> : null}
      {!reviewing && bulkable && bulkMatchField ? <label className="flex items-start gap-2 text-xs sm:col-span-2">
        <input type="checkbox" checked={applyAll} onChange={(event) => setApplyAll(event.target.checked)} className="mt-0.5" />
        <span>Apply all changed fields to other {row.recordType === "CLIENT" ? "client" : "policy"} rows where {fieldLabel(matchField(bulkMatchField))} is “{matchValue(row, bulkMatchField)}” and the row is not imported yet.</span>
      </label> : null}
      <div className="flex flex-wrap items-center justify-between gap-2 sm:col-span-2">
        {reviewing ? <>
          <OutlineButton type="button" onClick={() => setReviewing(false)} disabled={progress !== null}>Back to editing</OutlineButton>
          <NavyButton type="button" onClick={() => void confirmSave()} disabled={progress !== null}>{progress ?? "Confirm and save"}</NavyButton>
        </> : <>
          <OutlineButton onClick={onDone} disabled={progress !== null}>Cancel</OutlineButton>
          <NavyButton type="submit" disabled={progress !== null}>Review changes</NavyButton>
        </>}
      </div>
    </form>
  );
}
