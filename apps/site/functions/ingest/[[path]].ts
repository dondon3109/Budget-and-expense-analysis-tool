/**
 * Same-origin PostHog proxy for the public site (Cloudflare Pages Function at
 * /ingest/*). Keeping analytics on this origin lets the CSP stay at
 * `connect-src 'self'` and stops blocklists that match the PostHog host from
 * silently dropping consented events.
 *
 * It is not an open proxy: only the capture endpoints posthog-js uses are
 * forwarded, with only the headers PostHog needs, so it never sees the
 * visitor's cookies, page URL, or address, only Cloudflare's egress address.
 */
const CAPTURE_HOST = "us.i.posthog.com";
const CAPTURE_PATHS = [/^\/e\/?$/, /^\/i\/v0\/e\/?$/, /^\/batch\/?$/, /^\/capture\/?$/];
// Only what PostHog needs to decode the payload and classify the device. An
// allowlist, so the visitor's cookies, address headers, and Referer (the full
// page URL, which before_send's sanitizing never sees) cannot leak through.
const FORWARDED_HEADERS = ["content-type", "content-encoding", "user-agent"];

export async function onRequest({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname.replace(/^\/ingest/, "") || "/";
  if (request.method !== "POST" || !CAPTURE_PATHS.some((pattern) => pattern.test(path))) {
    return new Response("Not found", { status: 404 });
  }

  const headers = new Headers();
  for (const name of FORWARDED_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }

  return fetch(`https://${CAPTURE_HOST}${path}${url.search}`, {
    method: "POST",
    headers,
    body: request.body,
    redirect: "manual",
  });
}
