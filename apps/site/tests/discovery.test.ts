import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  LLMS_PAGES_MARKER,
  llmsPageList,
  robotsText,
  sitemapXml,
  withLlmsPageList,
} from "../src/seo/discovery";
import { PUBLIC_ROUTE_PATHS, SITE_ORIGIN } from "../src/seo/siteMetadata";

describe("robots.txt", () => {
  it("allows every crawler with a single wildcard group and advertises the sitemap", () => {
    const robots = robotsText(true);
    expect(robots).toContain("User-agent: *\nAllow: /");
    expect(robots.match(/^User-agent:/gm)).toHaveLength(1);
    expect(robots).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
  });

  it("welcomes search and AI answers but refuses training", () => {
    expect(robotsText(true)).toContain("Content-Signal: search=yes, ai-input=yes, ai-train=no");
  });

  it("never restates an Allow for agents the Cloudflare managed block covers", () => {
    // Cloudflare's managed block Disallows these agents above our rules; a second group for
    // the same names ties at equal specificity and crawlers resolve that restrictively.
    const robots = robotsText(true);
    for (const agent of ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"]) {
      expect(robots).not.toContain(agent);
    }
  });

  it("advertises no sitemap when indexing is off", () => {
    expect(robotsText(false)).not.toContain("Sitemap:");
  });
});

describe("llms.txt page list", () => {
  it("lists every manifest route by canonical URL with the brand suffix trimmed", () => {
    const lines = llmsPageList().split("\n");
    expect(lines).toHaveLength(PUBLIC_ROUTE_PATHS.length);
    expect(lines).toContain(
      `- [FAQ](${SITE_ORIGIN}/faq): Plain-language answers about tracking expenses, importing CSV or Excel exports, budgets, subscription tracking, savings interest, the AI assistant, privacy, and billing.`,
    );
  });

  it("rejects a template without exactly one marker", () => {
    expect(() => withLlmsPageList("no marker")).toThrow();
  });

  it.each(["llms.txt", "llms-full.txt"])("src/content/%s carries exactly one marker", (file) => {
    const template = readFileSync(resolve(import.meta.dirname, "../src/content", file), "utf8");
    expect(template.split(LLMS_PAGES_MARKER)).toHaveLength(2);
  });
});

describe("sitemap.xml", () => {
  it("lists the same routes as llms.txt, in manifest order", () => {
    const locs = [...sitemapXml().matchAll(/<loc>([^<]+)<\/loc>/g)].map(([, url]) => url);
    const listed = [...llmsPageList().matchAll(/\]\(([^)]+)\)/g)].map(([, url]) => url);
    expect(locs).toEqual(listed);
  });
});
