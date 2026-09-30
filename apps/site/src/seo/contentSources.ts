/** Every guide route renders the same page component over its entry in financeGuides.ts. */
const GUIDE_PAGE_SOURCES = [
  "apps/site/src/views/guides/GuideDetailPage.tsx",
  "packages/shared/src/financeGuides.ts",
];

/** The import guides share one page component and one copy module. */
const IMPORT_GUIDE_PAGE_SOURCES = [
  "apps/site/src/views/import/ImportGuidePage.tsx",
  "apps/site/src/views/import/importGuides.ts",
];

/** Both feature explainers render the same page component over their entry in featurePages.ts. */
const FEATURE_PAGE_SOURCES = [
  "apps/site/src/views/features/FeaturePage.tsx",
  "apps/site/src/views/features/featurePages.ts",
];

/**
 * Route-to-source map for the content freshness guard
 * (apps/site/tests/content-freshness.test.ts).
 *
 * Each entry lists the repository-relative files that make up one public route
 * in SITEMAP_ENTRIES. The guard dates a source from its last commit and fails
 * when the route's declared lastModified is older, which is what keeps
 * `<lastmod>` and `WebPage.dateModified` honest.
 *
 * Add a route here in the same change that publishes it: the guard fails while
 * a route has no entry. Declared dates live in `apps/site/src/seo/siteMetadata.ts`,
 * except where a page family owns its own: guides in
 * `packages/shared/src/financeGuides.ts` (`updatedDate`) and feature
 * explainers in `apps/site/src/views/features/featurePages.ts`.
 *
 * A source shared by several routes is checked against the newest declared date
 * among them, so editing one page forces one date bump instead of a bump for
 * every page that renders the file.
 *
 * Page CSS is not listed: these dates track material content changes, so a
 * restyle does not force a date bump. Also deliberately not listed:
 * siteMetadata.ts (it holds the declared dates), the chrome every route renders
 * (PublicHeader, LegalFooter, LegalPageLayout), and androidRelease.json (its
 * releaseDate is the date /install already declares).
 */
export const CONTENT_SOURCES: Record<string, readonly string[]> = {
  "/": [
    "apps/site/src/views/LandingPage.tsx",
    "apps/site/src/components/landing/BudgetPlannerCalculator.tsx",
    "apps/site/src/components/landing/CustomerReviews.tsx",
    "apps/site/src/components/landing/FastEntrySpotlight.tsx",
    "apps/site/src/components/landing/FeatureModules.tsx",
  ],
  "/pricing": ["apps/site/src/views/pricing/PricingPage.tsx"],
  "/terms-of-service": ["apps/site/src/views/legal/TermsOfServicePage.tsx"],
  "/privacy-policy": ["apps/site/src/views/legal/PrivacyPolicyPage.tsx"],
  "/cookie-policy": ["apps/site/src/views/legal/CookiePolicyPage.tsx"],
  "/faq": ["apps/site/src/views/faq/FaqPage.tsx"],
  "/install": [
    "apps/site/src/views/InstallPage.tsx",
    "apps/site/src/components/install/DownloadPanel.tsx",
  ],
  "/changelog": [
    "apps/site/src/views/changelog/ChangelogPage.tsx",
    "packages/web-common/src/releases/currentRelease.ts",
  ],
  "/guides": [
    "apps/site/src/views/guides/GuidesIndexPage.tsx",
    "packages/shared/src/financeGuides.ts",
  ],
  "/guides/track-gcash-maya-without-bank-linking": GUIDE_PAGE_SOURCES,
  "/guides/cancel-subscriptions-auto-debits-philippines": GUIDE_PAGE_SOURCES,
  "/guides/high-yield-digital-banking-cashflow-guide": GUIDE_PAGE_SOURCES,
  "/guides/replace-excel-spreadsheets-budget-tracker": GUIDE_PAGE_SOURCES,
  "/guides/budget-monthly-salary-philippines": GUIDE_PAGE_SOURCES,
  "/guides/50-30-20-rule-pesos": GUIDE_PAGE_SOURCES,
  "/guides/budget-semi-monthly-pay-kinsenas-katapusan": GUIDE_PAGE_SOURCES,
  "/guides/emergency-fund-philippines": GUIDE_PAGE_SOURCES,
  "/guides/budget-13th-month-pay-philippines": GUIDE_PAGE_SOURCES,
  "/tutorials": ["apps/site/src/views/tutorials/TutorialsPage.tsx"],
  "/import": [
    "apps/site/src/views/import/ImportHubPage.tsx",
    "apps/site/src/views/import/importGuides.ts",
  ],
  "/import/bdo-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/import/bpi-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/import/maribank-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/import/bank-of-america-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/import/jpmorgan-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/tools/50-30-20-calculator": [
    "apps/site/src/views/tools/BudgetCalculatorPage.tsx",
    "apps/site/src/views/tools/BudgetCalculator.tsx",
    "apps/site/src/views/tools/allocateBudget.ts",
  ],
  "/features/receipt-scanning": FEATURE_PAGE_SOURCES,
  "/features/voice-expense-entry": FEATURE_PAGE_SOURCES,
};
