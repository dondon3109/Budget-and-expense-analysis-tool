import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { useReducedMotion } from "../../hooks/useReducedMotion";

import "./DashboardStartupExperience.css";

const INTRO_DURATION = 700;
const LOOP_DURATION = 1_200;
const MINIMUM_DURATION = 3_000;
const COMPLETE_DURATION = 480;

export type DashboardStartupPhase = "intro" | "loading" | "complete" | "hidden";

type DashboardStartupExperienceProps = {
  isAppReady: boolean;
  isAppSettled: boolean;
  hasCompleted: boolean;
  onComplete: () => void;
  onPhaseChange: (phase: DashboardStartupPhase) => void;
};

function phaseCopy(phase: DashboardStartupPhase) {
  switch (phase) {
    case "intro":
      return {
        title: "Opening Zoption",
        description: "Preparing your private financial workspace.",
      };
    case "complete":
      return {
        title: "Your dashboard is ready",
        description: "",
      };
    default:
      return {
        title: "Preparing your dashboard",
        description: "Organizing your balances, spending, and recent activity.",
      };
  }
}

export function DashboardStartupExperience({
  isAppReady,
  isAppSettled,
  hasCompleted,
  onComplete,
  onPhaseChange,
}: DashboardStartupExperienceProps) {
  const reduceMotion = useReducedMotion();
  const [phase, setPhase] = useState<DashboardStartupPhase>(() =>
    hasCompleted ? "hidden" : "intro",
  );
  const startedAtRef = useRef<number | undefined>(undefined);
  const loadingStartedAtRef = useRef<number | undefined>(undefined);
  const completionScheduledRef = useRef(false);

  useEffect(() => {
    onPhaseChange(phase);
  }, [onPhaseChange, phase]);

  useEffect(() => {
    if (hasCompleted) {
      setPhase("hidden");
      return undefined;
    }
    if (startedAtRef.current === undefined) startedAtRef.current = Date.now();

    const introTimer = window.setTimeout(() => {
      loadingStartedAtRef.current = Date.now();
      setPhase("loading");
    }, INTRO_DURATION);
    return () => window.clearTimeout(introTimer);
  }, [hasCompleted]);

  useEffect(() => {
    if (phase !== "loading" || completionScheduledRef.current || !isAppSettled) return undefined;

    const now = Date.now();
    const startedAt = startedAtRef.current ?? now;
    const loadingStartedAt = loadingStartedAtRef.current ?? now;
    const minimumReadyAt = startedAt + MINIMUM_DURATION;
    const earliestCompletionAt = Math.max(now, minimumReadyAt);
    const elapsedLoopDuration = Math.max(0, earliestCompletionAt - loadingStartedAt);
    const nextLoopBoundaryAt =
      loadingStartedAt + Math.ceil(elapsedLoopDuration / LOOP_DURATION) * LOOP_DURATION;
    const completionDelay = reduceMotion
      ? Math.max(0, minimumReadyAt - now)
      : Math.max(0, nextLoopBoundaryAt - now);

    completionScheduledRef.current = true;
    const completionTimer = window.setTimeout(() => setPhase("complete"), completionDelay);
    return () => {
      completionScheduledRef.current = false;
      window.clearTimeout(completionTimer);
    };
  }, [isAppReady, isAppSettled, phase, reduceMotion]);

  useEffect(() => {
    if (phase !== "complete") return undefined;

    if (reduceMotion) {
      setPhase("hidden");
      onComplete();
      return undefined;
    }

    const completionTimer = window.setTimeout(() => {
      setPhase("hidden");
      onComplete();
    }, COMPLETE_DURATION);
    return () => window.clearTimeout(completionTimer);
  }, [onComplete, phase, reduceMotion]);

  const isVisible = phase !== "hidden";

  useLayoutEffect(() => {
    if (!isVisible) return undefined;

    const root = document.getElementById("root");
    const previousBodyOverflow = document.body.style.overflow;
    const previousAriaHidden = root?.getAttribute("aria-hidden") ?? null;
    const previousInert = root?.inert ?? false;

    if (root) {
      root.inert = true;
      root.setAttribute("aria-hidden", "true");
    }
    document.body.style.overflow = "hidden";

    return () => {
      if (root) {
        root.inert = previousInert;
        if (previousAriaHidden === null) root.removeAttribute("aria-hidden");
        else root.setAttribute("aria-hidden", previousAriaHidden);
      }
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [isVisible]);

  if (!isVisible) return null;

  const { title, description } = phaseCopy(phase);

  return createPortal(
    <section
      className="dashboard-startup-experience"
      data-phase={phase}
      data-reduced-motion={reduceMotion || undefined}
      data-startup-phase={phase}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label={title}
    >
      <div className="dashboard-startup-experience-content">
        <div className="dashboard-startup-logo" aria-hidden="true">
          <span className="brand-mark">
            <span className="brand-monogram">Z</span>
          </span>
          <span className="dashboard-startup-highlight" />
          <span className="dashboard-startup-arc" />
        </div>
        <span className="brand-wordmark dashboard-startup-wordmark" aria-hidden="true">
          Zoption
        </span>
        <div className="dashboard-startup-copy">
          <strong>{title}</strong>
          {description && <p>{description}</p>}
        </div>
      </div>
    </section>,
    document.body,
  );
}
