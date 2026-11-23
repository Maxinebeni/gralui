"use client";

// Two-step login (MFA) for the signed-in person: set it up with an
// authenticator app, save the recovery codes, or turn it off. Most roles must
// set it up at sign-in already (backend ADR-036); this card is for anyone who
// has not, and for turning it off. The backend does
// not say whether it is already on, so both actions are offered and the server
// answers if one does not apply. The app secret and recovery codes are shown
// once, kept only in this screen's memory, and never logged.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthenticatorQr, RecoveryCodeList } from "@/components/gral/authenticator-setup";
import { CODE_LENGTH, CodeBoxes } from "@/components/gral/code-boxes";
import { PasswordInput } from "@/components/gral/password-input";
import { FloatCard, NavyButton, OutlineButton } from "@/components/gral/ui";
import { MOCK_AUTH, confirmMfaEnrollment, disableMfa, startMfaEnrollment } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

const INPUT =
  "mt-1.5 w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-sm outline-none focus:border-sky focus:ring-2 focus:ring-sky/30";

type Step =
  | { name: "idle" }
  | { name: "password" }
  | { name: "scan"; secret: string; uri: string }
  | { name: "codes"; codes: string[] }
  | { name: "disable" };

export function TwoStepLogin() {
  const [step, setStep] = useState<Step>({ name: "idle" });

  return (
    <FloatCard className="p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <ShieldCheck className="size-5 text-primary" />
        <h2 className="text-base font-semibold tracking-tight">Two-step login</h2>
      </div>
      <p className="mt-2 text-sm text-muted-foreground">
        After your password, you also enter a 6-digit code from an app on your phone, such as Google Authenticator, Microsoft Authenticator or Duo
        Mobile. Someone who learns your password still cannot sign in. Setting it up signs you out on every device, so you sign in again with the new
        code.
      </p>

      {MOCK_AUTH ? (
        <p className="mt-4 text-xs text-subtle">Available on the live system.</p>
      ) : step.name === "idle" ? (
        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <OutlineButton onClick={() => setStep({ name: "disable" })}>Turn it off</OutlineButton>
          <NavyButton onClick={() => setStep({ name: "password" })}>Set up two-step login</NavyButton>
        </div>
      ) : step.name === "password" ? (
        <StartSetup onCancel={() => setStep({ name: "idle" })} onStarted={(secret, uri) => setStep({ name: "scan", secret, uri })} />
      ) : step.name === "scan" ? (
        <ScanAndConfirm secret={step.secret} uri={step.uri} onCancel={() => setStep({ name: "idle" })} onConfirmed={(codes) => setStep({ name: "codes", codes })} />
      ) : step.name === "codes" ? (
        <RecoveryCodes codes={step.codes} />
      ) : (
        <TurnOff onCancel={() => setStep({ name: "idle" })} />
      )}
    </FloatCard>
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

function TurnOff({ onCancel }: { onCancel: () => void }) {
  const router = useRouter();
  const { signOut } = useAuth();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password || !code.trim()) {
      setError("Enter your password and a code.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await disableMfa(password, code);
      // The server signs the account out everywhere when two-step login is turned off.
      toast.success("Two-step login is off. Please sign in again.");
      await signOut();
      router.replace("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not turn off two-step login.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-4 space-y-3">
      <p className="text-xs text-muted-foreground">You will be signed out on every device and need to sign in again.</p>
      <label className="block text-xs font-medium text-muted-foreground">
        Your password
        <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" className={INPUT} />
      </label>
      <label className="block text-xs font-medium text-muted-foreground">
        Code from your app, or a recovery code
        <input value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" className={INPUT} />
      </label>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-between gap-2">
        <OutlineButton onClick={onCancel}>Cancel</OutlineButton>
        <NavyButton type="submit" disabled={busy}>
          {busy ? "Turning off…" : "Turn off two-step login"}
        </NavyButton>
      </div>
    </form>
  );
}
