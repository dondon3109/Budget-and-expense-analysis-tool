import { useEffect, useRef, type RefObject } from "react";
import { useLocation } from "react-router-dom";

import { getConsentGatePreferences, subscribeToConsentGate } from "../consent/consentGate";
import { isEligiblePublicUrl } from "../seo/siteMetadata";

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();
const GOOGLE_ANALYTICS_SCRIPT_SELECTOR =
  'script[data-zoption-google-analytics="true"], script[src^="https://www.googletagmanager.com/gtag/js"]';
const GOOGLE_ANALYTICS_COOKIE_NAME = /^(?:_ga(?:_.+)?|_gid|_gat(?:_.+)?|_gac_.+|_dc_gtm_.+)$/;

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
    ga?: (...args: unknown[]) => void;
    google_tag_manager?: unknown;
    GoogleAnalyticsObject?: string;
  }
}

function disableFlagKey(id: string): string {
  return `ga-disable-${id}`;
}

function analyticsWindow(): Window & Record<string, unknown> {
  return window as unknown as Window & Record<string, unknown>;
}

function cookiePaths(pathname: string): string[] {
  const segments = pathname.split("/").filter(Boolean);
  const paths = new Set<string>(["/"]);
  let current = "";
  for (const segment of segments) {
    current += `/${segment}`;
    paths.add(current);
  }
  return [...paths];
}

function cookieDomains(hostname: string): Array<string | undefined> {
  const domains = new Set<string | undefined>([undefined]);
  if (!hostname || hostname === "localhost" || hostname.includes(":")) return [...domains];

  const labels = hostname.split(".").filter(Boolean);
  for (let index = 0; index <= Math.max(0, labels.length - 2); index += 1) {
    const domain = labels.slice(index).join(".");
    domains.add(domain);
    domains.add(`.${domain}`);
  }
  return [...domains];
}

function removeGoogleAnalyticsCookies(): void {
  const cookieNames = document.cookie
    .split(";")
    .map((cookie) => cookie.trim().split("=", 1)[0] ?? "")
    .filter((name) => GOOGLE_ANALYTICS_COOKIE_NAME.test(name));

  for (const name of cookieNames) {
    for (const path of cookiePaths(window.location.pathname)) {
      for (const domain of cookieDomains(window.location.hostname)) {
        document.cookie = `${name}=; Max-Age=0; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=${path}${domain ? `; domain=${domain}` : ""}`;
      }
    }
  }
}

function clearGoogleAnalyticsRuntime(id: string | undefined): void {
  document
    .querySelectorAll<HTMLScriptElement>(GOOGLE_ANALYTICS_SCRIPT_SELECTOR)
    .forEach((script) => script.remove());

  const target = analyticsWindow();
  delete target.gtag;
  delete target.dataLayer;
  delete target.ga;
  delete target.google_tag_manager;
  delete target.GoogleAnalyticsObject;
  if (id) delete target[disableFlagKey(id)];
}

function disableGoogleAnalytics(id: string | undefined): void {
  clearGoogleAnalyticsRuntime(id);
  if (id) analyticsWindow()[disableFlagKey(id)] = true;
  removeGoogleAnalyticsCookies();
}

function trackPageView(pathname: string, lastTrackedPathname: RefObject<string | null>) {
  if (!measurementId || !window.gtag || lastTrackedPathname.current === pathname) return;
  if (analyticsWindow()[disableFlagKey(measurementId)] === true) return;

  window.gtag("event", "page_view", {
    page_location: `${window.location.origin}${pathname}`,
    page_path: pathname,
    page_title: document.title,
  });
  lastTrackedPathname.current = pathname;
}

function ensureGoogleAnalytics(
  pathname: string,
  lastTrackedPathname: RefObject<string | null>,
): void {
  if (!measurementId) return;

  const existingScript = document.querySelector<HTMLScriptElement>(
    GOOGLE_ANALYTICS_SCRIPT_SELECTOR,
  );
  if (existingScript && window.gtag) {
    delete analyticsWindow()[disableFlagKey(measurementId)];
    trackPageView(pathname, lastTrackedPathname);
    return;
  }

  clearGoogleAnalyticsRuntime(measurementId);

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.dataset.zoptionGoogleAnalytics = "true";

  window.dataLayer = [];
  window.gtag = (...args) => window.dataLayer?.push(args);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });
  document.head.append(script);
  trackPageView(pathname, lastTrackedPathname);
}

export function GoogleAnalytics() {
  const location = useLocation();
  const currentPathname = useRef(location.pathname);
  const lastTrackedPathname = useRef<string | null>(null);
  currentPathname.current = location.pathname;
  const eligible = isEligiblePublicUrl(location.pathname, location.search, location.hash);

  useEffect(() => {
    if (!measurementId) return;
    if (!eligible) {
      lastTrackedPathname.current = null;
      disableGoogleAnalytics(measurementId);
      return;
    }

    const unsubscribe = subscribeToConsentGate((preferences) => {
      if (preferences.analytics) {
        ensureGoogleAnalytics(currentPathname.current, lastTrackedPathname);
      } else {
        lastTrackedPathname.current = null;
        disableGoogleAnalytics(measurementId);
      }
    });

    if (getConsentGatePreferences().analytics) {
      ensureGoogleAnalytics(currentPathname.current, lastTrackedPathname);
    } else {
      lastTrackedPathname.current = null;
      disableGoogleAnalytics(measurementId);
    }
    return unsubscribe;
  }, [eligible]);

  useEffect(() => {
    if (eligible && getConsentGatePreferences().analytics) {
      trackPageView(location.pathname, lastTrackedPathname);
    }
  }, [eligible, location.pathname]);

  return null;
}
