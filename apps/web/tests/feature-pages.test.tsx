// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";

import { cleanup, render, screen } from "@testing-library/react";
import { getFinanceGuideBySlug } from "@zoption/shared";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";

import { CookieConsentProvider } from "../src/consent/CookieConsentProvider";
import { FeaturePage } from "../src/pages/features/FeaturePage";
import {
  FEATURE_PAGES,
  FEATURE_PAGES_LAST_MODIFIED,
  FEATURE_PAGES_LAST_UPDATED,
  findFeaturePage,
} from "../src/pages/features/featurePages";
import { PUBLIC_ROUTE_METADATA, PUBLIC_ROUTE_PATHS } from "../src/seo/siteMetadata";
import { ThemeProvider } from "../src/theme/ThemeProvider";

function renderFeaturePage(path: string) {
  return render(
    <ThemeProvider>
      <CookieConsentProvider>
        <MemoryRouter initialEntries={[path]}>
          <FeaturePage path={path as (typeof FEATURE_PAGES)[number]["path"]} />
        </MemoryRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

afterEach(cleanup);

describe("feature explainer pages", () => {
  it("renders every registered page with its heading, summary, and sections", () => {
    for (const page of FEATURE_PAGES) {
      renderFeaturePage(page.path);

      expect(screen.getByRole("heading", { level: 1, name: page.heading })).toBeInTheDocument();
      expect(screen.getByText(page.summary)).toBeInTheDocument();

      for (const section of page.sections) {
        expect(screen.getByRole("heading", { level: 2, name: section.title })).toBeInTheDocument();
        expect(screen.getByText(section.body)).toBeInTheDocument();
      }

      cleanup();
    }
  });

  it("keeps every page registered in the public route manifest", () => {
    const manifestFeaturePaths = PUBLIC_ROUTE_PATHS.filter((path) => path.startsWith("/features/"));

    expect(manifestFeaturePaths).toEqual(FEATURE_PAGES.map((page) => page.path));

    for (const page of FEATURE_PAGES) {
      expect(PUBLIC_ROUTE_METADATA[page.path]?.canonical).toBe(`https://zoption.site${page.path}`);
      expect(PUBLIC_ROUTE_METADATA[page.path]?.robots).toBe("index,follow");
    }
  });

  it("keeps the displayed date in step with the ISO date the sitemap publishes", () => {
    const longForm = new Intl.DateTimeFormat("en-US", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(new Date(`${FEATURE_PAGES_LAST_MODIFIED}T00:00:00Z`));

    expect(FEATURE_PAGES_LAST_UPDATED).toBe(longForm);
  });

  it("links each page to its related guide and its sibling explainer", () => {
    for (const page of FEATURE_PAGES) {
      renderFeaturePage(page.path);

      const guide = getFinanceGuideBySlug(page.relatedGuideSlug);
      expect(guide).not.toBeNull();
      expect(screen.getByRole("link", { name: `Read guide: ${guide?.title}` })).toHaveAttribute(
        "href",
        `/guides/${guide?.slug}`,
      );

      const sibling = findFeaturePage(page.relatedFeaturePath);
      expect(sibling).toBeDefined();
      expect(screen.getByRole("link", { name: `Read: ${sibling?.heading}` })).toHaveAttribute(
        "href",
        sibling?.path,
      );

      cleanup();
    }
  });

  it("avoids claims the web app cannot keep", () => {
    const copy = JSON.stringify(FEATURE_PAGES);

    for (const banned of ["PDF", "iOS", "App Store", "Play Store", "aggregateRating"]) {
      expect(copy).not.toContain(banned);
    }
  });
});
