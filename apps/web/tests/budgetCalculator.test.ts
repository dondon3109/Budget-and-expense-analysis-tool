import { describe, expect, it } from "vitest";

import { allocateBudget, DEFAULT_PERCENTAGES } from "../src/pages/tools/allocateBudget";
import {
  PUBLIC_ROUTE_METADATA,
  PUBLIC_ROUTE_PATHS,
  SITEMAP_ENTRIES,
} from "../src/seo/siteMetadata";

const CALCULATOR_PATH = "/tools/50-30-20-calculator";

describe("allocateBudget", () => {
  it("splits a clean amount into the standard buckets", () => {
    expect(allocateBudget(3_000_000)).toEqual({
      needs: 1_500_000,
      wants: 900_000,
      savings: 600_000,
      total: 3_000_000,
    });
  });

  it("never loses or invents a centavo, for every amount up to one peso step", () => {
    // The whole point of centavo arithmetic: naive per-bucket rounding leaks a centavo
    // or two, so the three buckets would not reconcile with the income.
    for (let minor = 0; minor <= 100_000; minor += 1) {
      const result = allocateBudget(minor);
      expect(result.needs + result.wants + result.savings).toBe(minor);
      expect(result.total).toBe(minor);
    }
  });

  it("gives leftover centavos to the buckets that lost the most to flooring", () => {
    // 0.01 splits as 50%=0.005, 30%=0.003, 20%=0.002, so all three floor to 0 and the
    // single centavo goes to needs, which lost the largest fraction.
    expect(allocateBudget(1)).toEqual({
      needs: 1,
      wants: 0,
      savings: 0,
      total: 1,
    });
  });

  it("honours custom percentages", () => {
    const result = allocateBudget(1_000_00, { needs: 70, wants: 20, savings: 10 });
    expect(result).toEqual({ needs: 700_00, wants: 200_00, savings: 100_00, total: 1_000_00 });
  });

  it("rejects percentages that do not sum to 100", () => {
    expect(() => allocateBudget(1000, { needs: 50, wants: 30, savings: 19 })).toThrow(
      /sum to 100/,
    );
  });

  it("rejects non-integer or negative input", () => {
    expect(() => allocateBudget(-1)).toThrow(RangeError);
    expect(() => allocateBudget(1.5)).toThrow(RangeError);
    expect(() => allocateBudget(1000, { needs: -10, wants: 60, savings: 50 })).toThrow(RangeError);
  });

  it("leaves the shared defaults at 50/30/20", () => {
    expect(DEFAULT_PERCENTAGES).toEqual({ needs: 50, wants: 30, savings: 20 });
  });
});

describe("budget calculator route", () => {
  it("is registered as an indexable public route", () => {
    expect(PUBLIC_ROUTE_PATHS).toContain(CALCULATOR_PATH);
    expect(PUBLIC_ROUTE_METADATA[CALCULATOR_PATH].robots).toBe("index,follow");
  });

  it("describes the tool in its title and description", () => {
    const { title, description } = PUBLIC_ROUTE_METADATA[CALCULATOR_PATH];
    expect(title).toMatch(/50\/30\/20/);
    expect(description.toLowerCase()).toContain("peso");
  });

  it("appears in the sitemap", () => {
    expect(SITEMAP_ENTRIES.map((entry) => entry.path)).toContain(CALCULATOR_PATH);
  });
});
