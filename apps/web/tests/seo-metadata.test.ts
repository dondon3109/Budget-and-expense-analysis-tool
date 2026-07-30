import { describe, expect, it } from "vitest";

import {
  getRouteSeoMetadata,
  PUBLIC_ROUTE_METADATA,
  PUBLIC_ROUTE_PATHS,
  serializeJsonLd,
  SITEMAP_ENTRIES,
  SITE_ORIGIN,
} from "../src/seo/siteMetadata";

type SchemaNode = Record<string, unknown>;

function structuredDataFor(path: keyof typeof PUBLIC_ROUTE_METADATA) {
  const structuredData = PUBLIC_ROUTE_METADATA[path].structuredData;
  if (!structuredData) throw new Error(`${path} is missing structured data.`);
  return structuredData;
}

function nodesByType(nodes: SchemaNode[], type: string) {
  return nodes.filter((node) => node["@type"] === type);
}

describe("public SEO metadata", () => {
  it("gives every indexable route a unique title, description, and canonical URL", () => {
    const routes = Object.entries(PUBLIC_ROUTE_METADATA);
    const titles = routes.map(([, metadata]) => metadata.title);
    const descriptions = routes.map(([, metadata]) => metadata.description);
    const canonicals = routes.map(([, metadata]) => metadata.canonical);

    expect(new Set(titles)).toHaveLength(routes.length);
    expect(new Set(descriptions)).toHaveLength(routes.length);
    expect(new Set(canonicals)).toHaveLength(routes.length);
    expect(canonicals.every((canonical) => canonical.startsWith(SITE_ORIGIN))).toBe(true);
    expect(routes.every(([, metadata]) => metadata.robots === "index,follow")).toBe(true);
  });

  it("derives sitemap entries from the canonical public route manifest", () => {
    expect(SITEMAP_ENTRIES.map((entry) => entry.path)).toEqual(PUBLIC_ROUTE_PATHS);
    expect(SITEMAP_ENTRIES.every((entry) => /^\d{4}-\d{2}-\d{2}$/.test(entry.lastModified))).toBe(
      true,
    );

    for (const entry of SITEMAP_ENTRIES) {
      const metadata = PUBLIC_ROUTE_METADATA[entry.path];
      expect(entry.lastModified).toBe(metadata.sitemap.lastModified);
      expect(entry.changeFrequency).toBe(metadata.sitemap.changeFrequency);
      expect(entry.priority).toBe(metadata.sitemap.priority);
    }
  });

  it("models public routes as linked, canonical Schema.org graphs", () => {
    for (const path of PUBLIC_ROUTE_PATHS) {
      const metadata = PUBLIC_ROUTE_METADATA[path];
      const graph = structuredDataFor(path);
      const nodeIds = graph["@graph"].map((node) => node["@id"]);
      const websiteId = `${SITE_ORIGIN}/#website`;
      const website = nodesByType(graph["@graph"], "WebSite");

      expect(graph["@context"]).toBe("https://schema.org");
      expect(new Set(nodeIds)).toHaveLength(nodeIds.length);
      expect(website).toEqual([
        expect.objectContaining({
          "@id": websiteId,
          url: SITE_ORIGIN,
          inLanguage: "en",
        }),
      ]);

      if (path === "/") {
        const application = nodesByType(graph["@graph"], "WebApplication");
        expect(nodesByType(graph["@graph"], "SoftwareApplication")).toHaveLength(0);
        expect(application).toEqual([
          expect.objectContaining({
            "@id": `${SITE_ORIGIN}/#webapplication`,
            url: metadata.canonical,
            inLanguage: "en",
            isPartOf: { "@id": websiteId },
            featureList: [
              "Map columns, catch errors, and prevent duplicate entries.",
              "See totals, trends, categories, and budget progress together.",
              "Start from a clean workspace and add only the records you choose.",
            ],
          }),
        ]);
      } else {
        const page = nodesByType(graph["@graph"], "WebPage");
        expect(page).toEqual([
          expect.objectContaining({
            "@id": `${metadata.canonical}#webpage`,
            url: metadata.canonical,
            dateModified: metadata.sitemap.lastModified,
            inLanguage: "en",
            isPartOf: { "@id": websiteId },
          }),
        ]);
      }
    }
  });

  it("does not claim unsupported business, pricing, review, or navigation markup", () => {
    const unsupportedTypes = [
      "Organization",
      "Person",
      "Offer",
      "AggregateRating",
      "Review",
      "BreadcrumbList",
      "FAQPage",
      "LocalBusiness",
      "SearchAction",
      "SoftwareApplication",
    ];
    const unsupportedProperties = [
      "sameAs",
      "screenshot",
      "softwareVersion",
      "price",
      "priceCurrency",
      "aggregateRating",
      "review",
      "offers",
    ];

    for (const path of PUBLIC_ROUTE_PATHS) {
      const serialized = JSON.stringify(structuredDataFor(path));
      for (const type of unsupportedTypes) {
        expect(serialized).not.toContain(`"@type":"${type}"`);
      }
      for (const property of unsupportedProperties) {
        expect(serialized).not.toContain(`"${property}":`);
      }
    }
  });

  it("keeps tracking-only public URLs indexable with clean canonicals", () => {
    const metadata = getRouteSeoMetadata(
      "/privacy-policy/",
      "?utm_source=newsletter&gclid=campaign",
    );

    expect(metadata.robots).toBe("index,follow");
    expect(metadata.canonical).toBe(`${SITE_ORIGIN}/privacy-policy`);
  });

  it("keeps authentication, private, unknown, and sensitive URL state out of search", () => {
    expect(getRouteSeoMetadata("/login").robots).toBe("noindex,nofollow");
    expect(getRouteSeoMetadata("/app/transactions", "?utm_source=newsletter").robots).toBe(
      "noindex,nofollow",
    );
    expect(getRouteSeoMetadata("/", "?code=secret").robots).toBe("noindex,nofollow");
    expect(getRouteSeoMetadata("/", "?utm_source=newsletter&code=secret").robots).toBe(
      "noindex,nofollow",
    );
    expect(getRouteSeoMetadata("/", "?ref=partner").robots).toBe("noindex,nofollow");
    expect(getRouteSeoMetadata("/", "", "#error=access_denied").robots).toBe("noindex,nofollow");
    expect(getRouteSeoMetadata("/missing").robots).toBe("noindex,nofollow");
  });

  it("safely serializes structured data", () => {
    expect(serializeJsonLd({ value: "<script>" })).toBe('{"value":"\\u003cscript>"}');
  });
});
