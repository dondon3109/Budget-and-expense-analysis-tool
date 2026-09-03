import { ANDROID_RELEASE } from "../releases/androidRelease";
import { FINANCE_GUIDES, getFinanceGuideBySlug, type FinanceGuide } from "@zoption/shared";

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
  | "/faq"
  | "/install"
  | "/changelog"
  | "/guides"
  | GuideRoutePath;

export const PUBLIC_ROUTE_PATHS: PublicRoutePath[] = [
  "/",
  "/pricing",
  "/terms-of-service",
  "/privacy-policy",
  "/cookie-policy",
  "/faq",
  "/install",
  "/changelog",
  "/guides",
  ...FINANCE_GUIDES.map((guide) => `/guides/${guide.slug}` as const),
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
  "A private budget and expense tracker with a Free plan for reviewing imported transactions, budgets, and monthly cash flow.";

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
      "A private budget and expense tracker with a Free plan for reviewing imported transactions, budgets, and monthly cash flow without a direct bank connection.",
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    featureList: [
      "Start with a Free plan and upgrade only for higher limits and Pro features.",
      "Map columns, catch errors, and prevent duplicate entries.",
      "See totals, trends, categories, and budget progress together.",
      "Start from a clean workspace and add only the records you choose.",
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
    question: "Can I use Zoption for free?",
    answer:
      "Yes. Create an account and use Zoption's Free plan without paying. It includes core tracking features with plan limits; upgrade to Pro only if you want higher limits and additional features.",
  },
  {
    question: "Does Zoption connect to my bank?",
    answer:
      "No. Zoption does not connect to banks or ask for banking credentials. You import a CSV, Excel, or bank export file — or add rows yourself — and review every entry before anything is saved.",
  },
  {
    question: "What file formats can I import?",
    answer:
      "CSV, XLSX, and XLS. Pick a workbook, choose a worksheet, and see it visualized after you review each row.",
  },
  {
    question: "Is my workspace private?",
    answer:
      "Your workspace starts empty and contains only the records you choose to add. For details on how account, financial, and imported-transaction information is handled, see the Privacy Policy.",
  },
  {
    question: "How are money amounts stored?",
    answer:
      "Amounts are represented safely in integer centavos and totaled in plain language, so the calculations stay transparent and easy to follow.",
  },
  {
    question: "Do I need financial expertise to use Zoption?",
    answer:
      "No. Zoption keeps the language jargon-free and every calculation transparent, so you can track expenses and set budgets without a finance background.",
  },
  {
    question: "How does the AI Financial Assistant work, and what does it read?",
    answer:
      "The assistant is optional and requires separate, versioned consent. It answers questions about your workspace and reads only what you ask about, never edits a number, and explains the reasoning behind each answer. It is read-only: it does not create, edit, or delete your data.",
  },
  {
    question: "Can I track subscriptions and recurring charges?",
    answer:
      "Yes. Log a subscription and Zoption records its next charge as an expense, so your balance reflects what's paid. You can also switch to the Visual Renewal Calendar Interface to view upcoming billing cycles, payment schedules across dates, and cash-flow impact on an interactive month-by-month grid.",
  },
  {
    question: "How does automatic savings interest work?",
    answer:
      "Automatic interest is a Pro feature. On a savings account you can set the annual rate and pay day you want, and Zoption accrues interest daily, monthly, or yearly and adds the earned amount to your balance automatically.",
  },
  {
    question: "How do transfers between accounts work?",
    answer:
      "Transfer between your own accounts and Zoption shows the exact amount that arrives after any fee is deducted, then adds the transfer to the ledger. Transfers work across your accounts in both dollars and pesos.",
  },
  {
    question: "How can I export or delete my data?",
    answer:
      "Exports are available through the current filtered transaction CSV feature. You may request deletion of your account and associated data through the account deletion control in your account settings; an ongoing paid subscription must be canceled or otherwise resolved first.",
  },
  {
    question: "How does Zoption billing work?",
    answer:
      "Zoption offers monthly and annual paid subscription options through PayPal. Prices are charged in Philippine pesos, and subscriptions renew automatically for the selected interval unless you cancel renewal. You can request cancellation through Plan and billing in Zoption.",
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
        "Plain-language answers about tracking expenses, importing CSV or Excel exports, budgets, subscription tracking, savings interest, the AI assistant, privacy, and billing.",
      url: `${SITE_ORIGIN}/faq`,
      inLanguage: "en",
      dateModified: PUBLIC_CONTENT_LAST_MODIFIED,
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

function legalPageStructuredData(
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
      name: "Download Zoption Beta for Android",
      description: "Download the official Zoption Beta Android APK from the Zoption website.",
      url,
      dateModified: ANDROID_RELEASE.releaseDate,
      inLanguage: "en",
      isPartOf: { "@id": WEBSITE_ID },
      mainEntity: { "@id": applicationId },
    },
    {
      "@type": "SoftwareApplication",
      "@id": applicationId,
      name: "Zoption Beta for Android",
      applicationCategory: "FinanceApplication",
      operatingSystem: ANDROID_RELEASE.minimumAndroid,
      softwareVersion: ANDROID_RELEASE.versionName,
      datePublished: ANDROID_RELEASE.releaseDate,
      downloadUrl: ANDROID_RELEASE.downloadPath.startsWith("http")
        ? ANDROID_RELEASE.downloadPath
        : `${SITE_ORIGIN}${ANDROID_RELEASE.downloadPath}`,
      fileSize: `${ANDROID_RELEASE.sizeBytes} bytes`,
      description:
        "The native Zoption Beta Android app with offline-first budgeting and camera receipt scanning, for the private Zoption workspace.",
      url,
    },
  );
}

const PUBLIC_CONTENT_LAST_MODIFIED = "2026-08-11";
const TERMS_AND_PRIVACY_LAST_MODIFIED = "2026-08-11";
const COOKIE_POLICY_LAST_MODIFIED = "2026-08-10";
const CHANGELOG_LAST_MODIFIED = "2026-08-24";
const PRICING_LAST_MODIFIED = "2026-08-30";
const GUIDES_LAST_MODIFIED = "2026-08-30";

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

function pricingPageStructuredData(): StructuredDataGraph {
  const url = `${SITE_ORIGIN}/pricing`;
  return structuredDataGraph(websiteNode(), {
    "@type": "WebPage",
    "@id": `${url}#webpage`,
    name: "Pricing & Plans — Zoption",
    description:
      "Explore Zoption Free and Pro plans. Track personal finances with zero bank credentials, speech-to-transaction logging, receipt scanning, and bank statement imports.",
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

export const PUBLIC_ROUTE_METADATA: Record<PublicRoutePath, PublicRouteMetadata> = {
  "/": {
    title: "Zoption — Private Budget & Expense Tracker",
    description:
      "Start for free to track expenses, review CSV or Excel transaction imports, set practical budgets, and understand monthly cash flow without a direct bank connection.",
    canonical: SITE_ORIGIN,
    robots: "index,follow",
    structuredData: homepageStructuredData(),
    sitemap: {
      lastModified: PUBLIC_CONTENT_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 1,
    },
  },
  "/pricing": {
    title: "Pricing & Plans — Zoption",
    description:
      "Start for free or upgrade to Pro for ₱149/month. Private budget tracking, voice and receipt entry, bank statement imports, and no direct bank credential sharing.",
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
      "Read the terms that govern Zoption Free and Pro plans, accounts, budgeting features, transaction imports, exports, subscriptions, and the optional AI assistant.",
    canonical: `${SITE_ORIGIN}/terms-of-service`,
    robots: "index,follow",
    structuredData: legalPageStructuredData(
      "Terms of Service — Zoption",
      "The terms that govern Zoption Free and Pro plans, accounts, budgeting features, transaction imports, exports, subscriptions, and the optional AI assistant.",
      `${SITE_ORIGIN}/terms-of-service`,
      TERMS_AND_PRIVACY_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: TERMS_AND_PRIVACY_LAST_MODIFIED,
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
    structuredData: legalPageStructuredData(
      "Privacy Policy — Zoption",
      "How Zoption handles account, profile, financial workspace, plan, billing, imported transaction, assistant, consent, and operational information.",
      `${SITE_ORIGIN}/privacy-policy`,
      TERMS_AND_PRIVACY_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: TERMS_AND_PRIVACY_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  },
  "/cookie-policy": {
    title: "Cookie Policy — Zoption",
    description:
      "Learn about the necessary browser storage Zoption uses and how PostHog provides cookieless web analytics on public pages.",
    canonical: `${SITE_ORIGIN}/cookie-policy`,
    robots: "index,follow",
    structuredData: legalPageStructuredData(
      "Cookie Policy — Zoption",
      "The necessary browser storage Zoption uses and how PostHog provides cookieless web analytics on public pages.",
      `${SITE_ORIGIN}/cookie-policy`,
      COOKIE_POLICY_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: COOKIE_POLICY_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  },
  "/faq": {
    title: "FAQ — Zoption",
    description:
      "Plain-language answers about tracking expenses, importing CSV or Excel exports, budgets, subscription tracking, savings interest, the AI assistant, privacy, and billing.",
    canonical: `${SITE_ORIGIN}/faq`,
    robots: "index,follow",
    structuredData: faqStructuredData(),
    sitemap: {
      lastModified: PUBLIC_CONTENT_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 0.6,
    },
  },
  "/install": {
    title: "Download Zoption Beta for Android — Official APK",
    description:
      "Download the official Zoption Beta Android APK from the Zoption website, with version, file size, checksum, and safe installation steps.",
    canonical: `${SITE_ORIGIN}/install`,
    robots: "index,follow",
    structuredData: installPageStructuredData(),
    sitemap: {
      lastModified: ANDROID_RELEASE.releaseDate,
      changeFrequency: "monthly",
      priority: 0.7,
    },
  },
  "/changelog": {
    title: "Changelog & Release Notes — Zoption",
    description:
      "See what's new in Zoption: visual renewal calendar for subscriptions, voice expense entry, receipt scanning, transaction deduplication, Android Beta APK updates, and private budgeting tools.",
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
} satisfies Record<PublicRoutePath, PublicRouteMetadata>;

export const SITEMAP_ENTRIES: SitemapEntry[] = PUBLIC_ROUTE_PATHS.map((path) => {
  const metadata = PUBLIC_ROUTE_METADATA[path];
  if (!metadata) {
    throw new Error(`Missing metadata for public route: ${path}`);
  }
  const { sitemap } = metadata;
  return { path, ...sitemap };
});

const PRIVATE_ROUTE_TITLES: Record<string, string> = {
  "/login": "Sign in — Zoption",
  "/signup": "Create account — Zoption",
  "/forgot-password": "Reset your password — Zoption",
  "/update-password": "Choose a new password — Zoption",
  "/auth/callback": "Signing you in — Zoption",
  "/app": "Overview — Zoption",
  "/app/assistant": "Assistant — Zoption",
  "/app/calendar": "Calendar — Zoption",
  "/app/transactions": "Transactions — Zoption",
  "/app/import": "Import transactions — Zoption",
  "/app/budgets": "Budgets — Zoption",
  "/app/subscriptions": "Subscriptions — Zoption",
  "/app/settings": "Settings — Zoption",
  "/thank-you": "Thank You — Zoption",
};

const NOINDEX_DESCRIPTION = "Zoption is a private budget and expense tracking workspace.";
const TRACKING_PARAMETER_NAMES = new Set([
  "utm_source",
  "utm_medium",
  "utm_campaign",
  "utm_term",
  "utm_content",
  "gclid",
  "dclid",
  "fbclid",
  "msclkid",
]);
const SENSITIVE_FRAGMENT_PARAMETER_NAMES = new Set([
  "code",
  "token",
  "access_token",
  "refresh_token",
  "error",
  "error_code",
  "error_description",
  "type",
  "next",
  "state",
  "redirect_to",
]);

export function normalizePathname(pathname: string): string {
  if (!pathname || pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

function isTrackingOnlySearch(search: string): boolean {
  const parameters = new URLSearchParams(search);
  return [...parameters.keys()].every((name) => TRACKING_PARAMETER_NAMES.has(name.toLowerCase()));
}

function hasSensitiveFragment(hash: string): boolean {
  const fragment = hash.replace(/^#/, "");
  if (!fragment) return false;

  const parameters = new URLSearchParams(fragment);
  return [...parameters.keys()].some((name) =>
    SENSITIVE_FRAGMENT_PARAMETER_NAMES.has(name.toLowerCase()),
  );
}

function applyIndexingEnvironment(metadata: PublicRouteMetadata): SeoMetadata {
  if (searchIndexingEnabled) return metadata;
  return { ...metadata, robots: "noindex,nofollow" };
}

export function getPublicRouteMetadata(pathname: string): SeoMetadata | undefined {
  const normalized = normalizePathname(pathname);
  const metadata = PUBLIC_ROUTE_METADATA[normalized as PublicRoutePath];
  if (metadata) return applyIndexingEnvironment(metadata);

  if (normalized.startsWith("/guides/")) {
    const slug = normalized.replace(/^\/guides\//, "");
    const guide = getFinanceGuideBySlug(slug);
    if (guide) {
      const dynamicMeta: PublicRouteMetadata = {
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
      };
      return applyIndexingEnvironment(dynamicMeta);
    }
  }

  return undefined;
}

export function isEligiblePublicUrl(pathname: string, search = "", hash = ""): boolean {
  return Boolean(
    getPublicRouteMetadata(pathname) && isTrackingOnlySearch(search) && !hasSensitiveFragment(hash),
  );
}

export function getRouteSeoMetadata(pathname: string, search = "", hash = ""): SeoMetadata {
  const publicMetadata = getPublicRouteMetadata(pathname);
  if (publicMetadata && isEligiblePublicUrl(pathname, search, hash)) {
    return publicMetadata;
  }

  const normalizedPath = normalizePathname(pathname);
  const title =
    PRIVATE_ROUTE_TITLES[normalizedPath] ??
    (normalizedPath.startsWith("/app/") ? "Zoption workspace" : "Page not found — Zoption");

  return {
    title,
    description: NOINDEX_DESCRIPTION,
    canonical: `${SITE_ORIGIN}${normalizedPath}`,
    robots: "noindex,nofollow",
  };
}

export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, "\\u003c");
}
