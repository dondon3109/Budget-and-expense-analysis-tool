/**
 * Public pages (pricing, FAQ, legal, guides, the Android download) live on the
 * public site, a different origin from this app. React Router's `Link` treats an
 * absolute URL as a full navigation, so `<Link to={siteUrl("/faq")}>` works.
 */
const SITE_ORIGIN = (import.meta.env.VITE_SITE_URL?.trim() || "https://zoption.site").replace(
  /\/$/,
  "",
);

export function siteUrl(path: `/${string}`): string {
  return `${SITE_ORIGIN}${path}`;
}
