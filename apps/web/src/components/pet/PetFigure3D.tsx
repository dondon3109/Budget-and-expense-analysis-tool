import { tintPetHex, type PetColor } from "@zoption/shared";
import { useEffect, useRef } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import { mountPigScene } from "./pet3d/pigScene";

/**
 * PROTOTYPE: the Baby pig as a live 3D figure (three.js). Loaded lazily by PetPicture, so three.js
 * only downloads on the pet page for a pet that uses it. Reduced motion renders one still frame.
 */
export default function PetFigure3D({ color, size }: { color: PetColor | null; size: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const still = useReducedMotion();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    return mountPigScene(canvas, { body: tintPetHex("#F08FA6", color ?? "original"), still });
  }, [color, still]);

  return (
    <canvas
      ref={canvasRef}
      className="pet-figure-3d"
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
