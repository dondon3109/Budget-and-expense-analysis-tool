import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import {
  getRouteSeoMetadata,
  serializeJsonLd,
  SITE_NAME,
  SOCIAL_IMAGE_URL,
  STRUCTURED_DATA_SCRIPT_ID,
} from "./siteMetadata";

function upsertMeta(attribute: "name" | "property", key: string, content: string) {
  const selector = `meta[${attribute}="${key}"]`;
  const element =
    document.head.querySelector<HTMLMetaElement>(selector) ?? document.createElement("meta");
  element.setAttribute(attribute, key);
  element.content = content;
  if (!element.isConnected) document.head.append(element);
}

function upsertCanonical(href: string) {
  const element =
    document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]') ??
    document.createElement("link");
  element.rel = "canonical";
  element.href = href;
  if (!element.isConnected) document.head.append(element);
}

function upsertStructuredData(serialized: string) {
  const element =
    document.head.querySelector<HTMLScriptElement>(`script#${STRUCTURED_DATA_SCRIPT_ID}`) ??
    document.createElement("script");
  element.id = STRUCTURED_DATA_SCRIPT_ID;
  element.type = "application/ld+json";
  element.text = serialized;
  if (!element.isConnected) document.head.append(element);
}

export function SeoHead() {
  const location = useLocation();

  useEffect(() => {
    const metadata = getRouteSeoMetadata(location.pathname, location.search, location.hash);
    document.title = metadata.title;
    upsertMeta("name", "description", metadata.description);
    upsertMeta("name", "robots", metadata.robots);
    upsertCanonical(metadata.canonical);

    upsertMeta("property", "og:type", "website");
    upsertMeta("property", "og:site_name", SITE_NAME);
    upsertMeta("property", "og:title", metadata.title);
    upsertMeta("property", "og:description", metadata.description);
    upsertMeta("property", "og:url", metadata.canonical);
    upsertMeta("property", "og:image", SOCIAL_IMAGE_URL);
    upsertMeta("property", "og:image:width", "1200");
    upsertMeta("property", "og:image:height", "630");
    upsertMeta("property", "og:image:alt", "Zoption private budget and expense tracker");

    upsertMeta("name", "twitter:card", "summary_large_image");
    upsertMeta("name", "twitter:title", metadata.title);
    upsertMeta("name", "twitter:description", metadata.description);
    upsertMeta("name", "twitter:image", SOCIAL_IMAGE_URL);
    upsertMeta("name", "twitter:image:alt", "Zoption private budget and expense tracker");

    if (metadata.structuredData) {
      upsertStructuredData(serializeJsonLd(metadata.structuredData));
    } else {
      document.head.querySelector(`script#${STRUCTURED_DATA_SCRIPT_ID}`)?.remove();
    }
  }, [location.hash, location.pathname, location.search]);

  return null;
}
