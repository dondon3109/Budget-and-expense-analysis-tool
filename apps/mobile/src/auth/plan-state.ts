import { useCallback, useEffect, useState } from "react";

import { readPlan, type Plan } from "@/api/plan";

import { useSessionSnapshot } from "./session-state";

export type PlanStatus = "loading" | "ready" | "unknown";

// In-memory cache keyed by the immutable Supabase subject. Plan entitlement is a
// UI hint only: the Worker remains the authority for every Free/Pro limit, and an
// unknown or unreachable plan always fails closed to the Free view.
let cachedSubject: string | null = null;
let cachedPlan: Plan | null = null;

export function clearPlanCache(): void {
  cachedSubject = null;
  cachedPlan = null;
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
    if (cachedSubject === subject) {
      setPlan(cachedPlan);
      setStatus("ready");
      return;
    }

    const controller = new AbortController();
    let active = true;
    setStatus("loading");

    const run = async (): Promise<void> => {
      try {
        const accessToken = await getAccessToken(false);
        const next = await readPlan({ accessToken, signal: controller.signal });
        cachedSubject = subject;
        cachedPlan = next;
        if (active) {
          setPlan(next);
          setStatus("ready");
        }
      } catch (error) {
        if (!active) return;
        if (error instanceof DOMException && error.name === "AbortError") return;
        // Fail closed: without a confirmed plan the Free view is rendered.
        setPlan(null);
        setStatus("unknown");
      }
    };

    void run();
    return () => {
      active = false;
      controller.abort();
    };
  }, [attempt, getAccessToken, sessionStatus, subject]);

  const retry = useCallback(() => setAttempt((value) => value + 1), []);
  return { plan, status, retry };
}
