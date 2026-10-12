"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Circle, KeyRound, LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { InvalidLinkError, acceptInvitation, confirmPasswordReset } from "@/lib/api";
import { NavyButton } from "./ui";

// Backend rule (IdentityRecoveryService): 15+ characters, at most 72 bytes,
// used exactly as typed (no trimming).
const MIN_CHARS = 15;
const MAX_BYTES = 72;

const COPY = {
  reset: {
    title: "Set a new password",
    intro: "Choose a new password for your GRAL account.",
    button: "Save New Password",
    doneTitle: "Password updated",
    doneText: "Your password has been changed. Sign in with your new password.",
  },
  invitation: {
    title: "Welcome to GRAL",
    intro: "Create a password to activate your account.",
    button: "Create Password",
    doneTitle: "Account activated",
    doneText: "Your password has been set. Sign in to get started.",
  },
} as const;

const INPUT =
  "mt-1.5 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

export function SetPasswordForm({ mode }: { mode: "reset" | "invitation" }) {
  const copy = COPY[mode];
  // undefined = still reading the link, null = no token in the link.
  const [token, setToken] = useState<string | null | undefined>(undefined);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [linkError, setLinkError] = useState(false);

  // The email link carries the token after "#token=". Read it once, then
  // remove it from the address bar so it isn't kept in history or shared.
  // The ref stops a second run (React dev mode runs effects twice) from
  // seeing the already-cleared address and wiping the token.
  const tokenRead = useRef(false);
  useEffect(() => {
    if (tokenRead.current) return;
    tokenRead.current = true;
    const value = new URLSearchParams(window.location.hash.slice(1)).get("token");
    setToken(value || null);
    if (window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname);
    }
  }, []);

  const chars = [...password].length;
  const bytes = new TextEncoder().encode(password).length;
  const longEnough = chars >= MIN_CHARS;
  const notTooLong = bytes <= MAX_BYTES;
  const matches = password.length > 0 && password === confirm;
  const valid = longEnough && notTooLong && matches;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token || !valid) return;
    setSubmitting(true);
    try {
      await (mode === "reset" ? confirmPasswordReset(token, password) : acceptInvitation(token, password));
      setDone(true);
    } catch (err) {
      // Used, expired or invalid links get the "link isn't valid" screen; any
      // other problem (password rule, too many attempts, server) is shown as is.
      if (err instanceof InvalidLinkError) {
        setLinkError(true);
        toast.error("This link is no longer valid.");
      } else {
        toast.error(err instanceof Error ? err.message : "Could not save your password right now.");
      }
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
        </div>

        {token === undefined ? null : done ? (
          <div className="mt-7 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
              <Check className="size-5" />
            </span>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">{copy.doneTitle}</h1>
            <p className="mt-2 text-sm text-muted-foreground">{copy.doneText}</p>
            <Link
              href="/login"
              className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
            >
              Go to Sign In
            </Link>
          </div>
        ) : token === null || linkError ? (
          <div className="mt-7 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-danger-soft text-danger">
              <LinkIcon className="size-5" />
            </span>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">This link isn&apos;t valid</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {mode === "reset"
                ? "Reset links work once and expire after 30 minutes. Request a new one."
                : "Invitation links work once and expire after 48 hours. Ask your administrator to resend it."}
            </p>
            {mode === "reset" ? (
              <Link
                href="/forgot-password"
                className="mt-6 inline-flex w-full items-center justify-center rounded-full bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Request a New Link
              </Link>
            ) : null}
          </div>
        ) : (
          <>
            <div className="mt-6 text-center">
              <h1 className="text-lg font-semibold tracking-tight">{copy.title}</h1>
              <p className="mt-1 text-sm text-muted-foreground">{copy.intro}</p>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="new-password">
                  New password
                </label>
                <input
                  id="new-password"
                  type="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={INPUT}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="confirm-password">
                  Confirm new password
                </label>
                <input
                  id="confirm-password"
                  type="password"
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  className={INPUT}
                />
              </div>

              <ul className="space-y-1 text-[11px]">
                <Rule ok={longEnough}>At least {MIN_CHARS} characters ({chars} so far)</Rule>
                {!notTooLong ? <Rule ok={false}>Too long — use a shorter password</Rule> : null}
                <Rule ok={matches}>Both passwords match</Rule>
              </ul>

              <NavyButton type="submit" disabled={!valid || submitting} className="w-full py-2.5 text-sm">
                <KeyRound className="size-4" /> {submitting ? "Saving…" : copy.button}
              </NavyButton>
            </form>
          </>
        )}

        <Link
          href="/login"
          className="mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </Link>
      </div>
    </div>
  );
}

function Rule({ ok, children }: { ok: boolean; children: React.ReactNode }) {
  return (
    <li className={cn("flex items-center gap-1.5", ok ? "text-success" : "text-muted-foreground")}>
      {ok ? <Check className="size-3.5" /> : <Circle className="size-3.5" />}
      {children}
    </li>
  );
}
