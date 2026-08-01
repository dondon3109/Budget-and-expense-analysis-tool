export const SITE_ORIGIN = "https://zoption.site";
export const SITE_NAME = "Zoption";
export const SOCIAL_IMAGE_PATH = "/og/zoption-social.png";
export const SOCIAL_IMAGE_URL = `${SITE_ORIGIN}${SOCIAL_IMAGE_PATH}`;
export const STRUCTURED_DATA_SCRIPT_ID = "zoption-structured-data";

declare const __SEARCH_INDEXING_ENABLED__: boolean;

const searchIndexingEnabled =
  typeof __SEARCH_INDEXING_ENABLED__ === "undefined" || __SEARCH_INDEXING_ENABLED__;

export type PublicRoutePath = "/" | "/terms-of-service" | "/privacy-policy" | "/cookie-policy";

export const PUBLIC_ROUTE_PATHS: PublicRoutePath[] = [
  "/",
  "/terms-of-service",
  "/privacy-policy",
  "/cookie-policy",
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
  "A private budget and expense tracker for reviewing imported transactions, budgets, and monthly cash flow.";

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
  return structuredDataGraph(websiteNode(), {
    "@type": "WebApplication",
    "@id": WEB_APPLICATION_ID,
    name: SITE_NAME,
    applicationCategory: "FinanceApplication",
    operatingSystem: "Web",
    url: SITE_ORIGIN,
    description:
      "A private budget and expense tracker for reviewing imported transactions, budgets, and monthly cash flow without a direct bank connection.",
    inLanguage: "en",
    isPartOf: { "@id": WEBSITE_ID },
    featureList: [
      "Map columns, catch errors, and prevent duplicate entries.",
      "See totals, trends, categories, and budget progress together.",
      "Start from a clean workspace and add only the records you choose.",
    ],
  });
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

const LEGAL_PAGE_LAST_MODIFIED = "2026-08-02";

export const PUBLIC_ROUTE_METADATA: Record<PublicRoutePath, PublicRouteMetadata> = {
  "/": {
    title: "Zoption — Private Budget & Expense Tracker",
    description:
      "Track expenses, review CSV or Excel transaction imports, set practical budgets, and understand monthly cash flow in a private workspace without a direct bank connection.",
    canonical: SITE_ORIGIN,
    robots: "index,follow",
    structuredData: homepageStructuredData(),
    sitemap: {
      lastModified: LEGAL_PAGE_LAST_MODIFIED,
      changeFrequency: "monthly",
      priority: 1,
    },
  },
  "/terms-of-service": {
    title: "Terms of Service — Zoption",
    description:
      "Read the terms that govern Zoption accounts, budgeting features, transaction imports, exports, subscriptions, and the optional AI assistant.",
    canonical: `${SITE_ORIGIN}/terms-of-service`,
    robots: "index,follow",
    structuredData: legalPageStructuredData(
      "Terms of Service — Zoption",
      "The terms that govern Zoption accounts, budgeting features, transaction imports, exports, subscriptions, and the optional AI assistant.",
      `${SITE_ORIGIN}/terms-of-service`,
      LEGAL_PAGE_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: LEGAL_PAGE_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  },
  "/privacy-policy": {
    title: "Privacy Policy — Zoption",
    description:
      "Learn how Zoption handles account, profile, financial workspace, imported transaction, assistant, consent, and operational information.",
    canonical: `${SITE_ORIGIN}/privacy-policy`,
    robots: "index,follow",
    structuredData: legalPageStructuredData(
      "Privacy Policy — Zoption",
      "How Zoption handles account, profile, financial workspace, imported transaction, assistant, consent, and operational information.",
      `${SITE_ORIGIN}/privacy-policy`,
      LEGAL_PAGE_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: LEGAL_PAGE_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  },
  "/cookie-policy": {
    title: "Cookie Policy — Zoption",
    description:
      "Learn about the necessary browser storage Zoption uses and how Google Analytics 4 remains blocked until Analytics consent is granted.",
    canonical: `${SITE_ORIGIN}/cookie-policy`,
    robots: "index,follow",
    structuredData: legalPageStructuredData(
      "Cookie Policy — Zoption",
      "The necessary browser storage Zoption uses and how Google Analytics 4 remains blocked until Analytics consent is granted.",
      `${SITE_ORIGIN}/cookie-policy`,
      LEGAL_PAGE_LAST_MODIFIED,
    ),
    sitemap: {
      lastModified: LEGAL_PAGE_LAST_MODIFIED,
      changeFrequency: "yearly",
      priority: 0.4,
    },
  },
};

export const SITEMAP_ENTRIES: SitemapEntry[] = PUBLIC_ROUTE_PATHS.map((path) => {
  const { sitemap } = PUBLIC_ROUTE_METADATA[path];
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
  const metadata = PUBLIC_ROUTE_METADATA[normalizePathname(pathname) as PublicRoutePath];
  return metadata ? applyIndexingEnvironment(metadata) : undefined;
}

export function getRouteSeoMetadata(pathname: string, search = "", hash = ""): SeoMetadata {
  const publicMetadata = getPublicRouteMetadata(pathname);
  if (publicMetadata && isTrackingOnlySearch(search) && !hasSensitiveFragment(hash)) {
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
