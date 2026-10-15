import type { NextConfig } from "next";
import pkg from "./package.json";

// /api requests are forwarded to the backend by src/app/api/[...path]/route.ts.
const nextConfig: NextConfig = {
  // Only the version number is passed to the browser (shown on the Settings page).
  env: { NEXT_PUBLIC_APP_VERSION: pkg.version },
};

export default nextConfig;
