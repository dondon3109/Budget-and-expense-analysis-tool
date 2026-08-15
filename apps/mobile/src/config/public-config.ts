import { z } from "zod";

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

// NOTE: the EXPO_PUBLIC_* values must be read through static property
// accesses. The Expo bundler inlines only static references like
// process.env.EXPO_PUBLIC_API_URL, and release builds do not receive the
// dev-server environment at runtime. A dynamic source[key] read silently
// lost this configuration in release bundles.
export const publicConfig = parsePublicConfig(
  process.env.EXPO_PUBLIC_API_URL,
  process.env.EXPO_PUBLIC_SUPABASE_URL,
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export const isSupabaseConfigured = Boolean(
  publicConfig.supabaseUrl && publicConfig.supabasePublishableKey,
);
