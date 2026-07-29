import { describe, expect, it } from "vitest";

import {
  getRouteSeoMetadata,
  PUBLIC_ROUTE_METADATA,
  PUBLIC_ROUTE_PATHS,
  serializeJsonLd,
  SITEMAP_ENTRIES,
  SITE_ORIGIN,
} from "../src/seo/siteMetadata";

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

  it("uses the sitemap content date in legal-page structured data", () => {
    for (const path of ["/terms-of-service", "/privacy-policy", "/cookie-policy"] as const) {
      const schema = PUBLIC_ROUTE_METADATA[path].structuredData?.[0] as { dateModified?: string };
      expect(schema.dateModified).toBe(PUBLIC_ROUTE_METADATA[path].sitemap.lastModified);
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
