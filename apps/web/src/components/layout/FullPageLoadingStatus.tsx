import { useEffect, useRef } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import {
  ASCENDER_LENGTH,
  ASCENDER_PATH,
  ASCENDER_TIMING,
  MARK_VIEW_BOX,
  MONOGRAM_DASH,
  MONOGRAM_LENGTH,
  MONOGRAM_PATH,
  MONOGRAM_RESTING_OFFSET,
  MONOGRAM_TIMING,
  ascenderKeyframes,
  monogramKeyframes,
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
  /**
   * Set once the app behind this surface can be shown. The exit fade starts here,
   * never at mount: starting it early reveals the workspace and then snaps the
   * surface back when the animation ends, which is the flash it used to show.
   * A caller that unmounts this surface itself gets no exit, so handing over
   * through the fade means passing this together with `onComplete`.
   */
  ready?: boolean;
  /** Fired when the loading surface has shown its exit and the app can take over. */
  onComplete?: () => void;
};

const PHASE_TEXT: Record<LoadingPhase, string> = {
  session: "Checking your session",
  workspace: "Loading your workspace",
  summary: "Fetching this month's summary",
};

const PHASE_COUNT = Object.keys(PHASE_TEXT).length;
const EXIT_MS = 240;

export function FullPageLoadingStatus({
  title,
  description,
  phase = "session",
  progress,
  ready = false,
  onComplete,
}: FullPageLoadingStatusProps) {
  const reduceMotion = useReducedMotion();
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRef = useRef<SVGPathElement>(null);
  const markRef = useRef<SVGPathElement>(null);
  const completeRef = useRef(onComplete);
  completeRef.current = onComplete;
  const requestedRef = useRef(false);

  // Both elements animate themselves on the compositor. Declarative keyframes
  // rather than per-frame writes: this loop has to be exact, and it must not
  // touch React state while the app is still starting up.
  useEffect(() => {
    if (reduceMotion) return;
    const line = lineRef.current;
    const mark = markRef.current;
    if (!line || !mark || typeof line.animate !== "function") return;
    const animations = [
      line.animate(ascenderKeyframes(), ASCENDER_TIMING),
      mark.animate(monogramKeyframes(), MONOGRAM_TIMING),
    ];
    return () => {
      for (const animation of animations) animation.cancel();
    };
  }, [reduceMotion]);

  // The exit belongs to the handover, so it waits for the caller to say the app
  // behind can take over. It fills forwards, because an exit that stops applying
  // when it ends puts the surface back on screen for the frame before unmount.
  // Reduced motion has no exit to wait out.
  useEffect(() => {
    if (!ready) return;
    const finish = () => {
      if (requestedRef.current) return;
      requestedRef.current = true;
      completeRef.current?.();
    };
    if (reduceMotion) {
      finish();
      return;
    }
    const animation = rootRef.current?.animate?.([{ opacity: 1 }, { opacity: 0 }], {
      duration: EXIT_MS,
      easing: "cubic-bezier(0.4, 0, 0.2, 1)",
      fill: "forwards",
    });
    if (!animation) {
      finish();
      return;
    }
    animation.finished.then(finish).catch(finish);
  }, [ready, reduceMotion]);

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
      <svg
        className="full-page-loading-mark"
        viewBox={MARK_VIEW_BOX}
        fill="none"
        aria-hidden="true"
      >
        {!reduceMotion && (
          <path
            ref={lineRef}
            className="full-page-loading-line"
            d={ASCENDER_PATH}
            strokeDasharray={ASCENDER_LENGTH * 2}
            strokeDashoffset={ASCENDER_LENGTH * 2}
          />
        )}
        <path
          ref={markRef}
          className="full-page-loading-monogram"
          d={MONOGRAM_PATH}
          strokeDasharray={MONOGRAM_DASH}
          strokeDashoffset={reduceMotion ? MONOGRAM_RESTING_OFFSET : MONOGRAM_LENGTH}
        />
      </svg>

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
