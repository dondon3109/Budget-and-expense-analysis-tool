import Constants from "expo-constants";
import { z } from "zod";

import { isDevelopmentAppVariant } from "./app-variant";

const publicConfigSchema = z
  .object({
    apiUrl: z.string().url(),
    supabaseUrl: z.string().trim().url().optional(),
    supabasePublishableKey: z.string().trim().min(20).optional(),
  })
  .strict();

export type PublicConfig = z.infer<typeof publicConfigSchema>;

function optionalValue(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function environmentValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/**
 * Validates the raw environment values into the public configuration shape.
 * Kept separate so it stays unit-testable without touching process.env.
 */
export function parsePublicConfig(
  apiUrl: string | undefined,
  supabaseUrl: string | undefined,
  supabasePublishableKey: string | undefined,
): PublicConfig {
  return publicConfigSchema.parse({
    apiUrl: apiUrl ?? "https://api.zoption.site",
    supabaseUrl: optionalValue(supabaseUrl),
    supabasePublishableKey: optionalValue(supabasePublishableKey),
  });
}

/** Local Worker port the dev API listens on (`apps/api` `dev` script). */
export const DEV_API_PORT = 8787;

/**
 * Derives the dev API URL from the Expo dev-server host the phone already
 * used to load its JS bundle (e.g. `192.168.1.5:8081` → `http://192.168.1.5:8787`).
 * Hardcoding `localhost` breaks live streaming on a physical device because
 * the phone's loopback is not the laptop. Returns undefined when unparseable
 * so the caller falls back to plain localhost (simulators).
 */
export function devApiUrlFromHostUri(hostUri: string | null | undefined): string | undefined {
  const trimmed = hostUri?.trim();
  if (!trimmed) return undefined;
  const withoutScheme = trimmed.includes("://") ? trimmed.split("://", 2)[1]! : trimmed;
  const hostPort = withoutScheme.split("/", 1)[0]!;
  if (!hostPort) return undefined;
  let hostname: string;
  if (hostPort.startsWith("[")) {
    const end = hostPort.indexOf("]");
    if (end <= 1) return undefined;
    hostname = hostPort.slice(1, end);
  } else {
    hostname = hostPort.split(":", 1)[0]!;
  }
  if (!hostname) return undefined;
  return `http://${hostname}:${DEV_API_PORT}`;
}

/** Reads the Expo dev-server host at runtime; null outside `expo start`. */
function currentDevHostUri(): string | undefined {
  try {
    return Constants.expoConfig?.hostUri ?? undefined;
  } catch {
    return undefined;
  }
}

// NOTE: the EXPO_PUBLIC_* values must be read through static property
// accesses. The Expo bundler inlines only static references like
// process.env.EXPO_PUBLIC_API_URL, and release builds do not receive the
// dev-server environment at runtime. A dynamic source[key] read silently
// lost this configuration in release bundles.
const configuredApiUrl =
  environmentValue(process.env.EXPO_PUBLIC_API_URL) ??
  (isDevelopmentAppVariant()
    ? (devApiUrlFromHostUri(currentDevHostUri()) ?? `http://localhost:${DEV_API_PORT}`)
    : undefined);

export const publicConfig = parsePublicConfig(
  configuredApiUrl,
  environmentValue(process.env.EXPO_PUBLIC_SUPABASE_URL),
  environmentValue(process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
);

export const isSupabaseConfigured = Boolean(
  publicConfig.supabaseUrl && publicConfig.supabasePublishableKey,
);
