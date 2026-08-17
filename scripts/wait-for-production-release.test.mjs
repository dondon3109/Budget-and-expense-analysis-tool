import { describe, expect, it } from "vitest";

import { matchesDeploymentMarker } from "./wait-for-production-release.mjs";

describe("production release propagation marker", () => {
  it("accepts only the expected semantic version", () => {
    expect(matchesDeploymentMarker({ appVersion: "2.3.0" }, "2.3.0")).toBe(true);
    expect(matchesDeploymentMarker({ appVersion: "2.2.1" }, "2.3.0")).toBe(false);
    expect(matchesDeploymentMarker(null, "2.3.0")).toBe(false);
  });
});
