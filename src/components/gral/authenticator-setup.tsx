"use client";

// Pieces shared by the two places someone sets up two-step login: during
// sign-in (required for their role) and from Settings. The secret and the
// recovery codes come from the server once; they live only in this screen's
// memory and are never stored or logged.

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { Copy, Download } from "lucide-react";
import { toast } from "sonner";
import { NavyButton, OutlineButton } from "./ui";

/** "JBSWY3DPEHPK3PXP" as "JBSW Y3DP EHPK 3PXP", easier to type into an app by hand. */
export const groupSecret = (secret: string) => secret.replace(/(.{4})/g, "$1 ").trim();

/** The QR code to scan, the key to type when scanning fails, and the three instructions. */
export function AuthenticatorQr({ secret, uri }: { secret: string; uri: string }) {
  const [qr, setQr] = useState<string | null>(null);

  // Drawn in the browser, so the secret never leaves this page.
  useEffect(() => {
    let active = true;
    QRCode.toDataURL(uri, { margin: 1, width: 200 })
      .then((url) => {
        if (active) setQr(url);
      })
      .catch(() => {
        if (active) setQr(null);
      });
    return () => {
      active = false;
    };
  }, [uri]);

  return (
    <div className="space-y-4">
      <ol className="list-decimal space-y-1 pl-5 text-left text-xs text-muted-foreground">
        <li>Open an authenticator app on your phone (Google Authenticator, Microsoft Authenticator or Duo Mobile) and choose to add an account.</li>
        <li>Scan this QR code with the app.</li>
        <li>Type the 6-digit code the app shows for GRAL below.</li>
      </ol>
      <div className="flex flex-wrap items-center justify-center gap-4 sm:justify-start">
        {qr ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={qr} alt="QR code to add GRAL to your authenticator app" className="size-40 rounded-xl border border-border bg-white p-1" />
        ) : (
          <div className="flex size-40 items-center justify-center rounded-xl border border-border text-[11px] text-muted-foreground">Drawing the QR code…</div>
        )}
        <div className="min-w-0 text-left text-xs">
          <p className="text-muted-foreground">Can&apos;t scan? Type this key into the app instead:</p>
          <p className="mt-1 break-all font-mono text-sm font-semibold tracking-wider">{groupSecret(secret)}</p>
          <p className="mt-1 text-[11px] text-subtle">Time based, 6 digits, every 30 seconds.</p>
        </div>
      </div>
    </div>
  );
}

/** The ten one-time recovery codes, shown once, with copy, download and a tick before moving on. */
export function RecoveryCodeList({ codes, onDone, doneLabel = "Done" }: { codes: string[]; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const text = `GRAL Operations Platform: two-step login recovery codes\nEach code works once. Keep them somewhere safe and private.\n\n${codes.join("\n")}\n`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      toast.success("Codes copied.");
    } catch {
      toast.error("Could not copy. Use Download instead.");
    }
  }

  function download() {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "gral-recovery-codes.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3 text-left">
      <p className="text-xs text-muted-foreground">
        If you lose your phone, sign in with one of these codes instead. Each one works once. This is the only time they are shown, so save them now in a
        password manager or another private place. Don&apos;t share them.
      </p>
      <ul className="grid grid-cols-2 gap-2 rounded-xl bg-pale px-4 py-3 font-mono text-sm">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <OutlineButton onClick={copy}>
          <Copy className="size-3.5" /> Copy
        </OutlineButton>
        <OutlineButton onClick={download}>
          <Download className="size-3.5" /> Download
        </OutlineButton>
      </div>
      <label className="flex items-center gap-2 text-xs">
        <input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} />I have saved my recovery codes
      </label>
      <NavyButton disabled={!saved} onClick={onDone}>
        {doneLabel}
      </NavyButton>
    </div>
  );
}
