// Sample notification inbox, used only in demo mode (NEXT_PUBLIC_MOCK_AUTH=true)
// so the bell and the Notifications page work without a backend. Read marks
// are kept in memory until the page is refreshed.

import type { InboxNotification } from "./api";

function hoursAgo(hours: number) {
  return new Date(Date.now() - hours * 3_600_000).toISOString();
}

const NOTIFICATIONS: InboxNotification[] = [
  { id: "ntf-01", type: "APPROVAL", title: "Approval needed", body: "Settlement of RWF 4,200,000 on CLM-2025-078 for Rwanda Energy Group is waiting for your decision.", createdAt: hoursAgo(1), readAt: null },
  { id: "ntf-02", type: "RENEWAL", title: "Renewal due in 11 days", body: "POL-2025-341 Public Liability for Rwanda Energy Group expires on 09 Nov 2026.", createdAt: hoursAgo(3), readAt: null },
  { id: "ntf-03", type: "TASK", title: "New task assigned to you", body: "Collect the signed proposal form from Horizon Logistics Rwanda.", createdAt: hoursAgo(20), readAt: null },
  { id: "ntf-04", type: "CLIENT", title: "KYC review returned", body: "The KYC review for Kigali Steel Industries Ltd was returned for a missing tax clearance certificate.", createdAt: hoursAgo(28), readAt: hoursAgo(26) },
  { id: "ntf-05", type: "APPROVAL", title: "Request approved", body: "The DMD approved the quote for Bralirwa PLC Property All Risk.", createdAt: hoursAgo(50), readAt: hoursAgo(49) },
  { id: "ntf-06", type: "RENEWAL", title: "Renewal overdue", body: "POL-2025-412 Industrial All Risk for Kigali Steel Industries Ltd expired on 21 Sep 2026.", createdAt: hoursAgo(75), readAt: hoursAgo(70) },
  { id: "ntf-07", type: "TASK", title: "Task due tomorrow", body: "Send the renewal notice to Bank of Kigali.", createdAt: hoursAgo(100), readAt: hoursAgo(98) },
  { id: "ntf-08", type: "CLIENT", title: "Client added", body: "Horizon Logistics Rwanda was added and assigned to you.", createdAt: hoursAgo(170), readAt: hoursAgo(160) },
];

export async function mockListNotifications(page: number, size: number, unreadOnly: boolean) {
  const all = NOTIFICATIONS.filter((n) => !unreadOnly || !n.readAt);
  return {
    items: all.slice(page * size, (page + 1) * size).map((n) => ({ ...n })),
    page,
    totalPages: Math.max(1, Math.ceil(all.length / size)),
    totalElements: all.length,
  };
}

export async function mockUnreadCount() {
  return NOTIFICATIONS.filter((n) => !n.readAt).length;
}

export async function mockMarkNotificationRead(id: string) {
  const n = NOTIFICATIONS.find((x) => x.id === id);
  if (n && !n.readAt) n.readAt = new Date().toISOString();
}
