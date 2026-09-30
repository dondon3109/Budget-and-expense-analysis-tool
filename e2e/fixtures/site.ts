/**
 * The public site's dev server (playwright.config.ts). Specs keep the app as their
 * baseURL and reach public pages through `siteUrl`.
 */
export const SITE_URL = "http://localhost:4321";

export function siteUrl(path: `/${string}`): string {
  return `${SITE_URL}${path}`;
}
