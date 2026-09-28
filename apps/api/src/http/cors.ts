import type { MiddlewareHandler } from "hono";

import { isLoopbackOrigin } from "../auth";
import type { AppEnvironment } from "../types";

/**
 * Origin allowlist, CORS preflight, and security headers for every `/api/*` request. Mounted
 * first so a disallowed origin is rejected before any other middleware runs.
 */
export const corsAndSecurityHeaders: MiddlewareHandler<AppEnvironment> = async (context, next) => {
  const isWebSocket = context.req.header("Upgrade")?.toLowerCase() === "websocket";

  const allowedOrigins = (context.env?.ALLOWED_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((allowedOrigin) => allowedOrigin.trim())
    .filter(Boolean);
  const requestOrigin = context.req.header("Origin");
  const requestUrl = new URL(context.req.url);
  const isSameOrigin = requestOrigin === requestUrl.origin;
  // Local development may call the API from a loopback origin at any port. The hostname is
  // compared exactly: prefixes such as http://192.168. or http://10. are registrable hostnames
  // (192.168.example.com), not IP literals, and must never be trusted.
  const isLocalDev =
    context.env?.POSTHOG_AI_ENVIRONMENT !== "production" && isLoopbackOrigin(requestOrigin);

  if (requestOrigin && !isSameOrigin && !isLocalDev && !allowedOrigins.includes(requestOrigin)) {
    return context.json({ error: "origin_not_allowed" }, 403);
  }

  // Do not attach extra headers on WebSocket upgrades. Hono/Workers can clone
  // the 101 response when headers are merged, which aborts the browser handshake.
  if (isWebSocket) {
    await next();
    return;
  }

  context.header("X-Content-Type-Options", "nosniff");
  context.header("Referrer-Policy", "no-referrer");
  context.header("X-Frame-Options", "DENY");
  if (new URL(context.req.url).protocol === "https:") {
    context.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  }

  if (requestOrigin) {
    context.header("Access-Control-Allow-Origin", requestOrigin);
    context.header("Vary", "Origin");
  }
  context.header("Access-Control-Allow-Methods", "GET, POST, PATCH, PUT, DELETE, OPTIONS");
  context.header("Access-Control-Allow-Headers", "Authorization, Content-Type");
  context.header("Access-Control-Max-Age", "86400");

  if (context.req.method === "OPTIONS") return context.body(null, 204);
  await next();
};
