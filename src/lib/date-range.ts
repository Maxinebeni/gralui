// The date filter used on lists where each row has a clear date (claims:
// date reported; approvals: date requested). "All time" is the default, so
// nothing is hidden unless someone picks a range.

import { addDays, todayIso } from "./renewals";

export type DateRange = "all" | "30" | "90" | "year";

export const DATE_RANGE_OPTIONS: { value: DateRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "year", label: "This year" },
];

/** Whether an ISO date (yyyy-mm-dd) falls inside the range, counting back from today. */
export function withinRange(iso: string, range: DateRange) {
  if (range === "all") return true;
  const today = todayIso();
  const from = range === "year" ? `${today.slice(0, 4)}-01-01` : addDays(today, -Number(range));
  return iso.slice(0, 10) >= from && iso.slice(0, 10) <= today;
}
