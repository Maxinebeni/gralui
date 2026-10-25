"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Search, Settings } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
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
import { listApprovals, listNotifications, type Notice } from "@/lib/api";
import { formatDate, todayIso } from "@/lib/renewals";
import { canDecide } from "@/lib/approvals";
import { CalendarMenu } from "./calendar-menu";
import { GlobalSearch } from "./global-search";

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

  // Approvals waiting for this person, shown as a count in the menus.
  const [waiting, setWaiting] = useState(0);
  // The bell: approvals to decide and this person's own tasks.
  const [notices, setNotices] = useState<Notice[]>([]);
  // Admin pages live in the name menu, not the top bar.
  const adminLinks = navChildrenFor(user, ACCOUNT_MENU);
  useEffect(() => {
    listApprovals()
      .then((list) => setWaiting(list.filter((r) => canDecide(r, user.role)).length))
      .catch(() => setWaiting(0));
    listNotifications(user)
      .then(setNotices)
      .catch(() => setNotices([]));
    // Refreshed on every page change, so finished work drops off the list.
  }, [user.id, user.name, user.role, pathname]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1280px] px-3 py-4 sm:px-6 sm:py-6">
        {/* Phones: logo + icons on row 1, full-width scrollable menu on row 2. */}
        <header className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-4 lg:flex lg:justify-between">
          <Link href="/" className="flex min-w-0 items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/favicon_io/android-chrome-512x512.png"
              alt="Global Risk Advisors Ltd"
              className="h-11 w-auto sm:h-12"
            />
          </Link>

          {/* Administration accounts have no top-bar pages; their pages are in the name menu. */}
          {tabs.length > 0 ? (
          <nav className="float-pill col-span-2 row-start-2 flex w-full min-w-0 items-center justify-between gap-0.5 overflow-x-auto p-1.5 lg:col-auto lg:row-auto lg:w-auto lg:justify-start lg:gap-1">
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
            <IconBtn label="Search (Ctrl+K)" mobile onClick={() => setSearchOpen(true)}>
              <Search className="size-4" />
            </IconBtn>
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={notices.length > 0 ? `Notifications, ${notices.length} new` : "Notifications"}
                className="relative flex size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-[var(--shadow-pill)] outline-none transition-colors hover:text-primary"
              >
                <Bell className="size-4" />
                {notices.length > 0 ? (
                  <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-danger px-1 text-[9px] font-semibold text-white ring-2 ring-background">
                    {notices.length > 99 ? "99+" : notices.length}
                  </span>
                ) : null}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" sideOffset={8} className="w-80 rounded-2xl p-2 shadow-[var(--shadow-float)]">
                <p className="px-3 py-2 text-sm font-semibold">Notifications</p>
                <div className="my-1 h-px bg-border" />
                {notices.length === 0 ? (
                  <p className="px-3 py-3 text-sm text-muted-foreground">You&apos;re all caught up.</p>
                ) : (
                  <div className="max-h-[60vh] overflow-y-auto">
                    {notices.slice(0, 8).map((n) => {
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
                  </div>
                )}
                <div className="my-1 h-px bg-border" />
                <DropdownMenuItem onSelect={() => router.push("/my-work")} className="justify-center rounded-xl px-3 py-2 text-xs font-semibold text-primary">
                  {notices.length > 8 ? `See all ${notices.length} in My Work` : "Open My Work"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <Link
              href="/settings"
              aria-label="Settings"
              className={cn(
                "flex size-10 items-center justify-center rounded-full shadow-[var(--shadow-pill)] transition-colors hover:text-primary",
                pathname.startsWith("/settings") ? "bg-primary text-primary-foreground hover:text-primary-foreground" : "bg-card text-muted-foreground",
              )}
            >
              <Settings className="size-4" />
            </Link>
            <CalendarMenu />
            <DropdownMenu>
              <DropdownMenuTrigger
                aria-label={`${user.name}, ${user.role}. Open your menu`}
                className="flex size-10 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-[var(--shadow-pill)] outline-none"
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
                <DropdownMenuItem
                  onSelect={async () => {
                    try {
                      await signOut();
                    } finally {
                      router.replace("/login");
                    }
                  }}
                  className="rounded-xl px-3 py-2.5 text-sm"
                >
                  <LogOut className="size-4" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        <main className="mt-10 pb-24 sm:mt-14">{children}</main>
      </div>
      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
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

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
      <div className="min-w-0">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>

      <div className="flex min-w-0 flex-wrap items-center gap-2 sm:justify-end">
        {/* Demo-only role switcher (from the design). Hidden once the backend sends
            real permissions, because switching roles would no longer change anything. */}
        {!usesBackendPermissions(user) ? (
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
        {action}
      </div>
    </div>
  );
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />
      <div
        className={cn(
          "relative h-full w-full overflow-y-auto bg-card shadow-[var(--shadow-float)] duration-300 animate-in slide-in-from-right sm:rounded-l-3xl",
          wide ? "max-w-[720px]" : "max-w-[620px]",
        )}
      >
        {children}
      </div>
    </div>
  );
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
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center px-4 pt-16 pb-8 sm:pt-24">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative max-h-[calc(100dvh-8rem)] w-full max-w-[720px] overflow-y-auto rounded-3xl bg-card shadow-[var(--shadow-float)] duration-200 animate-in fade-in zoom-in-95 sm:max-h-[calc(100dvh-10rem)]"
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
