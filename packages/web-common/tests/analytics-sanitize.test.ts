import { describe, expect, it } from "vitest";

import { sanitizeAnalyticsProperties, sanitizeAnalyticsUrl } from "../src/analytics/sanitize";

describe("sanitizeAnalyticsUrl", () => {
  it("keeps only the origin and path of an absolute URL", () => {
    expect(
      sanitizeAnalyticsUrl("https://zoption.site/guides/budget?utm_source=x&email=a@b.c#top"),
    ).toBe("https://zoption.site/guides/budget");
  });

  it("strips the query and fragment from a bare path", () => {
    expect(sanitizeAnalyticsUrl("/auth/callback?code=secret#state")).toBe("/auth/callback");
  });
});

describe("sanitizeAnalyticsProperties", () => {
  it("reduces the URL properties posthog-js attaches and leaves the rest alone", () => {
    expect(
      sanitizeAnalyticsProperties({
        $current_url: "https://app.zoption.site/app?token=abc",
        $referrer: "https://chatgpt.com/c/123?q=budget",
        $pathname: "/update-password?code=xyz",
        plan: "pro",
      }),
    ).toEqual({
      $current_url: "https://app.zoption.site/app",
      $referrer: "https://chatgpt.com/c/123",
      $pathname: "/update-password",
      plan: "pro",
    });
  });

  it("normalizes $host to a bare lowercase host", () => {
    expect(sanitizeAnalyticsProperties({ $host: "https://Zoption.Site:8443/path" })).toEqual({
      $host: "zoption.site:8443",
    });
    expect(sanitizeAnalyticsProperties({ $host: "zoption.site" })).toEqual({
      $host: "zoption.site",
    });
  });

  it("drops a $host that is not a host at all", () => {
    expect(sanitizeAnalyticsProperties({ $host: "not a host", plan: "free" })).toEqual({
      plan: "free",
    });
  });
});
