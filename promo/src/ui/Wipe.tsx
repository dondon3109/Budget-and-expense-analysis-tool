import { useCurrentFrame } from "remotion";
import { C, easeInOut, prog } from "../theme";

/** Two skewed colour panels that sweep across the frame and hide a hard cut at `cut` (absolute frame). */
export const Wipe = ({ cut }: { cut: number }) => {
  const frame = useCurrentFrame();
  if (frame < cut - 8 || frame > cut + 14) return null;
  const panel = (delay: number, color: string, z: number) => {
    const inP = prog(frame, cut - 7 + delay, 8, easeInOut);
    const outP = prog(frame, cut + 1 + delay, 9, easeInOut);
    const x = (inP - 1) * 140 + outP * 140; // -140% → 0% → +140%
    return (
      <div
        key={z}
        style={{
          position: "absolute",
          top: -40,
          bottom: -40,
          left: "-15%",
          width: "130%",
          background: color,
          transform: `translateX(${x}%) skewX(-12deg)`,
          zIndex: z,
        }}
      />
    );
  };
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 50 }}>
      {panel(2, C.brandSoft, 1)}
      {panel(0, C.brand, 2)}
    </div>
  );
};
