const { chromium } = require("@playwright/test");

module.exports = {
  ci: {
    collect: {
      // The public site is what search engines and new visitors load; the app is noindex.
      startServerCommand:
        "pnpm --dir apps/api exec wrangler pages dev ../site/dist --port 8788 --compatibility-date=2026-08-18",
      startServerReadyPattern: "Ready on",
      startServerReadyTimeout: 30_000,
      url: [
        "http://localhost:8788/",
        "http://localhost:8788/terms-of-service",
        "http://localhost:8788/privacy-policy",
        "http://localhost:8788/cookie-policy",
        "http://localhost:8788/install",
        "http://localhost:8788/guides/50-30-20-rule-pesos",
        "http://localhost:8788/tools/50-30-20-calculator",
      ],
      numberOfRuns: 3,
      chromePath: chromium.executablePath(),
      settings: {
        preset: "desktop",
        chromeFlags: "--no-sandbox --disable-dev-shm-usage --disable-gpu",
        onlyCategories: ["performance", "accessibility", "best-practices", "seo"],
      },
    },
    assert: {
      assertions: {
        "categories:performance": ["error", { minScore: 0.85 }],
        "categories:accessibility": ["error", { minScore: 0.9 }],
        "categories:best-practices": ["error", { minScore: 0.9 }],
        "categories:seo": ["error", { minScore: 0.9 }],
        "largest-contentful-paint": ["error", { maxNumericValue: 2500 }],
        "cumulative-layout-shift": ["error", { maxNumericValue: 0.15 }],
        "total-byte-weight": ["error", { maxNumericValue: 750000 }],
      },
    },
    upload: {
      target: "filesystem",
      outputDir: "./tmp/lighthouse",
    },
  },
};
