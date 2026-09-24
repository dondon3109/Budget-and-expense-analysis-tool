/** Every guide route renders the same page component over its entry in financeGuides.ts. */
const GUIDE_PAGE_SOURCES = [
  "apps/web/src/pages/guides/GuideDetailPage.tsx",
  "packages/shared/src/financeGuides.ts",
];

/** The import guides share one page component and one copy module. */
const IMPORT_GUIDE_PAGE_SOURCES = [
  "apps/web/src/pages/import/ImportGuidePage.tsx",
  "apps/web/src/pages/import/importGuides.ts",
];

/** Both feature explainers render the same page component over their entry in featurePages.ts. */
const FEATURE_PAGE_SOURCES = [
  "apps/web/src/pages/features/FeaturePage.tsx",
  "apps/web/src/pages/features/featurePages.ts",
];

/**
 * Route-to-source map for the content freshness guard
 * (apps/web/tests/content-freshness.test.ts).
 *
 * Each entry lists the repository-relative files that make up one public route
 * in SITEMAP_ENTRIES. The guard dates a source from its last commit and fails
 * when the route's declared lastModified is older, which is what keeps
 * `<lastmod>` and `WebPage.dateModified` honest.
 *
 * Add a route here in the same change that publishes it: the guard fails while
 * a route has no entry. Declared dates live in `apps/web/src/seo/siteMetadata.ts`,
 * except where a page family owns its own: guides in
 * `packages/shared/src/financeGuides.ts` (`updatedDate`) and feature
 * explainers in `apps/web/src/pages/features/featurePages.ts`.
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
    "apps/web/src/pages/LandingPage.tsx",
    "apps/web/src/components/landing/BudgetPlannerCalculator.tsx",
    "apps/web/src/components/landing/CustomerReviews.tsx",
    "apps/web/src/components/landing/FastEntrySpotlight.tsx",
    "apps/web/src/components/landing/FeatureModules.tsx",
  ],
  "/pricing": ["apps/web/src/pages/pricing/PricingPage.tsx"],
  "/terms-of-service": ["apps/web/src/pages/legal/TermsOfServicePage.tsx"],
  "/privacy-policy": ["apps/web/src/pages/legal/PrivacyPolicyPage.tsx"],
  "/cookie-policy": ["apps/web/src/pages/legal/CookiePolicyPage.tsx"],
  "/faq": ["apps/web/src/pages/faq/FaqPage.tsx"],
  "/install": ["apps/web/src/pages/InstallPage.tsx"],
  "/changelog": [
    "apps/web/src/pages/changelog/ChangelogPage.tsx",
    "apps/web/src/releases/currentRelease.ts",
  ],
  "/guides": [
    "apps/web/src/pages/guides/GuidesIndexPage.tsx",
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
  "/tutorials": ["apps/web/src/pages/tutorials/TutorialsPage.tsx"],
  "/import": [
    "apps/web/src/pages/import/ImportHubPage.tsx",
    "apps/web/src/pages/import/importGuides.ts",
  ],
  "/import/bdo-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/import/bpi-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/import/maribank-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/import/bank-of-america-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/import/jpmorgan-statement": IMPORT_GUIDE_PAGE_SOURCES,
  "/tools/50-30-20-calculator": [
    "apps/web/src/pages/tools/BudgetCalculatorPage.tsx",
    "apps/web/src/pages/tools/allocateBudget.ts",
  ],
  "/features/receipt-scanning": FEATURE_PAGE_SOURCES,
  "/features/voice-expense-entry": FEATURE_PAGE_SOURCES,
};
