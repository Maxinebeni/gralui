import { ChevronDown, type LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";

export function FloatCard({
  className,
  delay = 0,
  children,
}: {
  className?: string;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <div
      className={cn("float-card rise-in min-w-0", className)}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  right,
  className,
}: {
  title: string;
  right?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "grid min-w-0 gap-3 px-4 pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:px-5 sm:pt-5",
        className,
      )}
    >
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      <div className="min-w-0">{right}</div>
    </div>
  );
}

export function StatTile({
  label,
  value,
  delta,
  tone = "up",
  delay = 0,
}: {
  /** Kept for existing callers; tiles no longer show an icon. */
  icon?: LucideIcon;
  label: string;
  value: string;
  delta?: string;
  tone?: "up" | "down";
  delay?: number;
}) {
  return (
    <FloatCard className="px-4 py-4" delay={delay}>
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="min-w-0 break-words text-2xl leading-none font-semibold tracking-tight sm:text-3xl">
          {value}
        </span>
        {delta ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-medium",
              tone === "up" ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {delta}
          </span>
        ) : null}
      </div>
    </FloatCard>
  );
}

export function SegmentedTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex max-w-full items-center gap-1 overflow-x-auto rounded-full bg-secondary p-1">
      {tabs.map((t) => (
        <button
          key={t}
          type="button"
          onClick={() => onChange(t)}
          className={cn(
            "shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
            value === t
              ? "bg-card text-primary shadow-[var(--shadow-pill)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

export function FilterPill({
  label,
  value,
  onClick,
}: {
  label?: string;
  value: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="float-pill flex max-w-full items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-foreground transition-shadow hover:shadow-[var(--shadow-float)]"
    >
      {label ? <span className="text-muted-foreground">{label}:</span> : null}
      <span className="truncate">{value}</span>
      <ChevronDown className="size-3.5 text-subtle" />
    </button>
  );
}

export function Chip({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "success" | "warning" | "danger" | "sky";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap",
        tone === "neutral" && "bg-secondary text-muted-foreground",
        tone === "success" && "bg-success-soft text-success",
        tone === "warning" && "bg-warning-soft text-warning",
        tone === "danger" && "bg-danger-soft text-danger",
        tone === "sky" && "bg-pale text-primary",
      )}
    >
      {children}
    </span>
  );
}

export function PriorityPill({ priority }: { priority: "P1" | "P2" | "P3" }) {
  return (
    <span
      title={`Priority ${priority.slice(1)}`}
      className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground"
    >
      {priority}
    </span>
  );
}

export function Person({ name }: { name: string }) {
  return (
    <span className="flex items-center gap-2">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-pale text-[10px] font-semibold text-primary">
        {initials(name)}
      </span>
      <span className="truncate text-xs text-foreground">{name}</span>
    </span>
  );
}

export function NavyButton({
  children,
  onClick,
  className,
  disabled,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  type?: "button" | "submit";
}) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40 sm:min-h-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function OutlineButton({
  children,
  onClick,
  className,
}: {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex min-h-9 items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary sm:min-h-0",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function TextLink({ children, onClick }: { children: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-xs text-primary underline underline-offset-2 hover:opacity-70"
    >
      {children}
    </button>
  );
}

export function DistributionRow({
  items,
}: {
  items: { label: string; value: string; tone?: "danger" | "warning" | "success" }[];
}) {
  return (
    <div className="mt-4 grid grid-cols-3 divide-x divide-border">
      {items.map((it) => (
        <div key={it.label} className="flex-1 px-2 text-center">
          <div className="text-[11px] text-muted-foreground">{it.label}</div>
          <div
            className={cn(
              "mt-1 text-xl font-semibold",
              it.tone === "danger" && "text-danger",
              it.tone === "warning" && "text-warning",
              it.tone === "success" && "text-success",
            )}
          >
            {it.value}
          </div>
        </div>
      ))}
    </div>
  );
}

export function SegmentedBar({ segments }: { segments: { label: string; value: number }[] }) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const shades = ["bg-primary", "bg-sky", "bg-sky/70", "bg-sky/50", "bg-pale", "bg-secondary", "bg-background"];
  return (
    <div>
      <div className="flex h-2.5 overflow-hidden rounded-full">
        {segments.map((s, i) => (
          <div
            key={s.label}
            className={cn(shades[i % shades.length], "h-full")}
            style={{ width: `${(s.value / total) * 100}%` }}
            title={`${s.label}: ${s.value}`}
          />
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
        {segments.map((s) => (
          <span key={s.label} className="text-[10px] text-muted-foreground">
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Counts per stage of a process: one row per stage with its name, a bar sized by count, and the number. */
export function StageBar({
  stages,
  onSelect,
  wideLabels = false,
}: {
  stages: { label: string; count: number }[];
  onSelect?: (label: string) => void;
  /** Room for longer stage names. */
  wideLabels?: boolean;
}) {
  const max = Math.max(...stages.map((s) => s.count), 1);
  return (
    <ul className="space-y-3">
      {stages.map((s) => (
        <li key={s.label}>
          <button
            type="button"
            disabled={!onSelect}
            onClick={() => onSelect?.(s.label)}
            className={cn(
              "grid w-full items-center gap-3 text-left disabled:cursor-default",
              wideLabels ? "grid-cols-[minmax(0,11rem)_minmax(0,1fr)_2rem]" : "grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2rem]",
            )}
            title={`${s.label}: ${s.count}`}
          >
            <span className="truncate text-xs text-muted-foreground">{s.label}</span>
            <span className="h-2 overflow-hidden rounded-full bg-secondary">
              <span className="block h-full rounded-full bg-sky" style={{ width: `${(s.count / max) * 100}%` }} />
            </span>
            <span className={cn("text-right text-sm font-semibold", !s.count && "text-subtle")}>{s.count}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

export function ChartCard({
  title,
  legend,
  height = 220,
  delay = 0,
  children,
}: {
  title: string;
  legend: { label: string; tone: "primary" | "sky" }[];
  height?: number;
  delay?: number;
  children: ReactNode;
}) {
  return (
    <FloatCard className="lift-card p-4 sm:p-5" delay={delay}>
      <h3 className="text-base font-semibold tracking-tight">{title}</h3>
      <div className="mt-1 flex flex-wrap items-center gap-4">
        {legend.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span
              className={cn("size-2.5 rounded-[3px]", l.tone === "primary" ? "bg-primary" : "bg-sky")}
            />
            {l.label}
          </span>
        ))}
      </div>
      <div className="mt-3 min-w-0" style={{ height }}>
        {children}
      </div>
    </FloatCard>
  );
}

export function QuickAction({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <FloatCard className="p-4 sm:p-5" delay={delay}>
      <h2 className="text-base font-semibold tracking-tight">Quick Action</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </FloatCard>
  );
}

export function QuickActionRow({
  tone = "danger",
  text,
  action,
  tinted,
}: {
  /** Kept for existing callers; the row shows a coloured dot instead. */
  icon?: LucideIcon;
  tone?: "danger" | "success";
  text: string;
  action: ReactNode;
  tinted?: boolean;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2.5 sm:px-3",
        tinted ? "bg-pale" : "",
      )}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <Dot tone={tone === "danger" ? "danger" : "success"} />
        <span className="min-w-0 text-xs font-medium text-foreground">{text}</span>
      </div>
      {action}
    </div>
  );
}

/** Shown wherever a value has not been captured yet, so a gap is never just a blank. */
export function NotRecorded() {
  return <span className="text-subtle italic">Not recorded</span>;
}

/** The value, or "Not recorded" when it is missing or empty. */
export function Recorded({ value }: { value: ReactNode }) {
  if (value === null || value === undefined || (typeof value === "string" && value.trim() === "")) return <NotRecorded />;
  return <>{value}</>;
}

/** A small coloured dot that shows a state by colour, in place of an icon. Sized to line up with text and ticks. */
export function Dot({ tone = "subtle", className }: { tone?: "danger" | "warning" | "sky" | "success" | "subtle"; className?: string }) {
  return (
    <span aria-hidden className={cn("flex size-4 shrink-0 items-center justify-center", className)}>
      <span
        className={cn(
          "size-2.5 rounded-full",
          tone === "danger" && "bg-danger",
          tone === "warning" && "bg-warning",
          tone === "sky" && "bg-sky",
          tone === "success" && "bg-success",
          tone === "subtle" && "bg-border",
        )}
      />
    </span>
  );
}
