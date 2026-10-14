export function formatRwf(amount: number) {
  return `RWF ${amount.toLocaleString("en-US")}`;
}

export function initials(name: string) {
  return name
    .split(" ")
    .slice(0, 2)
    .map((p) => p[0])
    .join("");
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "21 Sep 2025" (how policy dates are stored on screen) to "2025-09-21". Empty if it cannot be read. */
export function displayToIso(text: string): string {
  const [d, mon, y] = text.trim().split(/\s+/);
  const m = MONTHS.indexOf(mon ?? "");
  if (!d || m < 0 || !y) return "";
  return `${y}-${String(m + 1).padStart(2, "0")}-${d.padStart(2, "0")}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Plain-text version for places that need a string, e.g. titles and CSV. */
export const NOT_RECORDED = "Not recorded";

export function rwfOrNotRecorded(amount: number | null | undefined) {
  return amount === null || amount === undefined ? NOT_RECORDED : formatRwf(amount);
}
