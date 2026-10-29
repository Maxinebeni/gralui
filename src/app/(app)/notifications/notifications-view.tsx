"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { PageHeader, notificationHref } from "@/components/gral/shell";
import { CardHeader, Chip, FloatCard, OutlineButton, SegmentedTabs } from "@/components/gral/ui";
import { listNotifications, markNotificationRead, type InboxNotification } from "@/lib/api";
import { timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

const TABS = ["All", "Unread"] as const;

/** Labels for the backend's notification types. */
function moduleOf(type: string) {
  const t = type.toUpperCase();
  if (t.includes("APPROVAL")) return "Approvals";
  if (t.includes("RENEWAL")) return "Renewals";
  if (t.includes("CLIENT")) return "Clients";
  if (t.includes("CLAIM")) return "Claims";
  if (t.includes("TASK")) return "My Work";
  return "Account";
}

export function NotificationsView() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]>("All");
  const unreadOnly = tab === "Unread";

  // Under the "inbox" key so the bell and this page refresh together.
  const query = useInfiniteQuery({
    queryKey: ["inbox", "page", unreadOnly],
    queryFn: ({ pageParam }) => listNotifications(pageParam, unreadOnly),
    initialPageParam: 0,
    getNextPageParam: (last) => (last.page + 1 < last.totalPages ? last.page + 1 : undefined),
  });
  const items = query.data?.pages.flatMap((p) => p.items) ?? [];
  const total = query.data?.pages[0]?.totalElements ?? 0;

  async function open(n: InboxNotification) {
    router.push(notificationHref(n.type));
    if (n.readAt) return;
    try {
      await markNotificationRead(n.id);
      void queryClient.invalidateQueries({ queryKey: ["inbox"] });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not mark the notification as read.");
    }
  }

  return (
    <>
      <PageHeader title="Notifications" />
      <FloatCard className="mt-5 overflow-hidden">
        <CardHeader
          title={`${total} ${unreadOnly ? "unread" : total === 1 ? "notification" : "notifications"}`}
          right={<SegmentedTabs tabs={TABS} value={tab} onChange={setTab} />}
        />
        <ul className="mt-2 divide-y divide-border px-5 pb-3 sm:px-6">
          {items.map((n) => (
            <li key={n.id}>
              <button
                type="button"
                onClick={() => void open(n)}
                className="grid w-full gap-2 py-4 text-left hover:opacity-80 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-6"
              >
                <span className="flex min-w-0 items-start gap-3">
                  <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", n.readAt ? "bg-muted-foreground/30" : "bg-primary")} />
                  <span className="min-w-0">
                    <span className={cn("block text-sm text-foreground", !n.readAt && "font-semibold")}>{n.title}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">{n.body}</span>
                  </span>
                </span>
                <span className="flex items-center gap-3 pl-5 sm:pl-0">
                  <Chip tone="sky">{moduleOf(n.type)}</Chip>
                  <span className="w-20 text-xs text-muted-foreground sm:text-right">{timeAgo(n.createdAt)}</span>
                </span>
              </button>
            </li>
          ))}
          {query.isPending ? <li className="py-4 text-sm text-muted-foreground">Loading…</li> : null}
          {query.isError ? <li className="py-4 text-sm text-danger">{query.error.message}</li> : null}
          {query.isSuccess && items.length === 0 ? (
            <li className="py-4 text-sm text-muted-foreground">{unreadOnly ? "No unread notifications." : "No notifications yet."}</li>
          ) : null}
        </ul>
        {query.hasNextPage ? (
          <div className="px-5 pb-5 sm:px-6">
            <OutlineButton disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
              {query.isFetchingNextPage ? "Loading…" : "Show older"}
            </OutlineButton>
          </div>
        ) : null}
      </FloatCard>
    </>
  );
}
