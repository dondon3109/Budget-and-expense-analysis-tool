const { chromium } = require("@playwright/test");

module.exports = {
  ci: {
    collect: {
      startServerCommand: "pnpm --dir apps/api exec wrangler pages dev ../web/dist --port 8788",
      startServerReadyPattern: "Ready on",
      startServerReadyTimeout: 30_000,
      url: [
        "http://localhost:8788/",
        "http://localhost:8788/terms-of-service",
        "http://localhost:8788/privacy-policy",
        "http://localhost:8788/cookie-policy",
      ],
      numberOfRuns: 3,
      chromePath: chromium.executablePath(),
      settings: {
        preset: "desktop",
        chromeFlags: "--no-sandbox",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.9 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.1 }],
        "total-byte-weight": ["error", { maxNumericValue: 750000 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./tmp/lighthouse",
    },
  },
};
