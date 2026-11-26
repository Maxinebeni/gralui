"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, BarChart3, BriefcaseBusiness, ChevronDown, ClipboardList, Database, FileText, Home, KeyRound, LogOut, Menu, PanelLeftClose, PanelLeftOpen, RefreshCw, Search, Settings, ShieldCheck, SlidersHorizontal, UserCog, UserPlus, Users, X, type LucideIcon } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { initials, timeAgo } from "@/lib/format";
import { useCurrentUser } from "@/lib/auth-context";
import {
  ACCOUNT_MENU,
  NAV_ITEMS,
  homePathFor,
  navChildrenFor,
  navItemsFor,
  usesBackendPermissions,
  type NavItem,
} from "@/lib/permissions";
import {
  MOCK_AUTH,
  getNotificationInbox,
  buildNotices,
  listApprovals,
  listTasks,
  markNotificationRead,
  type InboxNotification,
  type NotificationInbox,
} from "@/lib/api";
import { queryKeys } from "@/lib/query";
import { formatDate, todayIso } from "@/lib/renewals";
import { canDecide } from "@/lib/approvals";
import { trapTab } from "@/lib/focus-trap";
import { CalendarMenu } from "./calendar-menu";
import { GlobalSearch } from "./global-search";
import { NotificationRealtime } from "./notification-realtime";
import { toast } from "sonner";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageMemory } from "./back-link";

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useCurrentUser();
  const tabs = navItemsFor(user);
  const [searchOpen, setSearchOpen] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const navPanel = useDialog(navOpen, () => setNavOpen(false));

  // Ctrl+K (Cmd+K on Mac) opens the platform search from any page.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // In a dropdown, "/claims" should not also light up on "/claims/all".
  const isActiveExact = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || (pathname.startsWith(href) && !NAV_HREFS.some((h) => h !== href && h.startsWith(href) && pathname.startsWith(h)));

  // The bell has two parts: "To do" (approvals to decide and this person's own
  // tasks, each opening its record) and "Updates" (the backend's notification
  // inbox, pushed live over the socket). All three come from the shared cache:
  // checked every minute, and on page changes when older than a minute.
  const queryClient = useQueryClient();
  const approvalsQuery = useQuery({
    queryKey: queryKeys.approvals(user.role),
    queryFn: () => listApprovals(),
    refetchInterval: 60_000,
  });
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(user.role),
    queryFn: () => listTasks(approvalsQuery.data),
    enabled: approvalsQuery.isSuccess,
    refetchInterval: 60_000,
  });
  const inboxKey = useMemo(() => queryKeys.inbox(user.id ?? user.email), [user.id, user.email]);
  const inboxQuery = useQuery({
    queryKey: inboxKey,
    queryFn: getNotificationInbox,
    enabled: MOCK_AUTH || !!user.id,
    refetchInterval: 60_000,
  });

  // Approvals waiting for this person, shown as a count in the menus.
  const waiting = useMemo(
    () => (approvalsQuery.data ?? []).filter((r) => canDecide(r, user.role)).length,
    [approvalsQuery.data, user.role],
  );
  const notices = useMemo(
    () => buildNotices(approvalsQuery.data ?? [], tasksQuery.data ?? [], user),
    [approvalsQuery.data, tasksQuery.data, user],
  );
  const notifications = inboxQuery.data?.items ?? [];
  // "New approval" and "task assigned" updates are the same work as the To do
  // items above, so the bell does not count them twice.
  const unreadNotificationCount = Math.max(
    0,
    (inboxQuery.data?.unreadCount ?? 0) -
      (notices.length ? notifications.filter((n) => !n.readAt && /APPROVAL_REQUESTED|TASK_ASSIGNED/i.test(n.type)).length : 0),
  );

  // After a page change, finished work drops off if the list is over a minute old.
  const { refetch: refetchApprovals, dataUpdatedAt: approvalsAt } = approvalsQuery;
  useEffect(() => {
    if (Date.now() - approvalsAt > 60_000) void refetchApprovals();
  }, [pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  const refreshNotifications = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: inboxKey });
  }, [queryClient, inboxKey]);
  const receiveNotification = useCallback(
    (notification: InboxNotification) => {
      let added = false;
      queryClient.setQueryData<NotificationInbox>(inboxKey, (current) => {
        const items = current?.items ?? [];
        if (items.some((item) => item.id === notification.id)) return current;
        added = true;
        return {
          items: [notification, ...items].slice(0, 20),
          unreadCount: (current?.unreadCount ?? 0) + (notification.readAt ? 0 : 1),
        };
      });
      if (added) toast(notification.title, { description: notification.body });
    },
    [queryClient, inboxKey],
  );
  const openNotification = useCallback(
    async (notification: InboxNotification) => {
      router.push(notificationHref(notification.type, notification.targetType, notification.targetId));
      if (notification.readAt) return;
      try {
        await markNotificationRead(notification.id);
        queryClient.setQueryData<NotificationInbox>(inboxKey, (current) =>
          current
            ? {
                items: current.items.map((item) => (item.id === notification.id ? { ...item, readAt: new Date().toISOString() } : item)),
                unreadCount: Math.max(0, current.unreadCount - 1),
              }
            : current,
        );
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Could not mark the notification as read.");
      }
    },
    [router, queryClient, inboxKey],
  );
  // Role-specific pages live in the sidebar; shared work links stay together.
  const adminLinks = navChildrenFor(user, ACCOUNT_MENU);
  const doSignOut = async () => {
    try {
      await signOut();
    } finally {
      router.replace("/login");
    }
  };
  const workspaceLinks = [
    ...tabs.filter((item) => item.href === "/").map((item) => ({ label: firstLabel(item), href: item.href })),
    ...navChildrenFor(user, "/").map(({ label, href }) => ({ label, href })),
  ];
  const clientTab = tabs.find((item) => item.href === "/clients");
  const claimTab = tabs.find((item) => item.href === "/claims");
  const sideGroups: SidebarGroup[] = [
    { label: "Workspace", links: workspaceLinks },
    ...(clientTab ? [{ label: "Clients", links: [{ label: firstLabel(clientTab), href: clientTab.href }, ...navChildrenFor(user, clientTab.href)] }] : []),
    ...(claimTab ? [{ label: "Claims", links: [{ label: firstLabel(claimTab), href: claimTab.href }, ...navChildrenFor(user, claimTab.href)] }] : []),
    {
      label: "Operations",
      links: tabs.filter((item) => !["/", "/clients", "/claims"].includes(item.href)).map((item) => ({ label: item.label, href: item.href })),
    },
    ...(adminLinks.length ? [{ label: "Administration", links: adminLinks.map(({ label, href }) => ({ label, href })) }] : []),
  ].filter((group) => group.links.length > 0);
  return (
    <div className="min-h-screen bg-background">
      <a
        href="#main"
        className="sr-only z-[80] rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Skip to main content
      </a>
      <div className="w-full px-4 pt-5 pb-4 sm:px-6 sm:py-6 lg:px-0">
        <div className={cn("lg:grid lg:gap-3", sidebarCollapsed ? "lg:grid-cols-[76px_minmax(0,1fr)]" : "lg:grid-cols-[240px_minmax(0,1fr)]")}>
          <aside className="relative hidden lg:block print:hidden">
            <div className={cn("fixed inset-y-0 left-0 z-20 border-r border-border bg-card px-3 py-5", sidebarCollapsed ? "w-[76px]" : "w-[240px]")}>
            <div className="flex h-full min-h-0 flex-col overflow-hidden">
              {sidebarCollapsed ? (
                <div className="flex flex-col items-center gap-2">
                  <Link href={homePathFor(user)} aria-label="Global Risk Advisors Ltd home" title="Global Risk Advisors Ltd" className="flex size-10 items-center justify-center overflow-hidden rounded-xl bg-card p-1">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/favicon_io/android-chrome-512x512.png" alt="" className="size-full object-contain" />
                  </Link>
                  <button type="button" onClick={() => setSidebarCollapsed(false)} aria-label="Expand sidebar" aria-expanded="false" title="Expand sidebar" className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <PanelLeftOpen aria-hidden="true" className="size-4" />
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <SidebarBrand home={homePathFor(user)} />
                  <button type="button" onClick={() => setSidebarCollapsed(true)} aria-label="Collapse sidebar" aria-expanded="true" title="Collapse sidebar" className="flex size-9 shrink-0 items-center justify-center rounded-xl text-muted-foreground hover:bg-secondary hover:text-foreground">
                    <PanelLeftClose aria-hidden="true" className="size-4" />
                  </button>
                </div>
              )}
              <SidebarLinks groups={sideGroups} isActiveExact={isActiveExact} waiting={waiting} collapsed={sidebarCollapsed} />
              <div className="mt-2 border-t border-border pt-2">
                <Link href="/settings" title={sidebarCollapsed ? "Settings" : undefined} aria-label={sidebarCollapsed ? "Settings" : undefined} aria-current={isActiveExact("/settings") ? "page" : undefined} className={sidebarLinkClass(isActiveExact("/settings"), sidebarCollapsed)}>
                  <Settings aria-hidden="true" className="size-4 shrink-0" />
                  {!sidebarCollapsed ? <span>Settings</span> : null}
                </Link>
              </div>
            </div>
            </div>
          </aside>

          {/* Pages sit in a centred column with room at both sides, as they did before the sidebar. */}
          <div className="mx-auto w-full min-w-0 max-w-[1320px] lg:px-8">
        <header className="flex min-w-0 items-center justify-between gap-3 print:hidden">
          <div className="flex min-w-0 items-center gap-2 lg:hidden">
            <button
              type="button"
              aria-label="Open navigation"
              aria-expanded={navOpen}
              aria-controls="mobile-navigation-dialog"
              onClick={() => setNavOpen(true)}
              className="flex size-10 shrink-0 items-center justify-center rounded-full bg-card text-primary shadow-[var(--shadow-pill)] outline-none"
            >
              <Menu aria-hidden="true" className="size-4" />
            </button>
          </div>

          <div className="ml-auto flex shrink-0 items-center gap-2">
            <IconBtn label="Search (Ctrl+K)" mobile onClick={() => setSearchOpen(true)}>
              <Search className="size-4" />
            </IconBtn>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={notices.length + unreadNotificationCount > 0 ? `Notifications, ${notices.length + unreadNotificationCount} new` : "Notifications"}
                className="relative flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-[var(--shadow-pill)] outline-none transition-colors hover:text-primary"
              >
                <Bell className="size-4" />
                {notices.length + unreadNotificationCount > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white ring-2 ring-background">
                    {notices.length + unreadNotificationCount > 99 ? "99+" : notices.length + unreadNotificationCount}
                  </span>
                ) : null}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-80 rounded-2xl p-2 shadow-[var(--shadow-float)]">
                <p className="px-3 py-2 text-sm font-semibold">Notifications</p>
                <div className="my-1 h-px bg-border" />
                <div className="max-h-[65vh] overflow-y-auto">
                  {notices.length === 0 && notifications.length === 0 ? (
                    <p className="px-3 py-3 text-sm text-muted-foreground">You&apos;re all caught up.</p>
                  ) : null}

                  {notices.length ? <p className="px-3 pt-2 pb-1 text-[10px] font-semibold tracking-wide text-subtle uppercase">To do</p> : null}
                  {notices.slice(0, 6).map((n) => {
                    const late = n.due < todayIso();
                    return (
                      <DropdownMenuItem key={n.key} onSelect={() => router.push(n.href)} className="items-start gap-2.5 rounded-xl px-3 py-2.5">
                        <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", late ? "bg-danger" : "bg-sky")} />
                        <span className="min-w-0">
                          <span className="block text-xs font-medium text-foreground">{n.title}</span>
                          <span className="block truncate text-[11px] text-muted-foreground">
                            {[n.detail, `${late ? "Overdue since" : "Due"} ${formatDate(n.due)}`].filter(Boolean).join(" · ")}
                          </span>
                        </span>
                      </DropdownMenuItem>
                    );
                  })}
                  {notices.length > 6 ? (
                    <DropdownMenuItem onSelect={() => router.push("/my-work")} className="rounded-xl px-3 py-2 text-xs font-semibold text-primary">
                      See all {notices.length} in My Work
                    </DropdownMenuItem>
                  ) : null}

                  {notifications.length ? <p className="px-3 pt-3 pb-1 text-[10px] font-semibold tracking-wide text-subtle uppercase">Updates</p> : null}
                  {notifications.map((notification) => (
                    <DropdownMenuItem
                      key={notification.id}
                      onSelect={() => void openNotification(notification)}
                      className={cn("items-start gap-2.5 rounded-xl px-3 py-2.5", !notification.readAt && "bg-primary/5")}
                    >
                      <span className={cn("mt-1.5 size-2 shrink-0 rounded-full", notification.readAt ? "bg-muted-foreground/30" : "bg-primary")} />
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-foreground">{notification.title}</span>
                        <span className="mt-0.5 block line-clamp-2 text-[11px] text-muted-foreground">{notification.body}</span>
                        <span className="mt-1 block text-[10px] text-subtle">{timeAgo(notification.createdAt)}</span>
                      </span>
                    </DropdownMenuItem>
                  ))}
                </div>
                <div className="my-1 h-px bg-border" />
                <DropdownMenuItem onSelect={() => router.push("/notifications")} className="rounded-xl px-3 py-2 text-xs font-semibold text-primary">
                  See all notifications
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <CalendarMenu />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`${user.name}, ${user.role}. Open your menu`}
                className="hidden size-10 sm:flex items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-[var(--shadow-pill)] outline-none"
              >
                {initials(user.name).toUpperCase()}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="min-w-60 rounded-2xl p-2 shadow-[var(--shadow-float)]">
                <div className="px-3 py-2">
                  <p className="text-sm font-semibold">{user.name}</p>
                  <p className="text-xs text-muted-foreground">{user.role}</p>
                </div>
                <div className="my-1 h-px bg-border" />
                <DropdownMenuItem onSelect={() => router.push("/my-work")} className="rounded-xl px-3 py-2.5 text-sm">
                  My work
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/approvals")} className="justify-between rounded-xl px-3 py-2.5 text-sm">
                  Approvals
                  {waiting > 0 ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{waiting}</span>
                  ) : null}
                </DropdownMenuItem>
                <div className="my-1 h-px bg-border" />
                <DropdownMenuItem onSelect={doSignOut} className="rounded-xl px-3 py-2.5 text-sm">
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="mt-8 pb-12 outline-none sm:mt-10 sm:pb-24">{children}</main>
          </div>
        </div>
      </div>
      {navOpen ? (
        <div className="fixed inset-0 z-[70] lg:hidden print:hidden">
          <button type="button" tabIndex={-1} aria-label="Close navigation" onClick={() => setNavOpen(false)} className="absolute inset-0 bg-foreground/35 backdrop-blur-[2px]" />
          <div ref={navPanel} id="mobile-navigation-dialog" role="dialog" aria-modal="true" aria-labelledby="mobile-navigation-title" tabIndex={-1} className="relative flex h-full w-[min(88vw,340px)] flex-col bg-card p-4 shadow-[var(--shadow-float)] outline-none">
            <div className="flex items-center justify-between gap-3">
              <h2 id="mobile-navigation-title" className="sr-only">Main navigation</h2>
              <SidebarBrand home={homePathFor(user)} />
              <button type="button" aria-label="Close navigation" onClick={() => setNavOpen(false)} className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-foreground">
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
            <SidebarLinks groups={sideGroups} isActiveExact={isActiveExact} waiting={waiting} onNavigate={() => setNavOpen(false)} />
            <div className="mt-2 border-t border-border pt-2">
              <Link href="/settings" onClick={() => setNavOpen(false)} aria-current={isActiveExact("/settings") ? "page" : undefined} className={sidebarLinkClass(isActiveExact("/settings"))}>
                <Settings aria-hidden="true" className="size-4 shrink-0" />
                <span>Settings</span>
              </Link>
              <button type="button" onClick={doSignOut} className={sidebarLinkClass(false)}>
                <LogOut aria-hidden="true" className="size-4 shrink-0" />
                <span>Sign out</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <PageMemory />
      <NotificationRealtime userId={user.id} onNotification={receiveNotification} onSync={refreshNotifications} />
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
  mobile = false,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
  /** Also show on phones (other icon buttons are hidden below the sm breakpoint). */
  mobile?: boolean;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className={cn(
        "size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-[var(--shadow-pill)] transition-colors hover:text-primary",
        mobile ? "flex" : "hidden sm:flex",
      )}
    >
      {children}
    </button>
  );
}

type SidebarLink = { label: string; href: string };
type SidebarGroup = { label: string; links: SidebarLink[] };

function sidebarLinkClass(active: boolean, collapsed = false) {
  return cn(
    "flex min-h-10 w-full items-center gap-2.5 rounded-xl py-2 text-sm transition-colors focus-visible:outline-none",
    collapsed ? "justify-center px-2" : "px-3",
    active ? "bg-primary/10 font-semibold text-primary" : "text-muted-foreground hover:bg-secondary hover:text-foreground",
  );
}

function SidebarBrand({ home }: { home: string }) {
  return (
    <div className="min-w-0 flex-1 px-1 py-2">
      <Link href={home} aria-label="Global Risk Advisors Ltd, go to the home page" className="flex w-full items-center rounded-2xl bg-card p-1.5 focus-visible:outline-none">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/gral-logo.png" alt="" className="h-auto w-[120px] max-w-full" />
      </Link>
    </div>
  );
}

function SidebarLinks({
  groups,
  isActiveExact,
  waiting,
  collapsed = false,
  onNavigate,
}: {
  groups: SidebarGroup[];
  isActiveExact: (href: string) => boolean;
  waiting: number;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  return (
    <nav aria-label="Main navigation" className={cn("mt-4 min-h-0 flex-1 space-y-4 overflow-y-auto px-1 pb-2", collapsed && "space-y-2")}>
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          {!collapsed ? <h2 className="px-3 pb-1.5 text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">{group.label}</h2> : null}
          <ul className="space-y-0.5">
            {group.links.map((link) => {
              const active = isActiveExact(link.href);
              const Icon = sidebarIconFor(link.href);
              return (
                <li key={link.href}>
                  <Link href={link.href} onClick={onNavigate} title={collapsed ? link.label : undefined} aria-label={collapsed ? link.label : undefined} aria-current={active ? "page" : undefined} className={sidebarLinkClass(active, collapsed)}>
                    <Icon aria-hidden="true" className="size-4 shrink-0" />
                    {!collapsed ? <span className="min-w-0 flex-1 truncate">{link.label}</span> : null}
                    {!collapsed && link.href === "/approvals" && waiting > 0 ? (
                      <span aria-label={`${waiting} approvals waiting for you`} className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{waiting}</span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </nav>
  );
}

function sidebarIconFor(href: string): LucideIcon {
  if (href === "/") return Home;
  if (href === "/my-work") return BriefcaseBusiness;
  if (href === "/approvals") return ClipboardList;
  if (href === "/clients") return Users;
  if (href === "/clients/all") return Users;
  if (href === "/clients/leads") return UserPlus;
  if (href === "/claims" || href === "/claims/all") return ShieldCheck;
  if (href === "/insurer-products") return FileText;
  if (href === "/renewals") return RefreshCw;
  if (href === "/reports") return BarChart3;
  if (href === "/imports") return Database;
  if (href === "/admin") return UserCog;
  if (href === "/admin/roles") return KeyRound;
  return FileText;
}

export function PageHeader({
  title,
  subtitle,
  extraPills,
  action,
}: {
  title: string;
  subtitle?: string;
  extraPills?: ReactNode;
  action?: ReactNode;
}) {
  const { user, roles, setRole } = useCurrentUser();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const showRoles = !usesBackendPermissions(user);
  const hasFilters = showRoles || !!extraPills;

  return (
    <div className="mb-6 grid gap-4 sm:grid-cols-[minmax(min-content,1fr)_auto] sm:items-center sm:gap-3">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight [overflow-wrap:anywhere] sm:text-3xl sm:[overflow-wrap:break-word]">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>

      {/* Phones: the filters fold behind one button; the page's own buttons stay in view. */}
      {hasFilters || action ? (
        <div className="flex flex-wrap items-center gap-2 sm:hidden print:hidden [&_a]:px-3.5 [&_a]:text-xs [&_button]:px-3.5 [&_button]:text-xs">
          {hasFilters ? (
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              aria-expanded={filtersOpen}
              className={cn(
                "float-pill flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium",
                filtersOpen && "bg-primary text-primary-foreground",
              )}
            >
              <SlidersHorizontal className="size-3.5" /> Filters
            </button>
          ) : null}
          {action}
        </div>
      ) : null}

      <div
        className={cn(
          "min-w-0 flex-wrap items-center gap-2 sm:flex sm:justify-end print:hidden",
          filtersOpen && hasFilters ? "flex" : "hidden",
        )}
      >
        {/* Demo-only role switcher (from the design). Hidden once the backend sends
            real permissions, because switching roles would no longer change anything. */}
        {showRoles ? (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="float-pill flex max-w-full items-center gap-1.5 px-3.5 py-2 text-xs font-medium"
              >
                <span className="text-muted-foreground">Role:</span>
                <span className="truncate">{user.role}</span>
                <ChevronDown className="size-3.5 text-subtle" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="rounded-xl">
              {roles.map((r) => (
                <DropdownMenuItem
                  key={r}
                  onSelect={() => setRole(r)}
                  className={cn("text-xs", r === user.role && "text-primary")}
                >
                  {r}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
        {extraPills}
        {action ? <div className="hidden flex-wrap items-center gap-2 sm:flex">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * Keyboard and screen-reader behaviour shared by the side panel and the pop-up:
 * focus moves into the dialog when it opens, Escape closes it, and focus goes
 * back to whatever opened it.
 */
function useDialog(open: boolean, onClose: () => void) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panel.current?.focus({ preventScroll: true });
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) close.current();
      trapTab(e, panel.current);
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener?.focus?.({ preventScroll: true });
    };
  }, [open]);
  return panel;
}

export function SlideOver({
  open,
  onClose,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** Wider panel for forms (720px instead of 620px). */
  wide?: boolean;
  children: ReactNode;
}) {
  const panel = useDialog(open, onClose);
  if (!open || typeof document === "undefined") return null;
  // Rendered on <body> so an animated card around it cannot trap the fixed panel.
  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className={cn(
          "relative h-full w-full overflow-y-auto bg-card shadow-[var(--shadow-float)] outline-none duration-300 animate-in slide-in-from-right sm:rounded-l-3xl",
          wide ? "max-w-[720px]" : "max-w-[620px]",
        )}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

/** Backend notifications carry no link, so each opens the area its type belongs to. */
/** The page a notification opens, from its type. */
export function notificationHref(type: string, targetType?: string | null, targetId?: string | null) {
  // Newer notices name their record, so they open it rather than the section.
  if (targetId) {
    const id = encodeURIComponent(targetId);
    switch ((targetType ?? "").toUpperCase()) {
      case "APPROVAL":
        return `/approvals?request=${id}`;
      case "TASK":
        return `/my-work?task=${id}`;
      case "RENEWAL":
        // The renewals screen keys cases by their short reference.
        return `/renewals?case=REN-${targetId.slice(0, 8).toUpperCase()}`;
      case "CLIENT":
        return `/clients?client=${id}`;
    }
  }
  const t = type.toUpperCase();
  if (t.includes("APPROVAL")) return "/approvals";
  if (t.includes("RENEWAL")) return "/renewals";
  if (t.includes("LEAD")) return "/clients/leads";
  if (t.includes("CLIENT")) return "/clients";
  if (t.includes("CLAIM")) return "/claims";
  if (t.includes("PASSWORD") || t.includes("MFA") || t.includes("IDENTITY")) return "/settings";
  // Task updates (assigned, due soon, overdue) open My Work, where each task links to its record.
  return "/my-work";
}

/** A centred pop-up for forms, set a little below the top of the screen. */
export function CenteredModal({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const panel = useDialog(open, onClose);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 pb-8 sm:pt-24">
      <button
        type="button"
        tabIndex={-1}
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />
      <div
        ref={panel}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        className="relative max-h-[calc(100dvh-8rem)] w-full max-w-[720px] overflow-y-auto rounded-3xl bg-card shadow-[var(--shadow-float)] outline-none duration-200 animate-in fade-in zoom-in-95 sm:max-h-[calc(100dvh-10rem)]"
      >
        {children}
      </div>
    </div>
  );
}

/** Shown when the current role is not allowed on a page. */
export function NoAccess() {
  const { user } = useCurrentUser();
  const home = homePathFor(user);
  return (
    <div className="flex justify-center pt-16">
      <div className="float-card rise-in max-w-md p-5 text-center sm:p-8">
        <h1 className="text-xl font-semibold tracking-tight">No access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {usesBackendPermissions(user)
            ? "Your account does not have access to this page. Ask your administrator if you need it."
            : `The ${user.role} role does not have access to this page.`}
        </p>
        <Link
          href={home}
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          {home === "/" ? "Go to Overview" : "Go to my home page"}
        </Link>
      </div>
    </div>
  );
}

const NAV_HREFS = NAV_ITEMS.map((i) => i.href);

/** The first entry of a dropdown repeats the item itself, under a clearer name. */
function firstLabel(item: NavItem) {
  return { "/": "Overview", "/claims": "Claims queue", "/clients": "Client records" }[item.href] ?? item.label;
}
