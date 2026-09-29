import { ChevronDown, TrendingDown, TrendingUp, type LucideIcon } from "lucide-react";
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
      className={cn("float-card rise-in", className)}
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
    <div className={cn("flex flex-wrap items-center justify-between gap-3 px-5 pt-5", className)}>
      <h2 className="text-base font-semibold tracking-tight">{title}</h2>
      {right}
    </div>
  );
}

export function StatTile({
  icon: Icon,
  label,
  value,
  delta,
  tone = "up",
  delay = 0,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  delta?: string;
  tone?: "up" | "down";
  delay?: number;
}) {
  return (
    <FloatCard className="px-4 py-4" delay={delay}>
      <div className="flex items-center gap-2">
        <span className="flex size-6 items-center justify-center rounded-md bg-pale text-primary">
          <Icon className="size-3.5" />
        </span>
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <div className="mt-3 flex items-end justify-between gap-2">
        <span className="text-3xl leading-none font-semibold tracking-tight">{value}</span>
        {delta ? (
          <span
            className={cn(
              "flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
              tone === "up" ? "bg-success-soft text-success" : "bg-danger-soft text-danger",
            )}
          >
            {tone === "up" ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
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
      className="float-pill flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-foreground transition-shadow hover:shadow-[var(--shadow-float)]"
    >
      {label ? <span className="text-muted-foreground">{label}:</span> : null}
      <span>{value}</span>
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
        "inline-flex items-center justify-center gap-1.5 rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40",
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
        "inline-flex items-center justify-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary",
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
    <div className="mt-4 flex divide-x divide-border">
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
    <FloatCard className="lift-card p-5" delay={delay}>
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
      <div className="mt-3" style={{ height }}>
        {children}
      </div>
    </FloatCard>
  );
}

export function QuickAction({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  return (
    <FloatCard className="p-5" delay={delay}>
      <h2 className="text-base font-semibold tracking-tight">Quick Action</h2>
      <div className="mt-3 space-y-2">{children}</div>
    </FloatCard>
  );
}

export function QuickActionRow({
  icon: Icon,
  tone = "danger",
  text,
  action,
  tinted,
}: {
  icon: LucideIcon;
  tone?: "danger" | "success";
  text: string;
  action: ReactNode;
  tinted?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-3 rounded-xl px-3 py-2.5",
        tinted ? "bg-pale" : "",
      )}
    >
      <div className="flex items-center gap-2.5">
        <Icon className={cn("size-4 shrink-0", tone === "danger" ? "text-danger" : "text-success")} />
        <span className="text-xs font-medium text-foreground">{text}</span>
      </div>
      {action}
    </div>
  );
}
