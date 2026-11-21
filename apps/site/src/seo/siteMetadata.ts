import {
  FEATURE_PAGES,
  FEATURE_PAGES_LAST_MODIFIED,
  findFeaturePage,
  type FeaturePagePath,
} from "../views/features/featurePages";
import { findImportGuide } from "../views/import/importGuides";
import { FINANCE_GUIDES, type FinanceGuide } from "@zoption/shared";

export const SITE_ORIGIN = "https://zoption.site";
export const SITE_NAME = "Zoption";
export const SOCIAL_IMAGE_PATH = "/og/zoption-social.png";
export const SOCIAL_IMAGE_URL = `${SITE_ORIGIN}${SOCIAL_IMAGE_PATH}`;
export const STRUCTURED_DATA_SCRIPT_ID = "zoption-structured-data";

declare const __SEARCH_INDEXING_ENABLED__: boolean;

const searchIndexingEnabled =
  typeof __SEARCH_INDEXING_ENABLED__ === "undefined" || __SEARCH_INDEXING_ENABLED__;

export type GuideRoutePath = `/guides/${string}`;

export type PublicRoutePath =
  | "/"
  | "/pricing"
  | "/terms-of-service"
  | "/privacy-policy"
  | "/cookie-policy"
  | "/delete-account"
  | "/faq"
  | "/install"
  | "/changelog"
  | "/guides"
  | GuideRoutePath
  | "/tutorials"
  | "/import"
  | "/import/bdo-statement"
  | "/import/bpi-statement"
  | "/import/maribank-statement"
  | "/import/bank-of-america-statement"
  | "/import/jpmorgan-statement"
  | "/tools/50-30-20-calculator"
  | "/tools/subscription-cost-calculator"
  | FeaturePagePath;

export const PUBLIC_ROUTE_PATHS: PublicRoutePath[] = [
  "/",
  "/pricing",
  "/terms-of-service",
  "/privacy-policy",
  "/cookie-policy",
  "/delete-account",
  "/faq",
  "/install",
  "/changelog",
  "/guides",
  ...FINANCE_GUIDES.map((guide) => `/guides/${guide.slug}` as const),
  "/tutorials",
  "/import",
  "/import/bdo-statement",
  "/import/bpi-statement",
  "/import/maribank-statement",
  "/import/bank-of-america-statement",
  "/import/jpmorgan-statement",
  "/tools/50-30-20-calculator",
  "/tools/subscription-cost-calculator",
  ...FEATURE_PAGES.map((page) => page.path),
];

type StructuredDataNode = Record<string, unknown>;

export interface StructuredDataGraph {
  "@context": "https://schema.org";
  "@graph": StructuredDataNode[];
}

export interface SeoMetadata {
  title: string;
  description: string;
  canonical: string;
  robots: "index,follow" | "noindex,nofollow";
  structuredData?: StructuredDataGraph;
}

interface SitemapFields {
  lastModified: string;
  changeFrequency: "weekly" | "monthly" | "yearly";
  priority: number;
}

export interface PublicRouteMetadata extends SeoMetadata {
  sitemap: SitemapFields;
}

export interface SitemapEntry extends SitemapFields {
  path: PublicRoutePath;
}

const WEBSITE_ID = `${SITE_ORIGIN}/#website`;
const WEB_APPLICATION_ID = `${SITE_ORIGIN}/#webapplication`;
const WEBSITE_DESCRIPTION =
  "Zoption is a private budget and expense tracker with English and Tagalog voice entry, receipt scanning, PDF/CSV/Excel bank imports, bill tracking, and 47-currency support without bank logins.";

function websiteNode(): StructuredDataNode {
  return {
    "@type": "WebSite",
    "@id": WEBSITE_ID,
    name: SITE_NAME,
    url: SITE_ORIGIN,
    description: WEBSITE_DESCRIPTION,
    inLanguage: "en",
  };
}

function structuredDataGraph(...nodes: StructuredDataNode[]): StructuredDataGraph {
  return { "@context": "https://schema.org", "@graph": nodes };
}

function homepageStructuredData(): StructuredDataGraph {
  const application = {
    "@type": "WebApplication",
    "@id": WEB_APPLICATION_ID,
    name: SITE_NAME,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: SITE_ORIGIN,
    description:
      "A private budget and expense tracker with a Free plan, voice entry, receipt scanning, and PDF/CSV/Excel bank statement imports without connecting to your bank.",
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    featureList: [
      "Log expenses by voice in English or Tagalog, paste bank and e-wallet SMS alerts, or scan receipts without storing the image.",
      "Import PDF, CSV, XLS, and XLSX bank statements with column mapping, row-by-row preview, and duplicate checks without bank logins.",
      "Track category budgets, recurring bills on a monthly calendar, savings interest, and accounts across 47 currencies in whole centavos.",
      "Use a consent-gated AI assistant grounded in your ledger, starting on a Free plan (500 monthly AI actions) with a 7-day Pro trial.",
    ],
  };
  return structuredDataGraph(websiteNode(), application);
}

type FaqItem = {
  question: string;
  answer: string;
};

const FAQ_ITEMS: FaqItem[] = [
  {
    question: "What is Zoption?",
    answer:
      "Zoption is a private budget and expense tracker for web and Android (coming to Google Play). It tracks spending, category budgets, recurring bills, savings interest, and family workspaces across 47 currencies without ever asking for your bank password.",
  },
  {
    question: "Can I use Zoption for free?",
    answer:
      "Yes. The Free plan is ₱0 forever with unlimited manual entries, 500 shared AI actions per month, 1 committed bank statement import per month, and unlimited custom accounts. Every new account also gets a 7-day Zoption Pro trial with no credit card required.",
  },
  {
    question: "Do I need financial expertise to use Zoption?",
    answer:
      "No. Setup adapts to how often you get paid and which spending categories you want to watch, and every total and budget bar is shown in plain language.",
  },
  {
    question: "Is there an Android app, and does Zoption work offline?",
    answer:
      "The native Zoption Android app is in testing on Google Play. It stores an encrypted copy of your workspace on the device so you can log transactions, budgets, and goals offline and sync when you reconnect. Until the Play listing opens, you can use the same account on the web app at app.zoption.site.",
  },
  {
    question: "Does Zoption connect to my bank?",
    answer:
      "No. Zoption does not connect to banks or ask for banking credentials. You add entries by voice, receipt photo, bank or e-wallet SMS paste, manual entry, or downloaded PDF, CSV, and Excel statements, and you review every row before saving.",
  },
  {
    question: "What file formats can I import?",
    answer:
      "PDF bank statements, Excel workbooks (.xlsx and .xls), and CSV files. Zoption includes built-in column presets for BDO, BPI, MariBank, Bank of America, and JPMorgan Chase, plus a generic preset for any other bank or e-wallet export. You pick a sheet if needed, preview every row, and catch duplicates before saving.",
  },
  {
    question: "How does voice expense entry work?",
    answer:
      "Tap the microphone on web or Android and speak naturally in English or Tagalog. Zoption transcribes your sentence and fills an editable draft with the amount, merchant, date, and category so you can check and save it with one tap.",
  },
  {
    question: "How does receipt photo scanning work?",
    answer:
      "Photograph a paper receipt or upload an e-receipt screenshot. Zoption extracts the store name, date, subtotal, tax, total, and line items into an editable draft and checks for duplicates. Receipt scanning asks for separate consent, and the image is never stored.",
  },
  {
    question: "What currencies does Zoption support?",
    answer:
      "Zoption supports 47 common currencies, including PHP, USD, EUR, GBP, JPY, AUD, CAD, SGD, AED, SAR, and INR. Each account keeps its own currency without altering stored amounts, while cash flow charts convert other currencies into your workspace currency using daily exchange rates.",
  },
  {
    question: "How are money amounts stored?",
    answer:
      "Amounts are stored as exact integer minor units (centavos) rather than floating-point decimals, so totals and budgets match your bank and receipt figures without rounding drift.",
  },
  {
    question: "How do transfers between accounts work?",
    answer:
      "Record a transfer between any of your accounts across 47 supported currencies, include any transfer fee, and see the exact amount that arrives before adding it to your ledger.",
  },
  {
    question: "Can I track monthly bills and subscriptions?",
    answer:
      "Yes. Log recurring bills such as electricity, water, internet, rent, or streaming subscriptions to track payment schedules and cash-flow impact on an interactive monthly bill calendar. On Zoption Pro and Family Pro, you can also log each time you use a service to see cost per use and flag subscriptions unused for 30 days.",
  },
  {
    question: "How does automatic savings interest work?",
    answer:
      "Automatic savings interest is included on Zoption Budget, Zoption Pro, and Family plans. Set the annual interest rate and pay day on any savings account, and Zoption accrues interest daily, monthly, or yearly and adds the earned amount to your balance automatically.",
  },
  {
    question: "How does the AI Financial Assistant work, and what does it read?",
    answer:
      "The assistant is optional and uses a separate, versioned consent flow. It reads only the ledger records relevant to your question, calculates totals mathematically from your real entries, and can draft transactions or propose edits to bills, goals, debts, accounts, categories, budgets, or existing transactions. Nothing is applied until you tap Save or Confirm.",
  },
  {
    question: "Is my workspace private?",
    answer:
      "Your workspace starts empty, is isolated to your account, and contains only the records you choose to add. Zoption shows no ads and never sells spending data. See the Privacy Policy for full handling details.",
  },
  {
    question: "How can I export or delete my data?",
    answer:
      "Filtered CSV transaction export is included on Zoption Budget, Zoption Pro, and during your 7-day Pro trial. You can delete your account and associated data at any time from Account Settings in the web or Android app, or follow the steps on /delete-account. Active paid subscriptions must be canceled first.",
  },
  {
    question: "Can I budget with my family or partner?",
    answer:
      "Yes. Family Budget (₱499/month or ₱4,990/year) and Family Pro (₱799/month or ₱7,990/year) cover one shared family space for up to 6 people, with shared budgets, remittances, receipts, and comments, while giving every member their own Budget or Pro personal workspace. You can also share read-only budget envelope or balance links from your workspace.",
  },
  {
    question: "How does Zoption billing work?",
    answer:
      "Personal plans are Free (₱0), Zoption Budget (₱149/month or ₱1,490/year), and Zoption Pro (₱249/month or ₱2,490/year). Family plans for up to 6 people are Family Budget (₱499/month or ₱4,990/year) and Family Pro (₱799/month or ₱7,990/year). Annual plans include 2 months free. Web checkout is processed in Philippine pesos through PayPal or Dodo Payments, and you can upgrade, downgrade, or cancel renewal anytime in Plan and billing.",
  },
  {
    question: "How do I add Zoption as a Preferred Source in Google Search and AI results?",
    answer:
      "You can set Zoption as your preferred source by visiting Google's preferences at https://www.google.com/preferences/source?q=zoption.site. When chosen, Google highlights Zoption content with a 'Preferred' trust badge and prioritizes verified budgeting guides and release updates in your Google Search, AI Overviews, and Top Stories.",
  },
];

export const FAQ_ITEMS_PUBLIC: readonly FaqItem[] = FAQ_ITEMS;

function faqStructuredData(): StructuredDataGraph {
  return structuredDataGraph(
    websiteNode(),
    {
      "@type": "WebPage",
      "@id": `${SITE_ORIGIN}/faq#webpage`,
      name: "FAQ — Zoption",
      description:
        "Plain-language answers on voice entry, receipt scanning, PDF/CSV/Excel bank imports, 47 currencies, bills, family plans, the AI assistant, privacy, and billing.",
      url: `${SITE_ORIGIN}/faq`,
      inLanguage: "en",
      dateModified: FAQ_LAST_MODIFIED,
      isPartOf: { "@id": WEBSITE_ID },
    },
    {
      "@type": "FAQPage",
      "@id": `${SITE_ORIGIN}/#faq`,
      mainEntity: FAQ_ITEMS.map((item) => ({
        "@type": "Question",
        name: item.question,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.answer,
        },
      })),
    },
  );
}

function contentPageStructuredData(
  name: string,
  description: string,
  url: string,
  dateModified: string,
): StructuredDataGraph {
  return structuredDataGraph(websiteNode(), {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    name,
    description,
    url,
    dateModified,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
  });
}

function installPageStructuredData(): StructuredDataGraph {
  const url = `${SITE_ORIGIN}/install`;
  const applicationId = `${url}#android-application`;
  return structuredDataGraph(
    websiteNode(),
    {
      "@type": "WebPage",
      "@id": `${url}#webpage`,
      name: "Zoption for Android",
      description: "The Zoption Android app is coming to Google Play.",
      url,
      dateModified: INSTALL_LAST_MODIFIED,
      inLanguage: "en",
      isPartOf: { "@id": WEBSITE_ID },
      mainEntity: { "@id": applicationId },
    },
    {
      "@type": "SoftwareApplication",
      "@id": applicationId,
      name: "Zoption for Android",
      applicationCategory: "FinanceApplication",
      operatingSystem: "Android",
      description:
        "The native Zoption Android app with offline-first budgeting and camera receipt scanning, for the private Zoption workspace.",
      url,
    },
  );
}

// Each date is the day that page's content last materially changed. They feed both
// <lastmod> and WebPage dateModified, so a stale value misrepresents freshness to
// crawlers. Update the constant whenever the corresponding page copy changes, and
// keep it in sync with sitemap.lastModified — seo-metadata.test.ts enforces both.
const LANDING_LAST_MODIFIED = "2026-11-21";
const PRICING_LAST_MODIFIED = "2026-11-21";
const GUIDES_LAST_MODIFIED = "2026-11-21";

function guidesIndexPageStructuredData(): StructuredDataGraph {
  const url = `${SITE_ORIGIN}/guides`;
  return structuredDataGraph(websiteNode(), {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    name: "Personal Finance & Budgeting Guides — Zoption",
    description:
      "Practical guides and tutorials on privacy-first expense tracking, e-wallet budgeting, subscription management, and digital banking in the Philippines.",
    url,
    dateModified: GUIDES_LAST_MODIFIED,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
  });
}

function guidePageStructuredData(guide: FinanceGuide): StructuredDataGraph {
  const url = `${SITE_ORIGIN}/guides/${guide.slug}`;
  return structuredDataGraph(websiteNode(), {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    name: `${guide.seoTitle} — Zoption`,
    description: guide.description,
    url,
    datePublished: guide.publishedDate,
    dateModified: guide.updatedDate,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
  });
}
const FAQ_LAST_MODIFIED = "2026-11-21";
const CHANGELOG_LAST_MODIFIED = "2026-11-21";
const TERMS_LAST_MODIFIED = "2026-10-19";
const PRIVACY_LAST_MODIFIED = "2026-10-19";
const COOKIE_POLICY_LAST_MODIFIED = "2026-10-22";
const DELETE_ACCOUNT_LAST_MODIFIED = "2026-11-20";
const IMPORT_LAST_MODIFIED = "2026-11-21";
const TOOLS_LAST_MODIFIED = "2026-11-21";
const SUBSCRIPTION_TOOL_LAST_MODIFIED = "2026-11-21";
const INSTALL_LAST_MODIFIED = "2026-11-21";
const TUTORIALS_LAST_MODIFIED = "2026-11-21";

function pricingPageStructuredData(): StructuredDataGraph {
  const url = `${SITE_ORIGIN}/pricing`;
  return structuredDataGraph(websiteNode(), {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    name: "Pricing & Plans — Zoption",
    description:
      "Explore Zoption Free, Budget, Pro, and family plans. Track personal finances with zero bank credentials, speech-to-transaction logging, receipt scanning, and bank statement imports.",
    url,
    dateModified: PRICING_LAST_MODIFIED,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
  });
}

function changelogPageStructuredData(): StructuredDataGraph {
  const url = `${SITE_ORIGIN}/changelog`;
  return structuredDataGraph(websiteNode(), {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    name: "Changelog & Product Updates — Zoption",
    description:
      "A complete record of new features, enhancements, and improvements across the Zoption web workspace and Android apps.",
    url,
    dateModified: CHANGELOG_LAST_MODIFIED,
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
  });
}

/**
 * Guides are keyed by their own path so a route can only be published when a
 * guide exists for it. Titles and descriptions come from the guide rather than
 * being restated here, which keeps the page and its metadata from drifting.
 */
function importGuideMetadata(path: string): PublicRouteMetadata {
  const guide = findImportGuide(path);
  if (!guide) throw new Error(`No import guide registered for ${path}`);

  const url = `${SITE_ORIGIN}${path}`;
  return {
    title: guide.title,
    description: guide.description,
    canonical: url,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      guide.heading,
      guide.description,
      url,
      IMPORT_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: IMPORT_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  };
}

function importHubMetadata(): PublicRouteMetadata {
  const url = `${SITE_ORIGIN}/import`;
  return {
    title: "Import Bank Statements — CSV, Excel & PDF | Zoption",
    description:
      "Import CSV, Excel, or PDF bank statements from BDO, BPI, MariBank, Bank of America, and Chase into a private peso budget tracker. No bank connection required.",
    canonical: url,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      "Import bank statements into Zoption",
      "Bring CSV, Excel, or PDF transaction history from your bank into a private peso budget tracker, reviewed row by row with no bank connection.",
      url,
      IMPORT_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: IMPORT_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  };
}

/**
 * Feature explainers are keyed by their own path, and their titles, descriptions, and
 * dates come from the page data rather than being restated here, so the page and its
 * metadata cannot drift apart.
 */
function featurePageMetadata(path: FeaturePagePath): PublicRouteMetadata {
  const page = findFeaturePage(path);
  if (!page) throw new Error(`No feature page registered for ${path}`);

  const url = `${SITE_ORIGIN}${path}`;
  return {
    title: page.title,
    description: page.description,
    canonical: url,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      page.heading,
      page.description,
      url,
      FEATURE_PAGES_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: FEATURE_PAGES_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  };
}

function subscriptionCalculatorMetadata(): PublicRouteMetadata {
  const url = `${SITE_ORIGIN}/tools/subscription-cost-calculator`;
  return {
    title: "Subscription Cost Calculator for Philippine Pesos | Zoption",
    description:
      "Add up your streaming, app, gym, and auto-debit subscriptions in pesos and see the monthly and yearly total, exact to the centavo. No sign-up, nothing leaves your browser.",
    canonical: url,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      "Subscription Cost Calculator for Philippine Pesos",
      "Add up streaming, app, gym, and auto-debit subscriptions in Philippine pesos and see what they cost per month and per year.",
      url,
      SUBSCRIPTION_TOOL_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: SUBSCRIPTION_TOOL_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  };
}

function budgetCalculatorMetadata(): PublicRouteMetadata {
  const url = `${SITE_ORIGIN}/tools/50-30-20-calculator`;
  return {
    title: "50/30/20 Budget Calculator for Philippine Pesos | Zoption",
    description:
      "Split your monthly Philippine peso take-home pay into needs, wants, and savings with exact centavo accuracy. Adjustable percentages, worked examples, and no sign-up.",
    canonical: url,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      "50/30/20 Budget Calculator for Philippine Pesos",
      "Split your monthly Philippine peso take-home pay into needs, wants, and savings with exact centavo accuracy. Adjustable percentages and worked examples for common Filipino salaries.",
      url,
      TOOLS_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: TOOLS_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  };
}

export const PUBLIC_ROUTE_METADATA: Record<PublicRoutePath, PublicRouteMetadata> = {
  "/": {
    title: "Zoption — Private Budgeting App with Voice & Receipt Scanning",
    description:
      "Free private budgeting app and expense tracker. Log spending by English or Tagalog voice, scan receipts, import bank statements, and track bills with no bank login.",
    canonical: SITE_ORIGIN,
    robots: "index,follow",
    structuredData: homepageStructuredData(),
    sitemap: {
      lastModified: LANDING_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 1,
    },
  },
  "/pricing": {
    title: "Pricing & Plans — Zoption",
    description:
      "Start free with 500 monthly AI actions and a 7-day Pro trial, or pick Budget (₱149/mo), Pro (₱249/mo), or Family plans up to 6 people. No bank login required.",
    canonical: `${SITE_ORIGIN}/pricing`,
    robots: "index,follow",
    structuredData: pricingPageStructuredData(),
    sitemap: {
      lastModified: PRICING_LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.9,
    },
  },
  "/terms-of-service": {
    title: "Terms of Service — Zoption",
    description:
      "Read the terms that govern Zoption's Free and paid plans, accounts, budgeting features, transaction imports, exports, subscriptions, and the optional AI assistant.",
    canonical: `${SITE_ORIGIN}/terms-of-service`,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      "Terms of Service — Zoption",
      "The terms that govern Zoption's Free and paid plans, accounts, budgeting features, transaction imports, exports, subscriptions, and the optional AI assistant.",
      `${SITE_ORIGIN}/terms-of-service`,
      TERMS_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: TERMS_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  },
  "/privacy-policy": {
    title: "Privacy Policy — Zoption",
    description:
      "Learn how Zoption handles account, profile, financial workspace, plan, billing, imported transaction, assistant, consent, and operational information.",
    canonical: `${SITE_ORIGIN}/privacy-policy`,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      "Privacy Policy — Zoption",
      "How Zoption handles account, profile, financial workspace, plan, billing, imported transaction, assistant, consent, and operational information.",
      `${SITE_ORIGIN}/privacy-policy`,
      PRIVACY_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: PRIVACY_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  },
  "/cookie-policy": {
    title: "Cookie Policy — Zoption",
    description:
      "Learn about the browser storage Zoption uses and how PostHog measures cookieless pageviews and account-linked app usage without cookies or financial detail.",
    canonical: `${SITE_ORIGIN}/cookie-policy`,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      "Cookie Policy — Zoption",
      "The browser storage Zoption uses and how PostHog measures cookieless pageviews and account-linked app usage without cookies or financial detail.",
      `${SITE_ORIGIN}/cookie-policy`,
      COOKIE_POLICY_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: COOKIE_POLICY_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  },
  "/delete-account": {
    title: "Delete your account — Zoption",
    description:
      "How to delete your Zoption account and its data from the Android app, the web app, or by email, and what is removed or kept.",
    canonical: `${SITE_ORIGIN}/delete-account`,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      "Delete your account — Zoption",
      "How to delete your Zoption account and its data, and what is removed or kept.",
      `${SITE_ORIGIN}/delete-account`,
      DELETE_ACCOUNT_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: DELETE_ACCOUNT_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.3,
    },
  },
  "/faq": {
    title: "FAQ — Zoption",
    description:
      "Plain-language answers on voice entry, receipt scanning, PDF/CSV/Excel bank imports, 47 currencies, bills, family plans, the AI assistant, privacy, and billing.",
    canonical: `${SITE_ORIGIN}/faq`,
    robots: "index,follow",
    structuredData: faqStructuredData(),
    sitemap: {
      lastModified: FAQ_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  },
  "/install": {
    title: "Zoption for Android — Coming to Google Play",
    description:
      "The native Zoption Android app is in testing on Google Play with encrypted offline-first entry, voice logging, and receipt scanning. Use the same account on the web today.",
    canonical: `${SITE_ORIGIN}/install`,
    robots: "index,follow",
    structuredData: installPageStructuredData(),
    sitemap: {
      lastModified: INSTALL_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  },
  "/changelog": {
    title: "Changelog & Release Notes — Zoption",
    description:
      "See what's new in Zoption: a bill calendar for recurring bills, voice expense entry, receipt scanning, transaction deduplication, Android app updates, and private budgeting tools.",
    canonical: `${SITE_ORIGIN}/changelog`,
    robots: "index,follow",
    structuredData: changelogPageStructuredData(),
    sitemap: {
      lastModified: CHANGELOG_LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  },
  "/guides": {
    title: "Personal Finance & Budgeting Guides — Zoption",
    description:
      "Practical guides and tutorials on privacy-first expense tracking, e-wallet budgeting, subscription management, and digital banking in the Philippines.",
    canonical: `${SITE_ORIGIN}/guides`,
    robots: "index,follow",
    structuredData: guidesIndexPageStructuredData(),
    sitemap: {
      lastModified: GUIDES_LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  },
  ...Object.fromEntries(
    FINANCE_GUIDES.map((guide) => [
      `/guides/${guide.slug}`,
      {
        title: `${guide.seoTitle} — Zoption`,
        description: guide.description,
        canonical: `${SITE_ORIGIN}/guides/${guide.slug}`,
        robots: "index,follow",
        structuredData: guidePageStructuredData(guide),
        sitemap: {
          lastModified: guide.updatedDate,
          changeFrequency: "monthly",
          priority: 0.7,
        },
      } satisfies PublicRouteMetadata,
    ]),
  ),
  "/import": importHubMetadata(),
  "/import/bdo-statement": importGuideMetadata("/import/bdo-statement"),
  "/import/bpi-statement": importGuideMetadata("/import/bpi-statement"),
  "/import/maribank-statement": importGuideMetadata("/import/maribank-statement"),
  "/import/bank-of-america-statement": importGuideMetadata("/import/bank-of-america-statement"),
  "/import/jpmorgan-statement": importGuideMetadata("/import/jpmorgan-statement"),
  "/tools/50-30-20-calculator": budgetCalculatorMetadata(),
  "/tools/subscription-cost-calculator": subscriptionCalculatorMetadata(),
  "/features/receipt-scanning": featurePageMetadata("/features/receipt-scanning"),
  "/features/voice-expense-entry": featurePageMetadata("/features/voice-expense-entry"),
  "/tutorials": {
    title: "User Guides & Step-by-Step Tutorials — Zoption",
    description:
      "Step-by-step guides on how to adjust account balances, use envelope budgeting, scan receipts, import bank CSV statements, and track bills in Zoption.",
    canonical: `${SITE_ORIGIN}/tutorials`,
    robots: "index,follow",
    structuredData: contentPageStructuredData(
      "User Guides & Step-by-Step Tutorials — Zoption",
      "Step-by-step guides on how to adjust account balances, use envelope budgeting, scan receipts, import bank CSV statements, and track bills in Zoption.",
      `${SITE_ORIGIN}/tutorials`,
      TUTORIALS_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: TUTORIALS_LAST_MODIFIED,
      changeFrequency: "weekly",
      priority: 0.8,
    },
  },
} satisfies Record<PublicRoutePath, PublicRouteMetadata>;

export const SITEMAP_ENTRIES: SitemapEntry[] = PUBLIC_ROUTE_PATHS.map((path) => {
  const metadata = PUBLIC_ROUTE_METADATA[path];
  if (!metadata) {
    throw new Error(`Missing metadata for public route: ${path}`);
  }
  const { sitemap } = metadata;
  return { path, ...sitemap };
});

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "").replace(/\.html$/, "") || "/";
}

/** The metadata a route renders with; preview and staging builds are never indexable. */
export function getPublicRouteMetadata(pathname: string): SeoMetadata | undefined {
  const metadata = PUBLIC_ROUTE_METADATA[normalizePathname(pathname) as PublicRoutePath];
  if (!metadata) return undefined;
  if (searchIndexingEnabled) return metadata;
  return { ...metadata, robots: "noindex,nofollow" };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
