import { useReducedMotion } from "../../hooks/useReducedMotion";

import "./InlineLoader.css";

type InlineLoaderProps = {
  label?: string;
};

/**
 * Compact branded loader for in-page/tab loading states. Pairs the Zoption
 * blob-mark motif with a soft pulsing copy line — a smaller sibling of the
 * full-page loading screen, not a plain-text placeholder.
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
        <span className="inline-loader-blob" />
        <span className="inline-loader-blob-inner" />
        <span className="inline-loader-dot" />
      </div>
      <p className="inline-loader-label">{label}…</p>
    </div>
  );
}