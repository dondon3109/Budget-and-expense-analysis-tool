import { LedgerLoader } from "./LedgerLoader";

import "./InlineLoader.css";

type InlineLoaderProps = {
  label?: string;
};

/** Compact loading state for in-page and tab-level work; the small ledger loader. */
export function InlineLoader({ label = "Loading" }: InlineLoaderProps) {
  return (
    <div className="inline-loader" role="status" aria-live="polite" aria-busy="true">
      <LedgerLoader size="small" />
      <p className="inline-loader-label">{label}…</p>
    </div>
  );
}
