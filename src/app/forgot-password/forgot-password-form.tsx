"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { toast } from "sonner";
import { NavyButton } from "@/components/gral/ui";
import { requestPasswordReset } from "@/lib/api";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const value = email.trim();
    if (!value) {
      toast.error("Enter your work email.");
      return;
    }
    setSubmitting(true);
    try {
      await requestPasswordReset(value);
      setSentTo(value);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="float-card rise-in w-full max-w-md p-8">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/favicon_io/android-chrome-512x512.png"
            alt="Global Risk Advisors Ltd"
            className="h-24 w-auto"
          />
        </div>

        {sentTo ? (
          <div className="mt-7 text-center">
            <span className="mx-auto flex size-12 items-center justify-center rounded-full bg-success-soft text-success">
              <MailCheck className="size-5" />
            </span>
            <h1 className="mt-4 text-lg font-semibold tracking-tight">Check your email</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              If an account exists for <span className="font-medium text-foreground">{sentTo}</span>,
              you&apos;ll receive a link to reset your password shortly.
            </p>
            <button
              type="button"
              onClick={() => setSentTo(null)}
              className="mt-4 text-xs text-primary underline underline-offset-2 hover:opacity-70"
            >
              Use a different email
            </button>
          </div>
        ) : (
          <>
            <div className="mt-6 text-center">
              <h1 className="text-lg font-semibold tracking-tight">Reset your password</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Enter your work email and we&apos;ll send you a reset link.
              </p>
            </div>

            <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
              <div>
                <label className="text-xs font-medium text-muted-foreground" htmlFor="email">
                  Work email
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@gral.rw"
                  className="mt-1.5 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
                />
              </div>

              <NavyButton type="submit" disabled={submitting} className="w-full py-2.5 text-sm">
                {submitting ? "Sending…" : "Send Reset Link"}
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

        <p className="mt-4 text-center text-[11px] text-subtle">
          Can&apos;t access your work email? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
