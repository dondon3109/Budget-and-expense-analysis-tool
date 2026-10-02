import { useMemo } from "react";
import * as THREE from "three";
import { C, pop } from "../theme";

export const CATEGORIES = [
  { name: "Food", pct: 36, color: C.brand },
  { name: "Bills", pct: 24, color: C.brandStrong },
  { name: "Transport", pct: 16, color: C.brandMid },
  { name: "Fun", pct: 14, color: C.cream },
  { name: "Savings", pct: 10, color: "#1f6b55" },
] as const;

const OUTER = 1;
const INNER = 0.6;
const DEPTH = 0.3;
const GAP = 0.035;

/** A 3D spending donut. Each slice springs out of the middle in turn. */
export const Donut = ({
  rel,
  position,
  scale,
  spin,
}: {
  rel: number;
  position: [number, number, number];
  scale: number;
  spin: number;
}) => {
  const slices = useMemo(() => {
    let a = Math.PI / 2;
    return CATEGORIES.map((c) => {
      const sweep = (c.pct / 100) * Math.PI * 2;
      const a0 = a + GAP;
      const a1 = a + sweep - GAP;
      a += sweep;
      const s = new THREE.Shape();
      s.moveTo(Math.cos(a0) * INNER, Math.sin(a0) * INNER);
      s.lineTo(Math.cos(a0) * OUTER, Math.sin(a0) * OUTER);
      s.absarc(0, 0, OUTER, a0, a1, false);
      s.lineTo(Math.cos(a1) * INNER, Math.sin(a1) * INNER);
      s.absarc(0, 0, INNER, a1, a0, true);
      const geo = new THREE.ExtrudeGeometry(s, {
        depth: DEPTH,
        bevelEnabled: true,
        bevelSize: 0.018,
        bevelThickness: 0.018,
        bevelSegments: 3,
        curveSegments: 40,
      });
      geo.translate(0, 0, -DEPTH / 2);
      const mid = (a0 + a1) / 2;
      return { geo, color: c.color, dir: [Math.cos(mid), Math.sin(mid)] as const };
    });
  }, []);

  return (
    <group position={position} scale={scale} rotation={[-0.95, 0, 0]}>
      <group rotation={[0, 0, spin]}>
        {slices.map((s, i) => {
          const p = pop(rel, i * 5, 10, 120);
          const out = (1 - p) * 1.4;
          return (
            <mesh
              key={i}
              geometry={s.geo}
              position={[s.dir[0] * out, s.dir[1] * out, 0]}
              scale={[Math.max(0.001, p), Math.max(0.001, p), Math.max(0.001, p)]}
            >
              <meshStandardMaterial color={s.color} metalness={0.15} roughness={0.42} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
};
