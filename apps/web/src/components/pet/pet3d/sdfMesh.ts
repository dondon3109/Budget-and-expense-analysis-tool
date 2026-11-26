// Turns a signed distance field (negative inside) into one smooth, closed triangle mesh. This is
// how the 3D pet is modeled: its parts are blended into each other like soft clay (see
// pigShape.ts), which separate primitive meshes cannot do without visible seams.

export type Sdf = (x: number, y: number, z: number) => number;

export interface SdfMesh {
  positions: Float32Array;
  normals: Float32Array;
  indices: Uint32Array;
}

// Cells are evaluated in blocks; a block whose center is far from the surface is skipped whole.
const BLOCK = 4;

/**
 * Meshes `sdf` inside the box `min`..`max` on a grid of `cell` spacing, with naive surface nets:
 * one vertex per cell the surface crosses (at the average of its edge crossings), joined into
 * quads across every crossed grid edge. The field must be a distance bound (it may underestimate,
 * never overestimate by much) for the block skipping.
 */
export function meshSdf(
  sdf: Sdf,
  min: readonly [number, number, number],
  max: readonly [number, number, number],
  cell: number,
): SdfMesh {
  const nx = Math.ceil((max[0] - min[0]) / cell) + 1;
  const ny = Math.ceil((max[1] - min[1]) / cell) + 1;
  const nz = Math.ceil((max[2] - min[2]) / cell) + 1;
  const point = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const field = new Float32Array(nx * ny * nz);

  // Blocks near the surface are evaluated point by point; far ones are filled with their center's
  // value, which has the right sign everywhere in them.
  const reach = Math.sqrt(3) * (BLOCK / 2) * cell * 1.25 + cell * 0.5;
  const near: number[] = [];
  for (let k0 = 0; k0 < nz - 1; k0 += BLOCK)
    for (let j0 = 0; j0 < ny - 1; j0 += BLOCK)
      for (let i0 = 0; i0 < nx - 1; i0 += BLOCK) {
        const i1 = Math.min(i0 + BLOCK, nx - 1);
        const j1 = Math.min(j0 + BLOCK, ny - 1);
        const k1 = Math.min(k0 + BLOCK, nz - 1);
        const d = sdf(
          min[0] + ((i0 + i1) / 2) * cell,
          min[1] + ((j0 + j1) / 2) * cell,
          min[2] + ((k0 + k1) / 2) * cell,
        );
        if (Math.abs(d) < reach) {
          near.push(i0, j0, k0);
          continue;
        }
        for (let k = k0; k <= k1; k += 1)
          for (let j = j0; j <= j1; j += 1)
            for (let i = i0; i <= i1; i += 1) field[point(i, j, k)] = d;
      }
  for (let b = 0; b < near.length; b += 3) {
    const [i0, j0, k0] = [near[b]!, near[b + 1]!, near[b + 2]!];
    for (let k = k0; k <= Math.min(k0 + BLOCK, nz - 1); k += 1)
      for (let j = j0; j <= Math.min(j0 + BLOCK, ny - 1); j += 1)
        for (let i = i0; i <= Math.min(i0 + BLOCK, nx - 1); i += 1)
          field[point(i, j, k)] = sdf(min[0] + i * cell, min[1] + j * cell, min[2] + k * cell);
  }

  // One vertex per crossed cell, at the average of its edge crossings.
  const cellIndex = (i: number, j: number, k: number) => i + (nx - 1) * (j + (ny - 1) * k);
  const vertexOf = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const corners = new Float32Array(8);
  const verts: number[] = [];
  const crossed: number[] = [];
  for (let b = 0; b < near.length; b += 3) {
    const [i0, j0, k0] = [near[b]!, near[b + 1]!, near[b + 2]!];
    for (let k = k0; k < Math.min(k0 + BLOCK, nz - 1); k += 1)
      for (let j = j0; j < Math.min(j0 + BLOCK, ny - 1); j += 1)
        for (let i = i0; i < Math.min(i0 + BLOCK, nx - 1); i += 1) {
          let mask = 0;
          for (let c = 0; c < 8; c += 1) {
            const v = field[point(i + (c & 1), j + ((c >> 1) & 1), k + ((c >> 2) & 1))]!;
            corners[c] = v;
            if (v < 0) mask |= 1 << c;
          }
          if (mask === 0 || mask === 255) continue;
          let sx = 0;
          let sy = 0;
          let sz = 0;
          let count = 0;
          for (const [a, e] of EDGES) {
            const va = corners[a]!;
            const vb = corners[e]!;
            if (va < 0 === vb < 0) continue;
            const t = va / (va - vb);
            sx += (a & 1) + ((e & 1) - (a & 1)) * t;
            sy += ((a >> 1) & 1) + (((e >> 1) & 1) - ((a >> 1) & 1)) * t;
            sz += ((a >> 2) & 1) + (((e >> 2) & 1) - ((a >> 2) & 1)) * t;
            count += 1;
          }
          vertexOf[cellIndex(i, j, k)] = verts.length / 3;
          verts.push(
            min[0] + (i + sx / count) * cell,
            min[1] + (j + sy / count) * cell,
            min[2] + (k + sz / count) * cell,
          );
          crossed.push(i, j, k);
        }
  }

  // A quad across every crossed grid edge, joining the four cells around it, wound so it faces out.
  const indices: number[] = [];
  const at = new Int32Array(3);
  for (let c = 0; c < crossed.length; c += 3) {
    const i = crossed[c]!;
    const j = crossed[c + 1]!;
    const k = crossed[c + 2]!;
    const inside = field[point(i, j, k)]! < 0;
    for (let axis = 0; axis < 3; axis += 1) {
      const end = point(
        i + (axis === 0 ? 1 : 0),
        j + (axis === 1 ? 1 : 0),
        k + (axis === 2 ? 1 : 0),
      );
      if (inside === field[end]! < 0) continue;
      // The two other axes, in the order whose cross product is `axis`.
      const u = (axis + 1) % 3;
      const v = (axis + 2) % 3;
      at.set([i, j, k]);
      if (at[u] === 0 || at[v] === 0) continue;
      const quad: number[] = [];
      for (const [du, dv] of QUAD) {
        at.set([i, j, k]);
        at[u] = at[u]! - du;
        at[v] = at[v]! - dv;
        quad.push(vertexOf[cellIndex(at[0]!, at[1]!, at[2]!)]!);
      }
      if (quad.includes(-1)) continue;
      const [a, b, c2, d] = quad as [number, number, number, number];
      if (inside) indices.push(a, b, c2, a, c2, d);
      else indices.push(a, c2, b, a, d, c2);
    }
  }

  // Each vertex's normal is the field's gradient there (tetrahedral differences, four samples), so
  // the shading is as smooth as the field itself rather than the grid's facets.
  const positions = new Float32Array(verts);
  const normals = new Float32Array(verts.length);
  const h = cell * 0.25;
  for (let p = 0; p < positions.length; p += 3) {
    const x = positions[p]!;
    const y = positions[p + 1]!;
    const z = positions[p + 2]!;
    const a = sdf(x + h, y - h, z - h);
    const b = sdf(x - h, y - h, z + h);
    const c = sdf(x - h, y + h, z - h);
    const d = sdf(x + h, y + h, z + h);
    const nx = a - b - c + d;
    const ny = -a - b + c + d;
    const nz = -a + b - c + d;
    const length = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1;
    normals[p] = nx / length;
    normals[p + 1] = ny / length;
    normals[p + 2] = nz / length;
  }
  return { positions, normals, indices: new Uint32Array(indices) };
}

// A cell's corners are numbered by their x, y, z offsets as bits 0, 1, 2; these are its 12 edges.
const EDGES: ReadonlyArray<readonly [number, number]> = [
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

// The four cells around a grid edge, as offsets along its two other axes, counterclockwise.
const QUAD: ReadonlyArray<readonly [number, number]> = [
  [1, 1],
  [0, 1],
  [0, 0],
  [1, 0],
];

/** Smooth union: the two shapes melt into each other over a seam about `k` wide. */
export function smin(a: number, b: number, k: number) {
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** Smooth intersection, the mirror of `smin`. */
export function smax(a: number, b: number, k: number) {
  return -smin(-a, -b, k);
}

/** An ellipsoid centered at the origin with radii `rx`, `ry`, `rz` (a close distance bound). */
export function ellipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  // Plain square roots: Math.hypot is several times slower, and this runs millions of times.
  const ax = x / rx;
  const ay = y / ry;
  const az = z / rz;
  const k0 = Math.sqrt(ax * ax + ay * ay + az * az);
  const k1 = Math.sqrt((ax * ax) / (rx * rx) + (ay * ay) / (ry * ry) + (az * az) / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}

/** A capsule from `a` to `b` whose radius tapers from `r1` to `r2`: limbs, ears, and hooves. */
export function roundCone(
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  r1: number,
  r2: number,
) {
  const [bax, bay, baz] = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const l2 = bax * bax + bay * bay + baz * baz;
  const rr = r1 - r2;
  const a2 = l2 - rr * rr;
  const il2 = 1 / l2;
  return (x: number, y: number, z: number) => {
    const [pax, pay, paz] = [x - a[0], y - a[1], z - a[2]];
    const py = pax * bax + pay * bay + paz * baz;
    const pz = py - l2;
    const qx = pax * l2 - bax * py;
    const qy = pay * l2 - bay * py;
    const qz = paz * l2 - baz * py;
    const x2 = qx * qx + qy * qy + qz * qz;
    const y2 = py * py * l2;
    const z2 = pz * pz * l2;
    const k = Math.sign(rr) * rr * rr * x2;
    if (Math.sign(pz) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
    if (Math.sign(py) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
    return (Math.sqrt(x2 * a2 * il2) + py * rr) * il2 - r1;
  };
}
