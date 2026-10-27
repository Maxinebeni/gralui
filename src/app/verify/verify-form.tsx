"use client";

// Second sign-in step: a 6-digit code. Front end only for now; any 6 digits are accepted
// until the backend sends and checks real codes.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { NavyButton } from "@/components/gral/ui";
import { useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";

const LENGTH = 6;
const RESEND_AFTER = 30;

function maskEmail(email: string) {
  const [name, domain] = email.split("@");
  if (!domain) return email;
  return `${name.slice(0, 2)}${"•".repeat(Math.max(1, name.length - 2))}@${domain}`;
}

export function VerifyForm() {
  const router = useRouter();
  const { user, ready, signOut } = useAuth();
  const [digits, setDigits] = useState<string[]>(Array(LENGTH).fill(""));
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [wait, setWait] = useState(RESEND_AFTER);
  const boxes = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (ready && !user) router.replace("/login");
  }, [ready, user, router]);

  useEffect(() => {
    if (wait <= 0) return;
    const t = setTimeout(() => setWait((w) => w - 1), 1000);
    return () => clearTimeout(t);
  }, [wait]);

  useEffect(() => boxes.current[0]?.focus(), []);

  // Puts digits in from one box onwards (typing, paste or the phone's code autofill).
  function fill(from: number, value: string) {
    const typed = value.replace(/\D/g, "").slice(0, LENGTH - from);
    if (!typed) return;
    setDigits((current) => {
      const next = [...current];
      typed.split("").forEach((d, i) => (next[from + i] = d));
      return next;
    });
    setError(null);
    boxes.current[Math.min(from + typed.length, LENGTH - 1)]?.focus();
  }

  function clear(i: number) {
    setDigits((current) => current.map((d, j) => (j === i ? "" : d)));
  }

  function onKeyDown(i: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (/^\d$/.test(e.key)) {
      e.preventDefault();
      fill(i, e.key);
    } else if (e.key === "Backspace") {
      e.preventDefault();
      if (digits[i]) clear(i);
      else if (i > 0) {
        clear(i - 1);
        boxes.current[i - 1]?.focus();
      }
    } else if (e.key === "ArrowLeft" && i > 0) boxes.current[i - 1]?.focus();
    else if (e.key === "ArrowRight" && i < LENGTH - 1) boxes.current[i + 1]?.focus();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const code = digits.join("");
    if (code.length < LENGTH) {
      setError(`Enter all ${LENGTH} digits.`);
      return;
    }
    setSubmitting(true);
    // Not connected yet: the backend will check the code here.
    await new Promise((r) => setTimeout(r, 400));
    setSubmitting(false);
    router.replace("/");
  }

  function resend() {
    setWait(RESEND_AFTER);
    setDigits(Array(LENGTH).fill(""));
    boxes.current[0]?.focus();
    toast.success("A new code has been sent.");
  }

  async function back() {
    await signOut();
    router.replace("/login");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-3 py-4 sm:px-4">
      <div className="float-card rise-in w-full max-w-md p-5 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-pale text-primary">
            <ShieldCheck className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Verify it&apos;s you</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Enter the 6-digit code sent to{" "}
            <span className="font-medium text-foreground">{user ? maskEmail(user.email) : "your work email"}</span>.
          </p>
        </div>

        <form className="mt-7" onSubmit={handleSubmit}>
          <div className="flex justify-center gap-2 sm:gap-2.5" onPaste={(e) => {
            e.preventDefault();
            fill(0, e.clipboardData.getData("text"));
          }}>
            {digits.map((d, i) => (
              <input
                key={i}
                ref={(el) => {
                  boxes.current[i] = el;
                }}
                value={d}
                onChange={(e) => fill(i, e.target.value)}
                onKeyDown={(e) => onKeyDown(i, e)}
                onFocus={(e) => e.target.select()}
                inputMode="numeric"
                autoComplete={i === 0 ? "one-time-code" : "off"}
                aria-label={`Digit ${i + 1}`}
                aria-invalid={error ? true : undefined}
                className={cn(
                  "size-11 rounded-xl border bg-card text-center text-lg font-semibold outline-none focus:border-sky focus:ring-2 focus:ring-sky/30 sm:size-12",
                  error ? "border-danger" : "border-input",
                )}
              />
            ))}
          </div>
          {error ? (
            <p role="alert" className="mt-3 text-center text-xs font-medium text-danger">
              {error}
            </p>
          ) : null}

          <NavyButton type="submit" disabled={submitting} className="mt-6 w-full py-2.5 text-sm">
            {submitting ? "Verifying…" : "Verify"}
          </NavyButton>
        </form>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Didn&apos;t get it?{" "}
          {wait > 0 ? (
            <span>Resend in {wait}s</span>
          ) : (
            <button type="button" onClick={resend} className="font-medium text-primary hover:opacity-70">
              Resend code
            </button>
          )}
        </p>

        <button
          type="button"
          onClick={back}
          className="mx-auto mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </button>
      </div>
    </div>
  );
}
