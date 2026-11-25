import { tintPetHex, type PetColor, type PetReaction } from "@zoption/shared";
import { useEffect, useRef } from "react";

import { useReducedMotion } from "../../hooks/useReducedMotion";
import { mountPigScene, type PigScene } from "./pet3d/pigScene";

/**
 * PROTOTYPE: the Baby pig as a live 3D figure (three.js). Loaded lazily by PetModel, so three.js
 * only downloads for a pet that uses it. `still` (or reduced motion) renders one still frame. Each
 * new `tap` plays its reaction inside the scene, so the legs, ears, snout, and mouth follow through.
 */
export default function PetFigure3D({
  color,
  size,
  still = false,
  tap,
  className,
}: {
  color: PetColor | null;
  size: number;
  still?: boolean;
  tap?: { reaction: PetReaction; id: number } | null;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<PigScene | null>(null);
  const frozen = useReducedMotion() || still;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scene = mountPigScene(canvas, {
      body: tintPetHex("#F08FA6", color ?? "original"),
      still: frozen,
    });
    sceneRef.current = scene;
    return () => {
      sceneRef.current = null;
      scene.dispose();
    };
  }, [color, frozen]);

  useEffect(() => {
    if (tap) sceneRef.current?.react(tap.reaction);
  }, [tap]);

  return (
    <canvas
      ref={canvasRef}
      className={className ? `pet-figure-3d ${className}` : "pet-figure-3d"}
      style={{ width: size, height: size }}
      aria-hidden="true"
    />
  );
}
