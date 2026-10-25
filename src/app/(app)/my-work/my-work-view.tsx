"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { AlarmClock, CalendarDays, CheckCircle2, ListTodo, Plus, X } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SlideOver } from "@/components/gral/shell";
import { Td, Th } from "@/components/gral/claim-list";
import { Field, Section, describedBy, inputClass } from "@/components/gral/client-form";
import { CardHeader, Chip, FloatCard, NavyButton, OutlineButton, Person, SegmentedTabs, StatTile, TextLink } from "@/components/gral/ui";
import { cn } from "@/lib/utils";
import {
  completeTask,
  createTask,
  listAssignees,
  listClaims,
  listRenewals,
  listTasks,
  reassignTask,
  type NewTaskInput,
} from "@/lib/api";
import { useCurrentUser } from "@/lib/auth-context";
import { addWorkingDays, workingDaysBetween } from "@/lib/claims";
import { recordHref } from "@/lib/links";
import { canAccessPath, taskPermissions } from "@/lib/permissions";
import { formatDate, todayIso } from "@/lib/renewals";
import type { SessionUser, TaskType, WorkTask } from "@/lib/types";

const TYPE_LABEL: Record<TaskType, string> = {
  CLAIM_STEP: "Claim",
  CLAIM_FOLLOW_UP: "Claim follow-up",
  CLAIM_DISPUTE: "Claims Committee",
  CLAIM_SIGN_OFF: "Sign-off",
  RENEWAL_MILESTONE: "Renewal",
  APPROVAL: "Approval",
  KYC_DOCUMENT: "KYC",
  ONBOARDING_STEP: "Lead",
  MANUAL: "Added by hand",
};

type Tab = "Mine" | "Overdue" | "Next 5 days" | "Team" | "Done";

function isMine(t: WorkTask, user: SessionUser) {
  return t.owner ? t.owner === user.name : t.ownerRole === user.role;
}

function dueTone(t: WorkTask): "danger" | "warning" | "neutral" {
  const today = todayIso();
  if (t.dueDate < today) return "danger";
  if (t.dueDate === today) return "warning";
  return "neutral";
}

function dueText(t: WorkTask) {
  const days = workingDaysBetween(todayIso(), t.dueDate);
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  return formatDate(t.dueDate);
}

export function MyWorkView() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useCurrentUser();
  const { managesTeamWork } = taskPermissions(user.role);
  const tabs: Tab[] = managesTeamWork ? ["Mine", "Overdue", "Next 5 days", "Team", "Done"] : ["Mine", "Overdue", "Next 5 days", "Done"];

  const [tasks, setTasks] = useState<WorkTask[]>([]);
  const [assignees, setAssignees] = useState<string[]>([]);
  const [tab, setTab] = useState<Tab>("Mine");
  const [newOpen, setNewOpen] = useState(false);

  const reload = useCallback(() => {
    listTasks().then(setTasks);
  }, []);
  useEffect(() => {
    reload();
    listAssignees().then(setAssignees);
  }, [reload]);

  // Workflow tasks are done on the record itself, so the row opens it.
  const opensRecord = (t: WorkTask) =>
    t.source === "SYSTEM" && canAccessPath(user, recordHref(t.resourceType, t.resourceId).split("?")[0]!);

  // Counts and lists only include tasks this person may see (their own, or the team's for managers).
  const visible = useMemo(() => tasks.filter((t) => managesTeamWork || isMine(t, user)), [tasks, managesTeamWork, user]);
  const open = visible.filter((t) => t.status === "OPEN");
  const mine = open.filter((t) => isMine(t, user));
  const scope = tab === "Team" ? open : mine;
  const weekEnd = addWorkingDays(todayIso(), 5);

  const rows = useMemo(() => {
    const today = todayIso();
    const list =
      tab === "Done"
        ? visible.filter((t) => t.status === "DONE")
        : tab === "Overdue"
          ? (managesTeamWork ? open : mine).filter((t) => t.dueDate < today)
          : tab === "Next 5 days"
            ? mine.filter((t) => t.dueDate >= today && t.dueDate <= weekEnd)
            : scope;
    return [...list].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [tab, visible, open, mine, scope, managesTeamWork, weekEnd]);

  const selectedId = searchParams.get("task");
  const selected = tasks.find((t) => t.id === selectedId) ?? null;
  const setSelected = (t: WorkTask | null) => {
    const params = new URLSearchParams(searchParams.toString());
    if (t) params.set("task", t.id);
    else params.delete("task");
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const today = todayIso();
  return (
    <>
      <PageHeader
        title="My Work"
        subtitle={`${mine.length} open ${mine.length === 1 ? "task" : "tasks"} for ${user.name}`}
        action={
          <NavyButton className="px-4 py-2 text-sm" onClick={() => setNewOpen(true)}>
            <Plus className="size-4" /> New Task
          </NavyButton>
        }
      />

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile icon={ListTodo} label="My Open Tasks" value={String(mine.length)} />
        <StatTile icon={AlarmClock} label="Overdue" value={String(mine.filter((t) => t.dueDate < today).length)} tone="down" delay={60} />
        <StatTile icon={CalendarDays} label="Due Today" value={String(mine.filter((t) => t.dueDate === today).length)} delay={120} />
        <StatTile
          icon={CheckCircle2}
          label={managesTeamWork ? "Team Open Tasks" : "Done"}
          value={String(managesTeamWork ? open.length : visible.filter((t) => t.status === "DONE").length)}
          delay={180}
        />
      </div>

      <FloatCard className="mt-4 overflow-hidden" delay={120}>
        <CardHeader title="Task List" right={<SegmentedTabs tabs={tabs} value={tab} onChange={setTab} />} />
        <div className="mt-4 overflow-x-auto px-2 pb-4">
          <table className="w-full min-w-[780px] border-separate border-spacing-0 text-left">
            <thead>
              <tr className="bg-pale text-[11px] text-muted-foreground">
                <Th className="rounded-l-xl">Task</Th>
                <Th>Record</Th>
                <Th>Type</Th>
                <Th>Assigned to</Th>
                <Th>Due</Th>
                <Th className="rounded-r-xl">Action</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((t) => (
                <tr
                  key={t.key}
                  className="cursor-pointer hover:bg-pale/50"
                  onClick={() => (opensRecord(t) ? router.push(recordHref(t.resourceType, t.resourceId)) : setSelected(t))}
                >
                  <Td>
                    <div className={cn("max-w-[280px] text-xs font-medium", t.status === "DONE" && "text-muted-foreground line-through")}>
                      {t.title}
                    </div>
                    {t.detail ? <div className="max-w-[280px] truncate text-[11px] text-muted-foreground">{t.detail}</div> : null}
                  </Td>
                  <Td>
                    <div className="text-xs whitespace-nowrap">{t.resourceRef}</div>
                    <div className="max-w-[160px] truncate text-[11px] text-muted-foreground">{t.client ?? ""}</div>
                  </Td>
                  <Td>
                    <Chip tone={t.source === "MANUAL" ? "neutral" : "sky"}>{TYPE_LABEL[t.type]}</Chip>
                  </Td>
                  <Td>
                    <div className="max-w-[150px] truncate">{t.owner ? <Person name={t.owner} /> : <span className="text-xs">{t.ownerRole}</span>}</div>
                  </Td>
                  <Td>
                    {t.status === "DONE" ? (
                      <Chip tone="success">Done</Chip>
                    ) : (
                      <Chip tone={dueTone(t)}>{dueText(t)}</Chip>
                    )}
                  </Td>
                  <Td>
                    <div className="flex items-center gap-3 whitespace-nowrap">
                      <TextLink>{opensRecord(t) ? "Open" : "Details"}</TextLink>
                      {opensRecord(t) && t.status === "OPEN" && (managesTeamWork || isMine(t, user)) ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelected(t);
                          }}
                          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                        >
                          Reassign
                        </button>
                      ) : null}
                    </div>
                  </Td>
                </tr>
              ))}
              {rows.length === 0 ? (
                <tr>
                  <Td className="text-xs text-muted-foreground" colSpan={6}>
                    {tab === "Mine" ? "Nothing assigned to you right now." : "No tasks in this view."}
                  </Td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </FloatCard>

      <SlideOver open={!!selected} onClose={() => setSelected(null)}>
        {selected ? (
          <TaskPanel
            key={selected.key}
            task={selected}
            assignees={assignees}
            canReassign={managesTeamWork || isMine(selected, user)}
            canComplete={selected.source === "MANUAL" && (managesTeamWork || isMine(selected, user))}
            userName={user.name}
            onClose={() => setSelected(null)}
            onChanged={reload}
          />
        ) : null}
      </SlideOver>

      <SlideOver open={newOpen} onClose={() => setNewOpen(false)} wide>
        {newOpen ? (
          <NewTaskForm
            assignees={assignees}
            userName={user.name}
            onClose={() => setNewOpen(false)}
            onCreated={() => {
              reload();
              setTab("Mine");
            }}
          />
        ) : null}
      </SlideOver>
    </>
  );
}

function TaskPanel({
  task: t,
  assignees,
  canReassign,
  canComplete,
  userName,
  onClose,
  onChanged,
}: {
  task: WorkTask;
  assignees: string[];
  canReassign: boolean;
  canComplete: boolean;
  userName: string;
  onClose: () => void;
  onChanged: () => void;
}) {
  const { user } = useCurrentUser();
  const canOpen = canAccessPath(user, recordHref(t.resourceType, t.resourceId).split("?")[0]!);
  const [owner, setOwner] = useState(t.owner ?? "");
  const [note, setNote] = useState("");
  const options = assignees.includes(userName) ? assignees : [userName, ...assignees];

  return (
    <div>
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-4 sm:px-6 sm:py-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Chip tone={t.source === "MANUAL" ? "neutral" : "sky"}>{TYPE_LABEL[t.type]}</Chip>
            {t.status === "DONE" ? <Chip tone="success">Done</Chip> : <Chip tone={dueTone(t)}>{dueText(t)}</Chip>}
          </div>
          <p className="mt-2 text-lg font-semibold tracking-tight">{t.title}</p>
          {t.detail ? <p className="mt-1 text-xs text-muted-foreground">{t.detail}</p> : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {t.resourceRef}
            {t.client ? ` · ${t.client}` : ""} · due {formatDate(t.dueDate)}
          </p>
        </div>
        <button
          type="button"
          aria-label="Close task"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>

      <div className="space-y-5 px-4 py-5 sm:px-6">
        <div className="flex flex-wrap items-center gap-2">
          {canOpen ? (
            <Link
              href={recordHref(t.resourceType, t.resourceId)}
              className="inline-flex min-h-9 items-center rounded-full bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:min-h-0"
            >
              Open {t.resourceRef}
            </Link>
          ) : null}
        </div>

        <section>
          <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Assigned to</h3>
          <p className="mt-2 text-xs">{t.owner ?? `${t.ownerRole} (role)`}</p>
          {canReassign && t.status === "OPEN" ? (
            <div className="mt-2 flex flex-col gap-2 sm:flex-row">
              <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Assign to" className={inputClass()}>
                <option value="">Choose a person</option>
                {options.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
              <OutlineButton
                className="sm:mt-1.5"
                onClick={async () => {
                  try {
                    if (owner === t.owner) return toast.error("This task is already assigned to them.");
                    await reassignTask(t.key, owner, userName);
                    toast.success(`Assigned to ${owner}.`);
                    onChanged();
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Could not reassign the task.");
                  }
                }}
              >
                Reassign
              </OutlineButton>
            </div>
          ) : null}
        </section>

        {canComplete && t.status === "OPEN" ? (
          <section className="rounded-2xl bg-pale p-4">
            <h3 className="text-sm font-semibold">Mark as done</h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="What was done? (optional)"
              aria-label="Completion note"
              className={cn(inputClass(), "text-xs")}
            />
            <NavyButton
              className="mt-2"
              onClick={async () => {
                try {
                  await completeTask(t.id, note, userName);
                  toast.success("Task done.");
                  onChanged();
                } catch (err) {
                  toast.error(err instanceof Error ? err.message : "Could not complete the task.");
                }
              }}
            >
              <CheckCircle2 className="size-3.5" /> Done
            </NavyButton>
          </section>
        ) : null}

        {t.history.length ? (
          <section>
            <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">History</h3>
            <ol className="mt-3 space-y-3">
              {[...t.history].reverse().map((e, i) => (
                <li key={`${e.at}-${i}`} className="flex gap-3">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-sky" />
                  <div>
                    <p className="text-xs">{e.text}</p>
                    <p className="text-[11px] text-subtle">
                      {formatDate(e.at)} · {e.by}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ) : null}
      </div>
    </div>
  );
}

type RecordOption = { value: string; label: string; input: Pick<NewTaskInput, "resourceType" | "resourceId" | "resourceRef" | "client"> };

function NewTaskForm({
  assignees,
  userName,
  onClose,
  onCreated,
}: {
  assignees: string[];
  userName: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [records, setRecords] = useState<RecordOption[]>([]);
  const [title, setTitle] = useState("");
  const [detail, setDetail] = useState("");
  const [record, setRecord] = useState("");
  const [owner, setOwner] = useState(userName);
  const [due, setDue] = useState(addWorkingDays(todayIso(), 2));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const options = assignees.includes(userName) ? assignees : [userName, ...assignees];

  useEffect(() => {
    Promise.all([listClaims(), listRenewals()]).then(([claims, renewals]) =>
      setRecords([
        ...claims.map((c) => ({
          value: `CLAIM:${c.id}`,
          label: `${c.id} · ${c.client}`,
          input: { resourceType: "CLAIM" as const, resourceId: c.id, resourceRef: c.id, client: c.client },
        })),
        ...renewals.map((r) => ({
          value: `RENEWAL:${r.id}`,
          label: `${r.id} · ${r.client} · ${r.classOfInsurance}`,
          input: { resourceType: "RENEWAL" as const, resourceId: r.id, resourceRef: r.id, client: r.client },
        })),
      ]),
    );
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!title.trim()) found.title = "Say what needs to be done.";
    if (!record) found.record = "Choose the claim or renewal this is about.";
    if (!due) found.due = "Choose a due date.";
    else if (due < todayIso()) found.due = "The due date cannot be in the past.";
    setErrors(found);
    if (Object.keys(found).length) return;
    try {
      const chosen = records.find((r) => r.value === record)!;
      await createTask({ title, detail: detail.trim() || undefined, owner, dueDate: due, ...chosen.input }, userName);
      toast.success("Task added.");
      onCreated();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not add the task.");
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex min-h-full flex-col">
      <div className="flex items-start justify-between gap-4 border-b border-border px-6 py-5">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">New Task</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            For work that is not already a step on a claim, renewal or approval. Those appear in My Work by themselves.
          </p>
        </div>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex size-9 shrink-0 items-center justify-center rounded-full bg-secondary text-muted-foreground hover:text-foreground"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="flex-1 space-y-6 px-6 py-5">
        <Section title="Task">
          <Field id="title" label="What needs to be done" error={errors.title} wide>
            <input id="title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Call the client about the police report" className={inputClass(errors.title)} {...describedBy("title", errors.title)} />
          </Field>
          <Field id="detail" label="Details (optional)" wide>
            <textarea id="detail" rows={2} value={detail} onChange={(e) => setDetail(e.target.value)} className={inputClass()} />
          </Field>
          <Field id="record" label="Related record" error={errors.record} wide>
            <select id="record" value={record} onChange={(e) => setRecord(e.target.value)} className={inputClass(errors.record)} {...describedBy("record", errors.record)}>
              <option value="">Choose a claim or renewal</option>
              {records.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </Field>
          <Field id="owner" label="Assign to">
            <select id="owner" value={owner} onChange={(e) => setOwner(e.target.value)} className={inputClass()}>
              {options.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>
          <Field id="due" label="Due date" error={errors.due}>
            <input id="due" type="date" min={todayIso()} value={due} onChange={(e) => setDue(e.target.value)} className={inputClass(errors.due)} {...describedBy("due", errors.due)} />
          </Field>
        </Section>
      </div>
      <div className="sticky bottom-0 flex justify-end gap-2 border-t border-border bg-card px-6 py-4">
        <OutlineButton onClick={onClose} className="px-4 py-2 text-sm">
          Cancel
        </OutlineButton>
        <NavyButton type="submit" className="px-4 py-2 text-sm">
          Add Task
        </NavyButton>
      </div>
    </form>
  );
}
