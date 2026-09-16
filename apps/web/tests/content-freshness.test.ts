import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { FINANCE_GUIDES } from "@zoption/shared";
import { describe, expect, it } from "vitest";

import { CONTENT_SOURCES } from "../src/seo/contentSources";
import { SITEMAP_ENTRIES } from "../src/seo/siteMetadata";

const REPO_ROOT = fileURLToPath(new URL("../../..", import.meta.url));

interface DeclaredRoute {
  path: string;
  declared: string;
}

/**
 * Author date of the last commit that touched a repository-relative path, as a
 * UTC calendar day. Page dates follow UTC so this guard agrees with the "never
 * ahead of today" rule in seo-metadata.test.ts: git's `--date=short` prints the
 * author's recorded timezone, so the child's TZ is pinned to UTC and the date is
 * formatted as local time instead. Returns null when git has no history for the
 * path, which the caller reports rather than passing over.
 */
function lastCommitDate(source: string): string | null {
  const date = execFileSync(
    "git",
    ["-C", REPO_ROOT, "log", "-1", "--format=%ad", "--date=format-local:%Y-%m-%d", "--", source],
    { encoding: "utf8", env: { ...process.env, TZ: "UTC" } },
  ).trim();

  return date || null;
}

/**
 * Routes grouped by the sources they list. A file shared by several routes (the
 * guide and import families) is checked against the newest declared date among
 * them, so editing one page forces one bump rather than a bump per page.
 */
function routesBySource(): Map<string, DeclaredRoute[]> {
  const groups = new Map<string, DeclaredRoute[]>();

  for (const entry of SITEMAP_ENTRIES) {
    for (const source of CONTENT_SOURCES[entry.path] ?? []) {
      const group = groups.get(source) ?? [];
      group.push({ path: entry.path, declared: entry.lastModified });
      groups.set(source, group);
    }
  }

  return groups;
}

describe("content freshness", () => {
  it("maps every public route to the sources that make up its page", () => {
    const unmapped = SITEMAP_ENTRIES.filter(
      (entry) => !Object.hasOwn(CONTENT_SOURCES, entry.path),
    ).map((entry) => entry.path);

    expect(
      unmapped,
      "Add these routes to CONTENT_SOURCES in apps/web/src/seo/contentSources.ts, listing the " +
        "page component and the modules that hold its copy (see the guide, import, and feature " +
        "families for examples).",
    ).toEqual([]);
  });

  it("points every source mapping at a real public route with at least one source", () => {
    const published = new Set<string>(SITEMAP_ENTRIES.map((entry) => entry.path));
    const unknown = Object.keys(CONTENT_SOURCES).filter((path) => !published.has(path));
    const empty = Object.entries(CONTENT_SOURCES)
      .filter(([, sources]) => sources.length === 0)
      .map(([path]) => path);

    expect(
      unknown,
      "CONTENT_SOURCES maps routes that are not public: fix or remove the key.",
    ).toEqual([]);
    expect(empty, "These routes list no sources, so the guard would skip them silently.").toEqual(
      [],
    );
  });

  it("keeps every declared date at least as new as the sources it describes", () => {
    const failures: string[] = [];

    for (const [source, routes] of routesBySource()) {
      const sourceDate = lastCommitDate(source);
      if (!sourceDate) {
        failures.push(
          `git has no commit history for ${source}. Commit the file, fix the path in ` +
            "contentSources.ts, or run `git fetch --unshallow` if this is a shallow clone " +
            "(CI checks out with fetch-depth: 0).",
        );
        continue;
      }

      const newest = routes.reduce((latest, route) =>
        route.declared > latest.declared ? route : latest,
      );

      if (newest.declared < sourceDate) {
        failures.push(
          `${source} was last committed on ${sourceDate}, but the newest declared date it feeds ` +
            `is ${newest.declared} on ${routes.map((route) => route.path).join(", ")}. Raise that ` +
            `date to ${sourceDate} or later.`,
        );
      }
    }

    expect(
      failures,
      "Declared dates must not lag the last commit that touched the page's sources. Dates live in " +
        "apps/web/src/seo/siteMetadata.ts, except guide routes (financeGuides.ts updatedDate) and " +
        "feature explainers (featurePages.ts). Future dates are already rejected by " +
        "seo-metadata.test.ts.",
    ).toEqual([]);
  });

  it("keeps every guide's updated date on or after its published date", () => {
    const backwards = FINANCE_GUIDES.filter((guide) => guide.updatedDate < guide.publishedDate).map(
      (guide) =>
        `${guide.slug}: updatedDate ${guide.updatedDate} is before publishedDate ${guide.publishedDate}`,
    );

    expect(
      backwards,
      "Set updatedDate on or after publishedDate in packages/shared/src/financeGuides.ts.",
    ).toEqual([]);
  });
});
