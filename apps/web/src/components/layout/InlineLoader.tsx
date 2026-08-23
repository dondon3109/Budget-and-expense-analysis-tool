import { useReducedMotion } from "../../hooks/useReducedMotion";

import "./InlineLoader.css";

type InlineLoaderProps = {
  label?: string;
};

/**
 * Compact branded loader for in-page/tab loading states.
 * Uses the Zoption precision astrolabe gyroscope and laser-drawn Z-emblem.
 */
export function InlineLoader({ label = "Loading" }: InlineLoaderProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="inline-loader"
      data-reduced-motion={reduceMotion || undefined}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="inline-loader-mark" aria-hidden="true">
        {/* Subtle breathing ambient bloom */}
        <span className="inline-loader-bloom" />

        {/* Micro Astrolabe SVG */}
        <svg className="inline-loader-svg" viewBox="0 0 64 64" fill="none">
          <circle
            cx="32"
            cy="32"
            r="28"
            className="inline-loader-reticle-outer"
          />
          <circle
            cx="32"
            cy="32"
            r="20"
            className="inline-loader-reticle-inner"
          />
          <path
            d="M 22 24 H 42 L 22 40 H 42"
            className="inline-loader-z-track"
          />
          <path
            d="M 22 24 H 42 L 22 40 H 42"
            pathLength={1}
            className="inline-loader-z-stroke"
          />
          <circle cx="22" cy="24" r="2" className="inline-loader-vertex" />
          <circle cx="42" cy="24" r="2" className="inline-loader-vertex" />
          <circle cx="22" cy="40" r="2" className="inline-loader-vertex" />
          <circle cx="42" cy="40" r="2" className="inline-loader-vertex" />
        </svg>

        {/* Mini 3D Orbit Satellites */}
        <div className="inline-loader-orbit-system">
          <div className="inline-loader-orbit-plane plane-income">
            <span className="inline-loader-satellite sat-income" />
          </div>
          <div className="inline-loader-orbit-plane plane-amber">
            <span className="inline-loader-satellite sat-amber" />
          </div>
        </div>
      </div>

      <div className="inline-loader-copy">
        <span className="inline-loader-beacon" aria-hidden="true" />
        <p className="inline-loader-label">{label}…</p>
      </div>
    </div>
  );
}