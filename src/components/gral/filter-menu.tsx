"use client";

// A filter pill that opens a list to choose from (e.g. Insurer: All insurers).

import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

export function FilterMenu({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  /** The chosen option's value. */
  value: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const current = options.find((o) => o.value === value) ?? options[0];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className="float-pill flex max-w-full items-center gap-1.5 px-3.5 py-2 text-xs font-medium text-foreground outline-none transition-shadow hover:shadow-[var(--shadow-float)]">
        <span className="text-muted-foreground">{label}:</span>
        <span className="truncate">{current?.label}</span>
        <ChevronDown className="size-3.5 text-subtle" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="max-h-80 min-w-56 rounded-2xl p-2 shadow-[var(--shadow-float)]">
        {options.map((o) => (
          <DropdownMenuItem
            key={o.value}
            onSelect={() => onChange(o.value)}
            className={cn("justify-between rounded-xl px-3 py-2.5 text-sm", o.value === value && "font-medium text-primary")}
          >
            {o.label}
            {o.value === value ? <Check className="size-4" /> : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
