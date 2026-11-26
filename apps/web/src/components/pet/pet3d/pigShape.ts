import { ellipsoid, meshSdf, roundCone, smax, smin, type SdfMesh } from "./sdfMesh";

// The Baby pig's shape as one signed distance field, modeled on a soft clay toy figure: a big
// round head with full cheeks on a chubby round body, ears that rise from the top corners and
// flop forward, little arms resting on the belly ending in split hooves, stubby legs stretched
// forward showing round soles, and a short snout with deep nostrils. Every part melts into its
// neighbor (`smin`), so the figure is one seamless piece with soft creases, like the toy.
//
// Units: the floor is y = 0, the figure faces +z, and it stands about 3 units tall.

type Vec3 = readonly [number, number, number];

const sub = (a: Vec3, b: Vec3): [number, number, number] => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const unit = (a: Vec3): Vec3 => {
  const length = Math.hypot(a[0], a[1], a[2]);
  return [a[0] / length, a[1] / length, a[2] / length];
};
const mirror = (side: number, p: Vec3): Vec3 => [p[0] * side, p[1], p[2]];

/** The rig: each bone's pivot and parent, in the order of the skin indices. */
export const PIG_BONES: ReadonlyArray<{ name: string; parent: number; at: Vec3 }> = [
  { name: "root", parent: -1, at: [0, 0, 0] },
  { name: "body", parent: 0, at: [0, 0, 0] },
  { name: "head", parent: 0, at: [0, 1.36, 0] },
  { name: "earL", parent: 2, at: [-0.6, 2.52, 0.1] },
  { name: "earR", parent: 2, at: [0.6, 2.52, 0.1] },
  { name: "snout", parent: 2, at: [0, 1.78, 0.95] },
  { name: "armL", parent: 0, at: [-0.82, 1.06, 0.24] },
  { name: "armR", parent: 0, at: [0.82, 1.06, 0.24] },
  { name: "legL", parent: 0, at: [-0.64, 0.34, 0.2] },
  { name: "legR", parent: 0, at: [0.64, 0.34, 0.2] },
];

/** Where the face details sit on the head, in the head's rest position. */
export const PIG_FACE = {
  eye: { x: 0.52, y: 1.99 },
  smile: { y: 1.44, halfWidth: 0.13 },
  blush: { x: 0.66, y: 1.58, radius: 0.28 },
};

// A part per skinned bone (root has none). Their distances weight the skin and pick the colors.
const BODY = 0;
const HEAD = 1;
const EAR_L = 2;
const EAR_R = 3;
const SNOUT = 4;
const ARM_L = 5;
const ARM_R = 6;
const LEG_L = 7;
const LEG_R = 8;
const PARTS = 9;

/**
 * A flat, tapered petal from `a` to `b`: a round cone squashed along `normal` to `thickness` of its
 * width, for the ears. Returns a distance bound (the squash only shrinks distances).
 */
function petal(a: Vec3, b: Vec3, r1: number, r2: number, normal: Vec3, thickness: number) {
  const axis = sub(b, a);
  // Keep the squash axis square to the petal's length so the cone stays straight.
  const n = unit(sub(normal, scaled(axis, dot(normal, axis) / dot(axis, axis))));
  const cone = roundCone(a, b, r1, r2);
  const stretch = 1 / thickness;
  return (x: number, y: number, z: number) => {
    const along = (x - a[0]) * n[0] + (y - a[1]) * n[1] + (z - a[2]) * n[2];
    const extra = along * (stretch - 1);
    return cone(x + n[0] * extra, y + n[1] * extra, z + n[2] * extra) / stretch;
  };
}

function scaled(a: Vec3, s: number): Vec3 {
  return [a[0] * s, a[1] * s, a[2] * s];
}

/**
 * An arm on `side` (-1 viewer's left, 1 right): a short chubby arm from the side of the body,
 * bending at the elbow so its split hoof rests on the belly, well above the legs.
 */
function arm(side: number) {
  const shoulder = mirror(side, [0.82, 1.06, 0.24]);
  const elbow = mirror(side, [0.92, 0.78, 0.56]);
  const wrist = mirror(side, [0.54, 0.9, 0.9]);
  // The hoof turns down off the forearm, so its tip rests on the belly instead of facing out.
  const forearm = unit(sub(wrist, elbow));
  const dir = unit([forearm[0], forearm[1] - 0.9, forearm[2]]);
  const tip: Vec3 = [wrist[0] + dir[0] * 0.13, wrist[1] + dir[1] * 0.13, wrist[2] + dir[2] * 0.13];
  const upper = roundCone(shoulder, elbow, 0.25, 0.25);
  const lower = roundCone(elbow, wrist, 0.25, 0.2);
  const hoof = roundCone(wrist, tip, 0.2, 0.1);
  // The cleft between the two toes: a rounded groove down the middle of the hoof's front face,
  // notching its tip. Wide enough for the mesh grid to draw it smoothly.
  const front = unit(cross(cross(dir, [0, 0.4, 1]), dir));
  const cleft = roundCone(
    [wrist[0] + front[0] * 0.185, wrist[1] + front[1] * 0.185, wrist[2] + front[2] * 0.185],
    [tip[0] + dir[0] * 0.06, tip[1] + dir[1] * 0.06, tip[2] + dir[2] * 0.06],
    0.022,
    0.026,
  );
  return {
    wrist,
    dir,
    distance(x: number, y: number, z: number) {
      const d = smin(smin(upper(x, y, z), lower(x, y, z), 0.08), hoof(x, y, z), 0.06);
      return smax(d, -cleft(x, y, z), 0.012);
    },
  };
}

/** A leg on `side`: a short thick stump stretched forward, ending in a flat round sole. */
function leg(side: number) {
  const hip = mirror(side, [0.64, 0.34, 0.2]);
  const foot = mirror(side, [0.82, 0.33, 0.82]);
  const dir = unit(sub(foot, hip));
  const stump = roundCone(hip, foot, 0.34, 0.33);
  const [fx, fy, fz] = foot;
  // A short rounded notch down from the top of the sole.
  const sole = (lift: number): Vec3 => [fx + dir[0] * 0.13, fy + lift, fz + dir[2] * 0.13];
  const notch = roundCone(sole(0.37), sole(0.23), 0.024, 0.02);
  return {
    foot,
    dir,
    distance(x: number, y: number, z: number) {
      const along = (x - fx) * dir[0] + (y - fy) * dir[1] + (z - fz) * dir[2];
      const d = smax(stump(x, y, z), along - 0.13, 0.1);
      return smax(d, -notch(x, y, z), 0.012);
    },
  };
}

/**
 * An ear on `side`: a thick, soft petal rising from the head's top corner and curling over so its
 * round tip droops forward, like a floppy felt ear. It is a chain of petals along a gentle curve,
 * melted together so the bend reads as one soft fold rather than a hinge.
 */
function ear(side: number) {
  const points = [
    mirror(side, [0.56, 2.56, 0.2]),
    mirror(side, [0.72, 2.78, 0.36]),
    mirror(side, [0.92, 2.82, 0.56]),
    mirror(side, [1.06, 2.7, 0.76]),
    mirror(side, [1.12, 2.58, 0.86]),
  ];
  const radii = [0.29, 0.28, 0.25, 0.19, 0.14];
  const facing = mirror(side, [0.3, 0.3, 1]);
  const width = unit(cross(sub(points[1]!, points[0]!), facing));
  const segments = points.slice(1).map((end, i) => {
    const start = points[i]!;
    return petal(start, end, radii[i]!, radii[i + 1]!, cross(width, sub(end, start)), 0.5);
  });
  return (x: number, y: number, z: number) =>
    segments.reduce((d, segment) => smin(d, segment(x, y, z), 0.12), Infinity);
}

/**
 * An egg: an ellipsoid (centered at the origin) whose width narrows toward the top by `taper` of
 * its radius, so it is widest low down and domes over the top. Two ellipsoids melted together
 * leave flat, upright sides where they overlap; one tapered form keeps every outline convex.
 */
function egg(x: number, y: number, z: number, rx: number, ry: number, rz: number, taper: number) {
  const s = Math.max(1 - (taper * y) / ry, 0.3);
  return ellipsoid(x / s, y, z / s, rx, ry, rz) * Math.min(s, 1);
}

const torso = (x: number, y: number, z: number) =>
  smax(egg(x, y - 0.68, z - 0.02, 1.12, 0.78, 0.92, 0.1), 0.03 - y, 0.16);

const skull = (x: number, y: number, z: number) =>
  smin(
    egg(x, y - 1.9, z, 1.16, 0.96, 0.9, 0.28),
    // Full cheeks low on the front of the face, inside the outline so they round it, not square it.
    ellipsoid(x, y - 1.7, z - 0.12, 0.98, 0.46, 0.8),
    0.2,
  );

/** How far forward the face is at (`x`, `y`), before the snout is added. */
function faceDepth(x: number, y: number) {
  let z = 2;
  for (let i = 0; i < 200; i += 1) {
    const d = skull(x, y, z);
    if (d < 0.0005) break;
    z -= Math.max(d, 0.001);
  }
  return z;
}

// The snout sits low between the eyes, its back sunk into the face and its front standing proud.
const SNOUT_Y = 1.78;
const FACE_Z = faceDepth(0, SNOUT_Y);

/** The snout: a short rounded oval cylinder, wider than tall, on the front of the face. */
function snout(x: number, y: number, z: number) {
  const round = 0.08;
  const sx = x / 1.38;
  const sy = y - SNOUT_Y;
  const q = Math.sqrt(sx * sx + sy * sy) - 0.225 + round;
  const w = Math.abs(z - (FACE_Z + 0.03)) - 0.16 + round;
  return Math.min(Math.max(q, w), 0) + Math.hypot(Math.max(q, 0), Math.max(w, 0)) - round;
}

const nostril = (x: number, y: number, z: number) =>
  ellipsoid(Math.abs(x) - 0.105, y - SNOUT_Y - 0.01, z - FACE_Z - 0.2, 0.046, 0.074, 0.1);

const arms = [arm(-1), arm(1)];
const legs = [leg(-1), leg(1)];
const ears = [ear(-1), ear(1)];

/** Each part's own distance at a point, by part index. */
function partDistances(x: number, y: number, z: number, out: Float64Array) {
  out[BODY] = torso(x, y, z);
  out[HEAD] = skull(x, y, z);
  out[EAR_L] = ears[0]!(x, y, z);
  out[EAR_R] = ears[1]!(x, y, z);
  out[SNOUT] = smax(snout(x, y, z), -nostril(x, y, z), 0.03);
  out[ARM_L] = arms[0]!.distance(x, y, z);
  out[ARM_R] = arms[1]!.distance(x, y, z);
  out[LEG_L] = legs[0]!.distance(x, y, z);
  out[LEG_R] = legs[1]!.distance(x, y, z);
}

/** Rough bounding spheres for the small parts, so far points skip their exact distance. */
const nearby = (x: number, y: number, z: number, c: Vec3, r: number) =>
  Math.sqrt((x - c[0]) ** 2 + (y - c[1]) ** 2 + (z - c[2]) ** 2) - r;

/** The whole pig: every part melted together, with the creases a clay toy has between them. */
export function pigDistance(x: number, y: number, z: number) {
  let d = smin(torso(x, y, z), skull(x, y, z), 0.06);
  for (let side = 0; side < 2; side += 1) {
    const s = side === 0 ? -1 : 1;
    if (nearby(x, y, z, [0.72 * s, 0.98, 0.62], 0.78) < d + 0.1)
      d = smin(d, arms[side]!.distance(x, y, z), 0.06);
    if (nearby(x, y, z, [0.73 * s, 0.33, 0.5], 0.72) < d + 0.14)
      d = smin(d, legs[side]!.distance(x, y, z), 0.1);
    if (nearby(x, y, z, [0.84 * s, 2.65, 0.54], 0.82) < d + 0.12)
      d = smin(d, ears[side]!(x, y, z), 0.12);
  }
  if (nearby(x, y, z, [0, SNOUT_Y, FACE_Z], 0.45) < d + 0.06) {
    d = smin(d, snout(x, y, z), 0.06);
    d = smax(d, -nostril(x, y, z), 0.03);
  }
  return d;
}

/** The meshed pig with its skin and the per-vertex regions its colors come from. */
export interface PigMesh extends SdfMesh {
  skinIndex: Uint16Array;
  skinWeight: Float32Array;
  /** Per vertex: snout, hoof, nostril, and blush amounts, each 0 to 1. */
  regions: Float32Array;
}

const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
};

let cached: PigMesh | null = null;

/**
 * Meshes the pig once per page (it is the same shape in every color) and skins it: each vertex
 * follows the bones of the parts it is closest to, blended across the creases so a bend stays soft.
 */
export function pigMesh(): PigMesh {
  if (cached) return cached;
  const mesh = meshSdf(pigDistance, [-1.5, -0.1, -1.05], [1.5, 3.15, 1.35], 0.024);
  const count = mesh.positions.length / 3;
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const regions = new Float32Array(count * 4);
  const d = new Float64Array(PARTS);
  const order = Array.from({ length: PARTS }, (_, i) => i);
  for (let v = 0; v < count; v += 1) {
    const x = mesh.positions[v * 3]!;
    const y = mesh.positions[v * 3 + 1]!;
    const z = mesh.positions[v * 3 + 2]!;
    partDistances(x, y, z, d);
    const nearest = Math.min(...d);

    // Skin: the four nearest parts, fading out over a band so creases bend smoothly.
    order.sort((a, b) => d[a]! - d[b]!);
    let total = 0;
    for (let i = 0; i < 4; i += 1) {
      const w = Math.max(0, 1 - (d[order[i]!]! - nearest) / 0.12) ** 2;
      skinIndex[v * 4 + i] = order[i]! + 1;
      skinWeight[v * 4 + i] = w;
      total += w;
    }
    for (let i = 0; i < 4; i += 1) skinWeight[v * 4 + i]! /= total;

    // Colors: the snout where it stands proud of the face, the hoof caps at the arm tips and the
    // soles, the inside of the nostrils, and a soft blush on each cheek.
    const snoutAmount = smooth(-0.015, 0.015, Math.min(d[HEAD]!, d[BODY]!) - d[SNOUT]!);
    // Each fades out smoothly where its limb meets the body, so the edge never follows the grid.
    const normal: Vec3 = [mesh.normals[v * 3]!, mesh.normals[v * 3 + 1]!, mesh.normals[v * 3 + 2]!];
    let hoof = 0;
    for (let side = 0; side < 2; side += 1) {
      const limb = arms[side]!;
      const onArm = smooth(0.04, 0, d[ARM_L + side]! - nearest);
      const past = dot(sub([x, y, z], limb.wrist), limb.dir);
      hoof = Math.max(hoof, onArm * smooth(0.07, 0.1, past));
      // A sole is the flat end of the leg: facing along the leg, past the rounded rim.
      const foot = legs[side]!;
      const onLeg = smooth(0.04, 0, d[LEG_L + side]! - nearest);
      const end = smooth(0.07, 0.1, dot(sub([x, y, z], foot.foot), foot.dir));
      hoof = Math.max(hoof, onLeg * end * smooth(0.55, 0.8, dot(normal, foot.dir)));
    }
    const inNostril = smooth(0.03, 0, Math.abs(nostril(x, y, z))) * snoutAmount;
    const { x: bx, y: by, radius } = PIG_FACE.blush;
    const cheek = Math.min(Math.hypot(Math.abs(x) - bx, y - by) / radius, 1);
    const blush = z > 0.2 ? (1 - cheek * cheek) ** 2 * (1 - snoutAmount) : 0;
    regions.set([snoutAmount, hoof, inNostril, blush], v * 4);
  }
  cached = { ...mesh, skinIndex, skinWeight, regions };
  return cached;
}

/**
 * The point on the pig's surface straight in front of (`x`, `y`) and the surface normal there, for
 * placing the eyes and the mouth on the face.
 */
export function onSurface(x: number, y: number): { point: Vec3; normal: Vec3 } {
  let z = 2;
  for (let i = 0; i < 200; i += 1) {
    const d = pigDistance(x, y, z);
    if (d < 0.0005) break;
    z -= Math.max(d, 0.001);
  }
  const h = 0.002;
  const normal = unit([
    pigDistance(x + h, y, z) - pigDistance(x - h, y, z),
    pigDistance(x, y + h, z) - pigDistance(x, y - h, z),
    pigDistance(x, y, z + h) - pigDistance(x, y, z - h),
  ]);
  return { point: [x, y, z], normal };
}
