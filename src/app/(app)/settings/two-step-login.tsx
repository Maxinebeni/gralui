"use client";

// Two-step login (MFA) for the signed-in person: set it up with an
// authenticator app and save the recovery codes. Most roles must set it up at
// sign-in already (backend ADR-036); this card is for anyone who has not.
// Everyone keeps it on, so there is no way to turn it off here. The app secret and recovery codes are shown
// once, kept only in this screen's memory, and never logged.

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AuthenticatorQr, RecoveryCodeList } from "@/components/gral/authenticator-setup";
import { CODE_LENGTH, CodeBoxes } from "@/components/gral/code-boxes";
import { PasswordInput } from "@/components/gral/password-input";
import { Chip, NavyButton, OutlineButton } from "@/components/gral/ui";
import { MOCK_AUTH, confirmMfaEnrollment, getMfaStatus, startMfaEnrollment } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const INPUT =
  "mt-1.5 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

type Step =
  | { name: "idle" }
  | { name: "password" }
  | { name: "scan"; secret: string; uri: string }
  | { name: "codes"; codes: string[] };

export function TwoStepLogin() {
  const [step, setStep] = useState<Step>({ name: "idle" });
  // On, off, or unknown (an older server): only the matching action is offered when it is known.
  const [enabled, setEnabled] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    void getMfaStatus().then((on) => {
      if (!cancelled) setEnabled(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const status =
    enabled === true ? (
      <Chip tone="success">On</Chip>
    ) : enabled === false ? (
      <Chip tone="warning">Off</Chip>
    ) : null;

  return (
    <section className="py-5" aria-labelledby="settings-two-step">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0 max-w-2xl">
          <div className="flex items-center gap-2">
            <h3 id="settings-two-step" className="text-sm font-semibold">
              Two-step login
            </h3>
            {MOCK_AUTH ? null : status}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            After your password you also enter a 6-digit code from an app on your phone, such as Google or Microsoft Authenticator.
          </p>
          {MOCK_AUTH ? <p className="mt-2 text-xs text-subtle">Available on the live system.</p> : null}
        </div>
        {!MOCK_AUTH && step.name === "idle" && enabled !== true ? (
          <NavyButton className="shrink-0 self-start" onClick={() => setStep({ name: "password" })}>
            Set up two-step login
          </NavyButton>
        ) : null}
      </div>

      {MOCK_AUTH || step.name === "idle" ? null : (
        <div className="max-w-md">
          {step.name === "password" ? (
            <StartSetup onCancel={() => setStep({ name: "idle" })} onStarted={(secret, uri) => setStep({ name: "scan", secret, uri })} />
          ) : step.name === "scan" ? (
            <ScanAndConfirm
              secret={step.secret}
              uri={step.uri}
              onCancel={() => setStep({ name: "idle" })}
              onConfirmed={(codes) => setStep({ name: "codes", codes })}
            />
          ) : (
            <RecoveryCodes codes={step.codes} />
          )}
        </div>
      )}
    </section>
  );
}

function StartSetup({ onCancel, onStarted }: { onCancel: () => void; onStarted: (secret: string, uri: string) => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) {
      setError("Enter your password.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { secret, otpauthUri } = await startMfaEnrollment(password);
      onStarted(secret, otpauthUri);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start setting up two-step login.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <p className="text-xs font-medium">Step 1 of 3: confirm it&apos;s you</p>
      <label className="block text-xs font-medium text-muted-foreground">
        Your password
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={INPUT} />
      </label>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-between gap-2">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <NavyButton type="submit" disabled={busy}>
          {busy ? "Checking…" : "Continue"}
        </NavyButton>
      </div>
    </form>
  );
}

function ScanAndConfirm({
  secret,
  uri,
  onCancel,
  onConfirmed,
}: {
  secret: string;
  uri: string;
  onCancel: () => void;
  onConfirmed: (codes: string[]) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (code.length < CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} digits from your app.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      onConfirmed(await confirmMfaEnrollment(code));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-4">
      <p className="text-xs font-medium">Step 2 of 3: add GRAL to your app</p>
      <AuthenticatorQr secret={secret} uri={uri} />
      <CodeBoxes
        value={code}
        onChange={(v) => {
          setCode(v);
          setError(null);
        }}
        invalid={!!error}
        label="Code from your app"
      />
      {error ? (
        <p role="alert" className="text-center text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-between gap-2">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <NavyButton type="submit" disabled={busy}>
          {busy ? "Checking…" : "Confirm"}
        </NavyButton>
      </div>
    </form>
  );
}

/** Turning it on signs the account out everywhere, so the next step is to sign in again with the new code. */
function RecoveryCodes({ codes }: { codes: string[] }) {
  const router = useRouter();
  const { signOut } = useAuth();
  return (
    <div className="mt-4 space-y-3">
      <p className="text-xs font-medium text-success">Two-step login is on.</p>
      <p className="text-xs font-medium">Step 3 of 3: save your recovery codes</p>
      <RecoveryCodeList
        codes={codes}
        doneLabel="Done, sign in again"
        onDone={async () => {
          toast.success("Sign in again with your password and the code from your app.");
          await signOut();
          router.replace("/login");
        }}
      />
    </div>
  );
}
