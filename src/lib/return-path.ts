// Where to go after signing in. The login page is opened as /login?next=/clients/...
// when a signed-out person follows a link, so they land where they meant to go.
// Only same-site paths are accepted, so a crafted link cannot send someone to
// another website after they sign in (an "open redirect").

/** The login URL that brings the person back to `path` afterwards. */
export function loginHref(path: string): string {
  const next = safeReturnPath(path);
  return next === "/" ? "/login" : `/login?next=${encodeURIComponent(next)}`;
}

/** `value` when it is a path on this site (other than the sign-in pages), otherwise "/". */
export function safeReturnPath(value: string | null | undefined): string {
  if (!value) return "/";
  // Must be a single-slash path: rejects "//evil.com", "/\evil.com", "https://..." and "javascript:".
  if (!value.startsWith("/") || value.startsWith("//") || value.startsWith("/\\")) return "/";
  if (/[\u0000-\u001f]/.test(value)) return "/";
  let parsed: URL;
  try {
    parsed = new URL(value, "https://gral.invalid");
  } catch {
    return "/";
  }
  if (parsed.origin !== "https://gral.invalid") return "/";
  if (["/login", "/verify", "/forgot-password", "/reset-password", "/accept-invitation"].includes(parsed.pathname)) return "/";
  return `${parsed.pathname}${parsed.search}${parsed.hash}`;
}

/** The ?next= value of the current page, made safe. Browser only. */
export function returnPathFromLocation(): string {
  if (typeof window === "undefined") return "/";
  return safeReturnPath(new URLSearchParams(window.location.search).get("next"));
}
