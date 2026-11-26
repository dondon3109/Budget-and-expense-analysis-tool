import { describe, expect, it } from "vitest";

import { meshSdf } from "../src/components/pet/pet3d/sdfMesh";

describe("meshSdf", () => {
  const sphere = (x: number, y: number, z: number) => Math.sqrt(x * x + y * y + z * z) - 1;
  const mesh = meshSdf(sphere, [-1.3, -1.3, -1.3], [1.3, 1.3, 1.3], 0.05);

  it("meshes a closed surface, every edge shared by two triangles", () => {
    const edges = new Map<string, number>();
    for (let t = 0; t < mesh.indices.length; t += 3)
      for (let e = 0; e < 3; e += 1) {
        const a = mesh.indices[t + e]!;
        const b = mesh.indices[t + ((e + 1) % 3)]!;
        const key = a < b ? `${a},${b}` : `${b},${a}`;
        edges.set(key, (edges.get(key) ?? 0) + 1);
      }
    expect(mesh.indices.length).toBeGreaterThan(1000);
    expect([...edges.values()].every((count) => count === 2)).toBe(true);
  });

  it("puts the vertices on the surface with outward normals and faces wound outward", () => {
    for (let p = 0; p < mesh.positions.length; p += 3) {
      const [x, y, z] = [mesh.positions[p]!, mesh.positions[p + 1]!, mesh.positions[p + 2]!];
      expect(Math.abs(sphere(x, y, z))).toBeLessThan(0.02);
      expect(
        x * mesh.normals[p]! + y * mesh.normals[p + 1]! + z * mesh.normals[p + 2]!,
      ).toBeGreaterThan(0.95);
    }
    const at = (i: number) => [0, 1, 2].map((k) => mesh.positions[mesh.indices[i]! * 3 + k]!);
    for (let t = 0; t < mesh.indices.length; t += 3) {
      const [a, b, c] = [at(t), at(t + 1), at(t + 2)] as [number[], number[], number[]];
      const u = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const v = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
      const n = [
        u[1]! * v[2]! - u[2]! * v[1]!,
        u[2]! * v[0]! - u[0]! * v[2]!,
        u[0]! * v[1]! - u[1]! * v[0]!,
      ];
      expect(n[0]! * a[0]! + n[1]! * a[1]! + n[2]! * a[2]!).toBeGreaterThan(0);
    }
  });
});
