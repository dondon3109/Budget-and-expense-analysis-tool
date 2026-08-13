import type { CSSProperties } from "react";

type BrandMarkProps = {
  size?: number;
  inverse?: boolean;
};

export function BrandMark({ size = 72, inverse = false }: BrandMarkProps) {
  const background = inverse ? "#f4f1e9" : "#06473d";
  const stroke = inverse ? "#06473d" : "#f4f1e9";

  return (
    <svg
      aria-hidden="true"
      width={size}
      height={size}
      viewBox="0 0 72 72"
      style={{ flex: "0 0 auto" }}
    >
      <rect width="72" height="72" rx="21" fill={background} />
      <path
        d="M23 24h27L26 49h28"
        fill="none"
        stroke={stroke}
        strokeWidth="10"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

type BrandLockupProps = BrandMarkProps & {
  style?: CSSProperties;
  wordmarkSize?: number;
};

export function BrandLockup({ style, wordmarkSize = 38, ...markProps }: BrandLockupProps) {
  return (
    <div className="brand-lockup" style={style}>
      <BrandMark {...markProps} />
      <span style={{ fontSize: wordmarkSize }}>Zoption</span>
    </div>
  );
}
