import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";
import type { MiddlewareHandler } from "hono";

import type { AppEnvironment, AuthUser, Bindings } from "./types";
import type { TenantResolver } from "./db/tenants";

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
  if (!["https:", "http:"].includes(projectUrl.protocol)) {
    throw new AuthConfigurationError("SUPABASE_URL must use HTTP or HTTPS.");
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

export function createAuthMiddleware(
  verifier: AuthVerifier,
  tenantResolver: TenantResolver,
): MiddlewareHandler<AppEnvironment> {
  return async (context, next) => {
    const authorization = context.req.header("Authorization");
    const match = authorization?.match(/^Bearer\s+(\S+)$/i);
    if (!match) return unauthorized(context, "authentication_required");

    let user: AuthUser;
    try {
      user = await verifier.verify(context.env, match[1]!);
    } catch (error) {
      if (error instanceof AuthConfigurationError) throw error;
      return unauthorized(context, "invalid_access_token");
    }

    const tenant = await tenantResolver.resolve(context.env, user);
    context.set("authUser", user);
    context.set("tenant", tenant);
    await next();
  };
}
