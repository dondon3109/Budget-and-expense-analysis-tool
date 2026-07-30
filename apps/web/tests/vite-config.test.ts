import { describe, expect, it } from "vitest";

import { validateApiUrlForBuild } from "../vite.config";

const productionApiUrl = "https://api.zoption.site";
const previewApiUrl = "https://budget-expense-api-preview.dondon3109.workers.dev";

describe("Vite API URL validation", () => {
  it("allows production builds to use the committed API fallback", () => {
    expect(() =>
      validateApiUrlForBuild({
        command: "build",
        deployEnvironment: "production",
        effectiveApiUrl: productionApiUrl,
      }),
    ).not.toThrow();
  });

  it.each(["preview", "staging"] as const)(
    "requires an explicit API URL for %s builds",
    (deployEnvironment) => {
      expect(() =>
        validateApiUrlForBuild({
          command: "build",
          deployEnvironment,
          effectiveApiUrl: productionApiUrl,
        }),
      ).toThrow(`VITE_API_URL must be set explicitly for ${deployEnvironment} builds`);
    },
  );

  it.each([
    ["preview", productionApiUrl],
    ["preview", `${productionApiUrl}/`],
    ["staging", productionApiUrl],
  ] as const)("rejects the production API for %s builds", (deployEnvironment, apiUrl) => {
    expect(() =>
      validateApiUrlForBuild({
        command: "build",
        deployEnvironment,
        effectiveApiUrl: apiUrl,
        explicitApiUrl: apiUrl,
      }),
    ).toThrow(`${deployEnvironment} builds must not use the production API`);
  });

  it.each([
    ["preview", previewApiUrl],
    ["staging", "https://api-staging.example.com"],
  ] as const)(
    "accepts an explicit non-production API for %s builds",
    (deployEnvironment, apiUrl) => {
      expect(() =>
        validateApiUrlForBuild({
          command: "build",
          deployEnvironment,
          effectiveApiUrl: apiUrl,
          explicitApiUrl: apiUrl,
        }),
      ).not.toThrow();
    },
  );

  it("retains the missing API URL build failure", () => {
    expect(() =>
      validateApiUrlForBuild({
        command: "build",
        deployEnvironment: "production",
        effectiveApiUrl: " ",
      }),
    ).toThrow("VITE_API_URL is required for production builds");
  });

  it("rejects invalid non-production API URLs", () => {
    expect(() =>
      validateApiUrlForBuild({
        command: "build",
        deployEnvironment: "preview",
        effectiveApiUrl: "preview-api",
        explicitApiUrl: "preview-api",
      }),
    ).toThrow("VITE_API_URL must be a valid absolute URL for preview builds");
  });
});
