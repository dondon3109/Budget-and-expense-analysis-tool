import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";

import { verifyWorkerIdentity, WorkerIdentityError } from "@/api/worker-identity";

import { useSessionSnapshot } from "./session-state";

export type WorkerIdentityStatus = "idle" | "checking" | "verified" | "error";

interface WorkerIdentitySnapshot {
  status: WorkerIdentityStatus;
  message: string | null;
  retry: () => void;
}

const WorkerIdentityContext = createContext<WorkerIdentitySnapshot>({
  status: "idle",
  message: null,
  retry: () => undefined,
});

export function WorkerIdentityProvider({ children }: PropsWithChildren) {
  const { getAccessToken, signOut, status: sessionStatus, subject } = useSessionSnapshot();
  const [attempt, setAttempt] = useState(0);
  const [snapshot, setSnapshot] = useState<Omit<WorkerIdentitySnapshot, "retry">>({
    status: "idle",
    message: null,
  });
  const requestRef = useRef(0);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    if (sessionStatus !== "signed-in" || !subject) {
      setSnapshot({ status: "idle", message: null });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setSnapshot({ status: "checking", message: null });

    const run = async (): Promise<void> => {
      try {
        let accessToken = await getAccessToken(false);
        try {
          await verifyWorkerIdentity({ subject, accessToken, signal: controller.signal });
        } catch (error) {
          if (!(error instanceof WorkerIdentityError) || error.code !== "session_expired") {
            throw error;
          }
          accessToken = await getAccessToken(true);
          await verifyWorkerIdentity({ subject, accessToken, signal: controller.signal });
        }
        if (requestRef.current === requestId) {
          setSnapshot({ status: "verified", message: null });
        }
      } catch (error) {
        if (requestRef.current !== requestId) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          setSnapshot({
            status: "error",
            message: "Workspace verification took too long. Check your connection and try again.",
          });
          return;
        }
        if (
          error instanceof WorkerIdentityError &&
          (error.code === "session_expired" ||
            error.code === "account_deleted" ||
            error.code === "identity_mismatch")
        ) {
          // Preserve the subject-scoped encrypted workspace when remote identity
          // can no longer be trusted enough to inspect or synchronize pending work.
          await signOut({ preserveLocalWorkspace: true }).catch(() => undefined);
          return;
        }
        setSnapshot({
          status: "error",
          message:
            error instanceof Error
              ? error.message
              : "Zoption could not verify your financial workspace.",
        });
      } finally {
        clearTimeout(timeout);
      }
    };

    void run();
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [attempt, getAccessToken, sessionStatus, signOut, subject]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  const value = useMemo(() => ({ ...snapshot, retry }), [retry, snapshot]);

  return <WorkerIdentityContext.Provider value={value}>{children}</WorkerIdentityContext.Provider>;
}

export function useWorkerIdentity(): WorkerIdentitySnapshot {
  return useContext(WorkerIdentityContext);
}
