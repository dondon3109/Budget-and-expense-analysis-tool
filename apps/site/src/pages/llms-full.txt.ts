import type { APIRoute } from "astro";

import template from "../content/llms-full.txt?raw";
import { withLlmsPageList } from "../seo/discovery";

export const GET: APIRoute = () => new Response(withLlmsPageList(template));
