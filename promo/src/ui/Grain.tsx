import { useCurrentFrame } from "remotion";

/** Fine film grain; the seed changes every other frame so it shimmers instead of crawling. */
export const Grain = () => {
  const frame = useCurrentFrame();
  const seed = Math.floor(frame / 2) % 12;
  return (
    <svg
      width="100%"
      height="100%"
      style={{ position: "absolute", inset: 0, opacity: 0.07, mixBlendMode: "overlay", pointerEvents: "none", zIndex: 60 }}
    >
      <filter id="grain">
        <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" seed={seed} stitchTiles="stitch" />
        <feColorMatrix type="saturate" values="0" />
      </filter>
      <rect width="100%" height="100%" filter="url(#grain)" />
    </svg>
  );
};
