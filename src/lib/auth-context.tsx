"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { signIn as apiSignIn } from "./api";
import { ROLES, type Role, type SessionUser } from "./types";

// Front-end-only session kept in localStorage. Replace with the backend's
// session/token handling when Spring Security is wired in.
const STORAGE_KEY = "gral.session";

type AuthState = {
  user: SessionUser | null;
  /** False until the stored session has been read on the client. */
  ready: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => void;
  /** Demo-only role switcher from the design's "Role:" pill. */
  setRole: (r: Role) => void;
  roles: readonly Role[];
};

const AuthContext = createContext<AuthState | null>(null);

function readStored(): SessionUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function writeStored(user: SessionUser | null) {
  try {
    if (user) localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage unavailable (private mode) — session lasts for this tab only.
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setUser(readStored());
    setReady(true);
  }, []);

  const value = useMemo<AuthState>(() => {
    const update = (next: SessionUser | null) => {
      setUser(next);
      writeStored(next);
    };
    return {
      user,
      ready,
      roles: ROLES,
      signIn: async (email, password) => update(await apiSignIn(email, password)),
      signOut: () => update(null),
      setRole: (role) => user && update({ ...user, role }),
    };
  }, [user, ready]);

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
