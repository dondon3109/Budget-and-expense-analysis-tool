import NetInfo from "@react-native-community/netinfo";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
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
import { Platform } from "react-native";

import { verifyWorkerIdentity, WorkerIdentityError } from "@/api/worker-identity";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";

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
  const [snapshot, setSnapshot] = useState<
    Omit<WorkerIdentitySnapshot, "retry"> & { subject: string | null }
  >({
    subject: null,
    status: "idle",
    message: null,
  });
  const requestRef = useRef(0);
  const lastSubjectRef = useRef<string | null>(null);
  const offlineErrorRef = useRef(false);
  const wasReachableRef = useRef<boolean | null>(null);

  useEffect(() => {
    const requestId = requestRef.current + 1;
    requestRef.current = requestId;
    offlineErrorRef.current = false;
    if (lastSubjectRef.current !== subject) {
      lastSubjectRef.current = subject;
      wasReachableRef.current = null;
    }
    if (sessionStatus !== "signed-in" || !subject) {
      wasReachableRef.current = null;
      setSnapshot({ subject: null, status: "idle", message: null });
      return;
    }

    if (isDummyDevelopmentSubject(subject)) {
      wasReachableRef.current = null;
      setSnapshot({ subject, status: "verified", message: null });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20_000);
    setSnapshot({ subject, status: "checking", message: null });

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
          offlineErrorRef.current = false;
          wasReachableRef.current = null;
          setSnapshot({ subject, status: "verified", message: null });
        }
      } catch (error) {
        if (requestRef.current !== requestId) return;
        if (error instanceof DOMException && error.name === "AbortError") {
          offlineErrorRef.current = true;
          setSnapshot({
            subject,
            status: "error",
            message: "Workspace verification took too long. Check your connection and try again.",
          });
          return;
        }
        if (
          error instanceof WorkerIdentityError &&
          (error.code === "account_deleted" ||
            error.code === "identity_mismatch" ||
            (error.code === "session_expired" && Platform.OS !== "android"))
        ) {
          // Preserve the subject-scoped encrypted workspace when remote identity
          // can no longer be trusted enough to inspect or synchronize pending work.
          // Android keeps the sign-in through an expired access token. The phone
          // restart and an explicit sign-out are what end it.
          await signOut({ preserveLocalWorkspace: true }).catch(() => undefined);
          return;
        }
        if (error instanceof WorkerIdentityError && error.code === "session_expired") {
          offlineErrorRef.current = false;
          setSnapshot({
            subject,
            status: "error",
            message:
              "You're still signed in. Zoption could not refresh the connection. Your entries stay on this phone.",
          });
          return;
        }
        const isOfflineFailure =
          isAuthRetryableFetchError(error) ||
          (error instanceof WorkerIdentityError &&
            error.code === "unreachable" &&
            error.status === 0);
        if (isOfflineFailure) {
          offlineErrorRef.current = true;
          setSnapshot({
            subject,
            status: "error",
            message: "You're offline. Changes stay on this device and sync when you reconnect.",
          });
          return;
        }
        offlineErrorRef.current = false;
        setSnapshot({
          subject,
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
  const value = useMemo(() => {
    if (sessionStatus !== "signed-in" || !subject) {
      return { status: "idle" as const, message: null, retry };
    }
    if (isDummyDevelopmentSubject(subject)) {
      return { status: "verified" as const, message: null, retry };
    }
    if (snapshot.subject !== subject) {
      return { status: "checking" as const, message: null, retry };
    }
    return { status: snapshot.status, message: snapshot.message, retry };
  }, [retry, sessionStatus, snapshot, subject]);

  // A check that failed offline, including an offline start where NetInfo's first
  // online event transitions from null -> true, runs again once the device reconnects.
  // Keep wasReachableRef across retries while in error so an already-online 5xx
  // or captive-portal failure cannot spin in a tight loop.
  useEffect(() => {
    if (value.status !== "error") return;
    if (typeof NetInfo?.addEventListener !== "function") return;
    return NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable ?? state.isConnected;
      if (reachable === null || reachable === undefined) return;
      const previous = wasReachableRef.current;
      wasReachableRef.current = Boolean(reachable);
      if (!reachable) return;
      if (previous === false || (previous === null && offlineErrorRef.current)) {
        retry();
      }
    });
  }, [retry, value.status]);

  return <WorkerIdentityContext.Provider value={value}>{children}</WorkerIdentityContext.Provider>;
}

export function useWorkerIdentity(): WorkerIdentitySnapshot {
  return useContext(WorkerIdentityContext);
}
