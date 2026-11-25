import { tintPetHex, type PetColor } from "@zoption/shared";
import { useEffect, useRef } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import { mountPigScene } from "./pet3d/pigScene";

/**
 * PROTOTYPE: the Baby pig as a live 3D figure (three.js). Loaded lazily by PetModel, so three.js
 * only downloads for a pet that uses it. `still` (or reduced motion) renders one still frame.
 */
export default function PetFigure3D({
  color,
  size,
  still = false,
  className,
}: {
  color: PetColor | null;
  size: number;
  still?: boolean;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frozen = useReducedMotion() || still;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountPigScene(canvas, {
      body: tintPetHex("#F08FA6", color ?? "original"),
      still: frozen,
    });
  }, [color, frozen]);

  return (
    <canvas
      ref={canvasRef}
      className={className ? `pet-figure-3d ${className}` : "pet-figure-3d"}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
