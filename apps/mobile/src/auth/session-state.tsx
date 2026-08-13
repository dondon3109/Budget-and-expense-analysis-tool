import { createContext, useContext, useMemo, type PropsWithChildren } from "react";

export type SessionStatus = "loading" | "signed-out" | "signed-in";

export interface SessionSnapshot {
  status: SessionStatus;
  subject: string | null;
}

const signedOutSession: SessionSnapshot = { status: "signed-out", subject: null };
const SessionContext = createContext<SessionSnapshot>(signedOutSession);

/** Milestone 2 replaces the default snapshot with the SecureStore-backed Supabase session. */
export function SessionProvider({
  children,
  value = signedOutSession,
}: PropsWithChildren<{ value?: SessionSnapshot }>) {
  const snapshot = useMemo(() => value, [value]);
  return <SessionContext.Provider value={snapshot}>{children}</SessionContext.Provider>;
}

export function useSessionSnapshot(): SessionSnapshot {
  return useContext(SessionContext);
}
