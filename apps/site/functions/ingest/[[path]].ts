/**
 * Same-origin PostHog proxy for the public site (Cloudflare Pages Function at
 * /ingest/*). Keeping analytics on this origin lets the CSP stay at
 * `connect-src 'self'` and stops blocklists that match the PostHog host from
 * silently dropping consented events.
 *
 * It is not an open proxy: only the capture endpoints posthog-js uses are
 * forwarded, and the visitor's cookies and address headers are stripped, so
 * PostHog only ever sees Cloudflare's egress address.
 */
const CAPTURE_HOST = "us.i.posthog.com";
const CAPTURE_PATHS = [/^\/e\/?$/, /^\/i\/v0\/e\/?$/, /^\/batch\/?$/, /^\/capture\/?$/];
const STRIPPED_HEADERS = [
  "cookie",
  "cf-connecting-ip",
  "cf-connecting-ipv6",
  "cf-ipcountry",
  "true-client-ip",
  "x-forwarded-for",
  "x-real-ip",
];

export async function onRequest({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/ingest/, "") || "/";
  if (request.method !== "POST" || !CAPTURE_PATHS.some((pattern) => pattern.test(path))) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers(request.headers);
  for (const name of STRIPPED_HEADERS) headers.delete(name);

  return fetch(`https://${CAPTURE_HOST}${path}${url.search}`, {
    method: "POST",
    headers,
    body: request.body,
    redirect: "manual",
  });
}
