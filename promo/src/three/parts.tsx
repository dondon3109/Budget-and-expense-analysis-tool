import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { C, ease, pop, prog, rand } from "../theme";
import { FPS } from "../timing";
import { drawLogoMark, makeDotTexture, useCanvasTexture } from "./textures";

const tmp = new THREE.Object3D();
const color = new THREE.Color();

/** Slowly rising field of soft brand-green dust. */
export const Stars = ({ abs }: { abs: number }) => {
  const { positions, dot } = useMemo(() => {
    const n = 900;
    const arr = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      arr[i * 3] = (rand(i * 3 + 1) - 0.5) * 16;
      arr[i * 3 + 1] = -26 + rand(i * 3 + 2) * 34;
      arr[i * 3 + 2] = -16 + rand(i * 3 + 3) * 14;
    }
    return { positions: arr, dot: makeDotTexture() };
  }, []);
  return (
    <points position={[0, abs * 0.016, 0]}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        map={dot}
        color={C.brand}
        size={0.14}
        sizeAttenuation
        transparent
        opacity={0.8}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
};

/** Drifting coins behind the phone scenes; fades in and out with `visible` (0..1). */
export const AmbientCoins = ({ abs, visible }: { abs: number; visible: number }) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const count = 22;
  const coins = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const side = i % 2 ? 1 : -1;
        return {
          x: side * (0.95 + rand(i + 1) * 2.1),
          y0: rand(i + 20) * 9,
          z: -4.6 + rand(i + 40) * 3.6,
          speed: 0.006 + rand(i + 60) * 0.011,
          spin: 0.02 + rand(i + 80) * 0.05,
          tilt: rand(i + 90) * Math.PI,
          size: 0.65 + rand(i + 100) * 0.7,
        };
      }),
    [],
  );
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    mesh.visible = visible > 0.001;
    coins.forEach((c, i) => {
      const y = ((c.y0 + abs * c.speed * 6) % 9) - 4.5;
      tmp.position.set(c.x, y, c.z);
      tmp.rotation.set(c.tilt + abs * c.spin, abs * c.spin * 0.7, 0);
      tmp.scale.setScalar(c.size * visible);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]}>
      <cylinderGeometry args={[0.17, 0.17, 0.04, 28]} />
      <meshStandardMaterial color={C.brand} metalness={0.35} roughness={0.38} emissive={C.brandSoft} />
    </instancedMesh>
  );
};

/** The Zoption mark minted as a coin. */
export const LogoCoin = ({
  scale = 1,
  rotY = 0,
  rotX = 0,
  position = [0, 0, 0],
}: {
  scale?: number;
  rotY?: number;
  rotX?: number;
  position?: [number, number, number];
}) => {
  const face = useCanvasTexture(512, 512, (ctx) => drawLogoMark(ctx, 0, 0, 512));
  // Cylinder caps map their UVs rotated a quarter turn, and the bottom cap is mirrored.
  const bottom = useMemo(() => {
    const t = face.clone();
    t.needsUpdate = true;
    return t;
  }, [face]);
  useMemo(() => {
    face.center.set(0.5, 0.5);
    face.rotation = Math.PI / 2;
    bottom.center.set(0.5, 0.5);
    bottom.rotation = -Math.PI / 2;
  }, [face, bottom]);
  const side = useMemo(
    () => new THREE.MeshStandardMaterial({ color: C.brand, metalness: 0.45, roughness: 0.28 }),
    [],
  );
  const faceMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: face, metalness: 0.15, roughness: 0.4 }),
    [face],
  );
  const bottomMat = useMemo(
    () => new THREE.MeshStandardMaterial({ map: bottom, metalness: 0.15, roughness: 0.4 }),
    [bottom],
  );
  return (
    <group position={position} scale={scale} rotation={[rotX, rotY, 0]}>
      <group rotation={[Math.PI / 2, 0, 0]}>
        <mesh material={[side, faceMat, bottomMat]}>
          <cylinderGeometry args={[0.85, 0.85, 0.14, 96]} />
        </mesh>
        {[0.075, -0.075].map((y) => (
          <mesh key={y} position={[0, y, 0]} rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[0.82, 0.028, 16, 120]} />
            <meshStandardMaterial color={C.brandStrong} metalness={0.5} roughness={0.25} />
          </mesh>
        ))}
      </group>
    </group>
  );
};

/** Expanding ring, the "impact" visual. */
export const Shockwave = ({
  abs,
  start,
  position = [0, 0, 0],
  size = 5,
  dur = 26,
}: {
  abs: number;
  start: number;
  position?: [number, number, number];
  size?: number;
  dur?: number;
}) => {
  const p = prog(abs, start, dur, ease);
  const on = abs >= start && abs < start + dur;
  return (
    <mesh position={position} scale={0.6 + size * p} visible={on}>
      <ringGeometry args={[0.97, 1, 128]} />
      <meshBasicMaterial
        color={C.brand}
        transparent
        opacity={(1 - p) * 0.9}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
        toneMapped={false}
      />
    </mesh>
  );
};

/** One-shot burst of confetti or sparks, fully determined by the frame number. */
export const Particles = ({
  abs,
  start,
  origin = [0, 0, 0.4],
  kind,
  count = 140,
  seed = 1,
}: {
  abs: number;
  start: number;
  origin?: [number, number, number];
  kind: "confetti" | "sparks";
  count?: number;
  seed?: number;
}) => {
  const ref = useRef<THREE.InstancedMesh>(null);
  const confetti = kind === "confetti";
  const life = confetti ? 2.6 : 1.3;
  const palette = useMemo(() => [C.brand, C.brandStrong, C.cream, C.brandMid, C.brand], []);
  const data = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const r = (n: number) => rand(i * 11 + n + seed * 977);
        const dir = new THREE.Vector3(r(1) - 0.5, r(2) * 0.85 - 0.05, r(3) * 0.9 - 0.1).normalize();
        return {
          dir,
          speed: confetti ? 2.6 + r(4) * 4.6 : 0.9 + r(4) * 2.6,
          spin: new THREE.Vector3(r(5) * 9, r(6) * 9, r(7) * 9),
          flutter: 6 + r(8) * 10,
          size: confetti ? 0.45 + r(9) * 0.55 : 0.5 + r(9) * 1.1,
          colorIdx: Math.floor(r(10) * palette.length),
        };
      }),
    [count, confetti, seed, palette],
  );
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    data.forEach((d, i) => mesh.setColorAt(i, color.set(palette[d.colorIdx])));
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [data, palette]);
  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const t = (abs - start) / FPS;
    mesh.visible = t >= 0 && t < life;
    if (!mesh.visible) return;
    const drag = confetti ? 2.1 : 2.8;
    const fade = Math.min(1, (life - t) / 0.45);
    data.forEach((d, i) => {
      const travel = (d.speed * (1 - Math.exp(-drag * t))) / drag;
      tmp.position.set(
        origin[0] + d.dir.x * travel,
        origin[1] + d.dir.y * travel - (confetti ? 1.7 * t * t : 0.15 * t * t),
        origin[2] + d.dir.z * travel,
      );
      tmp.rotation.set(d.spin.x * t, d.spin.y * t, d.spin.z * t);
      const flip = confetti ? Math.abs(Math.cos(t * d.flutter)) * 0.9 + 0.1 : 1;
      tmp.scale.set(d.size * fade, d.size * fade * flip, d.size * fade);
      tmp.updateMatrix();
      mesh.setMatrixAt(i, tmp.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });
  return (
    <instancedMesh ref={ref} args={[undefined, undefined, count]} frustumCulled={false}>
      {confetti ? <boxGeometry args={[0.07, 0.12, 0.012]} /> : <icosahedronGeometry args={[0.028, 0]} />}
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
};

/** Entrance spring helper for the coin: scale and spin settle together. */
export const coinEntrance = (rel: number) => ({
  scale: pop(rel, 0, 9, 120),
  spin: (1 - prog(rel, 0, 52, ease)) * Math.PI * 4,
});
