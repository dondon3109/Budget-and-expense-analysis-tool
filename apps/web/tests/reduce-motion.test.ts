// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { syncReduceMotionAttribute } from "../src/hooks/useReducedMotion";
import { reduceMotionPreference } from "../src/lib/browserPreferences";

function mockSystemReduceMotion(matches: boolean) {
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({ matches, addEventListener: vi.fn(), removeEventListener: vi.fn() })),
  );
}

describe("reduce motion attribute", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    window.localStorage.clear();
    document.documentElement.removeAttribute("data-reduce-motion");
  });

  it("follows the in-app switch when the system setting is off", () => {
    mockSystemReduceMotion(false);
    syncReduceMotionAttribute();
    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(false);

    reduceMotionPreference.set(true);

    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(true);
  });

  it("stays on for the system setting even with the in-app switch off", () => {
    mockSystemReduceMotion(true);
    reduceMotionPreference.set(false);

    syncReduceMotionAttribute();

    expect(document.documentElement.hasAttribute("data-reduce-motion")).toBe(true);
  });
});
