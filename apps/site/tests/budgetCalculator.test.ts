import { describe, expect, it } from "vitest";

import {
  PUBLIC_ROUTE_METADATA,
  PUBLIC_ROUTE_PATHS,
  SITEMAP_ENTRIES,
} from "../src/seo/siteMetadata";

const CALCULATOR_PATH = "/tools/50-30-20-calculator";

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
