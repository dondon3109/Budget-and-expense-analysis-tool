import { useCallback, useEffect, useState } from "react";

import { readPlan, type Plan } from "@/api/plan";
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

function fetchPlanForSubject(
  subject: string,
  getAccessToken: (refresh: boolean) => Promise<string>,
): Promise<Plan> {
  if (inFlight && inFlight.subject === subject) return inFlight.promise;
  const token = {};
  const promise = (async () => {
    const accessToken = await getAccessToken(false);
    const next = await readPlan({ accessToken });
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

  useEffect(() => {
    if (sessionStatus !== "signed-in" || !subject) {
      setPlan(null);
      setStatus("unknown");
      return;
    }
    if (isDummyDevelopmentSubject(subject)) {
      setPlan("zoption_pro");
      setStatus("ready");
      return;
    }
    if (cachedSubject === subject) {
      setPlan(cachedPlan);
      setStatus("ready");
      return;
    }

    let active = true;
    setStatus("loading");

    void fetchPlanForSubject(subject, getAccessToken)
      .then((next) => {
        if (active) {
          setPlan(next);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!active) return;
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
  return { plan, status, retry };
}
