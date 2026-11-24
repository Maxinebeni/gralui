import type { NextConfig } from "next";
import pkg from "./package.json";

// Security headers for every page and API response. The app only talks to its
// own origin (/api is proxied to the backend and the notification socket must be
// on the same host), so the Content-Security-Policy can stay on 'self'.
// Next.js adds small inline scripts while rendering, hence 'unsafe-inline';
// development also needs 'unsafe-eval' for fast refresh.
const isDev = process.env.NODE_ENV !== "production";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  // Document previews and the authenticator QR code use blob: and data: URLs.
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "frame-src 'self' blob:",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: contentSecurityPolicy },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Browsers ignore this over plain http (local development).
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
];

// /api requests are forwarded to the backend by src/app/api/[...path]/route.ts.
const nextConfig: NextConfig = {
  // Only the version number is passed to the browser (shown on the Settings page).
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
  // Do not advertise the framework in an X-Powered-By header.
  poweredByHeader: false,
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
