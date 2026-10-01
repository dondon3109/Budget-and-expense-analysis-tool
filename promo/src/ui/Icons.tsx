import type { CSSProperties, ReactNode } from "react";

type IconProps = { size?: number; color?: string; stroke?: number; style?: CSSProperties };

const make =
  (children: ReactNode, fill = false) =>
  ({ size = 40, color = "currentColor", stroke = 2.2, style }: IconProps) => (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={fill ? color : "none"}
      stroke={fill ? "none" : color}
      strokeWidth={stroke}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
    >
      {children}
    </svg>
  );

export const MicIcon = make(
  <>
    <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3z" />
    <path d="M19 11a7 7 0 0 1-14 0M12 18v3" />
  </>,
);
export const UtensilsIcon = make(
  <>
    <path d="M5 3v6a2 2 0 0 0 4 0V3M7 3v18" />
    <path d="M17 21V3c-2.4 1.2-4 4-4 7.5 0 2 1.4 3 4 3" />
  </>,
);
export const CartIcon = make(
  <>
    <path d="M3 4h2.2l2.3 10.5h10.3l1.9-7.5H6" />
    <circle cx="9" cy="19" r="1.4" />
    <circle cx="17" cy="19" r="1.4" />
  </>,
);
export const CheckIcon = make(<path d="M5 12.5l4.5 4.5L19 7.5" />);
export const CrossIcon = make(<path d="M6 6l12 12M18 6L6 18" />);
export const SparkleIcon = make(<path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />, true);
export const KeyboardIcon = make(
  <>
    <rect x="2.5" y="6" width="19" height="12" rx="2.5" />
    <path d="M6.5 10h.01M10 10h.01M14 10h.01M17.5 10h.01M7 14h10" />
  </>,
);
export const CardIcon = make(
  <>
    <rect x="2.5" y="5" width="19" height="14" rx="2.5" />
    <path d="M2.5 10h19M6 15h4" />
  </>,
);
export const ArrowRightIcon = make(<path d="M4 12h15M13 6l6 6-6 6" />);
export const WalletIcon = make(
  <>
    <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18v3" />
    <rect x="3" y="7" width="18" height="13" rx="2.5" />
    <path d="M16 13.5h2" />
  </>,
);
export const AppIcon = make(
  <>
    <rect x="4" y="4" width="16" height="16" rx="4.5" />
    <path d="M9 9h6l-6 6h6" />
  </>,
);
export const WifiIcon = make(
  <>
    <path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10.5 10.5 0 0 1 13 0M9 16a5 5 0 0 1 6 0" />
    <circle cx="12" cy="19.2" r="0.6" />
  </>,
);
export const BellIcon = make(
  <>
    <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15z" />
    <path d="M10 21h4" />
  </>,
);
