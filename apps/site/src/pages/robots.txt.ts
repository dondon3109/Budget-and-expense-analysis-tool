import type { APIRoute } from "astro";

import { robotsText } from "../seo/discovery";

export const GET: APIRoute = () => new Response(robotsText(__SEARCH_INDEXING_ENABLED__));
