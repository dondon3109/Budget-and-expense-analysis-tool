import { renderToString } from "react-dom/server";
import { StaticRouter } from "react-router-dom";

import { PublicRoutes } from "./PublicRoutes";
import { CookieConsentProvider } from "./consent/CookieConsentProvider";
import { getPublicRouteMetadata } from "./seo/siteMetadata";
import { ThemeProvider } from "./theme/ThemeProvider";

export {
  serializeJsonLd,
  SITE_NAME,
  SITE_ORIGIN,
  SOCIAL_IMAGE_URL,
  SITEMAP_ENTRIES,
  STRUCTURED_DATA_SCRIPT_ID,
} from "./seo/siteMetadata";

function renderRoute(pathname: string) {
  return renderToString(
    <ThemeProvider>
      <CookieConsentProvider>
        <StaticRouter location={pathname}>
          <PublicRoutes />
        </StaticRouter>
      </CookieConsentProvider>
    </ThemeProvider>,
  );
}

export function renderPublicRoute(pathname: string) {
  const metadata = getPublicRouteMetadata(pathname);
  if (!metadata) throw new Error(`Cannot prerender non-public route: ${pathname}`);

  return { html: renderRoute(pathname), metadata };
}

export function renderNotFoundPage() {
  return renderRoute("/not-found");
}
