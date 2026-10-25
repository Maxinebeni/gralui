import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Expose only the backend WebSocket URL needed by the browser STOMP client. */
export async function GET() {
  const configuredUrl = process.env.NOTIFICATION_WEBSOCKET_URL ?? `${(process.env.BACKEND_URL ?? "http://localhost:8081").replace(/\/+$/, "")}/ws`;
  let socketUrl: URL;
  try {
    socketUrl = new URL(configuredUrl);
    if (socketUrl.protocol === "http:") socketUrl.protocol = "ws:";
    else if (socketUrl.protocol === "https:") socketUrl.protocol = "wss:";
    if (socketUrl.protocol !== "ws:" && socketUrl.protocol !== "wss:") throw new Error("Unsupported socket protocol");
  } catch {
    return NextResponse.json({ error: "The notification socket URL is not configured correctly." }, { status: 500 });
  }
  return NextResponse.json({ url: socketUrl.toString() }, { headers: { "Cache-Control": "no-store" } });
}
