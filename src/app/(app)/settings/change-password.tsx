"use client";

// Change password from Settings. The backend has no "change while signed in"
// endpoint, so this uses its password reset: a link is emailed to the signed-in
// person's own address, and the link opens the set-new-password page. Setting the
// new password signs the account out everywhere, so they sign in again with it.

import { useState } from "react";
import { NavyButton } from "@/components/gral/ui";
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
    <section className="flex flex-col gap-3 py-5 sm:flex-row sm:items-start sm:justify-between sm:gap-8" aria-labelledby="settings-password">
      <div className="min-w-0 max-w-2xl">
        <h3 id="settings-password" className="text-sm font-semibold">
          Password
        </h3>
        <p className="mt-1 text-sm text-muted-foreground">
          We email a link to <span className="font-medium text-foreground">{user.email}</span>. After you choose a new password you are signed out
          everywhere and sign in again with it.
        </p>
        {state === "sent" ? (
          <p role="status" className="mt-2 text-sm text-success">
            {MOCK_AUTH ? "Demo: no email is sent." : "Link sent. Check your email; it can take a few minutes."}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {state !== "sent" ? (
        <NavyButton className="shrink-0 self-start" onClick={send} disabled={state === "sending"}>
          {state === "sending" ? "Sending…" : "Change password"}
        </NavyButton>
      ) : null}
    </section>
  );
}
