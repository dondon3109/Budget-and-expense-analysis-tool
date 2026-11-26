import {
  blurAttribute,
  ellipsoid,
  meshNeighbors,
  meshSdf,
  relaxMesh,
  roundCone,
  smax,
  smin,
  type SdfMesh,
} from "./sdfMesh";

// The Baby pig's shape as one signed distance field, modeled on a soft clay toy figure: a big
// round head with full cheeks on a chubby round body, ears that rise from the top corners and
// flop forward, little arms resting on the belly ending in split hooves, stubby legs stretched
// forward showing round soles, and a short snout with deep nostrils. Every part melts into its
// neighbor (`smin`), so the figure is one seamless piece with soft creases, like the toy; the arms
// melt in only at the shoulder, so they stand apart as limbs.
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

/**
 * The figure's proportions, fitted to the reference toy's photo (its outline and where its features
 * sit). Lengths are in figure units; `p` is a superellipse exponent (2 is a plain ellipse).
 */
const SHAPE = {
  headY: 2.01,
  headRx: 1.14,
  headRy: 0.92,
  headRz: 0.92,
  headTaper: 0.21,
  headP: 2.2,
  bodyY: 0.71,
  bodyRx: 1.12,
  bodyRy: 0.9,
  bodyRz: 1.0,
  bodyTaper: 0.18,
  bodyP: 2,
  // A round tummy swelling out of the belly's front between the arms, melted in over a wide blend.
  tummyY: 0.66,
  tummyZ: 0.58,
  tummyRx: 0.65,
  tummyRy: 0.55,
  tummyRz: 0.6,
  tummyBlend: 0.3,
  // Each arm follows a curve from the shoulder, bent toward the elbow point (which it does not
  // reach), to the wrist on the belly.
  shoulderX: 0.64,
  shoulderY: 1.06,
  shoulderZ: 0.42,
  elbowX: 0.76,
  elbowY: 0.9,
  elbowZ: 0.8,
  wristX: 0.38,
  wristY: 0.76,
  wristZ: 1,
  armR: 0.32,
  handR: 0.24,
  // Below the shoulder, how far each arm's center line sits off the body, as a share of its radius,
  // so the arm rests on the belly with most of its round showing instead of sinking into it.
  armRest: 0.45,
  // The hoof: a small cone `hoofR` thick reaching `hoofLen` from the wrist, out of the round hand,
  // turned down by `hoofDown` from the forearm's line. Its color starts `hoofStart` past the wrist,
  // so the hand stays pink and only the cone's tip is brown.
  hoofR: 0.12,
  hoofLen: 0.27,
  hoofDown: 0.35,
  hoofStart: 0.12,
  footX: 0.74,
  footR: 0.26,
  // Each leg runs from its hip (`hipX` out from the middle) forward to its foot, `legR` thick.
  hipX: 0.72,
  footZ: 0.94,
  legR: 0.38,
  earX: 0.675,
  earY: 2.29,
  earScale: 0.925,
  // Each ear's curve from its base, bent toward its bend point, to its tip (before scaling), and
  // its radius: `earR` at the base, swelling by `earBulge` midway and narrowing by `earNarrow` to
  // the tip. `earThick` is how thick it is for its width.
  earBendX: 0,
  earBendY: 0.85,
  earBendZ: 0.05,
  earTipX: 0.31,
  earTipY: 0.15,
  earTipZ: 0.6,
  earR: 0.37,
  earBulge: 0.04,
  earNarrow: 0.1,
  earThick: 0.3,
};

/** The rig: each bone's pivot and parent, in the order of the skin indices. */
export const PIG_BONES: ReadonlyArray<{ name: string; parent: number; at: Vec3 }> = [
  { name: "root", parent: -1, at: [0, 0, 0] },
  { name: "body", parent: 0, at: [0, 0, 0] },
  { name: "head", parent: 0, at: [0, 1.36, 0] },
  { name: "earL", parent: 2, at: [-SHAPE.earX, SHAPE.earY, 0] },
  { name: "earR", parent: 2, at: [SHAPE.earX, SHAPE.earY, 0] },
  { name: "snout", parent: 2, at: [0, 1.84, 0.95] },
  { name: "armL", parent: 0, at: [-SHAPE.shoulderX, SHAPE.shoulderY, SHAPE.shoulderZ] },
  { name: "armR", parent: 0, at: [SHAPE.shoulderX, SHAPE.shoulderY, SHAPE.shoulderZ] },
  { name: "legL", parent: 0, at: [-SHAPE.hipX, 0.34, 0.2] },
  { name: "legR", parent: 0, at: [SHAPE.hipX, 0.34, 0.2] },
];

/** Where the face details sit on the head, in the head's rest position. */
export const PIG_FACE = {
  eye: { x: 0.5, y: 2.04 },
  smile: { y: 1.53, halfWidth: 0.13 },
  blush: { x: 0.72, y: 1.7, radius: 0.33 },
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

/** A point on the quadratic Bézier curve from `a` to `c` bent toward `b`, at `t` from 0 to 1. */
function bezier(a: Vec3, b: Vec3, c: Vec3, t: number): Vec3 {
  const u = 1 - t;
  return [
    u * u * a[0] + 2 * u * t * b[0] + t * t * c[0],
    u * u * a[1] + 2 * u * t * b[1] + t * t * c[1],
    u * u * a[2] + 2 * u * t * b[2] + t * t * c[2],
  ];
}

/**
 * `p` pushed out from the body until it is at least `gap` off its surface: along the body's normal
 * but mostly forward (its sideways part damped, and never up), so the arm comes off the belly
 * without widening the figure's outline or lifting into a shrug. A few Newton steps on the body's distance, close to exact near the surface.
 */
function settle(p: Vec3, gap: number): Vec3 {
  let q: [number, number, number] = [p[0], p[1], p[2]];
  const h = 0.001;
  for (let i = 0; i < 6; i += 1) {
    const d = torso(q[0], q[1], q[2]);
    if (d >= gap - 0.001) break;
    const g = unit([
      torso(q[0] + h, q[1], q[2]) - torso(q[0] - h, q[1], q[2]),
      torso(q[0], q[1] + h, q[2]) - torso(q[0], q[1] - h, q[2]),
      torso(q[0], q[1], q[2] + h) - torso(q[0], q[1], q[2] - h),
    ]);
    const n = unit([g[0] * 0.25, Math.min(g[1], 0) * 0.25, g[2]]);
    // How far a step along `n` moves the point off the surface, so the step lands on `gap`.
    const rate = Math.max(dot(n, g), 0.3);
    q = [
      q[0] + (n[0] * (gap - d)) / rate,
      q[1] + (n[1] * (gap - d)) / rate,
      q[2] + (n[2] * (gap - d)) / rate,
    ];
  }
  return q;
}

/**
 * An arm on `side` (-1 viewer's left, 1 right): a short, fat arm hanging down the front of the body
 * and turning slightly in, ending in a round hand with a small split hoof that points down and in
 * onto the belly above the legs. It is one tube along a gentle curve (the elbow only bends it a
 * little, so it has no corner), and only its shoulder melts into the body: the rest lies against
 * it as a limb of its own, with a crease all along.
 */
function arm(side: number) {
  const { armR, handR } = SHAPE;
  const shoulder = mirror(side, [SHAPE.shoulderX, SHAPE.shoulderY, SHAPE.shoulderZ]);
  const elbow = mirror(side, [SHAPE.elbowX, SHAPE.elbowY, SHAPE.elbowZ]);
  const guide = mirror(side, [SHAPE.wristX, SHAPE.wristY, SHAPE.wristZ]);
  const steps = 6;
  // Full along the upper arm, narrowing toward the hand.
  const radius = (t: number) => armR + (handR - armR) * t * t;
  // The shoulder stays where it is, melting into the body; the rest settles onto it.
  const points = Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const rise = Math.min(Math.max((t - 0.2) / 0.5, 0), 1);
    const gap = radius(t) * SHAPE.armRest * rise * rise * (3 - 2 * rise);
    return settle(bezier(shoulder, elbow, guide, t), gap);
  });
  const wrist = points[steps]!;
  const segments = points
    .slice(1)
    .map((end, i) => roundCone(points[i]!, end, radius(i / steps), radius((i + 1) / steps)));
  // The hoof turns down and in off the forearm, so its tip points onto the belly.
  const forearm = unit(sub(wrist, points[steps - 2]!));
  const dir = unit([forearm[0], forearm[1] - SHAPE.hoofDown, forearm[2]]);
  const { hoofR, hoofLen } = SHAPE;
  const tip: Vec3 = [
    wrist[0] + dir[0] * hoofLen,
    wrist[1] + dir[1] * hoofLen,
    wrist[2] + dir[2] * hoofLen,
  ];
  const hoof = roundCone(wrist, tip, hoofR, hoofR * 0.7);
  // The hoof's front, and the line across it where the two toes split (painted, see `pigMesh`).
  const front = unit(cross(cross(dir, [0, 0.4, 1]), dir));
  const across = unit(cross(dir, front));
  return {
    wrist,
    dir,
    front,
    across,
    distance(x: number, y: number, z: number) {
      let d = Infinity;
      for (const segment of segments) d = Math.min(d, segment(x, y, z));
      return smin(d, hoof(x, y, z), 0.06);
    },
    /**
     * The arm joined to `rest` (the distance to the rest of the figure). Only the top of the upper
     * arm melts in; the rest meets the body in a narrow crease, so it reads as a limb of its own.
     */
    joined(rest: number, x: number, y: number, z: number) {
      const top = segments[0]!(x, y, z);
      let d = top;
      for (let i = 1; i < steps; i += 1) d = Math.min(d, segments[i]!(x, y, z));
      d = smin(d, hoof(x, y, z), 0.06);
      return smin(smin(rest, top, 0.12), d, 0.04);
    },
  };
}

/** A leg on `side`: a short thick stump stretched forward, ending in a flat round sole. */
function leg(side: number) {
  const hip = mirror(side, [SHAPE.hipX, 0.34, 0.2]);
  const foot = mirror(side, [SHAPE.footX, 0.33, SHAPE.footZ]);
  const dir = unit(sub(foot, hip));
  const stump = roundCone(hip, foot, SHAPE.legR, SHAPE.footR);
  const [fx, fy, fz] = foot;
  return {
    foot,
    dir,
    distance(x: number, y: number, z: number) {
      const along = (x - fx) * dir[0] + (y - fy) * dir[1] + (z - fz) * dir[2];
      return smax(stump(x, y, z), along - 0.13, 0.1);
    },
  };
}

/**
 * An ear on `side`: a thick, soft, round-tipped petal rising from the head's top corner and
 * folding forward so its tip points down and out, like a floppy felt ear. It follows one smooth
 * curve (so the fold is a soft bend, not a crease) and is widest past its base, rounding off to
 * a full tip.
 */
function ear(side: number) {
  const { earX, earY, earScale } = SHAPE;
  const place = (o: Vec3) =>
    mirror(side, [earX + o[0] * earScale, earY + o[1] * earScale, o[2] * earScale]);
  const base = place([0, 0, 0]);
  const bend = place([SHAPE.earBendX, SHAPE.earBendY, SHAPE.earBendZ]);
  const end = place([SHAPE.earTipX, SHAPE.earTipY, SHAPE.earTipZ]);
  // Short petals, so the small turn from one to the next never shows as a ridge (with fewer, the
  // thin flap crumples along its fold).
  const steps = 16;
  const points = Array.from({ length: steps + 1 }, (_, i) => bezier(base, bend, end, i / steps));
  const radius = (t: number) =>
    (SHAPE.earR + SHAPE.earBulge * Math.sin(Math.PI * t) - SHAPE.earNarrow * t) * earScale;
  const facing = mirror(side, [0.3, 0.3, 1]);
  const width = unit(cross(sub(points[1]!, points[0]!), facing));
  const segments = points.slice(1).map((p, i) => {
    const start = points[i]!;
    const r0 = radius(i / steps);
    const r1 = radius((i + 1) / steps);
    return petal(start, p, r0, r1, cross(width, sub(p, start)), SHAPE.earThick);
  });
  // A petal lies inside the sphere around its middle, and squashing only shrinks its distance by
  // `earThick`, so a petal that far away cannot change the blend and is skipped.
  const bounds = points.slice(1).map((p, i) => {
    const start = points[i]!;
    const middle = scaled([p[0] + start[0], p[1] + start[1], p[2] + start[2]], 0.5);
    const half = Math.hypot(...sub(p, start)) / 2;
    return { middle, reach: half + Math.max(radius(i / steps), radius((i + 1) / steps)) };
  });
  return (x: number, y: number, z: number) => {
    let d = Infinity;
    for (let i = 0; i < steps; i += 1) {
      const { middle, reach } = bounds[i]!;
      const [dx, dy, dz] = [x - middle[0], y - middle[1], z - middle[2]];
      const far = Math.sqrt(dx * dx + dy * dy + dz * dz) - reach;
      if (far * SHAPE.earThick >= d + 0.06) continue;
      d = smin(d, segments[i]!(x, y, z), 0.06);
    }
    return d;
  };
}

/**
 * An egg: an ellipsoid (centered at the origin) whose front outline is a superellipse of exponent
 * `p` (2 is a plain ellipse, higher is fuller in the corners) while it stays round front to back,
 * and whose width narrows toward the top by `taper` of its radius, so it is widest low down. Its
 * distance is the first-order estimate (value over gradient), close near the surface, which is
 * where the blends and the mesher need it.
 */
function egg(
  x: number,
  y: number,
  z: number,
  rx: number,
  ry: number,
  rz: number,
  taper: number,
  p: number,
) {
  const s = Math.max(1 - (taper * y) / ry, 0.3);
  const ax = Math.abs(x) / (rx * s);
  const ay = Math.abs(y) / ry;
  const az = Math.abs(z) / (rz * s);
  const m = (ax ** p + ay ** p) ** (1 / p);
  const n = Math.sqrt(m * m + az * az);
  if (m === 0 || n === 0) return (n - 1) * Math.min(rx * s, ry, rz * s);
  const k = m ** (2 - p) / n;
  const gx = (k * ax ** (p - 1)) / (rx * s);
  const gy = (k * ay ** (p - 1)) / ry;
  const gz = az / n / (rz * s);
  return (n - 1) / Math.sqrt(gx * gx + gy * gy + gz * gz);
}

const torso = (x: number, y: number, z: number) =>
  smax(
    smin(
      egg(
        x,
        y - SHAPE.bodyY,
        z - 0.02,
        SHAPE.bodyRx,
        SHAPE.bodyRy,
        SHAPE.bodyRz,
        SHAPE.bodyTaper,
        SHAPE.bodyP,
      ),
      ellipsoid(x, y - SHAPE.tummyY, z - SHAPE.tummyZ, SHAPE.tummyRx, SHAPE.tummyRy, SHAPE.tummyRz),
      SHAPE.tummyBlend,
    ),
    0.03 - y,
    0.16,
  );

const skull = (x: number, y: number, z: number) =>
  egg(
    x,
    y - SHAPE.headY,
    z,
    SHAPE.headRx,
    SHAPE.headRy,
    SHAPE.headRz,
    SHAPE.headTaper,
    SHAPE.headP,
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
const SNOUT_Y = 1.84;
const FACE_Z = faceDepth(0, SNOUT_Y);

/** The snout: a short rounded oval cylinder, wider than tall, on the front of the face. */
function snout(x: number, y: number, z: number) {
  const round = 0.11;
  const sx = x / 1.35;
  const sy = y - SNOUT_Y;
  const q = Math.sqrt(sx * sx + sy * sy) - 0.24 + round;
  const w = Math.abs(z - (FACE_Z + 0.03)) - 0.16 + round;
  return Math.min(Math.max(q, w), 0) + Math.hypot(Math.max(q, 0), Math.max(w, 0)) - round;
}

const nostril = (x: number, y: number, z: number) =>
  ellipsoid(Math.abs(x) - 0.115, y - SNOUT_Y - 0.01, z - FACE_Z - 0.2, 0.046, 0.074, 0.1);

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
  let d = smin(torso(x, y, z), skull(x, y, z), 0.07);
  for (let side = 0; side < 2; side += 1) {
    const s = side === 0 ? -1 : 1;
    if (nearby(x, y, z, [0.72 * s, 0.86, 0.74], 0.92) < d + 0.1) d = arms[side]!.joined(d, x, y, z);
    if (nearby(x, y, z, [0.8 * s, 0.33, 0.62], 0.82) < d + 0.14)
      d = smin(d, legs[side]!.distance(x, y, z), 0.06);
    if (nearby(x, y, z, [0.9 * s, 2.6, 0.45], 0.85) < d + 0.12)
      d = smin(d, ears[side]!(x, y, z), 0.06);
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
  /** Per vertex: snout, nostril, and blush amounts, each 0 to 1. */
  regions: Float32Array;
  /**
   * Per vertex: the hoof field, which crosses 0.5 at the edge of each hoof cap and sole; the
   * signed distance across the nearer hoof from its middle; and how much of the toes' split line
   * shows there (0 to 1, only down the hoof's front). The material cuts the hoof color sharply at
   * the field's 0.5 level and draws the split where the distance across is under its width; both
   * values change linearly or smoothly between vertices, so those edges stay crisp instead of
   * fading across the triangles.
   */
  hoofs: Float32Array;
  /**
   * Per vertex: the difference between the distances to the two nearest parts: 0 on the seam
   * between them, changing about linearly across it, negative on the part the other presses into
   * (the body under an arm, leg, or chin, the head under an ear). Then how strongly that crease's
   * line shows there: 1 along a narrow crease, fading to 0 where a part melts in over a wide
   * blend, such as the shoulder. Then the same spread a few vertices out, for the crease's shadow.
   */
  creases: Float32Array;
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
  const mesh = meshSdf(pigDistance, [-1.6, -0.1, -1.1], [1.6, 3.15, 1.45], 0.024);
  const count = mesh.positions.length / 3;
  // Soften the shading a little everywhere but the snout, whose exact normals keep the nostrils
  // crisp. More passes than this blur the creases and the body loses its form.
  const neighbors = meshNeighbors(mesh.indices, count);
  const exactNormals = mesh.normals.slice();
  relaxMesh(mesh, neighbors, 3, 2);
  const skinIndex = new Uint16Array(count * 4);
  const skinWeight = new Float32Array(count * 4);
  const regions = new Float32Array(count * 3);
  const field = new Float32Array(count);
  const hoofs = new Float32Array(count * 3);
  const creases = new Float32Array(count * 3);
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

    // The crease between the two nearest parts (an arm or a leg and the body, an ear and the head,
    // the head and the body). The pair is ordered by part, so the difference keeps its sign across
    // the seam and changes about linearly through 0 on it. In a blend of width k both distances
    // are k / 4 on the seam, so the narrow creases (0.04 to 0.07) are told from the wide shoulder
    // blend (0.12). The snout stands proud of the face with no crease, so it gets none.
    const a = Math.min(order[0]!, order[1]!);
    const b = Math.max(order[0]!, order[1]!);
    creases[v * 3] = d[a]! - d[b]!;
    creases[v * 3 + 1] = b === SNOUT ? 0 : smooth(0.028, 0.02, (d[a]! + d[b]!) / 2);

    // Colors: the snout where it stands proud of the face, the hoof caps at the arm tips and the
    // soles, the inside of the nostrils, and a soft blush on each cheek.
    const snoutAmount = smooth(-0.015, 0.015, Math.min(d[HEAD]!, d[BODY]!) - d[SNOUT]!);
    if (snoutAmount > 0) {
      const n = [0, 1, 2].map(
        (c) =>
          mesh.normals[v * 3 + c]! +
          (exactNormals[v * 3 + c]! - mesh.normals[v * 3 + c]!) * snoutAmount,
      );
      const length = Math.hypot(n[0]!, n[1]!, n[2]!) || 1;
      for (let c = 0; c < 3; c += 1) mesh.normals[v * 3 + c] = n[c]! / length;
    }
    // Each ramps up over a few vertices across its edge, so the field is smooth enough to cut
    // cleanly at 0.5, and fades out where its limb meets the body.
    const normal: Vec3 = [mesh.normals[v * 3]!, mesh.normals[v * 3 + 1]!, mesh.normals[v * 3 + 2]!];
    let hoof = 0;
    let split = 0;
    // Measured from the hoof on this side everywhere, so it changes smoothly between vertices.
    const sideArm = arms[x < 0 ? 0 : 1]!;
    const across = dot(sub([x, y, z], sideArm.wrist), sideArm.across);
    for (let side = 0; side < 2; side += 1) {
      const limb = arms[side]!;
      const onArm = smooth(0.04, 0, d[ARM_L + side]! - nearest);
      const past = dot(sub([x, y, z], limb.wrist), limb.dir);
      // The toes' split: a dark line down the middle of the hoof's front, as on the toy.
      split = Math.max(
        split,
        onArm *
          smooth(SHAPE.hoofStart, SHAPE.hoofStart + 0.06, past) *
          smooth(0.1, 0.4, dot(normal, limb.front)),
      );
      hoof = Math.max(hoof, onArm * smooth(SHAPE.hoofStart - 0.05, SHAPE.hoofStart + 0.05, past));
      // A sole is the flat end of the leg: facing along the leg, inside a pink rim. It is measured
      // on the leg's own surface, not by which part is nearest, so a hand resting close by cannot
      // bite into its color.
      const foot = legs[side]!;
      const onLeg = smooth(0.04, 0.015, d[LEG_L + side]!);
      const end = smooth(0.07, 0.1, dot(sub([x, y, z], foot.foot), foot.dir));
      hoof = Math.max(hoof, onLeg * end * smooth(0.7, 0.9, dot(normal, foot.dir)));
    }
    const inNostril = smooth(0.03, 0, Math.abs(nostril(x, y, z))) * snoutAmount;
    const { x: bx, y: by, radius } = PIG_FACE.blush;
    const cheek = Math.min(Math.hypot(Math.abs(x) - bx, y - by) / radius, 1);
    const blush = z > 0.2 ? (1 - cheek * cheek) ** 2 * (1 - snoutAmount) : 0;
    regions.set([snoutAmount, inNostril, blush], v * 3);
    field[v] = hoof;
    hoofs[v * 3 + 1] = across;
    hoofs[v * 3 + 2] = split;
  }
  // Two light passes smooth out the grid's small steps without moving the 0.5 level.
  for (let pass = 0; pass < 2; pass += 1) blurAttribute(field, 1, neighbors, 0.5);
  for (let v = 0; v < count; v += 1) hoofs[v * 3] = field[v]!;
  // A crease's shadow reaches further than the narrow band where its line shows, so its strength
  // spreads a few vertices out from the seam, a little weaker with each step (which also fades
  // the shadow out along the seam where it reaches the shoulder).
  const shade = new Float32Array(count);
  for (let v = 0; v < count; v += 1) shade[v] = creases[v * 3 + 1]!;
  for (let pass = 0; pass < 5; pass += 1) {
    const next = shade.slice();
    for (let v = 0; v < count; v += 1)
      for (let n = neighbors.start[v]!; n < neighbors.start[v + 1]!; n += 1)
        next[v] = Math.max(next[v]!, shade[neighbors.list[n]!]! * 0.9);
    shade.set(next);
  }
  for (let v = 0; v < count; v += 1) creases[v * 3 + 2] = shade[v]!;
  cached = { ...mesh, skinIndex, skinWeight, regions, hoofs, creases };
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
