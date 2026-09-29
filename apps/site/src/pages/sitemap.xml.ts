import type { APIRoute } from "astro";

import { sitemapXml } from "../seo/discovery";

// Preview and staging builds publish no sitemap; finalize-build.mjs removes this file there.
export const GET: APIRoute = () =>
  new Response(sitemapXml(), { headers: { "Content-Type": "application/xml; charset=utf-8" } });
