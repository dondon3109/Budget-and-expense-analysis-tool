import type { CSSProperties, ReactNode } from "react";
import { C, FONT, pop, prog, ease } from "../theme";

/** Ring that expands from a tap point. */
export const Ripple = ({ rel, at, x, y, size = 120 }: { rel: number; at: number; x: number; y: number; size?: number }) => {
  const p = prog(rel, at, 16, ease);
  if (rel < at || p >= 1) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - size / 2,
        top: y - size / 2,
        width: size,
        height: size,
        borderRadius: "50%",
        border: `5px solid ${C.brand}`,
        transform: `scale(${0.4 + p * 1.4})`,
        opacity: 1 - p,
        zIndex: 30,
      }}
    />
  );
};

/** A fingertip dot that presses at a point. */
export const Finger = ({ rel, at, x, y }: { rel: number; at: number; x: number; y: number }) => {
  const inP = prog(rel, at - 8, 8);
  const outP = prog(rel, at + 6, 8);
  const press = rel >= at ? 0.82 : 1;
  const o = inP * (1 - outP);
  if (o <= 0) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: x - 34,
        top: y - 34 + (1 - inP) * 40,
        width: 68,
        height: 68,
        borderRadius: "50%",
        background: "rgba(237,242,240,0.55)",
        border: "3px solid rgba(237,242,240,0.9)",
        transform: `scale(${press})`,
        opacity: o,
        zIndex: 31,
      }}
    />
  );
};

/** Pill used for floating callouts around the phone. */
export const Chip = ({
  children,
  style,
  rel,
  at,
  tilt = 0,
}: {
  children: ReactNode;
  style?: CSSProperties;
  rel: number;
  at: number;
  tilt?: number;
}) => {
  const p = pop(rel, at, 11, 170);
  return (
    <div
      style={{
        position: "absolute",
        display: "flex",
        alignItems: "center",
        gap: 18,
        padding: "22px 34px",
        borderRadius: 999,
        background: C.cream,
        color: C.logoBg,
        fontFamily: FONT.display,
        fontWeight: 800,
        fontSize: 48,
        boxShadow: "0 24px 60px rgba(0,0,0,0.5)",
        transform: `scale(${Math.max(0, p)}) rotate(${tilt}deg)`,
        opacity: Math.min(1, p * 2),
        ...style,
      }}
    >
      {children}
    </div>
  );
};

export const Kicker = ({ children, style }: { children: ReactNode; style?: CSSProperties }) => (
  <div
    style={{
      fontFamily: FONT.mono,
      fontWeight: 600,
      fontSize: 38,
      letterSpacing: "0.32em",
      textTransform: "uppercase",
      color: C.brand,
      textAlign: "center",
      ...style,
    }}
  >
    {children}
  </div>
);
