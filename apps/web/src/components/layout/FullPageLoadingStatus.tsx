import { useReducedMotion } from "../../hooks/useReducedMotion";

import "./FullPageLoadingStatus.css";

type FullPageLoadingStatusProps = {
  title: string;
  description: string;
};

export function FullPageLoadingStatus({
  title,
  description,
}: FullPageLoadingStatusProps) {
  const reduceMotion = useReducedMotion();

  return (
    <div
      className="full-page-status full-page-loading-status"
      data-reduced-motion={reduceMotion || undefined}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="full-page-loading-status-mark" aria-hidden="true">
        <span />
        <span />
        <span />
      </div>
      <div className="full-page-loading-status-copy">
        <span className="full-page-loading-status-brand">Zoption</span>
        <strong>{title}</strong>
        <p>{description}</p>
      </div>
    </div>
  );
}
