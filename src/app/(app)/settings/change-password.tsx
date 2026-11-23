"use client";

// Change password from Settings. The backend has no "change while signed in"
// endpoint, so this uses its password reset: a link is emailed to the signed-in
// person's own address, and the link opens the set-new-password page. Setting the
// new password signs the account out everywhere, so they sign in again with it.

import { KeyRound } from "lucide-react";
import { useState } from "react";
import { FloatCard, NavyButton } from "@/components/gral/ui";
import { useCurrentUser } from "@/lib/auth-context";
import { MOCK_AUTH, requestPasswordReset } from "@/lib/api";

export function ChangePassword() {
  const { user } = useCurrentUser();
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    setState("sending");
    setError(null);
    try {
      await requestPasswordReset(user.email);
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the email. Please try again.");
      setState("idle");
    }
  }

  return (
    <FloatCard className="p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <KeyRound className="size-5 text-primary" />
        <h2 className="text-base font-semibold tracking-tight">Change password</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        We email a link to <span className="font-medium text-foreground">{user.email}</span>. Open it to choose a new password. The link works
        once and for a limited time. After you set the new password you are signed out on every device, so sign in again with it.
      </p>
      {state === "sent" ? (
        <p role="status" className="mt-4 rounded-xl bg-success-soft px-3 py-2 text-sm text-success">
          {MOCK_AUTH ? "Demo: no email is sent. On the live system the link arrives in a few minutes." : "Check your email for the link. It can take a few minutes; also look in junk mail."}
        </p>
      ) : (
        <div className="mt-4">
          <NavyButton onClick={send} disabled={state === "sending"}>
            {state === "sending" ? "Sending…" : "Email me a link to change my password"}
          </NavyButton>
        </div>
      )}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      ) : null}
    </FloatCard>
  );
}
