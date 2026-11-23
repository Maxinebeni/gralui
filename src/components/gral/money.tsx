"use client";

// Money totals on the Reports summary tiles are hidden until someone presses
// the eye on a tile, so figures are not read over a shoulder or caught in a
// screen share. One press shows (or hides) all the tiles' amounts; the choice
// lasts for this browser tab only (sessionStorage). Printing a report and CSV
// downloads always show the real figures.

import { Eye, EyeOff } from "lucide-react";
import { useSyncExternalStore, type ReactNode } from "react";
import { formatRwf } from "@/lib/format";
import { cn } from "@/lib/utils";

const KEY = "gral.showAmounts";
const listeners = new Set<() => void>();

function read(): boolean {
  try {
    return sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}

export function setAmountsShown(shown: boolean) {
  try {
    if (shown) sessionStorage.setItem(KEY, "1");
    else sessionStorage.removeItem(KEY);
  } catch {
    /* private mode: the choice just isn't remembered */
  }
  listeners.forEach((l) => l());
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** Whether money amounts are on show. Hidden on the server and on first load. */
export function useAmountsShown() {
  return useSyncExternalStore(subscribe, read, () => false);
}

export const MASK = "••••••";

/**
 * An amount on screen. Pass a number (shown as "RWF 1,250,000") or the text to
 * show ("1,250,000", "RWF 1.2M"). While hidden, a leading "RWF " is kept.
 */
export function Money({ value, children, className }: { value?: number | null; children?: ReactNode; className?: string }) {
  const shown = useAmountsShown();
  const text = children ?? (value === null || value === undefined ? null : formatRwf(value));
  if (shown || text === null) return <span className={className}>{text}</span>;
  const rwf = typeof text === "string" && text.startsWith("RWF ");
  return (
    <>
      <span className={cn("tracking-wider print:hidden", className)} aria-label="Amount hidden" title="Amount hidden. Press the eye to show amounts.">
        {rwf ? `RWF ${MASK}` : MASK}
      </span>
      {/* A printed report always has the real figures. */}
      <span className={cn("hidden print:inline", className)}>{text}</span>
    </>
  );
}

/** The eye that shows or hides every amount. */
export function AmountsToggle({ className, size = "md" }: { className?: string; size?: "sm" | "md" }) {
  const shown = useAmountsShown();
  const Icon = shown ? EyeOff : Eye;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        setAmountsShown(!shown);
      }}
      aria-pressed={shown}
      aria-label={shown ? "Hide amounts" : "Show amounts"}
      title={shown ? "Hide amounts" : "Show amounts"}
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-primary",
        size === "sm" ? "size-7 hover:bg-secondary" : "size-10 bg-card shadow-[var(--shadow-pill)]",
        className,
      )}
    >
      <Icon className={size === "sm" ? "size-3.5" : "size-4"} />
    </button>
  );
}
