// @vitest-environment jsdom

import { render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MemoryRouter } from "react-router-dom";

import { SeoHead } from "../src/seo/SeoHead";
import { STRUCTURED_DATA_SCRIPT_ID } from "../src/seo/siteMetadata";

function renderSeoHead(entry: string) {
  return render(
    <MemoryRouter initialEntries={[entry]}>
      <SeoHead />
    </MemoryRouter>,
  );
}

function managedJsonLdScripts() {
  return document.head.querySelectorAll(`script#${STRUCTURED_DATA_SCRIPT_ID}`);
}

afterEach(() => {
  document.head.innerHTML = "";
  document.title = "";
});

describe("SeoHead", () => {
  it("reuses prerendered JSON-LD and replaces it on route changes", () => {
    document.head.innerHTML = `
      <meta name="description" content="stale" />
      <meta name="robots" content="index,follow" />
      <link rel="canonical" href="https://zoption.site" />
      <script id="${STRUCTURED_DATA_SCRIPT_ID}" type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","@id":"stale"}]}</script>
    `;

    const landing = renderSeoHead("/");
    expect(managedJsonLdScripts()).toHaveLength(1);
    expect(document.title).toBe("Zoption — Private Budget & Expense Tracker");
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://zoption.site",
    );

    landing.unmount();
    const privacy = renderSeoHead("/privacy-policy");
    expect(managedJsonLdScripts()).toHaveLength(1);
    const privacyScript = managedJsonLdScripts().item(0);
    expect(privacyScript).not.toBeNull();
    if (!privacyScript)
      throw new Error("Privacy metadata did not include managed structured data.");
    const privacySchema = JSON.parse(privacyScript.textContent ?? "{}") as {
      "@context"?: string;
      "@graph"?: Array<Record<string, unknown>>;
    };
    expect(privacySchema["@context"]).toBe("https://schema.org");
    expect(privacySchema["@graph"]).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          "@type": "WebPage",
          "@id": "https://zoption.site/privacy-policy#webpage",
          name: "Privacy Policy — Zoption",
          isPartOf: { "@id": "https://zoption.site/#website" },
        }),
      ]),
    );
    expect(document.head.querySelectorAll('meta[name="description"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('meta[name="robots"]')).toHaveLength(1);
    expect(document.head.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);

    privacy.unmount();
    renderSeoHead("/login");
    expect(managedJsonLdScripts()).toHaveLength(0);
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex,nofollow",
    );
  });

  it("keeps tracking-only URLs indexable with a clean canonical", () => {
    renderSeoHead("/privacy-policy?utm_source=newsletter&gclid=campaign");

    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "index,follow",
    );
    expect(document.head.querySelector('link[rel="canonical"]')?.getAttribute("href")).toBe(
      "https://zoption.site/privacy-policy",
    );
  });

  it("noindexes sensitive query and fragment states", () => {
    const query = renderSeoHead("/?utm_source=newsletter&code=secret");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex,nofollow",
    );

    query.unmount();
    renderSeoHead("/#error=access_denied");
    expect(document.head.querySelector('meta[name="robots"]')?.getAttribute("content")).toBe(
      "noindex,nofollow",
    );
  });
});
