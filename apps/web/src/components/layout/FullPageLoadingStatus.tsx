import { useEffect, useRef, useState } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";

import "./FullPageLoadingStatus.css";

type FullPageLoadingStatusProps = {
  title: string;
  description: string;
  /** Full load duration in milliseconds. Defaults to 3000ms. */
  durationMs?: number;
  /** Fired once the load animation reaches 100%. */
  onComplete?: () => void;
};

const DEFAULT_DURATION_MS = 3000;

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

export function FullPageLoadingStatus({
  title,
  description,
  durationMs = DEFAULT_DURATION_MS,
  onComplete,
}: FullPageLoadingStatusProps) {
  const reduceMotion = useReducedMotion();
  const [percent, setPercent] = useState(reduceMotion ? 100 : 0);
  const completedRef = useRef(false);

  useEffect(() => {
    if (reduceMotion) {
      setPercent(100);
      if (!completedRef.current) {
        completedRef.current = true;
        onComplete?.();
      }
      return;
    }

    const start = performance.now();
    let raf = 0;
    const readyAt = durationMs * 0.92; // settle the counter just before the bar finishes

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / durationMs, 1);
      // Ease out, then gently breathe to 100% so the counter never stalls visibly.
      const eased = easeOutCubic(t);
      const pct = Math.max(eased, Math.min(elapsed / readyAt, 1));
      setPercent(Math.round(pct * 100));

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPercent(100);
        if (!completedRef.current) {
          completedRef.current = true;
          onComplete?.();
        }
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [durationMs, onComplete, reduceMotion]);

  return (
    <div
      className="full-page-status full-page-loading-status"
      data-reduced-motion={reduceMotion || undefined}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="full-page-loading-status-mark" aria-hidden="true">
        <div className="full-page-loading-status-blob" />
        <div className="full-page-loading-status-blob-inner" />
        <div className="full-page-loading-status-monogram">
          <svg viewBox="0 0 200 200" fill="none" aria-hidden="true">
            <path
              className="full-page-loading-status-z"
              pathLength={1}
              d="M 66 74 H 134 L 66 126 H 134"
            />
          </svg>
        </div>
        <div className="full-page-loading-status-orbit" aria-hidden="true">
          <span className="full-page-loading-status-ring">
            <i className="full-page-loading-status-dot dot-income" />
          </span>
          <span className="full-page-loading-status-ring">
            <i className="full-page-loading-status-dot dot-amber" />
          </span>
          <span className="full-page-loading-status-ring">
            <i className="full-page-loading-status-dot dot-brand" />
          </span>
        </div>
      </div>

      <div className="full-page-loading-status-copy">
        <span className="full-page-loading-status-brand">Zoption</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>

      <div className="full-page-loading-status-progress">
        <div className="full-page-loading-status-track" aria-hidden="true">
          <div
            className="full-page-loading-status-fill"
            style={{ width: `${percent}%` }}
          />
        </div>
        <div className="full-page-loading-status-counter">
          <span className="full-page-loading-status-pct" aria-hidden="true">
            {percent}%
          </span>
          <span className="full-page-loading-status-label">Restoring workspace</span>
        </div>
      </div>
    </div>
  );
}