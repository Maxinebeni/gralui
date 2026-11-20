"use client";

// Data Import: the cleaned GRAL registers (the workbook made by
// tools/gral-import/clean_gral.py) are uploaded and checked; the Administrator
// fixes the rows that need a decision (account manager, insurer, product ...),
// checks again, and imports the ready rows as clients and policies. Rows that
// are not ready stay in the list, so the import can be finished in rounds.

import { useMemo, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
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
        title="Data Import"
        subtitle="GRAL's historical clients and policies, from the cleaned registers"
        action={
          canUpload ? (
            <NavyButton className="px-4 py-2 text-sm" onClick={() => setUpload({})}>
              <Plus className="size-4" /> New Import
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
        <h2 className="text-lg font-semibold tracking-tight">{parentBatchId ? "Upload Corrected File" : "New Import"}</h2>
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
        <p className="text-xs text-muted-foreground">
          Upload the workbook made by the cleaning script (clean_gral.py), without editing it in Excel. The file is checked straight away. Nothing is saved as a
          client or policy until you click Import Ready Rows.
        </p>
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
        <p className="text-[11px] text-subtle">Only synthetic data until GRAL confirms where the system is hosted.</p>
        <div className="flex flex-wrap gap-2">
          <NavyButton className="px-4 py-2 text-sm" disabled={step !== "idle"} onClick={submit}>
            {step === "uploading" ? "Uploading…" : step === "checking" ? "Checking every row…" : "Upload and Check"}
          </NavyButton>
          <OutlineButton className="px-4 py-2 text-sm" onClick={onClose}>
            Cancel
          </OutlineButton>
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
      <ArrowLeft className="size-4" /> Data Import
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
          <div className="mt-3 flex flex-wrap gap-2">
            <NavyButton onClick={commit}>Yes, import them</NavyButton>
            <OutlineButton onClick={() => setConfirming(false)}>Cancel</OutlineButton>
          </div>
        </FloatCard>
      ) : null}

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 xl:grid-cols-6">
        <StatTile label="Clients" value={n(batch.clients)} />
        <StatTile label="Policies" value={n(batch.policies)} delay={40} />
        <StatTile label="Ready" value={n(batch.ready)} delay={80} />
        <StatTile label="Needs a Decision" value={n(batch.review)} delay={120} />
        <StatTile label="Blocked" value={n(batch.errors)} delay={160} />
        <StatTile label="Imported" value={n(batch.committed)} delay={200} />
      </div>
      <p className="mt-2 text-[11px] text-subtle">
        {n(batch.sourceRows)} register rows kept exactly as GRAL typed them. Clients and policies add up to {n(batch.clients + batch.policies)}; ready, needs a
        decision, blocked and imported add up to {n(batch.ready + batch.review + batch.errors + batch.committed)}.
      </p>

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
    <div className="rounded-xl border border-border px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-medium">{rowTitle(row)}</p>
          <p className="mt-0.5 text-[11px] text-muted-foreground">{rowSource(row)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={rowStatusTone(row.status)}>{ROW_STATUS_LABEL[row.status] ?? row.status}</Chip>
          {canFix ? <OutlineButton onClick={() => setFixing((f) => !f)}>{fixing ? "Close" : "Fix"}</OutlineButton> : null}
        </div>
      </div>

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

      <button
        type="button"
        onClick={() => setShowValues((s) => !s)}
        className="mt-2 inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-primary"
        aria-expanded={showValues}
      >
        <ChevronDown className={cn("size-3 transition-transform", showValues && "rotate-180")} /> {showValues ? "Hide values" : "Show values"}
      </button>
      {showValues ? <RowValues row={row} lookups={lookups} /> : null}

      {fixing ? (
        lookupsError ? (
          <p className="mt-3 text-xs text-danger">{lookupsError instanceof Error ? lookupsError.message : "Could not load the lists to choose from."}</p>
        ) : !lookups ? (
          <p className="mt-3 text-xs text-muted-foreground">
            <Loader label="Loading insurers, products and account managers" />
          </p>
        ) : (
          <FixForm batch={batch} row={row} lookups={lookups} onDone={() => setFixing(false)} />
        )
      ) : null}
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
  const entries = Object.entries(row.values).filter(([k, v]) => valueText(v) && !k.startsWith("Import Provenance") && k !== "Source Row ID");
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

function FixForm({ batch, row, lookups, onDone }: { batch: ImportBatch; row: ImportRow; lookups: ImportLookups; onDone: () => void }) {
  const refresh = useRefresh();
  const suggested = fieldsToFix(row);
  const allFields = [...suggested, ...fieldsFor(row.recordType).filter((f) => !suggested.includes(f))];
  const [field, setField] = useState(suggested[0] ?? allFields[0]!);
  const [value, setValue] = useState("");
  const [linkTo, setLinkTo] = useState("");
  const [reason, setReason] = useState("");
  const [applyAll, setApplyAll] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const kind = fieldKind(field);
  const registerValue = matchValue(row, field);
  const bulkable = !!registerValue && ["manager", "insurer", "product", "clientType", "movement"].includes(kind);
  const candidates = kind === "duplicate" ? duplicateCandidates(row) : [];

  // Products offered: those linked to the insurer already chosen for this row, when there is one.
  const rowInsurer = lookups.insurers.find((i) => i.id === valueText(row.values["Insurer ID"]));
  const products = rowInsurer ? lookups.products.filter((p) => rowInsurer.productIds.includes(p.id)) : lookups.products;

  function pickField(f: string) {
    setField(f);
    setValue("");
    setLinkTo("");
    setApplyAll(false);
    setErrors({});
  }

  function finalValue(): string {
    if (kind === "duplicate" && value === "LINK") return `LINK:${linkTo.trim()}`;
    if (kind === "money") return value.replace(/,/g, "").trim();
    return value.trim();
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!value.trim() && kind !== "text") found.value = "Choose a value.";
    if (kind === "duplicate" && value === "LINK" && !/^[0-9a-f-]{36}$/i.test(linkTo.trim())) found.value = "Choose the existing client to link to.";
    if (kind === "money" && value.trim() && !(Number(value.replace(/,/g, "")) >= 0)) found.value = "Enter a number of zero or more.";
    if (!reason.trim()) found.reason = "Say why, e.g. Confirmed with GRAL's register owner.";
    if (reason.length > 500) found.reason = "Keep the reason under 500 characters.";
    setErrors(found);
    if (Object.keys(found).length) return;

    const v = finalValue();
    try {
      setProgress("Saving…");
      await correctImportRow(batch.id, row, field, v, reason.trim());
      let others = 0;
      let failed = 0;
      if (applyAll && bulkable) {
        setProgress("Finding the other rows…");
        const lists = await Promise.all((["ERROR", "REVIEW"] as const).map((s) => listAllImportRows(batch.id, row.recordType, s)));
        const targets = sameCaseRows(lists.flat(), row, field).filter((r) => valueText(r.values[field]) !== v);
        // One at a time: every change also updates the import's version on the server.
        for (const [k, target] of targets.entries()) {
          setProgress(`Saving ${k + 1} of ${targets.length}…`);
          try {
            await correctImportRow(batch.id, target, field, v, reason.trim());
            others += 1;
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
      refresh("imports");
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save this change.");
    } finally {
      setProgress(null);
    }
  }

  const cls = (k: string) => cn(inputClass(), errors[k] && "border-danger");

  let control: React.ReactNode;
  if (kind === "manager")
    control = (
      <select id="fix-value" value={value} onChange={(e) => setValue(e.target.value)} className={cls("value")}>
        <option value="">Choose the Accounts Executive…</option>
        {lookups.managers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    );
  else if (kind === "insurer")
    control = (
      <select id="fix-value" value={value} onChange={(e) => setValue(e.target.value)} className={cls("value")}>
        <option value="">Choose the insurer…</option>
        {lookups.insurers.map((i) => (
          <option key={i.id} value={i.id}>
            {i.name}
          </option>
        ))}
      </select>
    );
  else if (kind === "product")
    control = (
      <select id="fix-value" value={value} onChange={(e) => setValue(e.target.value)} className={cls("value")}>
        <option value="">{rowInsurer ? `Choose a product from ${rowInsurer.name}…` : "Choose the product…"}</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    );
  else if (kind === "clientType")
    control = (
      <select id="fix-value" value={value} onChange={(e) => setValue(e.target.value)} className={cls("value")}>
        <option value="">Choose the client type…</option>
        {IMPORT_CLIENT_TYPES.map((t) => (
          <option key={t.value} value={t.value}>
            {t.label}
          </option>
        ))}
      </select>
    );
  else if (kind === "movement")
    control = (
      <select id="fix-value" value={value} onChange={(e) => setValue(e.target.value)} className={cls("value")}>
        <option value="">Choose the movement…</option>
        {IMPORT_MOVEMENTS.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
    );
  else if (kind === "duplicate")
    control = (
      <div className="space-y-2">
        <select id="fix-value" value={value} onChange={(e) => setValue(e.target.value)} className={cls("value")}>
          <option value="">Choose…</option>
          <option value="DISTINCT">A different client from the similar names in this file</option>
          <option value="CREATE_NEW">A new client, even though a similar one exists</option>
          <option value="LINK">The same as a client already in the system</option>
        </select>
        {value === "LINK" ? (
          candidates.length ? (
            <select value={linkTo} onChange={(e) => setLinkTo(e.target.value)} className={cls("value")} aria-label="Existing client">
              <option value="">Choose the existing client…</option>
              {candidates.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.reference} · {c.name}
                </option>
              ))}
            </select>
          ) : (
            <input value={linkTo} onChange={(e) => setLinkTo(e.target.value)} placeholder="The existing client's system ID" className={cls("value")} aria-label="Existing client ID" />
          )
        ) : null}
      </div>
    );
  else if (kind === "date") control = <input id="fix-value" type="date" value={value} onChange={(e) => setValue(e.target.value)} className={cls("value")} />;
  else control = <input id="fix-value" inputMode={kind === "money" ? "decimal" : undefined} value={value} onChange={(e) => setValue(e.target.value)} className={cls("value")} />;

  const current = displayValue(field, row.values[field], lookups);

  return (
    <form onSubmit={save} noValidate className="mt-3 grid gap-3 border-t border-border pt-3 sm:grid-cols-2">
      <label className="block text-[11px] font-medium text-muted-foreground">
        <span className="mb-1 block">What to change</span>
        <select value={field} onChange={(e) => pickField(e.target.value)} className={inputClass()}>
          {suggested.length ? (
            <optgroup label="Needed for this row">
              {suggested.map((f) => (
                <option key={f} value={f}>
                  {fieldLabel(f)}
                </option>
              ))}
            </optgroup>
          ) : null}
          <optgroup label="Other fields">
            {allFields
              .filter((f) => !suggested.includes(f))
              .map((f) => (
                <option key={f} value={f}>
                  {fieldLabel(f)}
                </option>
              ))}
          </optgroup>
        </select>
        <span className="mt-1 block font-normal text-subtle">
          Now: {current || "blank"}
          {registerValue && matchField(field) !== field ? ` · Register says: ${registerValue}` : ""}
        </span>
      </label>
      <div className="block text-[11px] font-medium text-muted-foreground">
        <label htmlFor="fix-value" className="mb-1 block">
          New value
        </label>
        {control}
        {errors.value ? <p className="mt-1 text-danger">{errors.value}</p> : null}
      </div>
      <label className="block text-[11px] font-medium text-muted-foreground sm:col-span-2">
        <span className="mb-1 block">Reason for this change</span>
        <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. P. NKUSI is this Accounts Executive (confirmed by GRAL)" className={cls("reason")} />
        {errors.reason ? <span className="mt-1 block text-danger">{errors.reason}</span> : null}
      </label>
      {bulkable ? (
        <label className="flex items-start gap-2 text-xs sm:col-span-2">
          <input type="checkbox" checked={applyAll} onChange={(e) => setApplyAll(e.target.checked)} className="mt-0.5" />
          <span>
            Also use this for every other {row.recordType === "CLIENT" ? "client" : "policy"} in this file where {fieldLabel(matchField(field))} is “{registerValue}”
            and the row is not imported yet.
          </span>
        </label>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 sm:col-span-2">
        <NavyButton type="submit" disabled={progress !== null}>
          {progress ?? "Save change"}
        </NavyButton>
        <OutlineButton onClick={onDone} disabled={progress !== null}>
          Cancel
        </OutlineButton>
      </div>
    </form>
  );
}
