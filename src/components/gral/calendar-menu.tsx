"use client";

// The calendar in the top bar: a month view with Rwanda's public holidays,
// so anyone can check working days at a glance. Read only.

import { useEffect, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { getHolidays } from "@/lib/api";
import type { Holiday } from "@/lib/holidays";
import { todayIso } from "@/lib/renewals";
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const iso = (y: number, m: number, d: number) =>
  `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;

export function CalendarMenu() {
  const today = todayIso();
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));

  useEffect(() => {
    getHolidays().then(setHolidays);
  }, []);

  const byDate = new Map(holidays.map((h) => [h.date, h]));
  const days = new Date(Date.UTC(month.y, month.m + 1, 0)).getUTCDate();
  // Monday-first: how many empty cells before the 1st.
  const lead = (new Date(Date.UTC(month.y, month.m, 1)).getUTCDay() + 6) % 7;
  const cells: (number | null)[] = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];

  const shift = (by: number) =>
    setMonth(({ y, m }) => {
      const t = y * 12 + m + by;
      return { y: Math.floor(t / 12), m: t % 12 };
    });
  const goToday = () => setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 });

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        aria-label="Calendar and public holidays"
        className="flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-[var(--shadow-pill)] outline-none transition-colors hover:text-primary"
      >
        <CalendarDays className="size-4" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" sideOffset={8} className="w-80 overflow-visible rounded-2xl p-4 shadow-[var(--shadow-float)]">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            aria-label="Previous month"
            onClick={() => shift(-1)}
            className="flex size-8 items-center justify-center rounded-full hover:bg-secondary"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button type="button" onClick={goToday} className="text-sm font-semibold" title="Back to this month">
            {MONTHS[month.m]} {month.y}
          </button>
          <button
            type="button"
            aria-label="Next month"
            onClick={() => shift(1)}
            className="flex size-8 items-center justify-center rounded-full hover:bg-secondary"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="mt-3 grid grid-cols-7 gap-1 text-center">
          {WEEKDAYS.map((d, i) => (
            <span key={d} className={cn("text-[11px] font-medium", i >= 5 ? "text-subtle" : "text-muted-foreground")}>
              {d}
            </span>
          ))}
          {cells.map((day, i) => {
            if (day === null) return <span key={`blank-${i}`} />;
            const date = iso(month.y, month.m, day);
            const holiday = byDate.get(date);
            const weekend = i % 7 >= 5;
            return (
              <span
                key={date}
                aria-label={holiday ? `${day}, ${holiday.label}` : undefined}
                className={cn(
                  "group relative flex aspect-square items-center justify-center rounded-full text-xs",
                  weekend && !holiday && "text-subtle",
                  holiday && "cursor-default bg-primary font-semibold text-primary-foreground",
                  date === today && "ring-2 ring-primary ring-offset-2 ring-offset-card",
                  date === today && !holiday && "font-semibold text-primary",
                )}
              >
                {day}
                {holiday ? (
                  <span
                    className={cn(
                      "pointer-events-none absolute bottom-full z-10 mb-1.5 hidden rounded-lg bg-foreground px-2 py-1 text-[11px] font-medium whitespace-nowrap text-background group-hover:block",
                      // Edge columns open inward so long names stay inside the panel.
                      i % 7 <= 1 ? "left-0" : i % 7 >= 5 ? "right-0" : "left-1/2 -translate-x-1/2",
                    )}
                  >
                    {holiday.label}
                  </span>
                ) : null}
              </span>
            );
          })}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
