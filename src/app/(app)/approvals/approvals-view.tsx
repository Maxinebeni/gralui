"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlarmClock, CheckCircle2, CornerUpLeft, Inbox } from "lucide-react";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { FilterMenu } from "@/components/gral/filter-menu";
import { DATE_RANGE_OPTIONS, withinRange, type DateRange } from "@/lib/date-range";
import { ApprovalPanel } from "@/components/gral/approval-panel";
import { Td, Th } from "@/components/gral/claim-list";
import { CardHeader, Chip, FloatCard, SegmentedTabs, StatTile, TextLink } from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import { listApprovals } from "@/lib/api";
import { SUBJECT_LABEL, canDecide, statusLabel, statusTone } from "@/lib/approvals";
import { useCurrentUser } from "@/lib/auth-context";
import { approvalPermissions } from "@/lib/permissions";
import { formatDate, todayIso } from "@/lib/renewals";
import type { ApprovalRequest } from "@/lib/types";

const BASE_TABS = ["Waiting for me", "Sent by me", "Decided"] as const;
type Tab = (typeof BASE_TABS)[number] | "All";

export function ApprovalsView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const { seesAllRequests } = approvalPermissions(user.role);
  const tabs: Tab[] = seesAllRequests ? [...BASE_TABS, "All"] : [...BASE_TABS];

  const [requests, setRequests] = useState<ApprovalRequest[]>([]);
  const [tab, setTab] = useState<Tab>("Waiting for me");
  // Date requested filter; applies to every tab and the counts.
  const [range, setRange] = useState<DateRange>("all");
  const reload = useCallback(() => {
    listApprovals().then(setRequests);
  }, []);
  useEffect(reload, [reload]);

  // Requests this person may see: their own, ones they can decide, or all for oversight roles.
  const visible = useMemo(
    () =>
      requests.filter(
        (r) =>
          withinRange(r.requestedAt, range) &&
          (seesAllRequests ||
            r.requestedBy === user.name ||
            r.steps.some((s) => s.role === user.role || (s.role === "Board" && user.role === "MD"))),
      ),
    [requests, seesAllRequests, user.name, user.role, range],
  );

  const mine = visible.filter((r) => canDecide(r, user.role));
  const overdue = mine.filter((r) => r.dueAt < todayIso());
  const returned = visible.filter((r) => r.status === "RETURNED" && r.requestedBy === user.name);
  const decided = visible.filter((r) => r.status !== "PENDING");

  const rows = useMemo(() => {
    const list =
      tab === "Waiting for me"
        ? mine
        : tab === "Sent by me"
          ? visible.filter((r) => r.requestedBy === user.name)
          : tab === "Decided"
            ? decided
            : visible;
    return [...list].sort((a, b) => (tab === "Waiting for me" ? a.dueAt.localeCompare(b.dueAt) : b.requestedAt.localeCompare(a.requestedAt)));
  }, [tab, mine, visible, decided, user.name]);

  const openId = searchParams.get("request");
  const open = requests.find((r) => r.id === openId) ?? null;
  const setOpen = (r: ApprovalRequest | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (r) params.set("request", r.id);
    else params.delete("request");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <>
      <PageHeader
        title="Approvals"
        extraPills={
          <FilterMenu
            label="Requested"
            value={range}
            options={DATE_RANGE_OPTIONS}
            onChange={(v) => setRange(v as DateRange)}
          />
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={Inbox} label="Waiting for Me" value={String(mine.length)} />
        <StatTile icon={AlarmClock} label="Past Due" value={String(overdue.length)} tone="down" delay={60} />
        <StatTile icon={CornerUpLeft} label="Returned to Me" value={String(returned.length)} delay={120} />
        <StatTile icon={CheckCircle2} label="Decided" value={String(decided.length)} delay={180} />
      </div>

      <FloatCard className="mt-4 overflow-hidden" delay={120}>
        <CardHeader title="Approval Inbox" right={<SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />} />
        <div className="mt-4 overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-pale text-[11px] text-muted-foreground">
                <Th className="rounded-l-xl">Request</Th>
                <Th>Type</Th>
                <Th>Client</Th>
                <Th>Amount (RWF)</Th>
                <Th>Status</Th>
                <Th>Decide by</Th>
                <Th className="rounded-r-xl">Action</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const late = r.status === "PENDING" && r.dueAt < todayIso();
                return (
                  <tr key={r.id} className="cursor-pointer hover:bg-pale/50" onClick={() => setOpen(r)}>
                    <Td>
                      <div className="text-xs font-medium whitespace-nowrap">{r.id}</div>
                      <div className="max-w-[240px] truncate text-[11px] text-muted-foreground">{r.title}</div>
                    </Td>
                    <Td>
                      <Chip tone="sky">{SUBJECT_LABEL[r.subjectType]}</Chip>
                    </Td>
                    <Td className="max-w-[160px] truncate text-xs">{r.client ?? "No client"}</Td>
                    <Td className="text-xs whitespace-nowrap">{r.amount !== undefined ? r.amount.toLocaleString("en-US") : "No amount"}</Td>
                    <Td>
                      <Chip tone={statusTone(r)}>{statusLabel(r)}</Chip>
                    </Td>
                    <Td className={cn("text-xs whitespace-nowrap", late && "font-medium text-danger")}>
                      {r.status === "PENDING" ? formatDate(r.dueAt) : "Decided"}
                    </Td>
                    <Td>
                      <TextLink>{canDecide(r, user.role) ? "Review & decide" : "View"}</TextLink>
                    </Td>
                  </tr>
                );
              })}
              {rows.length === 0 ? (
                <tr>
                  <Td className="text-xs text-muted-foreground" colSpan={7}>
                    {tab === "Waiting for me" ? "Nothing is waiting for your decision." : "No requests in this view."}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </FloatCard>

      <SlideOver open={!!open} onClose={() => setOpen(null)}>
        {open ? <ApprovalPanel key={open.id} request={open} onClose={() => setOpen(null)} onChanged={reload} /> : null}
      </SlideOver>
    </>
  );
}
