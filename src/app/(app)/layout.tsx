"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NoAccess, Shell } from "@/components/gral/shell";
import { useAuth } from "@/lib/auth-context";
import { canAccessPath } from "@/lib/permissions";

// Every signed-in page lives under this layout: it redirects to /login when
// there is no session, and shows "No access" when the role can't see the page.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  if (!ready || !user) return <div className="min-h-screen bg-background" />;

  return <Shell>{canAccessPath(user.role, pathname) ? children : <NoAccess />}</Shell>;
}
