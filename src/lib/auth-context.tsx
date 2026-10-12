"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { MOCK_AUTH, getCurrentUser, signIn as apiSignIn, signOut as apiSignOut } from "./api";
import { ROLES, type Role, type SessionUser } from "./types";

// The backend keeps the login in a SESSION cookie. On load we ask the backend
// who is signed in (GET /api/v1/me), so a refresh keeps you logged in and a
// logout on the backend logs you out here too. Nothing is stored in the browser.
// Demo mode (NEXT_PUBLIC_MOCK_AUTH=true) is the exception: there is no backend,
// so the sample session is kept in localStorage under the same key.
const OLD_STORAGE_KEY = "gral.session";

function readDemoSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(OLD_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function writeDemoSession(user: SessionUser | null) {
  if (!MOCK_AUTH) return;
  try {
    if (user) localStorage.setItem(OLD_STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(OLD_STORAGE_KEY);
  } catch {
    // Storage unavailable: the demo session lasts for this tab only.
  }
}

type AuthState = {
  user: SessionUser | null;
  /** False until the backend has said who is signed in. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** Demo-only role switcher from the design's "Role:" pill. */
  setRole: (r: Role) => void;
  roles: readonly Role[];
};

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (MOCK_AUTH) {
      setUser(readDemoSession());
      setReady(true);
      return;
    }
    // Clean up the old front-end-only session from before the backend was connected.
    try {
      localStorage.removeItem(OLD_STORAGE_KEY);
    } catch {
      // Storage unavailable, nothing to clean.
    }

    let cancelled = false;
    getCurrentUser()
      .then((u) => {
        if (!cancelled) setUser(u);
      })
      .catch(() => {
        if (!cancelled) setUser(null);
      })
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      user,
      ready,
      roles: ROLES,
      signIn: async (email, password) => {
        const signedIn = await apiSignIn(email, password);
        setUser(signedIn);
        writeDemoSession(signedIn);
      },
      signOut: async () => {
        // Clear the screen straight away, then end the session on the backend.
        setUser(null);
        writeDemoSession(null);
        try {
          await apiSignOut();
        } catch {
          // The session may already have expired. The user is signed out either way.
        }
      },
      setRole: (role) => {
        if (!user) return;
        const updated = { ...user, role };
        setUser(updated);
        writeDemoSession(updated);
      },
    }),
    [user, ready],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

/** For screens rendered inside the signed-in layout, where a user always exists. */
export function useCurrentUser() {
  const { user, ...rest } = useAuth();
  if (!user) throw new Error("useCurrentUser called outside the signed-in layout");
  return { user, ...rest };
}