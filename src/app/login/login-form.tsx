"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { NavyButton, OutlineButton } from "@/components/gral/ui";
import { useAuth } from "@/lib/auth-context";

export function LoginForm() {
  const router = useRouter();
  const { user, ready, signIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Already signed in — skip the login screen.
  useEffect(() => {
    if (ready && user) router.replace("/clients");
  }, [ready, user, router]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim() || !password) {
      toast.error("Enter your work email and password.");
      return;
    }
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      router.replace("/clients");
    } catch (err) {
      // Show the backend's message (wrong password, no role, server down) on the page.
      const message =
        err instanceof Error && err.message
          ? err.message
          : "Could not sign in right now. Please try again.";
      setError(message);
      toast.error(message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-3 py-4 sm:px-4">
      <div className="float-card rise-in w-full max-w-md p-5 sm:p-8">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/favicon_io/android-chrome-512x512.png" alt="Global Risk Advisors Ltd" className="h-24 w-auto" />
          <p className="mt-3 text-sm text-muted-foreground">Thinking Beyond Tomorrow.</p>
        </div>

        <form className="mt-7 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
              Work email
            </label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                setError(null);
              }}
              placeholder="name@gral.rw"
              className="mt-1.5 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
            />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground" htmlFor="password">
              Password
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError(null);
              }}
              placeholder="••••••••"
              aria-invalid={error ? true : undefined}
              aria-describedby={error ? "login-error" : undefined}
              className="mt-1.5 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
            />
            {error && (
              <p id="login-error" role="alert" className="mt-2 text-xs font-medium text-danger">
                {error}
              </p>
            )}
            <div className="mt-2 flex justify-end">
              <Link href="/forgot-password" className="text-xs font-medium text-primary hover:opacity-70">
                Forgot password?
              </Link>
            </div>
          </div>

          <NavyButton type="submit" disabled={submitting} className="w-full py-2.5 text-sm">
            {submitting ? "Signing in…" : "Sign In"}
          </NavyButton>
        </form>

        <OutlineButton
          className="mt-3 w-full gap-2.5 py-2.5 text-sm"
          onClick={() => toast.info("Google sign-in will be connected with the backend.")}
        >
          <GoogleIcon />
          Sign in with Google
        </OutlineButton>

        <p className="mt-6 text-center text-[11px] text-subtle">
          Access is assigned by your administrator.
        </p>
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" aria-hidden="true" className="size-5">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}