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

export function readPublicConfig(
  source: Record<string, string | undefined> = process.env,
): PublicConfig {
  return publicConfigSchema.parse({
    apiUrl: source.EXPO_PUBLIC_API_URL ?? "https://api.zoption.site",
    supabaseUrl: optionalValue(source.EXPO_PUBLIC_SUPABASE_URL),
    supabasePublishableKey: optionalValue(source.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY),
  });
}

export const publicConfig = readPublicConfig();

export const isSupabaseConfigured = Boolean(
  publicConfig.supabaseUrl && publicConfig.supabasePublishableKey,
);
