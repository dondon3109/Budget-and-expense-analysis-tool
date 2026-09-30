import type { APIRoute } from "astro";

// The release workflow polls this to confirm the new site version is live.
export const GET: APIRoute = () =>
  new Response(`${JSON.stringify({ appVersion: __APP_VERSION__ }, null, 2)}\n`);
