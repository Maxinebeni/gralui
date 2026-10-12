// Forwards every /api/... request from the browser to the Spring Boot backend.
// The browser only ever talks to the frontend's own address, so there is no
// CORS problem, and the backend's SESSION cookie works on localhost too.
// Set the backend address with BACKEND_URL in .env.local.

import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";

const BACKEND_URL = (process.env.BACKEND_URL ?? "http://localhost:8081").replace(/\/+$/, "");

// Request headers the backend needs. The cookie carries the login session.
const REQUEST_HEADERS = ["accept", "content-type", "cookie", "x-csrf-token"];

// Response headers passed back to the browser (Set-Cookie is handled separately).
const RESPONSE_HEADERS = ["content-type", "content-disposition", "cache-control", "retry-after", "x-correlation-id"];

async function forward(req: NextRequest, ctx: { params: Promise<{ path: string[] }> }) {
  const { path } = await ctx.params;
  const target = `${BACKEND_URL}/api/${path.map(encodeURIComponent).join("/")}${req.nextUrl.search}`;

  const headers = new Headers();
  for (const name of REQUEST_HEADERS) {
    const value = req.headers.get(name);
    if (value) headers.set(name, value);
  }

  const hasBody = req.method !== "GET" && req.method !== "HEAD";

  let res: Response;
  try {
    res = await fetch(target, {
      method: req.method,
      headers,
      body: hasBody ? await req.arrayBuffer() : undefined,
      redirect: "manual",
      cache: "no-store",
    });
  } catch {
    return Response.json(
      { title: "The server could not be reached", status: 502, code: "BACKEND_UNREACHABLE" },
      { status: 502 },
    );
  }

  const out = new Headers();
  for (const name of RESPONSE_HEADERS) {
    const value = res.headers.get(name);
    if (value) out.set(name, value);
  }
  // Pass the login cookie back, minus any Domain so it is kept for localhost.
  for (const cookie of res.headers.getSetCookie()) {
    out.append("set-cookie", cookie.replace(/;\s*Domain=[^;]*/i, ""));
  }

  const noBody = res.status === 204 || res.status === 304;
  return new Response(noBody ? null : res.body, { status: res.status, headers: out });
}

export { forward as GET, forward as POST, forward as PUT, forward as PATCH, forward as DELETE };