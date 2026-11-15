"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu, Search, Settings, SlidersHorizontal } from "lucide-react";
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

export function Shell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, signOut } = useCurrentUser();
  const tabs = navItemsFor(user);
  const [searchOpen, setSearchOpen] = useState(false);

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

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));
  // In a dropdown, "/claims" should not also light up on "/claims/all".
  const isActiveExact = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || (pathname.startsWith(href) && !NAV_HREFS.some((h) => h !== href && h.startsWith(href) && pathname.startsWith(h)));

  // The bell has two parts: "To do" (approvals to decide and this person's own
  // tasks, each opening its record) and "Updates" (the backend's notification
  // inbox, pushed live over the socket). All three come from the shared cache:
  // checked every 30 seconds, when the tab gets focus, and on page changes when
  // older than 15 seconds.
  const queryClient = useQueryClient();
  const approvalsQuery = useQuery({
    queryKey: queryKeys.approvals(user.role),
    queryFn: () => listApprovals(),
    refetchInterval: 30_000,
  });
  const tasksQuery = useQuery({
    queryKey: queryKeys.tasks(user.role),
    queryFn: () => listTasks(approvalsQuery.data),
    enabled: approvalsQuery.isSuccess,
    refetchInterval: 30_000,
  });
  const inboxKey = useMemo(() => queryKeys.inbox(user.id ?? user.email), [user.id, user.email]);
  const inboxQuery = useQuery({
    queryKey: inboxKey,
    queryFn: getNotificationInbox,
    enabled: MOCK_AUTH || !!user.id,
    refetchInterval: 30_000,
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
  const unreadNotificationCount = inboxQuery.data?.unreadCount ?? 0;

  // After a page change, finished work should drop off soon.
  const { refetch: refetchApprovals, dataUpdatedAt: approvalsAt } = approvalsQuery;
  useEffect(() => {
    if (Date.now() - approvalsAt > 15_000) void refetchApprovals();
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
      router.push(notificationHref(notification.type));
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
  // Admin pages live in the name menu, not the top bar.
  const adminLinks = navChildrenFor(user, ACCOUNT_MENU);
  const doSignOut = async () => {
    try {
      await signOut();
    } finally {
      router.replace("/login");
    }
  };
  const listed = new Set(tabs.flatMap((t) => [t.href, ...navChildrenFor(user, t.href).map((c) => c.href)]));
  const personalLinks = [
    { label: "My Work", href: "/my-work" },
    { label: "Approvals", href: "/approvals" },
  ].filter((l) => !listed.has(l.href));
  // The phone menu: each top-bar page (with its own pages, if any), then My Work and
  // Approvals if no section lists them, Admin, and Settings.
  const [menuGroup, setMenuGroup] = useState<string | null>(null);
  const phoneGroups = [
    ...tabs.map((t) => {
      const children = navChildrenFor(user, t.href);
      const items = children.length ? [{ label: firstLabel(t), href: t.href }, ...children] : [{ label: t.label, href: t.href }];
      return { key: t.href, label: t.label, items, active: items.some((c) => isActive(c.href)) };
    }),
    ...personalLinks.map((l) => ({ key: l.href, label: l.label, items: [l], active: isActive(l.href) })),
    ...(adminLinks.length ? [{ key: "admin", label: "Admin", items: adminLinks.map((a) => ({ label: a.label, href: a.href })), active: adminLinks.some((a) => isActive(a.href)) }] : []),
    { key: "/settings", label: "Settings", items: [{ label: "Settings", href: "/settings" }], active: isActive("/settings") },
  ];
  const phoneItem = (active: boolean) => cn("justify-between rounded-xl px-3 py-2.5 text-sm", active && "bg-pale font-medium text-primary");
  const waitingBadge = waiting > 0 ? (
    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{waiting}</span>
  ) : null;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1280px] px-4 pt-5 pb-4 sm:px-6 sm:py-6">
        {/* Phones: logo and icons, with every page in the menu button. Tablets: the menu
            pills go on a second row. Desktop: one row. */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 lg:flex lg:justify-between print:hidden">
          {/* The logo goes to this person's home page (Overview, or Users for admin accounts). */}
          <Link
            href={homePathFor(user)}
            aria-label="Global Risk Advisors Ltd, go to the home page"
            title="Home"
            className="flex shrink-0 items-center justify-self-start rounded-xl transition-opacity outline-none hover:opacity-80 focus-visible:ring-2 focus-visible:ring-sky"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/favicon_io/android-chrome-512x512.png"
              alt=""
              className="h-14 w-auto sm:h-16"
            />
          </Link>

          {/* Administration accounts have no top-bar pages; their pages are in the name menu. */}
          {tabs.length > 0 ? (
          <nav aria-label="Main menu" className="float-pill col-span-2 row-start-2 hidden w-full min-w-0 sm:flex items-center justify-between gap-0.5 overflow-x-auto p-1.5 lg:col-auto lg:row-auto lg:w-auto lg:justify-start lg:gap-1">
            {tabs.map((t) => {
              const children = navChildrenFor(user, t.href);
              const active = isActive(t.href) || children.some((c) => isActive(c.href));
              const pillClass = cn(
                "shrink-0 rounded-full px-2.5 py-2 text-xs font-medium transition-colors outline-none sm:px-4 sm:text-sm",
                active
                  ? "bg-primary text-primary-foreground hover:text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              );
              if (children.length === 0) {
                return (
                  <Link key={t.href} href={t.href} className={pillClass}>
                    {t.label}
                  </Link>
                );
              }
              // The chevron opens the item's pages, e.g. Clients, All Clients and Leads.
              // The pill keeps the section's name; the open page is marked in the menu.
              return (
                <DropdownMenu key={t.href}>
                  <DropdownMenuTrigger className={pillClass}>
                    <span className="flex items-center gap-1.5">
                      {t.label}
                      <ChevronDown className="size-3.5 opacity-70" />
                    </span>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" sideOffset={8} className="min-w-56 rounded-2xl p-2 shadow-[var(--shadow-float)]">
                    {[{ label: firstLabel(t), href: t.href }, ...children].map((c) => (
                      <DropdownMenuItem
                        key={c.href}
                        onSelect={() => router.push(c.href)}
                        className={cn("justify-between rounded-xl px-3 py-2.5 text-sm", isActiveExact(c.href) && "font-medium text-primary")}
                      >
                        {c.label}
                        {c.href === "/approvals" && waiting > 0 ? (
                          <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">
                            {waiting}
                          </span>
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              );
            })}
          </nav>
          ) : null}

          <div className="flex shrink-0 items-center gap-2">
            {/* Phones only: a short list of the main pages. A section with more pages
                (Clients: Client Records, All Clients, Leads) opens in place. */}
            <DropdownMenu onOpenChange={(o) => { if (o) setMenuGroup(null); }}>
              <DropdownMenuTrigger
                aria-label="Open menu"
                className="relative order-last flex size-10 items-center justify-center rounded-full bg-card text-primary shadow-[var(--shadow-pill)] outline-none sm:hidden"
              >
                <Menu className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} collisionPadding={16} className="max-h-[75vh] w-56 overflow-y-auto rounded-2xl p-2 shadow-[var(--shadow-float)]">
                {phoneGroups.map((g) =>
                  g.items.length === 1 ? (
                    <DropdownMenuItem key={g.key} onSelect={() => router.push(g.items[0]!.href)} className={phoneItem(g.active)}>
                      {g.label}
                      {g.items[0]!.href === "/approvals" ? waitingBadge : null}
                    </DropdownMenuItem>
                  ) : (
                    <div key={g.key}>
                      <DropdownMenuItem
                        aria-expanded={menuGroup === g.key}
                        onSelect={(e) => {
                          e.preventDefault();
                          setMenuGroup((cur) => (cur === g.key ? null : g.key));
                        }}
                        className={phoneItem(g.active)}
                      >
                        {g.label}
                        <ChevronDown className={cn("size-4 opacity-60 transition-transform", menuGroup === g.key && "rotate-180")} />
                      </DropdownMenuItem>
                      {menuGroup === g.key
                        ? g.items.map((c) => (
                            <DropdownMenuItem
                              key={c.href}
                              onSelect={() => router.push(c.href)}
                              className={cn("ml-3 justify-between rounded-xl px-3 py-2 text-sm text-muted-foreground", isActiveExact(c.href) && "font-medium text-primary")}
                            >
                              {c.label}
                              {c.href === "/approvals" ? waitingBadge : null}
                            </DropdownMenuItem>
                          ))
                        : null}
                    </div>
                  ),
                )}
                <div className="my-1 h-px bg-border" />
                <DropdownMenuItem onSelect={doSignOut} className="rounded-xl px-3 py-2.5 text-sm">
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
            <Link
              href="/settings"
              aria-label="Settings"
              className={cn(
                "hidden size-10 items-center sm:flex justify-center rounded-full shadow-[var(--shadow-pill)] transition-colors hover:text-primary",
                pathname.startsWith("/settings") ? "bg-primary text-primary-foreground hover:text-primary-foreground" : "bg-card text-muted-foreground",
              )}
            >
              <Settings className="size-4" />
            </Link>
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
                  My Work
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => router.push("/approvals")} className="justify-between rounded-xl px-3 py-2.5 text-sm">
                  Approvals
                  {waiting > 0 ? (
                    <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-semibold text-primary-foreground">{waiting}</span>
                  ) : null}
                </DropdownMenuItem>
                {adminLinks.length > 0 ? (
                  <>
                    <div className="my-1 h-px bg-border" />
                    <p className="px-3 pt-2 pb-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Admin</p>
                    {adminLinks.map((a) => (
                      <DropdownMenuItem
                        key={a.href}
                        onSelect={() => router.push(a.href)}
                        className={cn("rounded-xl px-3 py-2.5 text-sm", isActiveExact(a.href) && "font-medium text-primary")}
                      >
                        {a.label}
                      </DropdownMenuItem>
                    ))}
                  </>
                ) : null}
                <div className="my-1 h-px bg-border" />
                <DropdownMenuItem onSelect={doSignOut} className="rounded-xl px-3 py-2.5 text-sm">
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mt-8 pb-12 sm:mt-14 sm:pb-24">{children}</main>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
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
    <div className="grid gap-4 sm:grid-cols-[minmax(min-content,1fr)_auto] sm:items-center sm:gap-3">
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
export function notificationHref(type: string) {
  const t = type.toUpperCase();
  if (t.includes("APPROVAL")) return "/approvals";
  if (t.includes("RENEWAL")) return "/renewals";
  if (t.includes("CLIENT")) return "/clients";
  if (t.includes("CLAIM")) return "/claims";
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
  return { "/": "Overview", "/claims": "Claims Queue", "/clients": "Client Records" }[item.href] ?? item.label;
}
