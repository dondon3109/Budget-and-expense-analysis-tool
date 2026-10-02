import { describe, expect, it } from "vitest";

import {
  dashboardEmphases,
  goalChecklistSignals,
  goalConfigFor,
  goalConfigs,
  goalCtaActions,
  goalCtaRoutes,
  type GoalCtaTarget,
} from "../src/goalConfig";
import { primaryGoals } from "../src/goals";

const validTargets: readonly string[] = [...goalCtaActions, ...goalCtaRoutes];

describe("goal config", () => {
  it("has an entry for every goal and a default", () => {
    for (const goal of primaryGoals) expect(goalConfigs[goal]).toBeDefined();
    expect(goalConfigs.default).toBeDefined();
  });

  it("uses valid CTA targets, emphases, and signals", () => {
    for (const config of Object.values(goalConfigs)) {
      const targets: GoalCtaTarget[] = [
        ...(config.cta ? [config.cta.target] : []),
        ...config.checklist.map((item) => item.target),
      ];
      for (const target of targets) expect(validTargets).toContain(target);
      expect(dashboardEmphases).toContain(config.emphasis);
      for (const item of config.checklist) expect(goalChecklistSignals).toContain(item.signal);
      expect(config.checklist.length).toBeLessThanOrEqual(3);
    }
  });

  it("gives every real goal a CTA, a starter prompt, and a checklist", () => {
    for (const goal of primaryGoals.filter((key) => key !== "other")) {
      const config = goalConfigs[goal];
      expect(config.cta?.label).toBeTruthy();
      expect(config.starterPrompt).toBeTruthy();
      expect(config.checklist.length).toBeGreaterThan(0);
    }
  });

  it("leaves other, skipped, and no goal on the default experience", () => {
    expect(goalConfigs.other).toBe(goalConfigs.default);
    expect(goalConfigFor(null)).toBe(goalConfigs.default);
    expect(goalConfigFor(undefined)).toBe(goalConfigs.default);
    expect(goalConfigs.default).toEqual({
      cta: null,
      emphasis: "overview",
      starterPrompt: null,
      checklist: [],
    });
  });
});
