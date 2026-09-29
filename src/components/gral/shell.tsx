"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Search, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { initials } from "@/lib/format";
import { useCurrentUser } from "@/lib/auth-context";
import { navItemsFor } from "@/lib/permissions";
import { FilterPill } from "./ui";

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
  const tabs = navItemsFor(user.role);

  const isActive = (href: string) => (href === "/" ? pathname === "/" : pathname.startsWith(href));

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6">
        <header className="flex items-center justify-between gap-4">
          <Link href="/" className="flex items-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/favicon_io/android-chrome-512x512.png" alt="Global Risk Advisors Ltd" className="h-12 w-auto" />
          </Link>

          <nav className="float-pill order-3 flex w-full items-center gap-1 overflow-x-auto p-1.5 lg:order-none lg:w-auto">
            {tabs.map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className={cn(
                  "shrink-0 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  isActive(t.href)
                    ? "bg-primary text-primary-foreground hover:text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <span className="flex items-center gap-1.5">
                  {t.label}
                  <ChevronDown className="size-3.5 opacity-70" />
                </span>
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-2">
            <IconBtn label="Search clients" onClick={() => router.push("/clients")}>
              <Search className="size-4" />
            </IconBtn>
            <IconBtn label="Notifications">
              <Bell className="size-4" />
            </IconBtn>
            <IconBtn label="Settings">
              <Settings className="size-4" />
            </IconBtn>
            <IconBtn
              label="Sign out"
              onClick={() => {
                signOut();
                router.replace("/login");
              }}
            >
              <LogOut className="size-4" />
            </IconBtn>
            <span
              title={`${user.name} · ${user.role}`}
              className="flex size-10 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground shadow-[var(--shadow-pill)]"
            >
              {initials(user.name).toUpperCase()}
            </span>
          </div>
        </header>

        <main className="mt-6 pb-24">{children}</main>
      </div>
    </div>
  );
}

function IconBtn({
  children,
  label,
  onClick,
}: {
  children: ReactNode;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="hidden size-10 items-center justify-center rounded-full bg-card text-muted-foreground shadow-[var(--shadow-pill)] transition-colors hover:text-primary sm:flex"
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
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {/* Demo-only role switcher (from the design). Remove once real roles come from the backend. */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className="float-pill flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium"
            >
              <span className="text-muted-foreground">Role:</span>
              <span>{user.role}</span>
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
        {extraPills}
        <FilterPill label="Date Range" value="Last 30 days" />
        {action}
      </div>
    </div>
  );
}

export function SlideOver({
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
    <div className="fixed inset-0 z-50 flex justify-end">
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="absolute inset-0 bg-foreground/25 backdrop-blur-[2px]"
      />
      <div className="relative h-full w-full max-w-[620px] overflow-y-auto rounded-l-3xl bg-card shadow-[var(--shadow-float)] duration-300 animate-in slide-in-from-right">
        {children}
      </div>
    </div>
  );
}

/** Shown when the current role is not allowed on a page. */
export function NoAccess() {
  const { user } = useCurrentUser();
  return (
    <div className="flex justify-center pt-16">
      <div className="float-card rise-in max-w-md p-8 text-center">
        <h1 className="text-xl font-semibold tracking-tight">No access</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The {user.role} role does not have access to this page.
        </p>
        <Link
          href="/clients"
          className="mt-6 inline-flex items-center justify-center rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
        >
          Go to Clients
        </Link>
      </div>
    </div>
  );
}
