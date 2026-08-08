import type { Bindings } from "./types";

export class ApiReadinessError extends Error {
  constructor(readonly reason: string) {
    super("API deployment bindings are not ready.");
    this.name = "ApiReadinessError";
  }
}

function fail(reason: string): never {
  throw new ApiReadinessError(reason);
}

function requiredText(
  env: Bindings,
  key: "ALLOWED_ORIGINS" | "SUPABASE_URL" | "SUPABASE_PUBLISHABLE_KEY",
) {
  const value = env[key]?.trim();
  if (!value) fail(`missing_${key.toLowerCase()}`);
  return value;
}

function isLoopbackHost(hostname: string): boolean {
  return ["localhost", "127.0.0.1", "[::1]"].includes(hostname);
}

function validateOrigin(value: string, name: string, allowLoopbackHttp: boolean): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return fail(`invalid_${name.toLowerCase()}`);
  }

  const validProtocol =
    url.protocol === "https:" ||
    (allowLoopbackHttp && url.protocol === "http:" && isLoopbackHost(url.hostname));
  if (
    !validProtocol ||
    url.username ||
    url.password ||
    url.pathname !== "/" ||
    url.search ||
    url.hash
  ) {
    fail(`invalid_${name.toLowerCase()}`);
  }
  return url;
}

function legacyKeyRole(value: string): string | undefined {
  const segments = value.split(".");
  if (segments.length !== 3 || !segments[1]) return undefined;
  try {
    const normalized = segments[1].replaceAll("-", "+").replaceAll("_", "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const payload: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (typeof payload !== "object" || payload === null || !("role" in payload)) return undefined;
    return typeof payload.role === "string" ? payload.role : undefined;
  } catch {
    return undefined;
  }
}

function validatePublishableKey(value: string): void {
  const modernPublishable = /^sb_publishable_[A-Za-z0-9_-]+$/.test(value);
  if (!modernPublishable && legacyKeyRole(value) !== "anon") {
    fail("invalid_supabase_publishable_key_type");
  }
}

export function validateRequiredApiBindings(env: Bindings): void {
  if (!env.DB || typeof env.DB.prepare !== "function") fail("missing_db_binding");

  const allowedOrigins = requiredText(env, "ALLOWED_ORIGINS")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  if (allowedOrigins.length === 0) fail("invalid_allowed_origins");
  for (const origin of allowedOrigins) validateOrigin(origin, "allowed_origins", true);

  validateOrigin(requiredText(env, "SUPABASE_URL"), "supabase_url", true);
  validatePublishableKey(requiredText(env, "SUPABASE_PUBLISHABLE_KEY"));
}

export async function checkApiReadiness(env: Bindings): Promise<void> {
  validateRequiredApiBindings(env);
  await env.DB.prepare("SELECT 1").first();
}
