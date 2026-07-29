import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { registerOptionalIntegration } from "../consent/consentGate";

const measurementId = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim();

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

function trackPageView(pathname: string) {
  if (!measurementId || !window.gtag) return;

  window.gtag("event", "page_view", {
    page_location: `${window.location.origin}${pathname}`,
    page_path: pathname,
    page_title: document.title,
  });
}

function loadGoogleAnalytics() {
  if (!measurementId) return;

  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  script.dataset.zoptionGoogleAnalytics = "true";

  window.dataLayer = window.dataLayer ?? [];
  window.gtag = (...args) => window.dataLayer?.push(args);
  window.gtag("js", new Date());
  window.gtag("config", measurementId, { send_page_view: false });
  document.head.append(script);
  trackPageView(window.location.pathname);

  return () => {
    script.remove();
    delete window.gtag;
    delete window.dataLayer;
  };
}

export function GoogleAnalytics() {
  const location = useLocation();

  useEffect(() => {
    if (!measurementId) return;
    return registerOptionalIntegration("analytics", loadGoogleAnalytics);
  }, []);

  useEffect(() => {
    trackPageView(location.pathname);
  }, [location.pathname]);

  return null;
}
