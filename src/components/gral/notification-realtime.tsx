"use client";

import { Client, type IMessage } from "@stomp/stompjs";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { getNotificationSocketCsrf, type InboxNotification } from "@/lib/api";
import { MOCK_AUTH } from "@/lib/api";

function parseNotification(message: IMessage): InboxNotification | null {
  try {
    const value = JSON.parse(message.body) as Partial<InboxNotification>;
    if (typeof value.id !== "string" || typeof value.title !== "string" || typeof value.body !== "string") return null;
    return {
      id: value.id,
      type: typeof value.type === "string" ? value.type : "GENERAL",
      title: value.title,
      body: value.body,
      createdAt: typeof value.createdAt === "string" ? value.createdAt : new Date().toISOString(),
      readAt: typeof value.readAt === "string" ? value.readAt : null,
    };
  } catch {
    return null;
  }
}

export function NotificationRealtime({
  userId,
  onNotification,
  onSync,
}: {
  userId?: string;
  onNotification: (notification: InboxNotification) => void;
  onSync: () => Promise<void>;
}) {
  const onNotificationRef = useRef(onNotification);
  const onSyncRef = useRef(onSync);
  onNotificationRef.current = onNotification;
  onSyncRef.current = onSync;

  useEffect(() => {
    if (!userId || MOCK_AUTH) return;
    let disposed = false;
    let client: Client | null = null;
    // Without a socket the bell still checks the inbox every 30 seconds (see
    // Shell), so a socket that cannot connect just stops retrying.
    const giveUp = () => {
      if (client) void client.deactivate();
    };

    void (async () => {
      try {
        const configResponse = await fetch("/api/notification-socket", { credentials: "include", cache: "no-store" });
        if (!configResponse.ok) throw new Error("Could not load the notification socket configuration.");
        const { url } = (await configResponse.json()) as { url: string };
        if (disposed) return;
        // The session cookie belongs to this site (API calls go through its /api
        // proxy), so a socket on another host cannot sign in.
        if (new URL(url).host !== window.location.host) {
          giveUp();
          return;
        }
        let connected = false;

        client = new Client({
          brokerURL: url,
          reconnectDelay: 5000,
          heartbeatIncoming: 10000,
          heartbeatOutgoing: 10000,
          // The browser attaches the SESSION cookie to the WebSocket handshake.
          // Refresh CSRF for the initial CONNECT and every automatic reconnect.
          beforeConnect: async () => {
            const csrf = await getNotificationSocketCsrf();
            client!.connectHeaders = { [csrf.headerName]: csrf.token };
          },
          onConnect: () => {
            connected = true;
            client?.subscribe("/user/queue/notifications", (message) => {
              const notification = parseNotification(message);
              if (notification) onNotificationRef.current(notification);
            });
            void onSyncRef.current().catch(() => undefined);
          },
          onStompError: (frame) => {
            console.warn("Notification socket rejected the connection:", frame.headers.message ?? frame.body);
            if (!connected) giveUp();
          },
          onWebSocketError: () => {
            // A socket that never connected will not start working by retrying.
            if (!connected) giveUp();
          },
        });
        await client.activate();
      } catch (error) {
        if (!disposed) {
          console.warn("Could not connect to live notifications:", error);
          giveUp();
        }
      }
    })();

    return () => {
      disposed = true;
      if (client) void client.deactivate();
    };
  }, [userId]);

  return null;
}
