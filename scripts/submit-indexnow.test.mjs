import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { INDEXNOW_KEY, indexNowPayload, sitemapUrls } from "./submit-indexnow.mjs";

describe("submit-indexnow", () => {
  it("serves the key from the public folder so engines can verify it", async () => {
    const file = await readFile(`apps/site/public/${INDEXNOW_KEY}.txt`, "utf8");
    expect(file.trim()).toBe(INDEXNOW_KEY);
  });

  it("builds the payload from sitemap locations", () => {
    const urls = sitemapUrls(
      "<urlset><url><loc>https://zoption.site</loc></url><url><loc>https://zoption.site/pricing</loc></url></urlset>",
    );
    expect(indexNowPayload(urls)).toEqual({
      host: "zoption.site",
      key: INDEXNOW_KEY,
      keyLocation: `https://zoption.site/${INDEXNOW_KEY}.txt`,
      urlList: ["https://zoption.site", "https://zoption.site/pricing"],
    });
  });
});
