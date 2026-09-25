import { useReducedMotion } from "../../hooks/useReducedMotion";

import "./LedgerLoader.css";

type LedgerLoaderProps = {
  size?: "large" | "small";
};

/**
 * Zoption loading mark: three ledger rows, each swept by a fill that enters from
 * the left and leaves to the right, one row after another. The row tracks stay
 * on screen between sweeps, so the mark never blinks out, and a still frame of
 * three filled rows still reads as the mark under reduced motion.
 */
export function LedgerLoader({ size = "large" }: LedgerLoaderProps) {
  const reduceMotion = useReducedMotion();

  return (
    <span
      className="ledger-loader"
      data-size={size}
      data-reduced-motion={reduceMotion || undefined}
      aria-hidden="true"
    >
      <span className="ledger-loader-row">
        <span className="ledger-loader-fill" />
      </span>
      <span className="ledger-loader-row">
        <span className="ledger-loader-fill" />
      </span>
      <span className="ledger-loader-row">
        <span className="ledger-loader-fill" />
      </span>
    </span>
  );
}
