"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { AuthenticatorQr, RecoveryCodeList } from "@/components/gral/authenticator-setup";
import { CODE_LENGTH, CodeBoxes } from "@/components/gral/code-boxes";
import { NavyButton, OutlineButton } from "@/components/gral/ui";
import { PasswordInput } from "@/components/gral/password-input";
import { useAuth } from "@/lib/auth-context";
import { MOCK_AUTH, startSignInSetup } from "@/lib/api";

export function LoginForm() {
  const router = useRouter();
  const { user, ready, sessionExpired, signIn, finishSignIn, finishSetupAtSignIn } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set once this form signs in, so the effect above does not skip the 2FA step.
  const signedInHere = useRef(false);
  // Two-step login: the password was right and the server wants a code from the app.
  const [challenge, setChallenge] = useState<{ challengeId: string; expiresAt: number; setupFirst: boolean } | null>(null);
  // Set up the authenticator app now (first sign-in for roles that must use two-step login).
  const [settingUp, setSettingUp] = useState(false);

  // Already signed in — skip the login screen. Overview is the landing page
  // because every role can see it (not every role has client access).
  useEffect(() => {
    if (ready && user && !signedInHere.current) router.replace("/");
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
      signedInHere.current = true;
      const needsCode = await signIn(email.trim(), password);
      if (needsCode) {
        signedInHere.current = false;
        setChallenge(needsCode);
        return;
      }
      // Demo mode shows the 2FA step; the backend does not send codes yet.
      router.replace(MOCK_AUTH ? "/verify" : "/");
    } catch (err) {
      signedInHere.current = false;
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

  const backToSignIn = () => {
    signedInHere.current = false;
    setChallenge(null);
    setSettingUp(false);
    setPassword("");
  };

  if (challenge && (challenge.setupFirst || settingUp)) {
    return (
      <SetupStep
        challenge={challenge}
        onBack={backToSignIn}
        onUseCode={() => setSettingUp(false)}
        onCode={async (code) => {
          // Signed in from here on; stay on this page until the recovery codes are saved.
          signedInHere.current = true;
          try {
            return await finishSetupAtSignIn(challenge.challengeId, code);
          } catch (err) {
            signedInHere.current = false;
            throw err;
          }
        }}
        onDone={() => router.replace("/")}
      />
    );
  }

  if (challenge) {
    return (
      <CodeStep
        challenge={challenge}
        onSetUp={() => setSettingUp(true)}
        onBack={backToSignIn}
        onCode={async (code) => {
          signedInHere.current = true;
          try {
            await finishSignIn(challenge.challengeId, code);
            router.replace("/");
          } catch (err) {
            signedInHere.current = false;
            throw err;
          }
        }}
      />
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-3 py-4 sm:px-4">
      <div className="float-card rise-in w-full max-w-md p-5 sm:p-8">
        <div className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/gral-logo.png" alt="Global Risk Advisors Ltd" className="h-auto w-48 max-w-full rounded-2xl bg-card p-2" />
          <p className="mt-3 text-sm text-muted-foreground">Thinking Beyond Tomorrow.</p>
        </div>

        {sessionExpired ? (
          <p role="alert" className="mt-5 rounded-xl bg-warning-soft px-3.5 py-3 text-sm font-medium text-warning">
            Your session was ended or expired. Please sign in again.
          </p>
        ) : null}

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
            <PasswordInput
              id="password"
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

/** Second sign-in step: the 6-digit code from the authenticator app, or a recovery code. */
function CodeStep({
  challenge,
  onCode,
  onSetUp,
  onBack,
}: {
  challenge: { expiresAt: number };
  onCode: (code: string) => Promise<void>;
  onSetUp: () => void;
  onBack: () => void;
}) {
  const [code, setCode] = useState("");
  const [recovery, setRecovery] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (Date.now() > challenge.expiresAt) {
      toast.error("This sign-in timed out after 5 minutes. Enter your password again.");
      onBack();
      return;
    }
    if (!recovery && code.length < CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} digits.`);
      return;
    }
    if (recovery && !code.trim()) {
      setError("Enter one of your recovery codes.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onCode(code);
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
      setCode("");
    } finally {
      setSubmitting(false);
    }
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
            {recovery
              ? "Enter one of the recovery codes you saved when you set up two-step login. Each code works once."
              : "Open your authenticator app and enter the 6-digit code for GRAL."}
          </p>
        </div>

        <form className="mt-7" onSubmit={submit}>
          {recovery ? (
            <input
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                setError(null);
              }}
              autoFocus
              autoComplete="off"
              aria-label="Recovery code"
              aria-invalid={error ? true : undefined}
              className="w-full rounded-xl border border-input bg-card px-3.5 py-2.5 text-center font-mono text-sm tracking-wider outline-none focus:border-sky focus:ring-2 focus:ring-sky/30"
            />
          ) : (
            <CodeBoxes
              value={code}
              onChange={(v) => {
                setCode(v);
                setError(null);
              }}
              invalid={!!error}
              autoFocus
              label="6-digit code"
            />
          )}
          {error ? (
            <p role="alert" className="mt-3 text-center text-xs font-medium text-danger">
              {error}
            </p>
          ) : null}
          <NavyButton type="submit" disabled={submitting} className="mt-6 w-full py-2.5 text-sm">
            {submitting ? "Checking…" : "Verify"}
          </NavyButton>
        </form>

        <button
          type="button"
          onClick={() => {
            setRecovery((r) => !r);
            setCode("");
            setError(null);
          }}
          className="mx-auto mt-4 block text-xs font-medium text-primary hover:opacity-70"
        >
          {recovery ? "Use the code from my app instead" : "Lost your phone? Use a recovery code"}
        </button>

        <div className="mt-6 rounded-xl bg-pale px-4 py-3 text-center text-xs">
          <p className="text-muted-foreground">First time signing in, or no authenticator app yet?</p>
          <button type="button" onClick={onSetUp} className="mt-1 font-medium text-primary hover:opacity-70">
            Set up two-step login now
          </button>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="mx-auto mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
        >
          <ArrowLeft className="size-3.5" /> Back to sign in
        </button>
      </div>
    </div>
  );
}

/**
 * Set-up during sign-in, for roles that must use two-step login (backend
 * ADR-036): scan the QR code, type the first code to sign in, save the
 * recovery codes. The whole step must finish within the five-minute challenge.
 */
function SetupStep({
  challenge,
  onCode,
  onUseCode,
  onBack,
  onDone,
}: {
  challenge: { challengeId: string; expiresAt: number; setupFirst: boolean };
  onCode: (code: string) => Promise<string[]>;
  onUseCode: () => void;
  onBack: () => void;
  onDone: () => void;
}) {
  const [setup, setSetup] = useState<{ secret: string; uri: string } | null>(null);
  const [startError, setStartError] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  useEffect(() => {
    let active = true;
    startSignInSetup(challenge.challengeId)
      .then(({ secret, otpauthUri }) => {
        if (active) setSetup({ secret, uri: otpauthUri });
      })
      .catch((err) => {
        if (active) setStartError(err instanceof Error ? err.message : "Could not start setting up two-step login.");
      });
    return () => {
      active = false;
    };
  }, [challenge.challengeId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (Date.now() > challenge.expiresAt) {
      toast.error("Set-up must finish within 5 minutes of entering your password. Please sign in again.");
      onBack();
      return;
    }
    if (code.length < CODE_LENGTH) {
      setError(`Enter all ${CODE_LENGTH} digits from your app.`);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      setCodes(await onCode(code));
    } catch (err) {
      setError(err instanceof Error ? err.message : "That code did not work.");
      setCode("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-3 py-4 sm:px-4">
      <div className="float-card rise-in w-full max-w-lg p-5 sm:p-8">
        <div className="flex flex-col items-center text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-pale text-primary">
            <ShieldCheck className="size-6" />
          </span>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">{codes ? "Save your recovery codes" : "Set up two-step login"}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {codes
              ? "You are signed in. Save these codes before you continue."
              : "Your account needs a code from an authenticator app each time you sign in. This takes about a minute, and must be finished within 5 minutes."}
          </p>
        </div>

        {codes ? (
          <div className="mt-6">
            <RecoveryCodeList codes={codes} onDone={onDone} doneLabel="Continue to GRAL" />
          </div>
        ) : startError ? (
          <div className="mt-6 space-y-3 text-center">
            <p role="alert" className="text-xs font-medium text-danger">
              {startError}
            </p>
            {challenge.setupFirst ? null : (
              <OutlineButton onClick={onUseCode} className="mx-auto">
                Enter a code from my app instead
              </OutlineButton>
            )}
          </div>
        ) : !setup ? (
          <p className="mt-6 text-center text-sm text-muted-foreground">Preparing your QR code…</p>
        ) : (
          <form className="mt-6 space-y-5" onSubmit={submit}>
            <AuthenticatorQr secret={setup.secret} uri={setup.uri} />
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
            <NavyButton type="submit" disabled={submitting} className="w-full py-2.5 text-sm">
              {submitting ? "Checking…" : "Confirm and sign in"}
            </NavyButton>
          </form>
        )}

        {codes ? null : (
          <button
            type="button"
            onClick={onBack}
            className="mx-auto mt-6 flex items-center justify-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-primary"
          >
            <ArrowLeft className="size-3.5" /> Back to sign in
          </button>
        )}
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
