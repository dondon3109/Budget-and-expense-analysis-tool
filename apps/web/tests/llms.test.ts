import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { LLMS_PAGES_MARKER, llmsPageList, withLlmsPageList } from "../scripts/llms.mjs";

describe("llms page list", () => {
  it("lists each page with its canonical URL and a title without the brand suffix", () => {
    expect(
      llmsPageList([
        { url: "https://zoption.site/faq", title: "FAQ — Zoption", description: "Answers." },
        { url: "https://zoption.site/import", title: "Import | Zoption", description: "How." },
      ]),
    ).toBe(
      "- [FAQ](https://zoption.site/faq): Answers.\n- [Import](https://zoption.site/import): How.",
    );
  });

  it("rejects a template without exactly one marker", () => {
    expect(() => withLlmsPageList("no marker", [])).toThrow();
  });

  it.each(["llms.txt", "llms-full.txt"])("public/%s carries exactly one marker", (file) => {
    const template = readFileSync(resolve(import.meta.dirname, "../public", file), "utf8");
    expect(template.split(LLMS_PAGES_MARKER)).toHaveLength(2);
  });
});
