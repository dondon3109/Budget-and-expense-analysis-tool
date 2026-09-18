import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { MiddlewareHandler } from "hono";

import type { AppEnvironment, AuthUser, Bindings } from "./types";
import type { TenantResolver } from "./db/tenants";
import { voiceTicketRepository, type VoiceTicketRepository } from "./db/voice-tickets";
import { HttpError } from "./errors";

export interface AuthVerifier {
  verify(env: Bindings, token: string): Promise<AuthUser>;
}

export class AuthConfigurationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AuthConfigurationError";
  }
}

function getSupabaseAuthUrl(env: Bindings): URL {
  const configuredUrl = env.SUPABASE_URL?.trim();
  if (!configuredUrl) {
    throw new AuthConfigurationError("SUPABASE_URL is required for authenticated API routes.");
  }

  let projectUrl: URL;
  try {
    projectUrl = new URL(configuredUrl);
  } catch {
    throw new AuthConfigurationError("SUPABASE_URL must be a valid absolute URL.");
  }
  const isLoopbackHost = ["localhost", "127.0.0.1", "[::1]"].includes(projectUrl.hostname);
  if (projectUrl.protocol !== "https:" && !(projectUrl.protocol === "http:" && isLoopbackHost)) {
    throw new AuthConfigurationError(
      "SUPABASE_URL must use HTTPS except for an explicit loopback development host.",
    );
  }

  return new URL("auth/v1/", projectUrl.href.endsWith("/") ? projectUrl : `${projectUrl.href}/`);
}

export function createSupabaseAuthVerifier(
  createJwks: (url: URL) => JWTVerifyGetKey = createRemoteJWKSet,
): AuthVerifier {
  const jwksByUrl = new Map<string, JWTVerifyGetKey>();

  return {
    async verify(env, token) {
      const authUrl = getSupabaseAuthUrl(env);
      const jwksUrl = new URL(".well-known/jwks.json", authUrl);
      let jwks = jwksByUrl.get(jwksUrl.href);
      if (!jwks) {
        jwks = createJwks(jwksUrl);
        jwksByUrl.set(jwksUrl.href, jwks);
      }

      const { payload } = await jwtVerify(token, jwks, {
        issuer: authUrl.href.replace(/\/$/, ""),
        audience: env.SUPABASE_JWT_AUDIENCE?.trim() || "authenticated",
      });
      if (typeof payload.sub !== "string" || payload.sub.length === 0) {
        throw new Error("The access token does not contain a subject.");
      }
      if (typeof payload.iat !== "number") {
        throw new Error("The access token does not contain an issued-at time.");
      }
      if (payload.role !== "authenticated") {
        throw new Error("The access token does not have the authenticated role.");
      }

      return {
        id: payload.sub,
        ...(typeof payload.email === "string" ? { email: payload.email } : {}),
        role: payload.role,
      };
    },
  };
}

export const supabaseAuthVerifier = createSupabaseAuthVerifier();

function unauthorized(context: Parameters<MiddlewareHandler<AppEnvironment>>[0], code: string) {
  context.header("WWW-Authenticate", 'Bearer realm="budget-expense-api"');
  return context.json({ error: code }, 401);
}

/**
 * Local-development opt-in. The dummy access token is honoured only when this binding is "true"
 * and the request arrives on a loopback host, so no deployed origin configuration can arm it.
 */
function isLocalDevEnabled(env: Bindings | undefined): boolean {
  return env?.DEV_ACCESS_TOKEN_ENABLED === "true";
}

/**
 * An exact loopback origin, never a hostname that merely starts with one: a
 * `http://localhost-cdn.example.com` origin must not qualify as local development.
 */
export function isLoopbackOrigin(origin: string | undefined): boolean {
  if (!origin) return false;
  let parsed: URL;
  try {
    parsed = new URL(origin);
  } catch {
    return false;
  }
  return (
    parsed.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsed.hostname)
  );
}

export function createAuthMiddleware(
  verifier: AuthVerifier,
  tenantResolver: TenantResolver,
  skipTenantResolution: (path: string, method: string) => boolean = () => false,
  voiceTickets: VoiceTicketRepository = voiceTicketRepository,
): MiddlewareHandler<AppEnvironment> {
  return async (context, next) => {
    const authorization = context.req.header("Authorization");
    const token = authorization?.match(/^Bearer\s+(\S+)$/i)?.[1];
    const isWebSocket = context.req.header("Upgrade")?.toLowerCase() === "websocket";

    // A browser cannot set an Authorization header on a WebSocket handshake, so the stream
    // redeems a single-use ticket from the query string instead of carrying the access token in
    // the URL. Only a real upgrade may redeem one, and redemption deletes the row, so a replayed
    // or expired ticket is rejected here with the same 401 shape as a bad token.
    let ticketUserId: string | null = null;
    if (!token && isWebSocket) {
      const ticket = context.req.query("ticket")?.trim();
      if (ticket) {
        ticketUserId = await voiceTickets.consume(context.env, ticket);
        if (!ticketUserId) return unauthorized(context, "invalid_voice_ticket");
      }
    }
    if (!token && !ticketUserId) return unauthorized(context, "authentication_required");

    let user: AuthUser | null = null;
    const devToken =
      token === "dummy-dev-access-token" &&
      isLocalDevEnabled(context.env) &&
      context.env?.POSTHOG_AI_ENVIRONMENT !== "production" &&
      isLoopbackOrigin(new URL(context.req.url).origin);
    if (devToken) {
      user = {
        id: context.env?.DEV_USER_ID?.trim() || "00000000-0000-4000-8000-000000000001",
        email: "dummy@zoption.local",
      };
    } else if (token) {
      try {
        user = await verifier.verify(context.env, token);
      } catch (error) {
        if (error instanceof AuthConfigurationError) throw error;
        return unauthorized(context, "invalid_access_token");
      }
    } else if (ticketUserId) {
      user = { id: ticketUserId };
    }
    if (!user) return unauthorized(context, "authentication_required");

    context.set("authUser", user);
    // A ticket authenticates one WebSocket connect, not the whole API surface.
    if (token) context.set("accessToken", token);

    // A deleted identity keeps its tombstone forever, so every authenticated path has to honour
    // it. This is the only enforcement point: /api/app/admin/* and DELETE /api/app/account skip
    // tenant resolution, so a retained token would otherwise be accepted on those paths.
    // The skip branch below needs no D1 binding at all, which only a test harness has: readiness
    // requires DB, so a deployment that serves traffic always runs the check.
    const database = context.env?.DB;
    if (typeof database?.prepare === "function") {
      const deleted = await database
        .prepare("SELECT 1 AS found FROM account_deletions WHERE user_id = ? LIMIT 1")
        .bind(user.id)
        .first<{ found: number }>();
      if (deleted) {
        throw new HttpError(410, "account_deleted", "This account has been deleted.");
      }
    }

    if (!skipTenantResolution(context.req.path, context.req.method)) {
      context.set("tenant", await tenantResolver.resolve(context.env, user));
    }
    await next();
  };
}
