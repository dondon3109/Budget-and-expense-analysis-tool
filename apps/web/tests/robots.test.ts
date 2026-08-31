import { describe, expect, it } from "vitest";

import { robotsText } from "../scripts/robots.mjs";

const SITE_ORIGIN = "https://zoption.site";

describe("robotsText", () => {
  it("allows every crawler with a single wildcard group in production", () => {
    expect(robotsText(SITE_ORIGIN, true)).toContain("User-agent: *\nAllow: /");
  });

  it("advertises the sitemap only when indexing is enabled", () => {
    expect(robotsText(SITE_ORIGIN, true)).toContain(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`);
    expect(robotsText(SITE_ORIGIN, false)).not.toContain("Sitemap:");
  });

  it("never restates an Allow for agents the Cloudflare managed block covers", () => {
    // Cloudflare prepends a block that Disallows these agents above our own rules.
    // Repeating `Allow` for the same names yields two groups of equal specificity with
    // conflicting directives; crawlers resolve that tie restrictively, so the extra
    // group cannot win and only adds ambiguity. The wildcard group already allows these
    // agents once the edge stops blocking them.
    const robots = robotsText(SITE_ORIGIN, true);
    for (const agent of ["GPTBot", "ClaudeBot", "Google-Extended", "Applebot-Extended"]) {
      expect(robots).not.toContain(agent);
    }
  });

  it("declares exactly one user-agent group", () => {
    expect(robotsText(SITE_ORIGIN, true).match(/^User-agent:/gm)).toHaveLength(1);
  });
});
