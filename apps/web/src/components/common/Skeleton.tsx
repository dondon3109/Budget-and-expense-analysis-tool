import { useId, type ReactNode } from "react";

import "./Skeleton.css";

type SkeletonLength = string | number;

export interface SkeletonProps {
  /** Any CSS length; numbers are treated as pixels. Defaults to the CSS width. */
  width?: SkeletonLength;
  /** Any CSS length; numbers are treated as pixels. Defaults to 12px. */
  height?: SkeletonLength;
  /** Any CSS border-radius value, e.g. "999px" or "var(--radius-md)". */
  radius?: string;
  className?: string;
}

function cssLength(value: SkeletonLength | undefined): string | undefined {
  return typeof value === "number" ? `${value}px` : value;
}

function joinClassNames(...names: (string | undefined)[]): string {
  return names.filter(Boolean).join(" ");
}

/**
 * One decorative placeholder bar. Always aria-hidden: the surrounding
 * SkeletonStatus owns the announcement, so the bars stay purely visual.
 */
export function Skeleton({ width, height, radius, className }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={joinClassNames("skeleton", className)}
      style={{ width: cssLength(width), height: cssLength(height), borderRadius: radius }}
    />
  );
}

export interface SkeletonTableRowsProps {
  /** Number of placeholder rows. Defaults to 5. */
  rows?: number;
  /** Column count; match the real table's <thead>, do not guess. */
  columns: number;
}

/** Placeholder rows for an existing table body. Render inside a <tbody>. */
export function SkeletonTableRows({ rows = 5, columns }: SkeletonTableRowsProps) {
  return (
    <>
      {Array.from({ length: rows }, (_, rowIndex) => (
        <tr key={rowIndex}>
          {Array.from({ length: columns }, (_, columnIndex) => (
            <td key={columnIndex}>
              <Skeleton height={14} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

export interface SkeletonStatusProps {
  /** Announced to assistive technology for as long as the skeleton is visible. */
  label: string;
  className?: string;
  children?: ReactNode;
}

/**
 * Live loading region for skeletons. The bars carry no text, so the label is
 * duplicated as a visually hidden live label and wired up with aria-labelledby
 * so the container keeps a real accessible name.
 */
export function SkeletonStatus({ label, className, children }: SkeletonStatusProps) {
  const labelId = useId();

  return (
    <div
      className={joinClassNames("skeleton-status", className)}
      role="status"
      aria-live="polite"
      aria-labelledby={labelId}
    >
      <span className="sr-only" id={labelId}>
        {label}
      </span>
      {children}
    </div>
  );
}
