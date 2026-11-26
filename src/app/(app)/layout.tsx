"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { NoAccess, Shell } from "@/components/gral/shell";
import { Loader } from "@/components/gral/ui";
import { useAuth } from "@/lib/auth-context";
import { canAccessPath, homePathFor } from "@/lib/permissions";
import { loginHref } from "@/lib/return-path";

// Every signed-in page lives under this layout: it redirects to /login when
// there is no session, and shows "No access" when the role can't see the page.
export default function AppLayout({ children }: { children: ReactNode }) {
  const { user, ready, sessionExpired } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // True once someone was signed in on this page, so a deliberate sign-out can be told
  // apart from opening a link while signed out (or the session expiring).
  const hadUser = useRef(false);
  useEffect(() => {
    if (user) hadUser.current = true;
  }, [user]);

  useEffect(() => {
    if (!ready || user) return;
    // Come back to this page after signing in, unless the person chose to sign out.
    const signedOutOnPurpose = hadUser.current && !sessionExpired;
    router.replace(signedOutOnPurpose ? "/login" : loginHref(`${pathname}${window.location.search}`));
  }, [ready, user, sessionExpired, pathname, router]);

  // People who can't see Overview (Administration accounts) start on their own home page.
  const home = user ? homePathFor(user) : "/";
  const redirectHome = !!user && pathname === "/" && home !== "/";
  useEffect(() => {
    if (redirectHome) router.replace(home);
  }, [redirectHome, home, router]);

  if (!ready || !user || redirectHome) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader size="lg" label="Loading GRAL" />
      </div>
    );
  }

  return <Shell>{canAccessPath(user, pathname) ? children : <NoAccess />}</Shell>;
}
