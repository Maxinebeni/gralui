"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export const PAGE_SIZE = 10;

/** The page numbers to show: always the first and last, the current one and its neighbours, gaps as null. */
export function pageNumbers(page: number, pages: number): (number | null)[] {
  const keep = new Set([1, pages, page - 1, page, page + 1].filter((n) => n >= 1 && n <= pages));
  const sorted = [...keep].sort((a, b) => a - b);
  return sorted.flatMap((n, i) => (i > 0 && n - sorted[i - 1]! > 1 ? [null, n] : [n]));
}

/**
 * Splits a list into pages. Goes back to page 1 when the list changes size
 * (a new filter, tab or search), or when `resetKey` changes.
 */
export function usePaged<T>(rows: T[], { pageSize = PAGE_SIZE, resetKey }: { pageSize?: number; resetKey?: unknown } = {}) {
  const key = `${rows.length}|${String(resetKey ?? "")}`;
  const [state, setState] = useState({ key, page: 1 });
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = state.key === key ? Math.min(state.page, pages) : 1;
  const start = (page - 1) * pageSize;
  return {
    items: rows.slice(start, start + pageSize),
    /** Whether row i is on the current page, for lists that render every row (so printing shows them all). */
    onPage: (i: number) => i >= start && i < start + pageSize,
    pager: (
      <Pager
        page={page}
        pages={pages}
        total={rows.length}
        from={start + 1}
        to={Math.min(start + pageSize, rows.length)}
        onPage={(p) => setState({ key, page: p })}
      />
    ),
  };
}

export function Pager({
  page,
  pages,
  total,
  from,
  to,
  onPage,
  className,
}: {
  page: number;
  pages: number;
  total: number;
  from: number;
  to: number;
  onPage: (page: number) => void;
  className?: string;
}) {
  if (pages <= 1) return null;
  const btn = "inline-flex size-8 items-center justify-center rounded-full text-xs font-medium transition-colors";
  return (
    <nav aria-label="Pages" className={cn("flex flex-wrap items-center justify-between gap-3 px-4 pt-2 pb-4", className)}>
      <span className="text-xs text-muted-foreground">
        {from}–{to} of {total.toLocaleString("en-US")}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Previous page"
          disabled={page === 1}
          onClick={() => onPage(page - 1)}
          className={cn(btn, "text-muted-foreground hover:bg-secondary disabled:pointer-events-none disabled:opacity-30")}
        >
          <ChevronLeft className="size-4" />
        </button>
        {pageNumbers(page, pages).map((n, i) =>
          n === null ? (
            <span key={`gap-${i}`} className="px-1 text-xs text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={n}
              type="button"
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={cn(btn, n === page ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-secondary")}
            >
              {n}
            </button>
          ),
        )}
        <button
          type="button"
          aria-label="Next page"
          disabled={page === pages}
          onClick={() => onPage(page + 1)}
          className={cn(btn, "text-muted-foreground hover:bg-secondary disabled:pointer-events-none disabled:opacity-30")}
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </nav>
  );
}
