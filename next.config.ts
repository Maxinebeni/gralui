import type { NextConfig } from "next";

// Where the Spring Boot backend runs. Set in .env.local.
const BACKEND_URL = process.env.BACKEND_URL ?? "http://localhost:8081";

const nextConfig: NextConfig = {
  // Forward every /api request to the backend. The browser only ever talks
  // to the frontend's own address, so there is no CORS block.
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_URL}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;