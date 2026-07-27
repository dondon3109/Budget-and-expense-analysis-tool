import { createContext, useContext, useState, type ReactNode } from "react";

import { useAuth } from "../auth/AuthProvider";

interface AssistantSessionContextValue {
  activeThreadId: string | null;
  draft: string;
  setActiveThreadId: (threadId: string | null) => void;
  setDraft: (draft: string) => void;
  startNewChat: () => void;
}

const AssistantSessionContext = createContext<AssistantSessionContextValue | undefined>(undefined);

function AssistantSessionStateProvider({ children }: { children: ReactNode }) {
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  function startNewChat() {
    setActiveThreadId(null);
    setDraft("");
  }

  return (
    <AssistantSessionContext.Provider
      value={{ activeThreadId, draft, setActiveThreadId, setDraft, startNewChat }}
    >
      {children}
    </AssistantSessionContext.Provider>
  );
}

export function AssistantSessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <AssistantSessionStateProvider key={user?.id ?? "signed-out"}>
      {children}
    </AssistantSessionStateProvider>
  );
}

export function useAssistantSession(): AssistantSessionContextValue {
  const context = useContext(AssistantSessionContext);
  if (!context) throw new Error("useAssistantSession must be used within AssistantSessionProvider.");
  return context;
}
