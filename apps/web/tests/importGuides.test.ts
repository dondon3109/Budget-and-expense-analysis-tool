import { describe, expect, it } from "vitest";

import { importPresets } from "../src/lib/importPresets";
import {
  detectedColumnLabels,
  IMPORT_GUIDES,
  IMPORT_GUIDE_PATHS,
  type ImportGuide,
} from "../src/pages/import/importGuides";
import {
  PUBLIC_ROUTE_METADATA,
  PUBLIC_ROUTE_PATHS,
  SITEMAP_ENTRIES,
} from "../src/seo/siteMetadata";

const supportedPresetIds = importPresets.map((preset) => preset.id);

describe("import guides", () => {
  it("only publishes guides for presets the importer actually supports", () => {
    for (const guide of IMPORT_GUIDES) {
      expect(supportedPresetIds).toContain(guide.presetId);
    }
  });

  it("gives every guide a distinct institution, path, and slug-like path", () => {
    const institutions = IMPORT_GUIDES.map((guide) => guide.institution);
    const paths = IMPORT_GUIDE_PATHS;

    expect(new Set(institutions).size).toBe(IMPORT_GUIDES.length);
    expect(new Set(paths).size).toBe(paths.length);

    for (const path of paths) {
      expect(path.startsWith("/import/")).toBe(true);
      expect(path).toBe(path.toLocaleLowerCase("en"));
      expect(path).not.toMatch(/\s|[^a-z0-9/-]/);
    }
  });

  it("does not claim currency conversion for foreign-currency exports", () => {
    const foreignCurrency = IMPORT_GUIDES.filter((guide) =>
      ["bank-of-america", "jpmorgan"].includes(guide.presetId),
    );

    expect(foreignCurrency.length).toBeGreaterThan(0);
    for (const guide of foreignCurrency) {
      const copy = `${guide.summary} ${guide.notes.join(" ")} ${guide.questions
        .map((item) => `${item.question} ${item.answer}`)
        .join(" ")}`;
      expect(copy.toLowerCase()).toContain("does not convert currencies");
      expect(copy).not.toMatch(/\bwe convert\b|\bauto-convert/i);
    }
  });

  it("never claims a bank connection", () => {
    for (const guide of IMPORT_GUIDES) {
      const copy = [
        guide.summary,
        guide.description,
        ...guide.exportSteps,
        ...guide.notes,
        ...guide.questions.flatMap((item) => [item.question, item.answer]),
      ].join(" ");
      expect(copy).not.toMatch(/\bconnects? to\b.*\bbank\b/i);
    }
  });

  it("derives detected columns from the real preset aliases", () => {
    for (const guide of IMPORT_GUIDES) {
      const preset = importPresets.find((candidate) => candidate.id === guide.presetId);
      const labels = detectedColumnLabels(guide.presetId);
      expect(labels.length).toBeGreaterThan(0);
      for (const label of labels) {
        const matchesPreset = Object.values(preset?.aliases ?? {}).some((aliases) =>
          aliases.includes(label),
        );
        expect(matchesPreset).toBe(true);
      }
    }
  });

  it("registers every guide as an indexable public route", () => {
    for (const path of IMPORT_GUIDE_PATHS) {
      expect(PUBLIC_ROUTE_PATHS).toContain(path);
      const metadata = PUBLIC_ROUTE_METADATA[path as (typeof PUBLIC_ROUTE_PATHS)[number]];
      expect(metadata.robots).toBe("index,follow");
      expect(metadata.title).toMatch(/Zoption/);
    }
    expect(PUBLIC_ROUTE_PATHS).toContain("/import");
  });

  it("keeps guide metadata in step with the guide copy", () => {
    for (const guide of IMPORT_GUIDES as ImportGuide[]) {
      const metadata = PUBLIC_ROUTE_METADATA[guide.path as (typeof PUBLIC_ROUTE_PATHS)[number]];
      expect(metadata.title).toBe(guide.title);
      expect(metadata.description).toBe(guide.description);
      expect(metadata.canonical).toBe(`https://zoption.site${guide.path}`);
    }
  });

  it("includes the hub and guides in the sitemap", () => {
    const paths = SITEMAP_ENTRIES.map((entry) => entry.path);
    expect(paths).toContain("/import");
    for (const path of IMPORT_GUIDE_PATHS) {
      expect(paths).toContain(path);
    }
  });
});
