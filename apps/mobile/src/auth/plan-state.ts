import NetInfo from "@react-native-community/netinfo";
import { isAuthRetryableFetchError } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

import { PlanError, readPlan, type Plan } from "@/api/plan";
import { isDummyDevelopmentSubject } from "@/db/demo-seed";

import { useSessionSnapshot } from "./session-state";

export type PlanStatus = "loading" | "ready" | "unknown";

// In-memory cache keyed by the immutable Supabase subject. Plan entitlement is a
// UI hint only: the Worker remains the authority for every Free/Pro limit, and an
// unknown or unreachable plan always fails closed to the Free view.
let cachedSubject: string | null = null;
let cachedPlan: Plan | null = null;
// Shares one in-flight request when several mounted screens call usePlan() at launch.
let inFlight: { subject: string; token: object; promise: Promise<Plan> } | null = null;

export function clearPlanCache(): void {
  cachedSubject = null;
  cachedPlan = null;
  inFlight = null;
}

function isOfflineNetworkError(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (error instanceof PlanError) {
    return error.code === "unreachable" && error.status === 0;
  }
  return !(error instanceof DOMException && error.name === "AbortError");
}

function fetchPlanForSubject(
  subject: string,
  getAccessToken: (refresh: boolean) => Promise<string>,
): Promise<Plan> {
  if (inFlight && inFlight.subject === subject) return inFlight.promise;
  const token = {};
  const promise = (async () => {
    let accessToken = await getAccessToken(false);
    let next: Plan;
    try {
      next = await readPlan({ accessToken });
    } catch (error) {
      if (!(error instanceof PlanError) || error.code !== "session_expired") {
        throw error;
      }
      accessToken = await getAccessToken(true);
      next = await readPlan({ accessToken });
    }
    if (inFlight?.token === token) {
      cachedSubject = subject;
      cachedPlan = next;
    }
    return next;
  })().finally(() => {
    if (inFlight?.token === token) inFlight = null;
  });
  inFlight = { subject, token, promise };
  return promise;
}

export function usePlan(): { plan: Plan | null; status: PlanStatus; retry: () => void } {
  const { subject, status: sessionStatus, getAccessToken } = useSessionSnapshot();
  const [plan, setPlan] = useState<Plan | null>(() =>
    cachedSubject !== null && cachedSubject === subject ? cachedPlan : null,
  );
  const [status, setStatus] = useState<PlanStatus>(() =>
    cachedSubject !== null && cachedSubject === subject ? "ready" : "unknown",
  );
  const [attempt, setAttempt] = useState(0);
  const hasFailedRef = useRef(false);
  const offlineFailureRef = useRef(false);
  const wasReachableRef = useRef<boolean | null>(null);

  useEffect(() => {
    if (sessionStatus !== "signed-in" || !subject) {
      hasFailedRef.current = false;
      offlineFailureRef.current = false;
      wasReachableRef.current = null;
      setPlan(null);
      setStatus("unknown");
      return;
    }
    if (isDummyDevelopmentSubject(subject)) {
      hasFailedRef.current = false;
      offlineFailureRef.current = false;
      wasReachableRef.current = null;
      setPlan("zoption_pro");
      setStatus("ready");
      return;
    }
    if (cachedSubject === subject) {
      hasFailedRef.current = false;
      offlineFailureRef.current = false;
      wasReachableRef.current = null;
      setPlan(cachedPlan);
      setStatus("ready");
      return;
    }

    let active = true;
    hasFailedRef.current = false;
    offlineFailureRef.current = false;
    setStatus("loading");

    void fetchPlanForSubject(subject, getAccessToken)
      .then((next) => {
        if (active) {
          hasFailedRef.current = false;
          offlineFailureRef.current = false;
          wasReachableRef.current = null;
          setPlan(next);
          setStatus("ready");
        }
      })
      .catch((error: unknown) => {
        if (!active) return;
        hasFailedRef.current = true;
        offlineFailureRef.current = isOfflineNetworkError(error);
        // Fail closed: without a confirmed plan the Free view is rendered.
        setPlan(null);
        setStatus("unknown");
      });

    return () => {
      active = false;
    };
  }, [attempt, getAccessToken, sessionStatus, subject]);

  const retry = useCallback(() => {
    if (cachedSubject === subject) {
      cachedSubject = null;
      cachedPlan = null;
    }
    setAttempt((value) => value + 1);
  }, [subject]);

  useEffect(() => {
    if (
      status !== "unknown" ||
      !hasFailedRef.current ||
      sessionStatus !== "signed-in" ||
      !subject ||
      isDummyDevelopmentSubject(subject)
    ) {
      return;
    }
    if (typeof NetInfo?.addEventListener !== "function") return;
    return NetInfo.addEventListener((state) => {
      const reachable = state.isInternetReachable ?? state.isConnected;
      if (reachable === null || reachable === undefined) return;
      const previous = wasReachableRef.current;
      wasReachableRef.current = Boolean(reachable);
      if (!reachable) return;
      if (previous === false || (previous === null && offlineFailureRef.current)) {
        retry();
      }
    });
  }, [retry, sessionStatus, status, subject]);

  return { plan, status, retry };
}
