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

/** "2h ago", "Yesterday", "3 days ago", or a date for anything older than a week. */
export function timeAgo(iso: string, now = new Date()) {
  const then = new Date(iso.length <= 10 ? `${iso}T12:00:00` : iso);
  const mins = Math.round((now.getTime() - then.getTime()) / 60000);
  if (mins < 1) return "Just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24 && then.toDateString() === now.toDateString()) return `${hours}h ago`;
  const days = Math.round((new Date(now.toDateString()).getTime() - new Date(then.toDateString()).getTime()) / 86400000);
  if (days <= 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  return then.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}
