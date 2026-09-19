import { useEffect, useRef } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  MORPH_HOLD_MS,
  MORPH_PATHS,
  MORPH_TRANSITION_MS,
  easeInOutCubic,
  morphPathAt,
} from "./loadingMark";

import "./FullPageLoadingStatus.css";

export type LoadingPhase = "session" | "workspace" | "summary";

type FullPageLoadingStatusProps = {
  title: string;
  description: string;
  /** Which real step the app is on. Unknown work reports "session". */
  phase?: LoadingPhase;
  /** Steps finished so far. Omit when the caller cannot count them. */
  progress?: number;
  /** Fired when the loading surface has shown its exit and the app can take over. */
  onComplete?: () => void;
};

const PHASE_TEXT: Record<LoadingPhase, string> = {
  session: "Checking your session",
  workspace: "Loading your workspace",
  summary: "Fetching this month's summary",
};

const PHASE_COUNT = Object.keys(PHASE_TEXT).length;
const EXIT_MS = 260;

export function FullPageLoadingStatus({
  title,
  description,
  phase = "session",
  progress,
  onComplete,
}: FullPageLoadingStatusProps) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const markRef = useRef<SVGPathElement>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const requestedRef = useRef(false);

  // The mark is written straight to the DOM: a morph per frame through React
  // state would re-render this whole surface sixty times a second.
  useEffect(() => {
    const mark = markRef.current;
    if (!mark || reduceMotion) return;
    const cycle = MORPH_HOLD_MS + MORPH_TRANSITION_MS;
    const started = performance.now();
    let frame = requestAnimationFrame(function tick(now) {
      const elapsed = now - started;
      const shape = Math.floor(elapsed / cycle);
      const within = elapsed - shape * cycle;
      const blend = within < MORPH_HOLD_MS ? 0 : (within - MORPH_HOLD_MS) / MORPH_TRANSITION_MS;
      mark.setAttribute("d", morphPathAt(shape, easeInOutCubic(blend)));
      frame = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(frame);
  }, [reduceMotion]);

  // The caller signals readiness on the same frame it prepares to unmount this
  // surface, so holding the completion back by the exit length keeps the fade
  // from being cut off. Reduced motion has no exit to wait out.
  useEffect(() => {
    if (reduceMotion) {
      if (requestedRef.current) return;
      requestedRef.current = true;
      completeRef.current?.();
      return;
    }
    const finish = () => {
      if (requestedRef.current) return;
      requestedRef.current = true;
      completeRef.current?.();
    };
    const animation = rootRef.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], {
      duration: EXIT_MS,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
    });
    if (!animation) {
      finish();
      return;
    }
    animation.finished.then(finish).catch(finish);
  }, [reduceMotion]);

  return (
    <div
      ref={rootRef}
      className="full-page-status full-page-loading-status"
      data-reduced-motion={reduceMotion || undefined}
      role="status"
      aria-live="polite"
      aria-atomic="true"
      aria-busy="true"
    >
      <div className="full-page-loading-stage" aria-hidden="true">
        <div className="full-page-loading-aura" />
        <svg className="full-page-loading-svg" viewBox="0 0 80 80" fill="none">
          <circle className="full-page-loading-reticle" cx="40" cy="40" r="37" />
          <path ref={markRef} className="full-page-loading-mark" d={MORPH_PATHS[0]} />
        </svg>
      </div>

      <div className="full-page-loading-copy">
        <span className="full-page-loading-brand">Zoption Platform</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>

      <div className="full-page-loading-progress">
        {progress !== undefined && (
          <div
            className="full-page-loading-track"
            role="progressbar"
            aria-label="Workspace setup progress"
            aria-valuemin={0}
            aria-valuemax={PHASE_COUNT}
            aria-valuenow={progress}
            aria-valuetext={PHASE_TEXT[phase]}
          >
            <span
              className="full-page-loading-fill"
              style={{ transform: `scaleX(${Math.min(progress / PHASE_COUNT, 1)})` }}
            />
          </div>
        )}
        <span className="full-page-loading-status-phase" aria-live="off">
          {PHASE_TEXT[phase]}
        </span>
      </div>
    </div>
  );
}
