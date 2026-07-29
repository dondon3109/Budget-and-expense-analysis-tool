import { describe, expect, it } from "vitest";

import {
  getRouteSeoMetadata,
  PUBLIC_ROUTE_METADATA,
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

  it("keeps the sitemap limited to the canonical public pages", () => {
    expect(SITEMAP_ENTRIES.map((entry) => entry.path)).toEqual([
      "/",
      "/terms-of-service",
      "/privacy-policy",
      "/cookie-policy",
    ]);
    expect(SITEMAP_ENTRIES.every((entry) => entry.lastModified === "2026-07-30")).toBe(true);
  });

  it("keeps authentication, private, and query-bearing pages out of search", () => {
    expect(getRouteSeoMetadata("/login").robots).toBe("noindex,nofollow");
    expect(getRouteSeoMetadata("/app/transactions").robots).toBe("noindex,nofollow");
    expect(getRouteSeoMetadata("/", "?code=secret").robots).toBe("noindex,nofollow");
    expect(getRouteSeoMetadata("/missing").robots).toBe("noindex,nofollow");
  });

  it("safely serializes structured data", () => {
    expect(serializeJsonLd({ value: "<script>" })).toBe('{"value":"\\u003cscript>"}');
  });
});
