import type { CSSProperties, ReactNode } from "react";
import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import type { AdTheme } from "../config/types";
import { clamp, easeOut, sceneFade } from "../motion";
import { BrandLockup } from "./Brand";

type AdCanvasProps = {
  children: ReactNode;
  theme: AdTheme;
  dark?: boolean;
  progress?: boolean;
};

export function AdCanvas({ children, theme, dark = false, progress = true }: AdCanvasProps) {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const complete = interpolate(frame, [0, durationInFrames - 1], [0, 100], clamp);
  const variables = {
    "--ad-bg": dark ? theme.accentStrong : theme.background,
    "--ad-ink": dark ? theme.paper : theme.ink,
    "--ad-muted": dark ? "#b9d8cc" : theme.muted,
    "--ad-accent": dark ? "#67e0bc" : theme.accent,
    "--ad-accent-strong": dark ? theme.paper : theme.accentStrong,
    "--ad-accent-soft": dark ? "#123f35" : theme.accentSoft,
    "--ad-paper": dark ? "#17342e" : theme.paper,
  } as CSSProperties;

  return (
    <AbsoluteFill className={`ad-canvas${dark ? " is-dark" : ""}`} style={variables}>
      <div className="ambient-shape ambient-shape-one" />
      <div className="ambient-shape ambient-shape-two" />
      {progress ? (
        <div className="timeline-progress" aria-hidden="true">
          <span style={{ width: `${complete}%` }} />
        </div>
      ) : null}
      {children}
    </AbsoluteFill>
  );
}

export function SafeFrame({
  children,
  className = "",
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div className={`safe-frame ${className}`} style={style}>
      {children}
    </div>
  );
}

export function Scene({
  children,
  duration,
  className = "",
  fadeIn = 10,
  fadeOut = 14,
  style,
}: {
  children: ReactNode;
  duration: number;
  className?: string;
  fadeIn?: number;
  fadeOut?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const opacity = sceneFade(frame, duration, fadeIn, fadeOut);
  return (
    <AbsoluteFill className={`ad-scene ${className}`} style={{ opacity, ...style }}>
      {children}
    </AbsoluteFill>
  );
}

export function PersistentHeader({ dark = false }: { dark?: boolean }) {
  return (
    <div className="persistent-header">
      <BrandLockup size={48} wordmarkSize={27} inverse={dark} />
      <span className="sound-safe-label">Designed for sound-off</span>
    </div>
  );
}

export function Kicker({ children, delay = 0 }: { children: ReactNode; delay?: number }) {
  const frame = useCurrentFrame();
  const progress = easeOut(frame, delay, 14);
  return (
    <div
      className="kicker"
      style={{
        opacity: progress,
        transform: `translateY(${18 * (1 - progress)}px)`,
      }}
    >
      <span />
      {children}
    </div>
  );
}

export function BigHeadline({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const progress = easeOut(frame, delay, Math.round(fps * 0.65));
  return (
    <h1
      className="big-headline"
      style={{
        opacity: Math.max(0.001, progress),
        transform: `translateY(${46 * (1 - progress)}px)`,
        clipPath: `inset(${(1 - progress) * 100}% 0 0 0)`,
        ...style,
      }}
    >
      {children}
    </h1>
  );
}

export function Caption({
  children,
  delay = 0,
  style,
}: {
  children: ReactNode;
  delay?: number;
  style?: CSSProperties;
}) {
  const frame = useCurrentFrame();
  const progress = easeOut(frame, delay, 16);
  return (
    <p
      className="ad-caption"
      style={{ opacity: progress, transform: `translateY(${24 * (1 - progress)}px)`, ...style }}
    >
      {children}
    </p>
  );
}
