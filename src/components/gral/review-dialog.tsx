"use client";

// "Check before saving": the key figures in large type, with any unusual
// figures listed at the top. When there are warnings, the person ticks that
// they checked them before the save button works.

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { amountInWords } from "@/lib/amounts";
import { formatRwf } from "@/lib/format";
import { NavyButton, OutlineButton } from "./ui";

export type ReviewRow = { label: string; value: ReactNode } | { label: string; amount: number };

export function ReviewDialog({
  open,
  title,
  rows,
  warnings,
  confirmLabel,
  saving,
  onConfirm,
  onBack,
}: {
  open: boolean;
  title: string;
  rows: ReviewRow[];
  warnings: string[];
  confirmLabel: string;
  saving?: boolean;
  onConfirm: () => void;
  onBack: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);

  const onBackRef = useRef(onBack);
  onBackRef.current = onBack;

  // Fresh each time it opens: unticked, focused, Escape goes back.
  useEffect(() => {
    if (!open) return;
    setChecked(false);
    dialogRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onBackRef.current();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (!open) return null;
  const amounts = rows.filter((r): r is { label: string; amount: number } => "amount" in r);
  const others = rows.filter((r): r is { label: string; value: ReactNode } => "value" in r);

  // Rendered on the page body, so a sliding panel around the form cannot clip it.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-foreground/30 p-0 sm:items-center sm:p-4" onClick={onBack}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="review-title"
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full outline-none max-w-lg overflow-y-auto rounded-t-3xl bg-card p-5 shadow-[var(--shadow-float)] sm:rounded-3xl sm:p-6"
      >
        <h2 id="review-title" className="text-lg font-semibold tracking-tight">
          {title}
        </h2>
        <p className="mt-1 text-xs text-muted-foreground">Check the figures. Go back to change anything.</p>

        {warnings.length > 0 ? (
          <div className="mt-4 rounded-2xl bg-warning-soft/60 p-3.5">
            <p className="flex items-center gap-1.5 text-xs font-semibold text-warning">
              {warnings.length === 1 ? "One figure looks unusual" : `${warnings.length} figures look unusual`}
            </p>
            <ul className="mt-2 space-y-1.5 text-xs">
              {warnings.map((w) => (
                <li key={w} className="flex gap-2">
                  <span className="mt-1.5 size-1 shrink-0 rounded-full bg-warning" />
                  {w}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <dl className="mt-4 divide-y divide-border">
          {amounts.map((r) => (
            <div key={r.label} className="py-2.5">
              <dt className="text-[11px] text-muted-foreground">{r.label}</dt>
              <dd className="text-xl font-semibold tracking-tight tabular-nums">{formatRwf(r.amount)}</dd>
              <dd className="text-[11px] text-muted-foreground">{amountInWords(r.amount)} Rwandan francs</dd>
            </div>
          ))}
        </dl>
        {others.length > 0 ? (
          <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5 rounded-2xl bg-secondary/60 p-3.5 text-xs">
            {others.map((r) => (
              <div key={r.label} className="contents">
                <dt className="text-muted-foreground">{r.label}</dt>
                <dd className="min-w-0 font-medium break-words">{r.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {warnings.length > 0 ? (
          <label className="mt-4 flex items-start gap-2 text-xs">
            <input type="checkbox" checked={checked} onChange={(e) => setChecked(e.target.checked)} className="mt-0.5" />
            I have checked the figures above and they are correct.
          </label>
        ) : null}

        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <OutlineButton onClick={onBack} className="px-4 py-2 text-sm">
            Go back and edit
          </OutlineButton>
          <NavyButton onClick={onConfirm} disabled={saving || (warnings.length > 0 && !checked)} className="px-4 py-2 text-sm">
            {saving ? "Saving…" : confirmLabel}
          </NavyButton>
        </div>
      </div>
    </div>,
    document.body,
  );
}
