import { useMemo } from "react";
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";
import { C, FONT } from "../theme";
import { drawLogoMark, useCanvasTexture } from "./textures";

/** The "Zoption Pro" badge that spins in during the offer. */
export const ProBadge = ({
  scale,
  rotY,
  rotX,
  position,
}: {
  scale: number;
  rotY: number;
  rotX: number;
  position: [number, number, number];
}) => {
  const front = useCanvasTexture(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = C.logoBg;
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = C.brand;
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.roundRect(28, 28, w - 56, h - 56, 64);
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(78, 80, 120, 120, 28);
    ctx.clip();
    drawLogoMark(ctx, 78, 80, 120);
    ctx.restore();
    ctx.fillStyle = C.cream;
    ctx.font = `700 64px ${FONT.display}`;
    ctx.textBaseline = "middle";
    ctx.fillText("zoption", 228, 142);
    ctx.fillStyle = C.brand;
    ctx.font = `800 330px ${FONT.display}`;
    ctx.textBaseline = "alphabetic";
    ctx.fillText("PRO", 70, 500);
    ctx.fillStyle = C.brandStrong;
    ctx.font = `600 38px ${FONT.mono}`;
    ctx.textAlign = "right";
    ctx.fillText("7 DAYS", w - 90, 190);
    ctx.fillText("ON US", w - 90, 238);
  });
  const back = useCanvasTexture(1024, 640, (ctx, w, h) => {
    ctx.fillStyle = C.logoBg;
    ctx.fillRect(0, 0, w, h);
    drawLogoMark(ctx, (w - 360) / 2, (h - 360) / 2, 360);
  });
  const geo = useMemo(() => new RoundedBoxGeometry(1.7, 1.063, 0.1, 6, 0.1), []);
  const materials = useMemo(() => {
    const edge = new THREE.MeshStandardMaterial({ color: C.brand, metalness: 0.4, roughness: 0.3 });
    const mk = (map: THREE.Texture) => new THREE.MeshStandardMaterial({ map, metalness: 0.1, roughness: 0.4 });
    return [edge, edge, edge, edge, mk(front), mk(back)];
  }, [front, back]);
  return (
    <group position={position} scale={scale} rotation={[rotX, rotY, 0]}>
      <mesh geometry={geo} material={materials} />
    </group>
  );
};
