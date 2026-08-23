import { useEffect, useMemo, useRef, useState } from "react";

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

const MILESTONES = [
  { threshold: 0, text: "Securing encrypted session" },
  { threshold: 24, text: "Calibrating real-time ledgers" },
  { threshold: 52, text: "Synthesizing cashflow models" },
  { threshold: 78, text: "Aligning workspace horizons" },
  { threshold: 100, text: "Workspace ready" },
];

export function FullPageLoadingStatus({
  title,
  description,
  durationMs = DEFAULT_DURATION_MS,
  onComplete,
}: FullPageLoadingStatusProps) {
  const reduceMotion = useReducedMotion();
  const [percent, setPercent] = useState(reduceMotion ? 100 : 0);
  const completedRef = useRef(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    if (reduceMotion) {
      setPercent(100);
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
      return;
    }

    const start = performance.now();
    let raf = 0;
    const readyAt = durationMs * 0.92; // Settle the counter smoothly right before the bar finishes

    const tick = (now: number) => {
      const elapsed = now - start;
      const t = Math.min(elapsed / durationMs, 1);
      const eased = easeOutCubic(t);
      const pct = Math.max(eased, Math.min(elapsed / readyAt, 1));
      setPercent(Math.round(pct * 100));

      if (t < 1) {
        raf = requestAnimationFrame(tick);
      } else {
        setPercent(100);
        if (!completedRef.current) {
          completedRef.current = true;
          onCompleteRef.current?.();
        }
      }
    };

    raf = requestAnimationFrame(tick);

    // Guaranteed fallback timeout in case RAF is throttled in a background tab
    const fallbackTimer = window.setTimeout(() => {
      setPercent(100);
      if (!completedRef.current) {
        completedRef.current = true;
        onCompleteRef.current?.();
      }
    }, durationMs + 100);

    return () => {
      cancelAnimationFrame(raf);
      window.clearTimeout(fallbackTimer);
    };
  }, [durationMs, reduceMotion]);

  const activePhaseText = useMemo(() => {
    let current = "Securing encrypted session";
    for (const m of MILESTONES) {
      if (percent >= m.threshold) {
        current = m.text;
      }
    }
    return current;
  }, [percent]);

  return (
    <div
      className="full-page-status full-page-loading-status"
      data-reduced-motion={reduceMotion || undefined}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="full-page-loading-stage" aria-hidden="true">
        {/* Ambient atmospheric aura & subtle luminous core */}
        <div className="full-page-loading-aura" />
        <div className="full-page-loading-core-bloom" />

        {/* Central kinetic emblem: Financial Astrolabe */}
        <div className="full-page-loading-status-mark">
          {/* Geometric Reticle & Laser-Drawn Monogram */}
          <svg
            className="full-page-loading-svg"
            viewBox="0 0 200 200"
            fill="none"
            aria-hidden="true"
          >
            <defs>
              <linearGradient id="zoption-laser-grad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="var(--income)" stopOpacity="0.95" />
                <stop offset="50%" stopColor="var(--brand)" stopOpacity="1" />
                <stop offset="100%" stopColor="var(--brand-strong)" stopOpacity="0.9" />
              </linearGradient>
              <filter id="zoption-glow" x="-20%" y="-20%" width="140%" height="140%">
                <feGaussianBlur stdDeviation="3.5" result="blur" />
                <feMerge>
                  <feMergeNode in="blur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            {/* Outer harmonic reticle & cardinal ticks */}
            <circle
              className="full-page-loading-reticle-outer"
              cx="100"
              cy="100"
              r="90"
            />
            <circle
              className="full-page-loading-reticle-inner"
              cx="100"
              cy="100"
              r="68"
            />

            {/* Cardinal calibration pips */}
            <line x1="100" y1="4" x2="100" y2="12" className="full-page-loading-tick" />
            <line x1="100" y1="188" x2="100" y2="196" className="full-page-loading-tick" />
            <line x1="4" y1="100" x2="12" y2="100" className="full-page-loading-tick" />
            <line x1="188" y1="100" x2="196" y2="100" className="full-page-loading-tick" />

            {/* Corner micro-crosshairs */}
            <circle cx="36" cy="36" r="1.5" className="full-page-loading-dot-pip" />
            <circle cx="164" cy="36" r="1.5" className="full-page-loading-dot-pip" />
            <circle cx="36" cy="164" r="1.5" className="full-page-loading-dot-pip" />
            <circle cx="164" cy="164" r="1.5" className="full-page-loading-dot-pip" />

            {/* Z Monogram — Underlying guide track */}
            <path
              className="full-page-loading-z-track"
              d="M 68 74 H 132 L 68 126 H 132"
            />

            {/* Z Monogram — Precision drawing stroke */}
            <path
              className="full-page-loading-status-z"
              pathLength={1}
              d="M 68 74 H 132 L 68 126 H 132"
            />

            {/* Z Monogram — Traveling photon beam */}
            <path
              className="full-page-loading-z-gleam"
              pathLength={1}
              d="M 68 74 H 132 L 68 126 H 132"
              filter="url(#zoption-glow)"
            />

            {/* Vertex Node Jewels */}
            <circle cx="68" cy="74" r="4" className="full-page-loading-vertex vertex-1" />
            <circle cx="132" cy="74" r="4" className="full-page-loading-vertex vertex-2" />
            <circle cx="68" cy="126" r="4" className="full-page-loading-vertex vertex-3" />
            <circle cx="132" cy="126" r="4" className="full-page-loading-vertex vertex-4" />
          </svg>

          {/* 3D Multi-plane orbital satellites */}
          <div className="full-page-loading-orbit-system" aria-hidden="true">
            <div className="full-page-loading-orbit-plane orbit-plane-income">
              <span className="full-page-loading-satellite sat-income">
                <i className="full-page-loading-satellite-core" />
                <i className="full-page-loading-satellite-halo" />
              </span>
            </div>
            <div className="full-page-loading-orbit-plane orbit-plane-amber">
              <span className="full-page-loading-satellite sat-amber">
                <i className="full-page-loading-satellite-core" />
                <i className="full-page-loading-satellite-halo" />
              </span>
            </div>
            <div className="full-page-loading-orbit-plane orbit-plane-brand">
              <span className="full-page-loading-satellite sat-brand">
                <i className="full-page-loading-satellite-core" />
                <i className="full-page-loading-satellite-halo" />
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Editorial Identity & Typography */}
      <div className="full-page-loading-status-copy">
        <div className="full-page-loading-status-badge">
          <span className="full-page-loading-status-beacon" aria-hidden="true" />
          <span className="full-page-loading-status-brand">Zoption Platform</span>
        </div>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>

      {/* Precision Financial Telemetry & Progress Gauge */}
      <div className="full-page-loading-status-progress">
        <div className="full-page-loading-status-track" aria-hidden="true">
          <div
            className="full-page-loading-status-fill"
            style={{ width: `${percent}%` }}
          >
            <span className="full-page-loading-status-cursor" />
          </div>
          {/* Milestone demarcation notches */}
          <span className="full-page-loading-notch notch-25" />
          <span className="full-page-loading-notch notch-50" />
          <span className="full-page-loading-notch notch-75" />
        </div>

        <div className="full-page-loading-status-telemetry">
          <div className="full-page-loading-status-counter" aria-hidden="true">
            <span className="full-page-loading-status-pct">{percent}</span>
            <span className="full-page-loading-status-pct-symbol">%</span>
          </div>
          <span className="full-page-loading-status-phase" aria-hidden="true">
            {activePhaseText}
          </span>
        </div>
      </div>
    </div>
  );
}